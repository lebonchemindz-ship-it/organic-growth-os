// ============================================================
// CREDENTIAL VAULT — /api/keys
// GET    → masked states for every service (+ pin/env-sync info)
// POST   → save a credential (encrypted DB row + durable env backup)
//         body {action:'sync-env'} → push the whole vault to the
//         durable env backup (Railway / Vercel), PIN-gated
// DELETE → remove a credential and its env-var backup
// When a settings PIN is configured, POST/DELETE require the
// x-settings-pin header (the owner's dashboard PIN).
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { ensureSeeded } from '@/lib/ensure-seed'
import { CREDENTIAL_SERVICES, findCredentialService } from '@/lib/credential-services'
import { storageStatus } from '@/lib/hosting'
import {
  buildServiceStates,
  deleteCredential,
  getCredentialValues,
  getSettingsPin,
  isBrainLive,
  logCredentialEvent,
  saveCredentialValues,
} from '@/lib/credentials'
import { isEnvSyncAvailable, removeEnvVar, upsertEnvVar } from '@/lib/vercel-env'
import { isRailwayEnvSyncAvailable, railwayRemoveVar, railwayUpsertVar } from '@/lib/railway-env'
import { resetDataForSeoCaches } from '@/lib/dataforseo'

export const dynamic = 'force-dynamic'

// ------------------------------------------------------------
// Durable env backup layer: Vercel env store when configured
// (legacy hosting), otherwise the Railway deployment variables
// (production). Both are write-through backups of the vault.
// ------------------------------------------------------------
function envBackupLayer(): 'vercel' | 'railway' | 'none' {
  if (isEnvSyncAvailable()) return 'vercel'
  if (isRailwayEnvSyncAvailable()) return 'railway'
  return 'none'
}

async function backupUpsertVar(name: string, value: string): Promise<boolean> {
  if (envBackupLayer() === 'vercel') return upsertEnvVar(name, value)
  if (envBackupLayer() === 'railway') return railwayUpsertVar(name, value)
  return false
}

async function backupRemoveVar(name: string): Promise<boolean> {
  if (envBackupLayer() === 'vercel') return removeEnvVar(name)
  if (envBackupLayer() === 'railway') return railwayRemoveVar(name)
  return false
}

async function pinOk(req: NextRequest): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const pin = await getSettingsPin()
  if (!pin) return { ok: true }
  if (req.headers.get('x-settings-pin') === pin) return { ok: true }
  return {
    ok: false,
    response: NextResponse.json({ error: 'invalid_pin', message: 'Invalid settings PIN.' }, { status: 401 }),
  }
}

export async function GET() {
  try {
    await ensureSeeded()
    const [services, brain] = await Promise.all([buildServiceStates(), isBrainLive()])
    return NextResponse.json({
      pinRequired: Boolean(await getSettingsPin()),
      envSyncAvailable: isEnvSyncAvailable(),
      // the honest storage story for THIS server (Railway = permanent:
      // persistent volume + deployment env vars; the old amber warning
      // only ever applied to serverless hosting)
      storage: storageStatus(),
      brain,
      services,
    })
  } catch (e) {
    console.error('[keys] GET failed:', e)
    return NextResponse.json({ error: 'failed to load credential states' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded()
    const gate = await pinOk(req)
    if (!gate.ok) return gate.response

    const body = await req.json().catch(() => ({}))

    // ---- action: push the whole vault to the durable env backup ----
    // Lets the owner refresh the backup layer (Railway deployment
    // variables) without re-typing any secret — the values are read
    // from the vault and written through. PIN-gated like every write.
    if (body.action === 'sync-env') {
      const layer = envBackupLayer()
      if (layer === 'none') {
        return NextResponse.json({
          error: 'no_backup_layer',
          message: 'No durable env backup is configured on this server (Railway storage itself is already permanent — the vault lives on the persistent volume).',
        }, { status: 400 })
      }
      const syncedVars: string[] = []
      const failedVars: string[] = []
      for (const svc of CREDENTIAL_SERVICES) {
        const values = await getCredentialValues(svc.id)
        for (const f of svc.fields) {
          const val = values[f.id]
          if (!val) continue
          for (const ev of f.envVars) {
            const ok = await backupUpsertVar(ev, val)
            if (ok) syncedVars.push(ev)
            else failedVars.push(ev)
          }
        }
      }
      await logCredentialEvent(
        syncedVars.length
          ? `Vault backed up to ${layer === 'railway' ? 'Railway deployment variables' : 'Vercel env vars'} — ${syncedVars.length} variables`
          : 'Backup sync ran with nothing to write (vault is empty)',
        { action: 'sync-env', syncedVars, failedVars },
      )
      return NextResponse.json({
        message: failedVars.length
          ? `Backed up ${syncedVars.length} variable(s) to ${layer === 'railway' ? 'Railway' : 'Vercel'} — failed: ${failedVars.join(', ')}.`
          : syncedVars.length
            ? `Backed up ${syncedVars.length} variable(s) to ${layer === 'railway' ? 'Railway' : 'Vercel'} — the vault is now safe even against a total database loss.`
            : 'Nothing to back up — the vault is empty.',
        layer,
        syncedVars,
        failedVars,
      })
    }

    const serviceId = String(body.service || '')
    const svc = findCredentialService(serviceId)
    if (!svc) {
      return NextResponse.json({ error: 'unknown_service', message: `Unknown service "${serviceId}".` }, { status: 400 })
    }

    const incomingRaw = (body.values && typeof body.values === 'object' ? body.values : {}) as Record<string, unknown>
    const incoming: Record<string, string> = {}
    for (const f of svc.fields) {
      const v = incomingRaw[f.id]
      if (typeof v === 'string' && v.trim()) {
        incoming[f.id] = v.trim().slice(0, f.multiline ? 5000 : 600)
      }
    }
    if (Object.keys(incoming).length === 0) {
      return NextResponse.json({ error: 'nothing_to_save', message: 'No values provided — fill at least one field.' }, { status: 400 })
    }

    // 1. store (encrypted) — the agent can use the key immediately
    const merged = await saveCredentialValues(serviceId, incoming)

    // a NEW DataForSEO key must take effect immediately: drop any
    // stale 40100/40202 result the API caches are still holding
    if (serviceId === 'dataforseo') resetDataForSeoCaches()

    // 2. durable backup — sync each field to the active env layer
    //    (Vercel: runtime-readable plain vars; Railway: deployment
    //    variables re-imported at boot when a vault row is missing)
    const syncedVars: string[] = []
    const failedVars: string[] = []

    if (envBackupLayer() !== 'none') {
      for (const f of svc.fields) {
        const val = merged[f.id]
        if (!val) continue
        for (const ev of f.envVars) {
          const ok = await backupUpsertVar(ev, val)
          if (ok) syncedVars.push(ev)
          else failedVars.push(ev)
        }
      }
    }

    await logCredentialEvent(
      `Credential saved for ${svc.name}${syncedVars.length ? ` — backed up to ${syncedVars.join(', ')}` : ''}`,
      { service: serviceId, fields: Object.keys(incoming), envSynced: syncedVars },
    )

    // verify the new key works immediately (DataForSEO only) so the
    // save feedback can say "connected" instead of leaving doubt
    let test: { ok: boolean; message: string } | null = null
    if (serviceId === 'dataforseo') {
      const { checkDataForSeoAuth } = await import('@/lib/dataforseo')
      const check = await checkDataForSeoAuth(true)
      test = { ok: check.ok, message: check.message }
    }

    const states = await buildServiceStates()
    const state = states.find((s) => s.service === serviceId)
    return NextResponse.json({
      message: test
        ? (test.ok ? `Saved — ${test.message}` : `Saved, but the live test failed: ${test.message}`)
        : 'Saved — the agent can use it immediately.',
      service: state,
      test,
      envSync: {
        available: envBackupLayer() !== 'none',
        layer: envBackupLayer(),
        syncedVars,
        failedVars,
      },
    })
  } catch (e) {
    console.error('[keys] POST failed:', e)
    return NextResponse.json({ error: 'save_failed', message: 'Could not save the credential.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureSeeded()
    const gate = await pinOk(req)
    if (!gate.ok) return gate.response

    const serviceId = String(new URL(req.url).searchParams.get('service') || '')
    const svc = findCredentialService(serviceId)
    if (!svc) {
      return NextResponse.json({ error: 'unknown_service' }, { status: 400 })
    }

    const values = await getCredentialValues(serviceId)
    await deleteCredential(serviceId)
    if (serviceId === 'dataforseo') resetDataForSeoCaches()

    // Remove the durable env backup too. Always attempt every env var mapped
    // to this service (backupRemoveVar is a no-op when absent) so nothing is
    // resurrected on the next cold start.
    const removedVars: string[] = []
    if (envBackupLayer() !== 'none') {
      for (const f of svc.fields) {
        const hadValue = Boolean(values[f.id])
        if (!hadValue) continue
        for (const ev of f.envVars) {
          if (await backupRemoveVar(ev)) removedVars.push(ev)
        }
      }
    }

    await logCredentialEvent(`Credential removed for ${svc.name}`, { service: serviceId, removedEnvVars: removedVars })
    return NextResponse.json({
      message: removedVars.length
        ? `Removed (also removed the permanent backup: ${removedVars.join(', ')}).`
        : 'Removed from the credential vault.',
      removedVars,
    })
  } catch (e) {
    console.error('[keys] DELETE failed:', e)
    return NextResponse.json({ error: 'delete_failed', message: 'Could not remove the credential.' }, { status: 500 })
  }
}
