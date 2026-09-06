import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'

export const dynamic = 'force-dynamic'

const STAGES = ['BRIEF', 'DRAFTING', 'FACT_CHECK', 'OPTIMIZING', 'IMAGING', 'LINKING', 'SCHEDULED', 'PUBLISHED', 'MONITORING', 'REFRESHING']

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded()
    const brandSlug = req.nextUrl.searchParams.get('brand') || 'holy_strips'
    const brand = await db.brand.findUnique({ where: { slug: brandSlug } })
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

    const items = await db.contentItem.findMany({
      where: { brandId: brand.id },
      orderBy: { updatedAt: 'desc' },
    })

    const byStage: Record<string, number> = {}
    for (const s of STAGES) byStage[s] = items.filter((i) => i.stage === s).length

    return NextResponse.json({
      items,
      byStage,
      summary: {
        total: items.length,
        published: items.filter((i) => ['PUBLISHED', 'MONITORING'].includes(i.stage)).length,
        inProduction: items.filter((i) => ['BRIEF', 'DRAFTING', 'FACT_CHECK', 'OPTIMIZING', 'IMAGING', 'LINKING'].includes(i.stage)).length,
        scheduled: items.filter((i) => i.stage === 'SCHEDULED').length,
        totalWords: items.reduce((s, i) => s + i.wordCount, 0),
        totalOrganicClicks: items.reduce((s, i) => s + i.organicClicks, 0),
        withImages: items.filter((i) => i.hasImages).length,
      },
    })
  } catch (e) {
    console.error('content error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
