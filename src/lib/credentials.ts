// ============================================================
// CREDENTIAL VAULT — server-side store (server-only)
// Encrypted credentials in the app database, an in-memory
// cache for hot paths (the Sprout agent), masked states for
// the dashboard, env-var import on cold start (durability)
// and env-var export to the Vercel project (permanence).
// ============================================================

import { db } from '@/lib/db'
import { CREDENTIAL_SERVICES, findCredentialService, type CredentialService } from '@/lib/credential-services'
import { decryptJson, encryptJson, maskSecret } from '@/lib/vault'

const CACHE_TTL_MS = 15_000
const valueCache = new Map<string, { values: Record<string, string>; ts: number }>()

export interface CredentialFieldState {
  id: string
  set: boolean
  /** plaintext for public fields, masked for secret fields */
  value: string
  /** true when a deployment env var already carries this exact value */
  envSynced: boolean
}

export interface CredentialServiceState {
  service: string
  configured: boolean
  source: string | null
  updatedAt: string | null
  fields: CredentialFieldState[]
}

/** Decrypted values for a service ({} when not saved). Cached for 15s. */
export async function getCredentialValues(serviceId: string): Promise<Record<string, string>> {
  const hit = valueCache.get(serviceId)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.values
  let values: Record<string, string> = {}
  try {
    const row = await db.credential.findUnique({ where: { service: serviceId } })
    if (row && row.valuesEnc) values = decryptJson(row.valuesEnc)
  } catch (e) {
    // table may not exist yet (before ensureSeeded) — fall back to env vars
    const svc = findCredentialService(serviceId)
    if (svc) {
      for (const f of svc.fields) {
        const ev = f.envVars.find((v) => process.env[v] && process.env[v]!.trim())
        if (ev) values[f.id] = process.env[ev]!.trim()
      }
    }
    console.error('[credentials] read failed:', serviceId, e instanceof Error ? e.message : e)
  }
  valueCache.set(serviceId, { values, ts: Date.now() })
  return values
}

/** Merge + encrypt + upsert a credential row. Returns the merged values. */
export async function saveCredentialValues(serviceId: string, incoming: Record<string, string>): Promise<Record<string, string>> {
  const existing = await getCredentialValues(serviceId)
  const merged: Record<string, string> = { ...existing }
  for (const [k, v] of Object.entries(incoming)) {
    if (typeof v === 'string' && v.trim()) merged[k] = v.trim()
  }
  // drop fields that are no longer part of the registry
  const svc = findCredentialService(serviceId)
  if (svc) {
    for (const k of Object.keys(merged)) {
      if (!svc.fields.some((f) => f.id === k)) delete merged[k]
    }
  }
  await db.credential.upsert({
    where: { service: serviceId },
    create: { service: serviceId, valuesEnc: encryptJson(merged), source: 'DASHBOARD' },
    update: { valuesEnc: encryptJson(merged), source: 'DASHBOARD', updatedAt: new Date() },
  })
  valueCache.set(serviceId, { values: merged, ts: Date.now() })
  return merged
}

/** Delete a credential row (env vars are handled by the API route). */
export async function deleteCredential(serviceId: string): Promise<void> {
  try {
    await db.credential.deleteMany({ where: { service: serviceId } })
  } catch {
    // ignore — row may not exist
  }
  valueCache.delete(serviceId)
}

function fieldValuesFromEnv(svc: CredentialService): Record<string, string> {
  const values: Record<string, string> = {}
  for (const f of svc.fields) {
    const ev = f.envVars.find((v) => process.env[v] && process.env[v]!.trim())
    if (ev) values[f.id] = process.env[ev]!.trim()
  }
  return values
}

/** Masked/public states for every service in the registry (for the dashboard). */
export async function buildServiceStates(): Promise<CredentialServiceState[]> {
  let rows: Array<{ service: string; source: string; updatedAt: Date; valuesEnc: string }> = []
  try {
    rows = await db.credential.findMany()
  } catch (e) {
    console.error('[credentials] list failed:', e instanceof Error ? e.message : e)
  }
  const byService = new Map(rows.map((r) => [r.service, r]))

  return CREDENTIAL_SERVICES.map((svc) => {
    const row = byService.get(svc.id)
    const values = row && row.valuesEnc ? decryptJson(row.valuesEnc) : {}
    const envValues = fieldValuesFromEnv(svc)
    const effective = { ...envValues, ...values } // stored values win over env
    const fields: CredentialFieldState[] = svc.fields.map((f) => {
      const val = effective[f.id] || ''
      const envSynced = f.envVars.some((ev) => val && process.env[ev] === val)
      return {
        id: f.id,
        set: Boolean(val),
        value: f.secret ? maskSecret(val) : val,
        envSynced,
      }
    })
    return {
      service: svc.id,
      configured: fields.some((f) => f.set),
      source: row ? row.source : null,
      updatedAt: row ? row.updatedAt.toISOString() : null,
      fields,
    }
  })
}

/**
 * Cold-start durability: copy credentials that exist only as deployment env
 * vars into the vault (never overwriting rows saved from the dashboard).
 * Called once per server instance from ensureSeeded().
 */
export async function importEnvCredentials(): Promise<number> {
  let imported = 0
  for (const svc of CREDENTIAL_SERVICES) {
    try {
      const row = await db.credential.findUnique({ where: { service: svc.id } })
      if (row) continue
      const envValues = fieldValuesFromEnv(svc)
      if (Object.keys(envValues).length === 0) continue
      await db.credential.create({
        data: { service: svc.id, valuesEnc: encryptJson(envValues), source: 'ENV' },
      })
      imported += 1
    } catch (e) {
      console.error('[credentials] env import failed:', svc.id, e instanceof Error ? e.message : e)
    }
  }
  if (imported > 0) {
    console.log(`[credentials] imported ${imported} credential(s) from deployment env vars`)
    logCredentialEvent(`Imported ${imported} credential(s) from deployment environment variables`, {})
  }
  return imported
}

/** True when the Sprout agent has a real brain (Anthropic or OpenAI key). */
export async function isBrainLive(): Promise<{ live: boolean; provider: string | null }> {
  const anthropic = await getCredentialValues('anthropic')
  if (anthropic.apiKey) return { live: true, provider: 'Anthropic Claude' }
  const openai = await getCredentialValues('openai')
  if (openai.apiKey) return { live: true, provider: 'OpenAI' }
  return { live: false, provider: null }
}

/** Append-only system log entry (never contains secret values). */
export function logCredentialEvent(message: string, meta: Record<string, unknown>): void {
  db.systemEvent
    .create({ data: { type: 'CREDENTIAL', level: 'INFO', message, meta: JSON.stringify(meta).slice(0, 2000) } })
    .catch(() => {})
}
