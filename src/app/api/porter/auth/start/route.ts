// ============================================================
// PORTER OAUTH — GET /api/porter/auth/start
// Begins the Porter Metrics OAuth login: dynamically registers
// this deployment as a public OAuth client, generates PKCE +
// state (stored in HttpOnly cookies), then redirects the owner
// to Porter's authorize page. No PIN needed — nothing is read.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { getPorterConfig, registerClient, generatePkce, randomState, buildAuthorizeUrl } from '@/lib/porter-mcp'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const redirectUri = `${origin}/api/porter/auth/callback`
  const cfg = await getPorterConfig()

  const clientId = await registerClient(cfg.mcpUrl, redirectUri)
  if (!clientId) {
    return NextResponse.redirect(`${origin}/?porter=error&reason=registration_failed`)
  }

  const { verifier, challenge } = generatePkce()
  const state = randomState()
  const authorizeUrl = buildAuthorizeUrl(cfg.mcpUrl, clientId, redirectUri, state, challenge)

  const res = NextResponse.redirect(authorizeUrl)
  const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: origin.startsWith('https://') }
  res.cookies.set('porter_state', state, { ...cookieOpts, maxAge: 600 })
  res.cookies.set('porter_verifier', verifier, { ...cookieOpts, maxAge: 600 })
  res.cookies.set('porter_client_id', clientId, { ...cookieOpts, maxAge: 1800 })
  return res
}
