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

    const keywords = await db.keyword.findMany({
      where: { brandId: brand.id },
      orderBy: [{ currentPosition: 'asc' }, { monthlyVolume: 'desc' }],
    })

    return NextResponse.json({
      keywords: keywords.map((k) => ({
        ...k,
        change: k.previousPosition > 0
          ? k.previousPosition - k.currentPosition
          : 0,
      })),
      summary: {
        total: keywords.length,
        top3: keywords.filter((k) => k.currentPosition >= 1 && k.currentPosition <= 3).length,
        top10: keywords.filter((k) => k.currentPosition >= 1 && k.currentPosition <= 10).length,
        positions1120: keywords.filter((k) => k.currentPosition >= 11 && k.currentPosition <= 20).length,
        notRanking: keywords.filter((k) => k.currentPosition === 0).length,
        totalVolume: keywords.reduce((s, k) => s + k.monthlyVolume, 0),
        live: keywords.filter((k) => k.source === 'GSC' || k.source === 'DATAFORSEO').length,
        demo: keywords.filter((k) => k.source !== 'GSC' && k.source !== 'DATAFORSEO').length,
      },
    })
  } catch (e) {
    console.error('keywords error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
