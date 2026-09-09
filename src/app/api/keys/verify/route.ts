// ============================================================
// CREDENTIAL VAULT — POST /api/keys/verify
// Verifies the owner's settings PIN and re-imports credentials
// from the durable env backup into the vault (idempotent —
// never overwrites rows saved from the dashboard).
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { ensureSeeded } from '@/lib/ensure-seed'
import { getSettingsPin, importEnvCredentials } from '@/lib/credentials'
import { isEnvSyncAvailable } from '@/lib/vercel-env'
import { detectHosting, isPersistentVolumeDb } from '@/lib/hosting'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const pin = await getSettingsPin()
    if (pin && req.headers.get('x-settings-pin') !== pin) {
      return NextResponse.json({ ok: false, error: 'invalid_pin', message: 'Invalid settings PIN.' }, { status: 401 })
    }

    // The durable env source exists on Vercel (env sync API) AND on Railway
    // (deployment env vars are baked into every instance — the import reads
    // them straight from process.env and writes them into the vault).
    const hasDurableEnvSource = isEnvSyncAvailable() || isPersistentVolumeDb() || detectHosting() === 'vercel'
    let restored = 0
    if (hasDurableEnvSource) {
      try {
        await ensureSeeded()
        restored = await importEnvCredentials()
      } catch {
        restored = 0
      }
    }

    return NextResponse.json({
      ok: true,
      restored,
      message: restored > 0 ? `PIN accepted — restored ${restored} key(s) from the permanent backup.` : 'PIN accepted.',
    })
  } catch (e) {
    console.error('[keys:verify] failed:', e)
    return NextResponse.json({ ok: false, error: 'verify_failed' }, { status: 500 })
  }
}
