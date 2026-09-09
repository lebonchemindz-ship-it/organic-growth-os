// ============================================================
// RAILWAY ENV STORE (server-only, optional)
// Production runs on Railway. The vault (SQLite on the /data
// persistent volume) is the live source of truth and survives
// restarts/redeploys on its own. This layer adds the SECOND
// durable copy: deployment environment variables.
//
// When RAILWAY_TOKEN (+ RAILWAY_PROJECT_ID and
// RAILWAY_ENVIRONMENT_ID) is configured, credentials saved from
// the dashboard are ALSO written to this service's Railway
// environment variables, so even a total database loss can be
// recovered (env vars are re-imported into the vault at boot
// when a row is missing).
//
// Railway values are write-only via the API (values are never
// returned), so reads stay on the vault — this layer is
// strictly a write-through backup, mirroring the vercel-env
// interface. Every call is best-effort: failures never block
// a save.
// ============================================================

const ENDPOINT = 'https://backboard.railway.app/graphql/v2'

/** True when this instance can write to the Railway project's env vars. */
export function isRailwayEnvSyncAvailable(): boolean {
  return Boolean(
    process.env.RAILWAY_TOKEN?.trim() &&
    process.env.RAILWAY_PROJECT_ID?.trim() &&
    process.env.RAILWAY_ENVIRONMENT_ID?.trim()
  )
}

async function gql(query: string, variables: Record<string, unknown>, timeoutMs = 15_000): Promise<Record<string, unknown> | null> {
  const token = process.env.RAILWAY_TOKEN!.trim()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    })
    const json = await res.json().catch(() => null) as { errors?: unknown[]; data?: Record<string, unknown> } | null
    if (!json || json.errors) {
      console.error('[railway-env] GraphQL error:', JSON.stringify(json?.errors ?? 'no response'))
      return null
    }
    return json.data ?? null
  } catch (e) {
    console.error('[railway-env] request failed:', e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Create or update a SERVICE-scoped environment variable.
 * skipDeploys defaults to true: the vault is the live source,
 * the env var is the cold-restore backup, so no redeploy is
 * needed for the value to be backed up — it lands in the
 * container on the next natural deploy.
 */
export async function railwayUpsertVar(name: string, value: string, opts: { skipDeploys?: boolean } = {}): Promise<boolean> {
  const input = {
    projectId: process.env.RAILWAY_PROJECT_ID!.trim(),
    environmentId: process.env.RAILWAY_ENVIRONMENT_ID!.trim(),
    serviceId: process.env.RAILWAY_SERVICE_ID?.trim() || undefined,
    name,
    value,
    skipDeploys: opts.skipDeploys ?? true,
  }
  const data = await gql(`mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`, { input })
  return data !== null
}

/** Remove an environment variable (by name). Returns true on success (or when it does not exist). */
export async function railwayRemoveVar(name: string): Promise<boolean> {
  const input = {
    projectId: process.env.RAILWAY_PROJECT_ID!.trim(),
    environmentId: process.env.RAILWAY_ENVIRONMENT_ID!.trim(),
    serviceId: process.env.RAILWAY_SERVICE_ID?.trim() || undefined,
    name,
  }
  const data = await gql(`mutation($input: VariableDeleteInput!) { variableDelete(input: $input) }`, { input })
  // deleting a missing variable is not an error worth failing on
  return data !== null
}
