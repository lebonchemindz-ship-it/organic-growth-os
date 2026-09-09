// ============================================================
// PORTER LIVE STATS — GET /api/porter/stats?days=28[&refresh=1]
// Real statistics for the brand from Google Search Console and
// GA4, pulled live through the Porter Metrics MCP server:
//   • GSC: clicks, impressions, CTR, avg position, daily series,
//          top queries, top pages
//   • GA4: sessions, users, daily series
// The heavy lifting lives in src/lib/porter-stats.ts (shared
// with Sprout's get_real_stats tool). Results are cached
// 5 minutes per warm server instance.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { ensureSeeded } from '@/lib/ensure-seed'
import { getPorterConfig } from '@/lib/porter-mcp'
import { fetchLiveStats } from '@/lib/porter-stats'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded()
    const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 28, 7), 90)
    const refresh = req.nextUrl.searchParams.get('refresh') === '1'

    const cfg = await getPorterConfig()
    if (!cfg.accessToken) {
      return NextResponse.json({ error: 'not_connected', message: 'Connect Porter first (Live Stats → Connect Porter).' }, { status: 400 })
    }

    const stats = await fetchLiveStats(days, refresh)
    return NextResponse.json({ ...stats, cached: false })
  } catch (e) {
    console.error('[porter] stats failed:', e)
    return NextResponse.json({ error: 'stats_failed', message: 'Could not pull live statistics.' }, { status: 500 })
  }
}
