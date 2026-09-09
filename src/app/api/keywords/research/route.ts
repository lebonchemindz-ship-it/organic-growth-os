// ============================================================
// KEYWORD RESEARCH — POST /api/keywords/research
// Real keyword suggestions (volume, difficulty, CPC) from
// DataForSEO Labs, optionally auto-added to the keyword
// universe with source = DATAFORSEO.
// Clear, actionable error when the DataForSEO credentials
// are missing or rejected (40100 → use API Access creds,
// not the dashboard email/password).
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'
import { researchKeywords } from '@/lib/dataforseo'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded()
    const body = await req.json().catch(() => ({}))
    const seed = String(body.seed || '').trim().slice(0, 120)
    const brandSlug = String(body.brandSlug || 'holy_strips')
    const autoAdd = body.autoAdd !== false // default: add to the universe
    const limit = Math.min(Math.max(Number(body.limit) || 20, 5), 25)
    const locationName = String(body.locationName || 'United States').trim().slice(0, 60)

    if (!seed) {
      return NextResponse.json({ error: 'no_seed', message: 'Provide a seed keyword to research.' }, { status: 400 })
    }

    const brand = await db.brand.findUnique({ where: { slug: brandSlug } })
    if (!brand) return NextResponse.json({ error: 'brand_not_found', message: 'Brand not found.' }, { status: 404 })

    const outcome = await researchKeywords(seed, { limit, locationName })
    if (!outcome.ok) {
      return NextResponse.json(
        { error: outcome.code, message: outcome.message, statusCode: outcome.statusCode ?? null },
        { status: outcome.code === 'invalid_credentials' ? 401 : 502 },
      )
    }

    let added = 0
    let enriched = 0
    if (autoAdd) {
      for (const s of outcome.suggestions.slice(0, 20)) {
        const exists = await db.keyword.findFirst({ where: { brandId: brand.id, term: s.term } })
        if (exists) {
          // enrich existing rows with the real volume/difficulty data,
          // but keywords that already carry real GSC ranking data keep their GSC source
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
            monthlyVolume: s.volume,
            difficulty: s.difficulty,
            currentPosition: 0,
            previousPosition: 0,
            targetUrl: '',
            commercialValue: s.intent === 'TRANSACTIONAL' ? 80 : s.intent === 'COMMERCIAL' ? 60 : 30,
            aeoValue: 45,
            geoValue: 40,
            status: 'TRACKING',
            source: 'DATAFORSEO',
          },
        })
        added += 1
      }
      try {
        await db.systemEvent.create({
          data: {
            brandId: brand.id,
            type: 'CREDENTIAL',
            level: 'INFO',
            message: `[KEYWORD_RESEARCH] Researched "${seed}" via DataForSEO — ${added} new keywords added`,
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
      addedCount: added,
      enriched,
    })
  } catch (e) {
    console.error('[keywords:research] failed:', e)
    return NextResponse.json({ error: 'research_failed', message: 'Keyword research failed with an internal error.' }, { status: 500 })
  }
}
