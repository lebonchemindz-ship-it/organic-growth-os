// ============================================================
// PORTER OAUTH — GET /api/porter/auth/callback
// Porter redirects here after the owner logs in. Validates the
// state cookie (CSRF protection), exchanges the code (PKCE) for
// tokens, and stores them in the credential vault (encrypted +
// durable env backup) so the connection survives restarts.
// Then bounces back to the app with ?porter=connected.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { ensureSeeded } from '@/lib/ensure-seed'
import { logCredentialEvent } from '@/lib/credentials'
import { exchangeCode, getPorterConfig, savePorterTokens } from '@/lib/porter-mcp'

export const dynamic = 'force-dynamic'

function bail(origin: string, reason: string): NextResponse {
  const res = NextResponse.redirect(`${origin}/?porter=error&reason=${encodeURIComponent(reason)}`)
  res.cookies.delete('porter_state')
  res.cookies.delete('porter_verifier')
  res.cookies.delete('porter_client_id')
  return res
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  try {
    await ensureSeeded()

    const oauthError = req.nextUrl.searchParams.get('error')
    if (oauthError) return bail(origin, oauthError)

    const code = req.nextUrl.searchParams.get('code')
    const state = req.nextUrl.searchParams.get('state')
    const cookieState = req.cookies.get('porter_state')?.value
    const verifier = req.cookies.get('porter_verifier')?.value
    const clientId = req.cookies.get('porter_client_id')?.value

    if (!code) return bail(origin, 'missing_code')
    if (!state || !cookieState || state !== cookieState) return bail(origin, 'state_mismatch')
    if (!verifier || !clientId) return bail(origin, 'expired_login_session')

    const cfg = await getPorterConfig()
    const redirectUri = `${origin}/api/porter/auth/callback`
    const tokens = await exchangeCode(cfg.mcpUrl, code, verifier, redirectUri, clientId)
    if (!tokens || !tokens.access_token) return bail(origin, 'token_exchange_failed')

    await savePorterTokens(tokens, clientId)
    await logCredentialEvent('Porter Metrics connected via OAuth — live statistics source is ready', { service: 'porter' })

    const res = NextResponse.redirect(`${origin}/?porter=connected`)
    res.cookies.delete('porter_state')
    res.cookies.delete('porter_verifier')
    res.cookies.delete('porter_client_id')
    return res
  } catch (e) {
    console.error('[porter] callback failed:', e)
    return bail(origin, 'internal_error')
  }
}
