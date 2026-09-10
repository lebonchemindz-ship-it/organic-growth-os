import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'
import { hunterReady } from '@/lib/hunter'
import { smtpReady } from '@/lib/email-sender'
import { discoverPublishers, launchOutreach, sendDueFollowups, markCampaignReplied, deletePublisher } from '@/lib/outreach-engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded()
    const brandSlug = req.nextUrl.searchParams.get('brand') || 'holy_strips'
    const brand = await db.brand.findUnique({ where: { slug: brandSlug } })
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

    const campaigns = await db.outreachCampaign.findMany({
      where: { brandId: brand.id },
      include: { publisher: true },
      orderBy: { updatedAt: 'desc' },
    })

    const publishers = await db.publisher.findMany({
      where: { brandId: brand.id },
      orderBy: { qualificationScore: 'desc' },
    })

    const backlinks = await db.backlinkRecord.findMany({
      where: { brandId: brand.id },
      orderBy: { authorityScore: 'desc' },
    })

    const [hunter, smtp] = await Promise.all([hunterReady(), smtpReady()])

    // due follow-ups + daily-cap usage for the engine status strip
    const DAY_MS = 24 * 60 * 60_000
    const now = Date.now()
    const sentTodayStart = new Date()
    sentTodayStart.setUTCHours(0, 0, 0, 0)
    const activeCampaigns = await db.outreachCampaign.findMany({
      where: { brandId: brand.id, status: 'SENT', sequenceStage: { in: ['DAY_1', 'DAY_5', 'DAY_12'] } },
      select: { sequenceStage: true, sentAt: true },
    })
    const dueFollowups = activeCampaigns.filter((c) => {
      if (!c.sentAt) return false
      const age = now - c.sentAt.getTime()
      return (c.sequenceStage === 'DAY_1' && age >= 4 * DAY_MS) || (c.sequenceStage === 'DAY_5' && age >= 7 * DAY_MS)
    }).length
    const sentToday = await db.outreachCampaign.count({ where: { brandId: brand.id, sentAt: { gte: sentTodayStart } } })

    return NextResponse.json({
      campaigns,
      publishers,
      backlinks,
      engine: {
        hunterReady: hunter,
        smtpReady: smtp,
        dueFollowups,
        sentToday,
        dailyCap: 30,
      },
      summary: {
        totalPublishers: publishers.length,
        qualified: publishers.filter((p) => p.qualificationScore >= 70).length,
        contacted: publishers.filter((p) => ['CONTACTED', 'REPLIED', 'NEGOTIATING', 'PLACED'].includes(p.status)).length,
        replied: publishers.filter((p) => ['REPLIED', 'NEGOTIATING', 'PLACED'].includes(p.status)).length,
        placed: publishers.filter((p) => p.status === 'PLACED').length,
        activeSequences: campaigns.filter((c) => ['SENT', 'QUEUED'].includes(c.status)).length,
        referringDomains: backlinks.length,
        avgAuthority: backlinks.length
          ? Math.round(backlinks.reduce((s, b) => s + b.authorityScore, 0) / backlinks.length)
          : 0,
        referralTraffic: backlinks.reduce((s, b) => s + b.referralTraffic, 0),
        dailyCap: 30,
      },
    })
  } catch (e) {
    console.error('outreach error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// ============================================================
// OUTREACH ENGINE ACTIONS (POST)
//   discover     — find + verify + qualify publishers (Hunter)
//   launch       — start Day-1 outreach (SMTP send, 30/day cap)
//   followups    — send every due Day-5 / Day-12 follow-up
//   mark-replied — stop a sequence after a real reply
// ============================================================

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded()
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')
    const brandSlug = String(body.brandSlug || 'holy_strips')
    const brand = await db.brand.findUnique({ where: { slug: brandSlug } })
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

    if (action === 'discover') {
      const seed = typeof body.seed === 'string' ? body.seed : ''
      const domains = Array.isArray(body.domains)
        ? body.domains.filter((d: unknown) => typeof d === 'string' && d.trim()).map(String)
        : typeof body.domains === 'string'
          ? (body.domains as string).split(/[\n,;\s]+/).filter(Boolean)
          : []
      const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 25)
      const autoLaunch = body.autoLaunch !== false // default ON — "contact them automatically"
      const result = await discoverPublishers(brand.id, brand.domain, {
        seed, domains, limit, autoLaunch, brandName: brand.name,
      })
      return NextResponse.json(result, { status: result.ok ? 200 : 400 })
    }

    if (action === 'launch') {
      const publisherIds = Array.isArray(body.publisherIds) ? body.publisherIds.map(String) : undefined
      const limit = Math.min(Math.max(Number(body.limit) || 30, 1), 30)
      const result = await launchOutreach(brand.id, brand.name, brand.domain, { publisherIds, limit })
      return NextResponse.json(result, { status: result.ok ? 200 : 400 })
    }

    if (action === 'followups') {
      const result = await sendDueFollowups(brand.id, brand.name, brand.domain)
      return NextResponse.json(result, { status: result.ok ? 200 : 400 })
    }

    if (action === 'mark-replied') {
      const campaignId = String(body.campaignId || '')
      if (!campaignId) return NextResponse.json({ ok: false, message: 'campaignId required.' }, { status: 400 })
      const result = await markCampaignReplied(campaignId, brand.id)
      return NextResponse.json(result, { status: result.ok ? 200 : 400 })
    }

    if (action === 'delete-publisher') {
      const publisherId = String(body.publisherId || '')
      if (!publisherId) return NextResponse.json({ ok: false, message: 'publisherId required.' }, { status: 400 })
      const result = await deletePublisher(publisherId, brand.id)
      return NextResponse.json(result, { status: result.ok ? 200 : 400 })
    }

    return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 })
  } catch (e) {
    console.error('outreach POST error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
