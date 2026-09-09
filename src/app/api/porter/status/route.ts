// ============================================================
// PORTER STATUS — GET /api/porter/status
// Read-only snapshot for the Live Stats page:
//   • porter connected? (whoami) — token refresh handled inside
//   • GSC + GA4 connector slugs and their accounts
//   • Option 1 (direct Google service-account) state, so both
//     statistics sources are visible side by side
// No PIN — only masked/public state is returned.
// ============================================================

import { NextResponse } from 'next/server'
import { ensureSeeded } from '@/lib/ensure-seed'
import { buildServiceStates } from '@/lib/credentials'
import {
  findGoogleConnectorSlugs,
  getPorterConfig,
  listPorterAccounts,
  normalizeAccounts,
  testPorterConnection,
} from '@/lib/porter-mcp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface WhoamiInfo {
  name?: string
  email?: string
  company?: string
  plan?: string
}

function extractWhoami(data: unknown): WhoamiInfo | null {
  let obj: unknown = data
  if (Array.isArray(obj)) obj = obj[0]
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const user = (o.user && typeof o.user === 'object' ? o.user : o) as Record<string, unknown>
  const company = (o.company && typeof o.company === 'object' ? o.company : null) as Record<string, unknown> | null
  return {
    name: (user.name ?? user.user_name ?? undefined) as string | undefined,
    email: (user.email ?? user.user_email ?? undefined) as string | undefined,
    company: (company?.name ?? (typeof o.company === 'string' ? o.company : undefined)) as string | undefined,
    plan: (o.plan ?? user.plan ?? undefined) as string | undefined,
  }
}

export async function GET() {
  try {
    await ensureSeeded()
    const cfg = await getPorterConfig()

    // Option 1 — direct Google service-account state (from the vault)
    const states = await buildServiceStates()
    const googleState = states.find((s) => s.service === 'google')
    const googleDirect = {
      configured: googleState?.configured ?? false,
      fieldsSet: (googleState?.fields || []).filter((f) => f.set).map((f) => f.id),
      fieldCount: (googleState?.fields || []).filter((f) => f.set).length,
    }

    if (!cfg.accessToken) {
      return NextResponse.json({
        connected: false,
        reason: 'not_connected',
        mcpUrl: cfg.mcpUrl,
        googleDirect,
      })
    }

    const who = await testPorterConnection()
    if (!who.ok) {
      return NextResponse.json({
        connected: false,
        reason: who.error?.hint === 'reconnect' || who.error?.status === 401 ? 'token_expired' : 'unreachable',
        detail: who.error?.message || null,
        mcpUrl: cfg.mcpUrl,
        googleDirect,
      })
    }

    const slugs = await findGoogleConnectorSlugs()
    const [gscRes, ga4Res] = await Promise.all([
      listPorterAccounts(slugs.gsc),
      listPorterAccounts(slugs.ga4),
    ])

    return NextResponse.json({
      connected: true,
      mcpUrl: cfg.mcpUrl,
      whoami: extractWhoami(who.data),
      connectors: slugs,
      accounts: {
        gsc: gscRes.ok ? normalizeAccounts(gscRes.data) : [],
        ga4: ga4Res.ok ? normalizeAccounts(ga4Res.data) : [],
      },
      accountErrors: {
        gsc: gscRes.ok ? null : gscRes.error?.message || 'could not list Search Console accounts',
        ga4: ga4Res.ok ? null : ga4Res.error?.message || 'could not list GA4 accounts',
      },
      googleDirect,
    })
  } catch (e) {
    console.error('[porter] status failed:', e)
    return NextResponse.json({ error: 'status_failed' }, { status: 500 })
  }
}
