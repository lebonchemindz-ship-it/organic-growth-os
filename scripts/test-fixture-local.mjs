// LOCAL TEST FIXTURE ONLY — inserts GSC-shaped keyword rows into the local
// dev database so the growth engine pipeline can be validated end-to-end
// before deploying. Never runs against production (separate DB/volume).
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const BRAND_SLUG = 'holy_strips'

async function main() {
  const brand = await db.brand.findUnique({ where: { slug: BRAND_SLUG } })
  if (!brand) throw new Error('brand missing — run ensureSeeded first (GET /api/overview)')

  // shaped like the real production GSC rows (90-day window)
  const rows = [
    { term: 'holy strips', intent: 'INFORMATIONAL', funnel: 'TOFU', impressions: 1200, clicks: 40, position: 3 },
    { term: 'holy strips vitamin b12', intent: 'INFORMATIONAL', funnel: 'TOFU', impressions: 800, clicks: 22, position: 5 },
    { term: 'vitamin b12 strips', intent: 'COMMERCIAL', funnel: 'MOFU', impressions: 2400, clicks: 18, position: 12 },
    { term: 'best b12 strips', intent: 'COMMERCIAL', funnel: 'MOFU', impressions: 900, clicks: 9, position: 7 },
    { term: 'b12 patch vs strips', intent: 'COMMERCIAL', funnel: 'MOFU', impressions: 600, clicks: 6, position: 9 },
    { term: 'b12 supplements for vegetarians', intent: 'INFORMATIONAL', funnel: 'TOFU', impressions: 3000, clicks: 5, position: 18 },
    { term: 'where to buy b12 strips', intent: 'TRANSACTIONAL', funnel: 'BOFU', impressions: 300, clicks: 12, position: 4 },
    { term: 'b12 energy strips review', intent: 'COMMERCIAL', funnel: 'MOFU', impressions: 400, clicks: 3, position: 14 },
  ]

  for (const r of rows) {
    await db.keyword.upsert({
      where: { id: `test-${r.term.replace(/\s+/g, '-')}` },
      create: {
        id: `test-${r.term.replace(/\s+/g, '-')}`,
        brandId: brand.id, term: r.term, intent: r.intent, funnelStage: r.funnel,
        monthlyVolume: 0, difficulty: 0,
        impressions: r.impressions, clicks: r.clicks,
        currentPosition: r.position, previousPosition: 0,
        targetUrl: '', commercialValue: 0, aeoValue: 0, geoValue: 0,
        status: 'TRACKING', source: 'GSC',
      },
      update: { impressions: r.impressions, clicks: r.clicks, currentPosition: r.position, source: 'GSC' },
    })
  }
  const count = await db.keyword.count({ where: { brandId: brand.id, source: 'GSC' } })
  console.log(`local fixture: ${count} GSC keywords`)
  await db.opportunity.deleteMany({ where: { brandId: brand.id, source: 'GSC' } })
  await db.approvalItem.deleteMany({ where: { brandId: brand.id, source: 'ENGINE' } })
  console.log('cleared previous engine rows')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
