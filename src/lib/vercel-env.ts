// ============================================================
// VERCEL ENV SYNC (server-only, optional)
// When VERCEL_TOKEN (+ VERCEL_PROJECT_ID or project name) is
// configured, credentials saved from the dashboard are also
// written to the Vercel project's environment variables —
// the only storage that survives serverless cold starts.
// Every call is best-effort: failures never block a save.
// ============================================================

const API = 'https://api.vercel.com'
const REDEPLOY_COOLDOWN_MS = 5 * 60 * 1000

let lastRedeployAt = 0

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
}

async function listEnvVars(): Promise<EnvRecord[]> {
  const res = await vercelApi(`/v9/projects/${projectId()}/env?limit=100`)
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

/** Create or update an environment variable (production + preview). Returns true on success. */
export async function upsertEnvVar(key: string, value: string, isSecret: boolean): Promise<boolean> {
  const existing = (await listEnvVars()).find((e) => e.key === key)
  const target = Array.from(new Set([...(existing?.target || ['production']), 'production', 'preview']))
  const type = isSecret ? 'secret' : 'plain'
  const body = JSON.stringify({ key, value, target, type })

  if (existing) {
    const res = await vercelApi(`/v9/projects/${projectId()}/env/${existing.id}`, { method: 'PATCH', body })
    if (res && res.ok) return true
    console.error('[vercel-env] patch failed:', key, res ? res.status : 'no response')
    return false
  }
  const res = await vercelApi(`/v10/projects/${projectId()}/env`, { method: 'POST', body })
  if (res && res.ok) return true
  console.error('[vercel-env] create failed:', key, res ? res.status : 'no response')
  return false
}

/** Remove an environment variable. Returns true on success (or when it does not exist). */
export async function removeEnvVar(key: string): Promise<boolean> {
  const existing = (await listEnvVars()).find((e) => e.key === key)
  if (!existing) return true
  const res = await vercelApi(`/v9/projects/${projectId()}/env/${existing.id}`, { method: 'DELETE' })
  if (res && (res.ok || res.status === 204)) return true
  console.error('[vercel-env] delete failed:', key, res ? res.status : 'no response')
  return false
}

/** Trigger a production redeploy so new env vars take effect. Cooldown: 5 minutes. */
export async function triggerRedeploy(force = false): Promise<{ triggered: boolean; reason: string }> {
  if (!force && Date.now() - lastRedeployAt < REDEPLOY_COOLDOWN_MS) {
    return { triggered: false, reason: 'cooldown' }
  }
  const list = await vercelApi(`/v6/deployments?projectId=${projectId()}&limit=1&target=production&state=READY`)
  if (!list || !list.ok) {
    return { triggered: false, reason: `list failed (${list ? list.status : 'no response'})` }
  }
  try {
    const data = await list.json()
    const uid = (data.deployments || [])[0]?.uid
    if (!uid) return { triggered: false, reason: 'no ready production deployment found' }
    const res = await vercelApi(
      `/v13/deployments/${uid}/redeploy?target=production&forceNewDeployment=1`,
      { method: 'POST', body: JSON.stringify({}) },
      20_000,
    )
    if (res && res.ok) {
      lastRedeployAt = Date.now()
      return { triggered: true, reason: `redeploying ${uid}` }
    }
    return { triggered: false, reason: `redeploy failed (${res ? res.status : 'no response'})` }
  } catch (e) {
    return { triggered: false, reason: e instanceof Error ? e.message : String(e) }
  }
}
