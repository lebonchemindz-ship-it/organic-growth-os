import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'
import { fetchLiveStats } from '@/lib/porter-stats'
import { fetchBacklinksSummary } from '@/lib/dataforseo'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded()
    const brandSlug = req.nextUrl.searchParams.get('brand') || 'holy_strips'

    const brand = await db.brand.findUnique({ where: { slug: brandSlug } })
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    const [latestReport, keywordCount, top3, top10, opportunityCount, pendingOpportunities, contentCount, publishedCount, publisherCount, aiPrompts, approvalCount, events, backlinks] = await Promise.all([
      db.weeklyReport.findFirst({ where: { brandId: brand.id }, orderBy: { weekOf: 'desc' } }),
      db.keyword.count({ where: { brandId: brand.id } }),
      db.keyword.count({ where: { brandId: brand.id, currentPosition: { gte: 1, lte: 3 } } }),
      db.keyword.count({ where: { brandId: brand.id, currentPosition: { gte: 1, lte: 10 } } }),
      db.opportunity.count({ where: { brandId: brand.id } }),
      db.opportunity.count({ where: { brandId: brand.id, status: { in: ['DISCOVERED', 'VERIFIED', 'PRIORITIZED', 'APPROVAL_REQUIRED'] } } }),
      db.contentItem.count({ where: { brandId: brand.id } }),
      db.contentItem.count({ where: { brandId: brand.id, stage: { in: ['PUBLISHED', 'MONITORING'] } } }),
      db.publisher.count({ where: { brandId: brand.id } }),
      db.aiPrompt.findMany({ where: { brandId: brand.id } }),
      db.approvalItem.count({ where: { brandId: brand.id, status: 'PENDING' } }),
      db.systemEvent.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: 'desc' }, take: 8 }),
      db.backlinkRecord.count({ where: { brandId: brand.id, status: 'ACTIVE' } }),
    ])

    // weekly history for chart
    const reports = await db.weeklyReport.findMany({
      where: { brandId: brand.id },
      orderBy: { weekOf: 'asc' },
      select: { weekOf: true, organicGrowthScore: true, organicClicks: true, aiMentionRate: true, referringDomains: true, top10Count: true },
    })

    const mentionedPrompts = aiPrompts.filter((p) =>
      p.chatgptMentioned || p.geminiMentioned || p.perplexityMentioned || p.claudeMentioned || p.copilotMentioned
    )
    // REAL mention rate — only prompts measured via a live LLM call
    // (source "LLM") are counted; unchecked prompts never inflate it
    const llmPrompts = aiPrompts.filter((p) => p.source === 'LLM')
    const rateBase = llmPrompts.length > 0 ? llmPrompts : aiPrompts
    const mentionedLlm = rateBase.filter((p) =>
      p.chatgptMentioned || p.geminiMentioned || p.perplexityMentioned || p.claudeMentioned || p.copilotMentioned
    )
    const aiMentionRate = rateBase.length > 0 ? Math.round((mentionedLlm.length / rateBase.length) * 100) : 0

    // autonomy mix
    const opportunities = await db.opportunity.findMany({
      where: { brandId: brand.id },
      select: { autonomyLevel: true },
    })
    const autonomyMix = {
      GREEN: opportunities.filter((o) => o.autonomyLevel === 'GREEN').length,
      YELLOW: opportunities.filter((o) => o.autonomyLevel === 'YELLOW').length,
      RED: opportunities.filter((o) => o.autonomyLevel === 'RED').length,
    }

    // ---------- REAL data overlay (Google Search Console + GA4 via Porter) ----------
    // When Porter is connected, the KPIs below switch to real Google numbers
    // and each KPI carries a `real` flag so the UI can badge it LIVE/DEMO.
    const keywordSources = await db.keyword.groupBy({ by: ['source'], _count: { _all: true }, where: { brandId: brand.id } })
    const bySource = new Map(keywordSources.map((g) => [g.source, g._count._all]))
    const realKeywordCount = (bySource.get('GSC') ?? 0) + (bySource.get('DATAFORSEO') ?? 0)

    const live = await fetchLiveStats(28).catch(() => null)
    const realTraffic = Boolean(live?.connected && (live.gsc.available || live.ga4.available))

    // ---------- REAL referring domains (DataForSEO Backlinks API) ----------
    // Falls back to the local outreach-acquired backlink count (0) when
    // DataForSEO keys are missing/invalid — and says so honestly.
    // ?refresh=1 (the dashboard Refresh button) forces a live re-pull,
    // bypassing the 6h cache — errors were never cached longer than 60s.
    const force = req.nextUrl.searchParams.get('refresh') === '1'
    const backlinksLive = await fetchBacklinksSummary(brand.domain, force).catch(() => null)
    const realReferringDomains = backlinksLive?.ok && backlinksLive.referringDomains !== null
    const lastMentionCheck = llmPrompts.length > 0
      ? llmPrompts.reduce((max, p) => (p.lastCheckedAt > max ? p.lastCheckedAt : max), llmPrompts[0].lastCheckedAt)
      : null
    const pendingRealOpps = await db.opportunity.count({
      where: { brandId: brand.id, status: { in: ['DISCOVERED', 'VERIFIED', 'PRIORITIZED', 'APPROVAL_REQUIRED'] }, source: 'GSC' },
    })
    const engineApprovals = await db.approvalItem.count({ where: { brandId: brand.id, source: 'ENGINE' } })
    const realClicks = live?.gsc.available ? live.gsc.totals.clicks : null
    const realImpressions = live?.gsc.available ? live.gsc.totals.impressions : null
    const realCtr = live?.gsc.available ? Number(live.gsc.totals.ctr.toFixed(2)) : null
    const realPosition = live?.gsc.available && live.gsc.totals.position !== null ? Number(live.gsc.totals.position.toFixed(1)) : null
    const realSessions = live?.ga4.available ? live.ga4.totals.sessions : null
    const realUsers = live?.ga4.available ? live.ga4.totals.users : null

    // real clicks series for the chart (replaces the demo weekly history
    // when available — same shape so the UI stays simple)
    const realHistory = realTraffic && (live?.gsc.daily?.length ?? 0) > 0
      ? (live?.gsc.daily ?? []).map((p) => ({
          weekOf: p.date,
          organicClicks: p.clicks,
          impressions: p.impressions,
          organicGrowthScore: 0,
          aiMentionRate: 0,
          referringDomains: 0,
          top10Count: 0,
        }))
      : null

    return NextResponse.json({
      brand: {
        id: brand.id, slug: brand.slug, name: brand.name, domain: brand.domain,
        status: brand.status, industry: brand.industry, baselineScore: brand.baselineScore,
      },
      kpis: {
        // real GSC clicks replace the demo estimate when connected
        organicClicks: realClicks ?? latestReport?.organicClicks ?? 0,
        clicksDelta: latestReport?.organicClicksDelta ?? 0,
        scoreDirection: latestReport?.direction ?? 'FLAT',
        organicGrowthScore: latestReport?.organicGrowthScore ?? 0,
        top3,
        top10,
        trackedKeywords: keywordCount,
        realTrackedKeywords: realKeywordCount,
        referringDomains: realReferringDomains ? (backlinksLive?.referringDomains ?? backlinks) : backlinks,
        aiMentionRate,
        pendingOpportunities,
        activeOpportunities: opportunityCount,
        publishedContent: publishedCount,
        totalContent: contentCount,
        qualifiedPublishers: publisherCount,
        pendingApprovals: approvalCount,
      },
      // which KPIs are REAL right now (drives the LIVE/DEMO chips in the UI)
      kpiReal: {
        organicClicks: realClicks !== null,
        top3: realKeywordCount > 0,
        top10: realKeywordCount > 0,
        trackedKeywords: realKeywordCount > 0,
        referringDomains: realReferringDomains,
        aiMentionRate: llmPrompts.length > 0,
        pendingOpportunities: pendingRealOpps > 0,
        pendingApprovals: engineApprovals > 0,
      },
      // honest context for the KPI cards (what backs each number)
      kpiNotes: {
        referringDomains: backlinksLive?.message ?? null,
        aiMentionRate: lastMentionCheck
          ? `${llmPrompts.length} prompts measured via live LLM answers (last: ${lastMentionCheck.toISOString().slice(0, 10)})`
          : null,
      },
      live: {
        traffic: realTraffic,
        clicks: realClicks,
        impressions: realImpressions,
        ctr: realCtr,
        position: realPosition,
        sessions: realSessions,
        users: realUsers,
        gscAccount: live?.gsc.accountName ?? null,
        ga4Account: live?.ga4.accountName ?? null,
        gscTopQueries: live?.gsc.topQueries?.slice(0, 5) ?? [],
        range: live?.range ?? null,
      },
      realHistory,
      autonomyMix,
      weeklyHistory: reports,
      latestReport,
      recentEvents: events,
      hasData: true,
    })
  } catch (e) {
    console.error('overview error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
