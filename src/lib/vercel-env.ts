// ============================================================
// VERCEL ENV STORE (server-only, optional)
// When VERCEL_TOKEN (+ VERCEL_PROJECT_ID or project name) is
// configured, credentials saved from the dashboard are also
// written to the Vercel project's environment variables —
// the only storage that survives serverless cold starts.
//
// Env vars are written as "plain" type deliberately: plain
// values can be read back at runtime via the Vercel API, so a
// fresh server instance can restore the credential vault
// WITHOUT waiting for a new deployment. (The project has no
// git link, so API-triggered rebuilds are not possible — and
// with runtime reads they are no longer needed at all.)
//
// Every call is best-effort: failures never block a save.
// ============================================================

const API = 'https://api.vercel.com'
const REMOTE_CACHE_TTL_MS = 15_000

let remoteCache: { values: Record<string, string>; ts: number } | null = null

export function isEnvSyncAvailable(): boolean {
  return Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_TOKEN.trim())
}

function projectId(): string {
  return (
    process.env.VERCEL_PROJECT_ID?.trim() ||
    process.env.VERCEL_PROJECT_NAME?.trim() ||
    'organic-growth-os'
  )
}

async function vercelApi(path: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<null | Response> {
  const token = process.env.VERCEL_TOKEN!.trim()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(init.headers || {}),
      },
      signal: controller.signal,
    })
  } catch (e) {
    console.error('[vercel-env] request failed:', path, e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(timer)
  }
}

interface EnvRecord {
  id: string
  key: string
  target?: string[]
  type?: string
  value?: string
}

async function listEnvVars(): Promise<EnvRecord[]> {
  const res = await vercelApi(`/v9/projects/${projectId()}/env?limit=100&decrypt=true`)
  if (!res || !res.ok) {
    console.error('[vercel-env] list failed:', res ? res.status : 'no response')
    return []
  }
  try {
    const data = await res.json()
    const envs = (data.envs || data.result || []) as EnvRecord[]
    return Array.isArray(envs) ? envs : []
  } catch {
    return []
  }
}

/**
 * Current env-var values of the Vercel project, as readable at
 * RUNTIME (plain values only — sensitive values are not returned
 * by the API). Cached in-memory for 15s per server instance.
 * Returns {} when env sync is unavailable or the API fails.
 */
export async function getRemoteEnvValues(): Promise<Record<string, string>> {
  if (!isEnvSyncAvailable()) return {}
  if (remoteCache && Date.now() - remoteCache.ts < REMOTE_CACHE_TTL_MS) {
    return remoteCache.values
  }
  const values: Record<string, string> = {}
  for (const e of await listEnvVars()) {
    if (e.key && typeof e.value === 'string' && e.value) values[e.key] = e.value
  }
  remoteCache = { values, ts: Date.now() }
  return values
}

/** Drop the cached env snapshot so the next read hits the API. */
export function invalidateRemoteEnvCache(): void {
  remoteCache = null
}

/**
 * Create or update an environment variable (production + preview)
 * as PLAIN type so it can be read back at runtime. When an existing
 * variable is "sensitive"/"encrypted", it is deleted and recreated
 * (Vercel does not allow type changes via PATCH).
 * Returns true on success.
 */
export async function upsertEnvVar(key: string, value: string): Promise<boolean> {
  const existing = (await listEnvVars()).find((e) => e.key === key)
  const target = Array.from(new Set([...(existing?.target || ['production']), 'production', 'preview']))

  if (existing && existing.type === 'plain') {
    const res = await vercelApi(`/v9/projects/${projectId()}/env/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ key, value, target, type: 'plain' }),
    })
    if (res && res.ok) {
      invalidateRemoteEnvCache()
      return true
    }
    console.error('[vercel-env] patch failed:', key, res ? res.status : 'no response')
    return false
  }

  // type change required (or brand new) → remove the old record first
  if (existing) {
    const del = await vercelApi(`/v9/projects/${projectId()}/env/${existing.id}`, { method: 'DELETE' })
    if (!del || !(del.ok || del.status === 204)) {
      console.error('[vercel-env] delete-before-recreate failed:', key, del ? del.status : 'no response')
      return false
    }
  }

  const res = await vercelApi(`/v10/projects/${projectId()}/env`, {
    method: 'POST',
    body: JSON.stringify({ key, value, target, type: 'plain' }),
  })
  if (res && res.ok) {
    invalidateRemoteEnvCache()
    return true
  }
  console.error('[vercel-env] create failed:', key, res ? res.status : 'no response')
  return false
}

/** Remove an environment variable. Returns true on success (or when it does not exist). */
export async function removeEnvVar(key: string): Promise<boolean> {
  const existing = (await listEnvVars()).find((e) => e.key === key)
  if (!existing) return true
  const res = await vercelApi(`/v9/projects/${projectId()}/env/${existing.id}`, { method: 'DELETE' })
  if (res && (res.ok || res.status === 204)) {
    invalidateRemoteEnvCache()
    return true
  }
  console.error('[vercel-env] delete failed:', key, res ? res.status : 'no response')
  return false
}
