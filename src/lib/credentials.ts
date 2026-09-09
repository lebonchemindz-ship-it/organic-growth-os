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
import { getRemoteEnvValues, isEnvSyncAvailable } from '@/lib/vercel-env'

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
    console.error('[credentials] read failed:', serviceId, e instanceof Error ? e.message : e)
  }
  // Live env fallback: when the vault row is missing (e.g. a warm serverless
  // instance that started BEFORE the credential was saved), resolve the value
  // straight from the durable env store so new credentials work immediately
  // on every instance — not just after the next cold start.
  if (Object.keys(values).length === 0) {
    const svc = findCredentialService(serviceId)
    if (svc) {
      try {
        values = { ...values, ...(await durableFieldValues(svc)) }
      } catch {
        // env store unavailable — return what we have
      }
    }
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

/**
 * Durable field values for a service: the Vercel project env vars read
 * LIVE from the API (runtime-readable "plain" values). Falls back to the
 * deployment's baked process.env only when env sync is not configured.
 * Remote values win because they reflect the LATEST saved keys without
 * requiring a redeploy — and deleted keys are never resurrected from a
 * stale deployment snapshot.
 */
async function durableFieldValues(svc: CredentialService): Promise<Record<string, string>> {
  const source = isEnvSyncAvailable() ? await getRemoteEnvValues() : process.env
  const values: Record<string, string> = {}
  for (const f of svc.fields) {
    const ev = f.envVars.find((v) => source[v] && source[v]!.trim())
    if (ev) values[f.id] = source[ev]!.trim()
  }
  return values
}

/** The env-var values a service's fields are checked against (for sync badges). */
async function envSyncSnapshot(): Promise<Record<string, string>> {
  return isEnvSyncAvailable() ? await getRemoteEnvValues() : (process.env as Record<string, string>)
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
  const envSnapshot = await envSyncSnapshot()

  return CREDENTIAL_SERVICES.map((svc) => {
    const row = byService.get(svc.id)
    let values = row && row.valuesEnc ? decryptJson(row.valuesEnc) : {}
    let source = row ? row.source : null
    // No vault row on THIS instance (warm instance that started before the
    // credential was saved, or a row written by another instance's DB) →
    // resolve live from the durable env store so the dashboard always shows
    // the true state. DB values always win when present.
    if (Object.keys(values).length === 0) {
      for (const f of svc.fields) {
        const ev = f.envVars.find((v) => envSnapshot[v] && envSnapshot[v]!.trim())
        if (ev) values[f.id] = envSnapshot[ev]!.trim()
      }
      if (Object.keys(values).length > 0) source = 'ENV'
    }
    const effective = { ...values } // stored values win
    const fields: CredentialFieldState[] = svc.fields.map((f) => {
      const val = effective[f.id] || ''
      const envSynced = f.envVars.some((ev) => val && envSnapshot[ev] === val)
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
      source,
      updatedAt: row ? row.updatedAt.toISOString() : null,
      fields,
    }
  })
}

/**
 * Cold-start durability: copy credentials that exist only in the durable
 * env store (Vercel project env vars, read live) into the vault — never
 * overwriting rows saved from the dashboard. Called once per server
 * instance from ensureSeeded(). Also safe to call at any time (idempotent).
 */
export async function importEnvCredentials(): Promise<number> {
  let imported = 0
  for (const svc of CREDENTIAL_SERVICES) {
    try {
      const row = await db.credential.findUnique({ where: { service: svc.id } })
      if (row) continue
      const envValues = await durableFieldValues(svc)
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
    console.log(`[credentials] restored ${imported} credential(s) from the durable env backup`)
    logCredentialEvent(`Restored ${imported} credential(s) from the durable environment backup`, {})
  }
  return imported
}

/**
 * The owner's settings PIN. Read live from the durable env store when
 * available (so a PIN change applies within ~15s, no redeploy needed),
 * falling back to the deployment's baked process.env value.
 */
export async function getSettingsPin(): Promise<string | null> {
  const remote = isEnvSyncAvailable() ? await getRemoteEnvValues() : null
  const fromRemote = remote?.['SETTINGS_PIN']?.trim()
  if (fromRemote) return fromRemote
  return process.env.SETTINGS_PIN?.trim() || null
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
