// ============================================================
// CREDENTIAL VAULT — /api/keys
// GET    → masked states for every service (+ pin/env-sync info)
// POST   → save a credential (encrypted DB row + durable env backup)
// DELETE → remove a credential and its env-var backup
// When a settings PIN is configured, POST/DELETE require the
// x-settings-pin header (the owner's dashboard PIN).
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { ensureSeeded } from '@/lib/ensure-seed'
import { findCredentialService } from '@/lib/credential-services'
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

export const dynamic = 'force-dynamic'

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

    // 2. durable backup — sync each field to the Vercel project env vars
    //    (plain type → readable at runtime, no redeploy needed)
    const syncedVars: string[] = []
    const failedVars: string[] = []

    if (isEnvSyncAvailable()) {
      for (const f of svc.fields) {
        const val = merged[f.id]
        if (!val) continue
        for (const ev of f.envVars) {
          const ok = await upsertEnvVar(ev, val)
          if (ok) syncedVars.push(ev)
          else failedVars.push(ev)
        }
      }
    }

    await logCredentialEvent(
      `Credential saved for ${svc.name}${syncedVars.length ? ` — backed up to ${syncedVars.join(', ')}` : ''}`,
      { service: serviceId, fields: Object.keys(incoming), envSynced: syncedVars },
    )

    const states = await buildServiceStates()
    const state = states.find((s) => s.service === serviceId)
    return NextResponse.json({
      message: 'Saved — the agent can use it immediately.',
      service: state,
      envSync: {
        available: isEnvSyncAvailable(),
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

    // Remove the durable env backup too. Always attempt every env var mapped
    // to this service (removeEnvVar is a no-op when absent) so nothing is
    // resurrected on the next cold start.
    const removedVars: string[] = []
    if (isEnvSyncAvailable()) {
      for (const f of svc.fields) {
        const hadValue = Boolean(values[f.id])
        if (!hadValue) continue
        for (const ev of f.envVars) {
          if (await removeEnvVar(ev)) removedVars.push(ev)
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
