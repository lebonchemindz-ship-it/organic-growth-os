import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'

export const dynamic = 'force-dynamic'

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

    return NextResponse.json({
      campaigns,
      publishers,
      backlinks,
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
