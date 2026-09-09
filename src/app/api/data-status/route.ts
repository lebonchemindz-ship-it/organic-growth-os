// ============================================================
// DATA STATUS — GET /api/data-status
// One endpoint that answers: "what is REAL right now?"
//   • porter    — connected? who? GSC/GA4 accounts linked?
//   • dataforseo— credentials saved? auth verified? balance?
//   • brain     — which AI provider powers Sprout
//   • keywords  — real (GSC/DATAFORSEO) vs estimate counts
//   • verdict   — realTraffic / realVolumes / anyReal flags
// The sidebar, top bar and demo banner render from this state
// (no more hardcoded DEMO badges). Cached 30s per instance.
// ============================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'
import { checkDataForSeoAuth, getDataForSeoConfig } from '@/lib/dataforseo'
import { getCredentialValues } from '@/lib/credentials'
import { findGoogleConnectorSlugs, getPorterConfig, listPorterAccounts, normalizeAccounts, testPorterConnection } from '@/lib/porter-mcp'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const CACHE_TTL_MS = 30_000
let cache: { json: Record<string, unknown>; ts: number } | null = null

export async function GET() {
  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return NextResponse.json({ ...cache.json, cached: true })
    }
    await ensureSeeded()

    // ---- Porter / Google Search Console & GA4 ----
    const porterCfg = await getPorterConfig()
    let porter: Record<string, unknown> = {
      connected: false,
      reason: 'not_connected',
      message: 'Not connected — open the Live Stats page and press "Connect Porter".',
      gscAccounts: 0,
      ga4Accounts: 0,
      whoami: null,
    }
    if (porterCfg.accessToken) {
      const who = await testPorterConnection().catch(() => null)
      if (who?.ok) {
        const slugs = await findGoogleConnectorSlugs().catch(() => ({ gsc: '', ga4: '' }))
        const [gscRes, ga4Res] = await Promise.all([
          listPorterAccounts(slugs.gsc).catch(() => null),
          listPorterAccounts(slugs.ga4).catch(() => null),
        ])
        const gscAccounts = gscRes?.ok ? normalizeAccounts(gscRes.data).length : 0
        const ga4Accounts = ga4Res?.ok ? normalizeAccounts(ga4Res.data).length : 0
        porter = {
          connected: true,
          gscAccounts,
          ga4Accounts,
          message: gscAccounts > 0
            ? `Connected — ${gscAccounts} Search Console account(s), ${ga4Accounts} GA4 account(s).`
            : 'Connected — link your Search Console / GA4 accounts on the Live Stats page.',
          whoami: who.data ?? null,
        }
      } else {
        porter = {
          connected: false,
          reason: 'token_expired',
          message: 'The Porter session expired — press "Connect Porter" again on the Live Stats page.',
          gscAccounts: 0,
          ga4Accounts: 0,
          whoami: null,
        }
      }
    }

    // ---- DataForSEO ----
    const dfsCfg = await getDataForSeoConfig()
    const dfsAuth = await checkDataForSeoAuth()
    const dataforseo = {
      configured: Boolean(dfsCfg),
      verified: dfsAuth.ok,
      balance: dfsAuth.balance,
      message: dfsAuth.message,
    }

    // ---- Sprout brain ----
    const [anthropic, openai] = await Promise.all([
      getCredentialValues('anthropic'),
      getCredentialValues('openai'),
    ])
    const brain = {
      provider: anthropic.apiKey ? 'Anthropic Claude' : openai.apiKey ? 'OpenAI' : 'Built-in sandbox AI',
      keyConfigured: Boolean(anthropic.apiKey || openai.apiKey),
    }

    // ---- keyword universe reality ----
    const brand = await db.brand.findUnique({ where: { slug: 'holy_strips' } })
    let keywords = { total: 0, live: 0, demo: 0, agent: 0 }
    if (brand) {
      const groups = await db.keyword.groupBy({ by: ['source'], _count: { _all: true }, where: { brandId: brand.id } })
      const bySource = new Map(groups.map((g) => [g.source, g._count._all]))
      keywords = {
        total: groups.reduce((s, g) => s + g._count._all, 0),
        live: (bySource.get('GSC') ?? 0) + (bySource.get('DATAFORSEO') ?? 0),
        demo: bySource.get('DEMO') ?? 0,
        agent: bySource.get('AGENT') ?? 0,
      }
    }

    const chatCount = await db.chatMessage.count().catch(() => 0)

    const json = {
      porter,
      dataforseo,
      brain,
      keywords,
      chatMessages: chatCount,
      flags: {
        // real Google traffic numbers visible (Live Stats / Overview)
        realTraffic: Boolean(porter.connected && (keywords.live > 0 || (porter as Record<string, unknown>).gscAccounts)),
        // real search volumes available for research
        realVolumes: Boolean(dataforseo.verified),
        // any real data in the system at all
        anyReal: keywords.live > 0 || Boolean(dataforseo.verified) || Boolean((porter as Record<string, unknown>).gscAccounts),
      },
      checkedAt: new Date().toISOString(),
    }

    cache = { json, ts: Date.now() }
    return NextResponse.json(json)
  } catch (e) {
    console.error('[data-status] failed:', e)
    return NextResponse.json({ error: 'status_failed' }, { status: 500 })
  }
}
