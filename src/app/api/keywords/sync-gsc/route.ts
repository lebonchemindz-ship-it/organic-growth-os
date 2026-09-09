// ============================================================
// GSC KEYWORD SYNC — POST /api/keywords/sync-gsc
// Imports the REAL queries people search on Google (from the
// connected Google Search Console account via Porter Metrics)
// into the keyword universe: real positions, impressions and
// click data. This replaces demo keywords with live data.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'
import { syncGscKeywords } from '@/lib/gsc-keywords'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded()
    const body = await req.json().catch(() => ({}))
    const brandSlug = String(body.brandSlug || 'holy_strips')
    const days = Math.min(Math.max(Number(body.days) || 90, 7), 90)

    const brand = await db.brand.findUnique({ where: { slug: brandSlug } })
    if (!brand) return NextResponse.json({ error: 'brand_not_found', message: 'Brand not found.' }, { status: 404 })

    const result = await syncGscKeywords(brand.id, brand.domain, days)
    if (!result.ok) {
      const status = result.code === 'not_connected' ? 400 : 502
      return NextResponse.json({ error: result.code, message: result.message }, { status })
    }

    return NextResponse.json(result)
  } catch (e) {
    console.error('[keywords:sync-gsc] failed:', e)
    return NextResponse.json({ error: 'sync_failed', message: 'Search Console sync failed with an internal error.' }, { status: 500 })
  }
}
