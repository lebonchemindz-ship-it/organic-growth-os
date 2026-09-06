import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await ensureSeeded()
    const brands = await db.brand.findMany({
      orderBy: { createdAt: 'asc' },
    })
    // attach counts per brand
    const result = await Promise.all(
      brands.map(async (b) => {
        const [kw, opp, content, reports, latestReport] = await Promise.all([
          db.keyword.count({ where: { brandId: b.id } }),
          db.opportunity.count({ where: { brandId: b.id } }),
          db.contentItem.count({ where: { brandId: b.id } }),
          db.weeklyReport.count({ where: { brandId: b.id } }),
          db.weeklyReport.findFirst({ where: { brandId: b.id }, orderBy: { weekOf: 'desc' } }),
        ])
        return {
          ...b,
          stats: {
            keywords: kw,
            opportunities: opp,
            content,
            reports,
            currentScore: latestReport?.organicGrowthScore ?? b.baselineScore,
          },
        }
      })
    )
    return NextResponse.json({ brands: result })
  } catch (e) {
    console.error('brands error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
