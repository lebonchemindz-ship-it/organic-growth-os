// ============================================================
// HOSTING DETECTION (server-only)
// The app runs in three kinds of places:
//   • Railway (production) — long-running container with a
//     persistent volume (/data, SQLite) + deployment env vars:
//     storage is PERMANENT, nothing is lost on restarts or
//     redeploys.
//   • Vercel (serverless legacy) — ephemeral per-instance
//     storage; permanence comes from the project env store
//     (VERCEL_TOKEN sync).
//   • local dev — this machine's database.
// The API Keys page reports the truth for each case instead of
// a generic serverless warning that does not apply to Railway.
// ============================================================

export type HostingKind = 'railway' | 'vercel' | 'local'

/** Where is this server instance running? */
export function detectHosting(): HostingKind {
  if (
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_DEPLOYMENT_ID
  ) {
    return 'railway'
  }
  if (process.env.VERCEL) return 'vercel'
  return 'local'
}

/** True when the database sits on a persistent volume (Railway /data). */
export function isPersistentVolumeDb(): boolean {
  if (detectHosting() === 'railway') return true
  return (process.env.DATABASE_URL || '').startsWith('file:/data')
}

export interface StorageStatus {
  hosting: HostingKind
  /** true when saved data survives restarts/redeploys without extra setup */
  permanent: boolean
  /** human-readable storage layers (never contains secret values) */
  layers: string[]
}

/**
 * The honest storage story for this server. Keys and app data are
 * permanent when either (a) the Vercel env sync is configured, or
 * (b) we are on Railway, where the SQLite database lives on a
 * persistent volume and the deployment env vars hold the keys at
 * the infrastructure level (auto-imported into the vault on boot).
 */
export function storageStatus(): StorageStatus {
  const hosting = detectHosting()
  if (hosting === 'railway') {
    return {
      hosting,
      permanent: true,
      layers: [
        'encrypted vault (AES-256) in the app database on a persistent volume',
        'deployment environment variables (Railway) at the infrastructure level',
        'boot-time auto-restore: every new instance re-imports keys from the env vars',
      ],
    }
  }
  return {
    hosting,
    permanent: false,
    layers: ['encrypted vault (AES-256) in this server\u2019s database'],
  }
}
