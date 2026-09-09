// ============================================================
// PORTER CONNECT-ACCOUNT — POST /api/porter/connect-account
// Asks Porter for an authorization URL the owner opens in the
// browser to link one Google account (Search Console or GA4)
// through Porter's OAuth. PIN-protected (state-changing).
// Body: { connector: 'google-search-console' | 'google-analytics-4' }
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { ensureSeeded } from '@/lib/ensure-seed'
import { getSettingsPin } from '@/lib/credentials'
import { connectPorterAccount, findGoogleConnectorSlugs } from '@/lib/porter-mcp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ALLOWED = /^[\w-]{2,64}$/ // connector slugs only

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded()
    const pin = await getSettingsPin()
    if (pin && req.headers.get('x-settings-pin') !== pin) {
      return NextResponse.json({ error: 'invalid_pin', message: 'Invalid settings PIN.' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    let connector = String(body.connector || '').trim()
    if (!ALLOWED.test(connector)) {
      return NextResponse.json({ error: 'bad_connector', message: 'Unknown connector.' }, { status: 400 })
    }

    // Only the two Google statistics connectors are allowed from here
    const slugs = await findGoogleConnectorSlugs()
    if (connector !== slugs.gsc && connector !== slugs.ga4) {
      return NextResponse.json(
        { error: 'not_allowed', message: `Only the Google statistics connectors (${slugs.gsc}, ${slugs.ga4}) can be connected from here.` },
        { status: 400 },
      )
    }

    const r = await connectPorterAccount(connector)
    if (!r.ok) {
      return NextResponse.json(
        { error: 'connect_failed', message: r.error?.message || 'Porter could not start the connection.' },
        { status: 502 },
      )
    }

    // authorization_url is the documented key; accept close variants
    const data = r.data
    const url =
      (data && typeof data === 'object' && ((data as Record<string, unknown>).authorization_url as string)) ||
      (data && typeof data === 'object' && ((data as Record<string, unknown>).url as string)) ||
      (typeof data === 'string' && data.startsWith('http') ? data : null)

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'no_url', message: 'Porter did not return an authorization URL.', raw: typeof data === 'string' ? data.slice(0, 300) : null },
        { status: 502 },
      )
    }

    return NextResponse.json({ connector, authorizationUrl: url })
  } catch (e) {
    console.error('[porter] connect-account failed:', e)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
