// ============================================================
// KEYWORD UNIVERSE — /api/keywords
// GET  → the keyword list + summary (live/demo counts).
//        Materializes the REAL Google Search Console queries
//        on read (source of truth = Google via Porter), so real
//        keywords survive every cold start without a database.
// POST → { action: 'sync-gsc' | 'research', ... } — write actions
//        live in THIS route (one serverless function = one DB
//        shared with the GET above, so the UI sees them
//        immediately).
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'
import { ensureGscMaterialized, syncGscKeywords } from '@/lib/gsc-keywords'
import { researchKeywords } from '@/lib/dataforseo'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function loadBrand(brandSlug: string) {
  return db.brand.findUnique({ where: { slug: brandSlug } })
}

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded()
    const brandSlug = req.nextUrl.searchParams.get('brand') || 'holy_strips'
    const brand = await loadBrand(brandSlug)
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

    // real GSC keywords materialized from the source of truth (fast no-op
    // when this instance did it within the last 5 minutes)
    await ensureGscMaterialized(brand.id, brand.domain)

    const keywords = await db.keyword.findMany({
      where: { brandId: brand.id },
      orderBy: [{ currentPosition: 'asc' }, { impressions: 'desc' }],
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
        // totalVolume only counts REAL DataForSEO volumes (0 until keys added)
        totalVolume: keywords.reduce((s, k) => s + k.monthlyVolume, 0),
        // REAL GSC numbers (90-day window)
        totalImpressions: keywords.reduce((s, k) => s + k.impressions, 0),
        totalClicks: keywords.reduce((s, k) => s + k.clicks, 0),
        // true only when at least one keyword carries a REAL DataForSEO volume
        hasRealVolume: keywords.some((k) => k.monthlyVolume > 0),
        hasRealDifficulty: keywords.some((k) => k.difficulty > 0),
        live: keywords.filter((k) => k.source === 'GSC' || k.source === 'DATAFORSEO').length,
        demo: keywords.filter((k) => k.source !== 'GSC' && k.source !== 'DATAFORSEO').length,
      },
    })
  } catch (e) {
    console.error('keywords error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded()
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')
    const brandSlug = String(body.brandSlug || 'holy_strips')
    const brand = await loadBrand(brandSlug)
    if (!brand) return NextResponse.json({ error: 'brand_not_found', message: 'Brand not found.' }, { status: 404 })

    if (action === 'sync-gsc') {
      const days = Math.min(Math.max(Number(body.days) || 90, 7), 90)
      const result = await syncGscKeywords(brand.id, brand.domain, days)
      if (!result.ok) {
        const status = result.code === 'not_connected' ? 400 : 502
        return NextResponse.json({ error: result.code, message: result.message }, { status })
      }
      return NextResponse.json(result)
    }

    if (action === 'research') {
      const seed = String(body.seed || '').trim().slice(0, 120)
      const autoAdd = body.autoAdd !== false
      const limit = Math.min(Math.max(Number(body.limit) || 20, 5), 25)
      const locationName = String(body.locationName || 'United States').trim().slice(0, 60)
      if (!seed) {
        return NextResponse.json({ error: 'no_seed', message: 'Provide a seed keyword to research.' }, { status: 400 })
      }

      const outcome = await researchKeywords(seed, { limit, locationName })
      if (!outcome.ok) {
        return NextResponse.json(
          { error: outcome.code, message: outcome.message, statusCode: outcome.statusCode ?? null },
          { status: outcome.code === 'invalid_credentials' ? 401 : 502 },
        )
      }

      let addedCount = 0
      let enriched = 0
      if (autoAdd) {
        for (const s of outcome.suggestions.slice(0, 20)) {
          const exists = await db.keyword.findFirst({ where: { brandId: brand.id, term: s.term } })
          if (exists) {
            await db.keyword.update({
              where: { id: exists.id },
              data: {
                monthlyVolume: s.volume || exists.monthlyVolume,
                difficulty: s.difficulty || exists.difficulty,
                source: exists.source === 'GSC' ? 'GSC' : 'DATAFORSEO',
              },
            })
            enriched += 1
            continue
          }
          await db.keyword.create({
            data: {
              brandId: brand.id,
              term: s.term,
              intent: s.intent,
              funnelStage: s.funnel,
              // REAL DataForSEO numbers:
              monthlyVolume: s.volume,
              difficulty: s.difficulty,
              // heuristic scores stay 0 — never shown as measured data
              commercialValue: 0,
              aeoValue: 0,
              geoValue: 0,
              status: 'TRACKING',
              source: 'DATAFORSEO',
            },
          })
          addedCount += 1
        }
        try {
          await db.systemEvent.create({
            data: {
              brandId: brand.id,
              type: 'CREDENTIAL',
              level: 'INFO',
              message: `[KEYWORD_RESEARCH] Researched "${seed}" via DataForSEO — ${addedCount} new keywords added`,
              meta: `location=${locationName} suggestions=${outcome.suggestions.length}`,
            },
          })
        } catch {
          // logging is best-effort
        }
      }

      return NextResponse.json({
        ok: true,
        seed,
        locationName,
        suggestions: outcome.suggestions,
        addedCount,
        enriched,
      })
    }

    return NextResponse.json({ error: 'unknown_action', message: 'Use action: "sync-gsc" or "research".' }, { status: 400 })
  } catch (e) {
    console.error('[keywords] POST failed:', e)
    return NextResponse.json({ error: 'keyword_action_failed', message: 'The keyword action failed with an internal error.' }, { status: 500 })
  }
}
