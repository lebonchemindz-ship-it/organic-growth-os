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

    const reports = await db.weeklyReport.findMany({
      where: { brandId: brand.id },
      orderBy: { weekOf: 'desc' },
    })

    return NextResponse.json({
      reports,
      latest: reports[0] ?? null,
    })
  } catch (e) {
    console.error('reports error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
