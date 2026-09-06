// ============================================================
// CREDENTIAL VAULT — POST /api/keys/redeploy
// Triggers a production redeploy so newly synced env vars
// become live for every future request. PIN-protected.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { isEnvSyncAvailable, triggerRedeploy } from '@/lib/vercel-env'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const pin = process.env.SETTINGS_PIN?.trim()
    if (pin && req.headers.get('x-settings-pin') !== pin) {
      return NextResponse.json({ error: 'invalid_pin', message: 'Invalid settings PIN.' }, { status: 401 })
    }
    if (!isEnvSyncAvailable()) {
      return NextResponse.json(
        { triggered: false, message: 'Env sync is not configured on this deployment (VERCEL_TOKEN missing).' },
        { status: 400 },
      )
    }
    const result = await triggerRedeploy(true)
    return NextResponse.json({
      triggered: result.triggered,
      message: result.triggered
        ? 'Redeploy triggered — new environment goes live in ~1-2 minutes.'
        : `Could not trigger a redeploy (${result.reason}).`,
    })
  } catch (e) {
    console.error('[keys:redeploy] failed:', e)
    return NextResponse.json({ error: 'redeploy_failed' }, { status: 500 })
  }
}
