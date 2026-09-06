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

    const items = await db.approvalItem.findMany({
      where: { brandId: brand.id },
      orderBy: { requestedAt: 'desc' },
    })

    return NextResponse.json({
      items,
      summary: {
        pending: items.filter((i) => i.status === 'PENDING').length,
        approved: items.filter((i) => i.status === 'APPROVED').length,
        rejected: items.filter((i) => i.status === 'REJECTED').length,
      },
    })
  } catch (e) {
    console.error('approvals error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// Approve / reject a RED action
export async function PATCH(req: NextRequest) {
  try {
    const { id, decision } = await req.json()
    if (!id || !['APPROVED', 'REJECTED', 'PENDING'].includes(decision)) {
      return NextResponse.json({ error: 'id and decision (APPROVED|REJECTED|PENDING) required' }, { status: 400 })
    }

    const item = await db.approvalItem.update({
      where: { id },
      data: {
        status: decision,
        decidedAt: decision === 'PENDING' ? null : new Date(),
      },
    })

    // if approved, link the related opportunity to execution
    if (decision === 'APPROVED') {
      await db.systemEvent.create({
        data: {
          brandId: item.brandId,
          type: 'APPROVAL',
          level: 'INFO',
          message: `Owner APPROVED: ${item.title}`,
          meta: 'RED action released for execution. Daily loop continues.',
        },
      })
    }

    return NextResponse.json({ item })
  } catch (e) {
    console.error('approvals patch error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
