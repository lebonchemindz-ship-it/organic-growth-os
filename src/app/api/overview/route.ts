import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'

export const dynamic = 'force-dynamic'

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
      db.opportunity.count({ where: { brandId: brand.id, status: { in: ['DISCOVERED', 'VERIFIED', 'PRIORITIZED'] } } }),
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
    const aiMentionRate = aiPrompts.length > 0 ? Math.round((mentionedPrompts.length / aiPrompts.length) * 100) : 0

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

    return NextResponse.json({
      brand: {
        id: brand.id, slug: brand.slug, name: brand.name, domain: brand.domain,
        status: brand.status, industry: brand.industry, baselineScore: brand.baselineScore,
      },
      kpis: {
        organicGrowthScore: latestReport?.organicGrowthScore ?? 0,
        scoreDirection: latestReport?.direction ?? 'FLAT',
        organicClicks: latestReport?.organicClicks ?? 0,
        clicksDelta: latestReport?.organicClicksDelta ?? 0,
        top3, top10,
        trackedKeywords: keywordCount,
        referringDomains: backlinks,
        aiMentionRate,
        pendingOpportunities,
        activeOpportunities: opportunityCount,
        publishedContent: publishedCount,
        totalContent: contentCount,
        qualifiedPublishers: publisherCount,
        pendingApprovals: approvalCount,
      },
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
