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

    const opportunities = await db.opportunity.findMany({
      where: { brandId: brand.id },
      orderBy: { opportunityScore: 'desc' },
    })

    return NextResponse.json({
      opportunities,
      summary: {
        total: opportunities.length,
        green: opportunities.filter((o) => o.autonomyLevel === 'GREEN').length,
        yellow: opportunities.filter((o) => o.autonomyLevel === 'YELLOW').length,
        red: opportunities.filter((o) => o.autonomyLevel === 'RED').length,
        completed: opportunities.filter((o) => o.status === 'COMPLETED').length,
        avgScore: opportunities.length
          ? Math.round((opportunities.reduce((s, o) => s + o.opportunityScore, 0) / opportunities.length) * 10) / 10
          : 0,
      },
    })
  } catch (e) {
    console.error('opportunities error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// Update opportunity status (e.g. approve RED item)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, status } = body
    if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })

    const opportunity = await db.opportunity.update({
      where: { id },
      data: {
        status,
        completedAt: status === 'COMPLETED' ? new Date() : null,
      },
    })
    return NextResponse.json({ opportunity })
  } catch (e) {
    console.error('opportunity patch error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
