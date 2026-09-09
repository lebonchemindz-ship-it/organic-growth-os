import { db } from '@/lib/db'

// ============================================================
// SEED — v1.8 "NO DEMO DATA"
// ============================================================
// History: until v1.7 this seed filled the database with a full
// synthetic demo dataset (fake keywords, fake content items with
// URLs that 404'd on the real store, fake publishers, fake weekly
// reports…). The owner made it explicit: never show demo numbers
// as if they were real. From v1.8 the seed creates ONLY genuinely
// true configuration data:
//
//   1. The brand roster (the actual brands being operated).
//   2. The integration checklist — a static reference catalog.
//      Live connection status is NOT stored here; it is
//      reconciled from the real credential vault / Porter state
//      at read time in /api/integrations.
//
// Everything else (keywords, content, opportunities, publishers,
// outreach, AI visibility, reports, tasks, backlinks, events)
// starts EMPTY and is filled only by real sources (Google Search
// Console / GA4 via Porter, DataForSEO) or by real actions the
// owner or the Growth Agent perform.
//
// A one-time migration in ensure-seed.ts purges the old demo rows
// from databases created by earlier versions.
// ============================================================

export async function seedDatabase() {
  // wipe all app data (NOT the credential vault and NOT chat history)
  await db.systemEvent.deleteMany()
  await db.integration.deleteMany()
  await db.backlinkRecord.deleteMany()
  await db.weeklyReport.deleteMany()
  await db.approvalItem.deleteMany()
  await db.aiPrompt.deleteMany()
  await db.outreachCampaign.deleteMany()
  await db.publisher.deleteMany()
  await db.contentItem.deleteMany()
  await db.opportunity.deleteMany()
  await db.keyword.deleteMany()
  await db.task.deleteMany()
  await db.brand.deleteMany()

  // ============================================================
  // BRANDS — the real roster (config, not metrics)
  // ============================================================
  await db.brand.create({
    data: {
      slug: 'holy_strips',
      name: 'Holy Strips',
      domain: 'holystrips.com',
      status: 'ACTIVE',
      industry: 'Dissolvable supplement strips',
      description: 'Dissolvable oral supplement strips. First brand activated on the Organic Growth OS. Ecommerce brand on Shopify with Merchant Center product feeds.',
      positioning: 'Clean-label dissolvable strips that replace bulky capsules — no pills, no water, no fillers.',
      targetAudience: 'Health-conscious adults 25-55, fitness enthusiasts, travelers, people with pill fatigue.',
      voice: 'Scientific but friendly. Transparent about ingredients. No hype claims.',
      approvedClaims: 'Supports energy metabolism (B12 methylcobalamin). Supports immune function (Vitamin C & D3). Standard supplement facts structure claims only.',
      restrictedClaims: 'No disease treatment claims. No FDA evaluation statements beyond required disclaimers. No weight-loss promises. No "clinically proven" language without on-file studies.',
      baselineScore: 0, // measured by a real audit, not invented
    },
  })

  await db.brand.create({
    data: {
      slug: 'armoray',
      name: 'Armoray',
      domain: 'armoray.com',
      status: 'PENDING_ACTIVATION',
      industry: 'Performance supplements',
      description: 'Second brand in the queue. Waiting for GSC + GA4 + Shopify connections before activation.',
      positioning: 'Performance nutrition for endurance athletes.',
      targetAudience: 'Endurance athletes, runners, cyclists.',
      voice: 'Data-driven, performance-focused.',
      approvedClaims: 'Pending brand truth intake.',
      restrictedClaims: 'Pending brand truth intake.',
      baselineScore: 0,
    },
  })

  await db.brand.create({
    data: {
      slug: 'zero_trace',
      name: 'Zero Trace',
      domain: 'zerotrace.co',
      status: 'PENDING_ACTIVATION',
      industry: 'Clean-label wellness',
      description: 'Third brand in the roadmap. Awaiting activation after Armoray.',
      positioning: 'Zero filler, zero artificial ingredients.',
      targetAudience: 'Clean-label consumers.',
      voice: 'Minimal, honest, ingredient-first.',
      approvedClaims: 'Pending brand truth intake.',
      restrictedClaims: 'Pending brand truth intake.',
      baselineScore: 0,
    },
  })

  await db.brand.create({
    data: {
      slug: 'fully_nutrition',
      name: 'Fully Nutrition',
      domain: 'fullynutrition.com',
      status: 'PENDING_ACTIVATION',
      industry: 'Daily nutrition',
      description: 'Fourth brand in the roadmap.',
      positioning: 'Complete daily nutrition, simplified.',
      targetAudience: 'Busy professionals.',
      voice: 'Warm, practical, science-backed.',
      approvedClaims: 'Pending brand truth intake.',
      restrictedClaims: 'Pending brand truth intake.',
      baselineScore: 0,
    },
  })

  await seedIntegrations()

  // One honest bootstrap event
  await db.systemEvent.create({
    data: {
      brandId: null,
      type: 'SYSTEM',
      level: 'INFO',
      message: 'Database initialized — no demo data. Real data flows in from connected sources (Search Console, GA4, DataForSEO) and agent actions.',
      meta: 'seed=v1.8',
    },
  })

  console.log('Seed complete (v1.8 — configuration only, no demo data):')
  console.log('  Brands:', await db.brand.count())
  console.log('  Integrations:', await db.integration.count())
  console.log('  Keywords/Content/Opportunities/Publishers/Reports: 0 (real sources only)')
}

export async function seedIntegrations() {
  await db.integration.deleteMany()

  // ============================================================
  // INTEGRATION CHECKLIST — static catalog.
  // Statuses here are the honest DEFAULT (pending). /api/integrations
  // overrides them at read time with the real connection state
  // (Porter/GSC/GA4 accounts, DataForSEO auth, Anthropic key).
  // Also used by the v1.8 one-time purge to rebuild the catalog
  // on databases created by older versions (which contained fake
  // "CONNECTED" statuses and a non-existent Supabase row).
  // ============================================================
  const integrationSeeds: Array<[number, string, string, string, string, string, string]> = [
    [1, 'SQLite Database (persistent volume)', 'DATABASE', 'Permanent OS database and persistent memory — lives on a Railway volume so history, tasks, keywords and credentials survive restarts. Brand isolation via brand_id on every table.', 'SHARED', 'PENDING', 'https://www.sqlite.org/docs.html'],
    [2, 'DataForSEO MCP', 'INTELLIGENCE', 'SERPs, keywords, competitors, backlinks, technical audits, AI data. Official Claude Code MCP server.', 'SHARED', 'PENDING', 'https://docs.dataforseo.com'],
    [3, 'Activepieces', 'AUTOMATION', '24/7 scheduler and orchestration layer. Runs the 16 OS flows even when laptop is off.', 'SHARED', 'PENDING', 'https://activepieces.com/docs'],
    [4, 'Anthropic API', 'BRAIN', 'Runs Claude automatically inside Activepieces flows (headless daily loop) and powers the Growth Agent.', 'SHARED', 'PENDING', 'https://console.anthropic.com'],
    [5, 'Google Search Console (via Porter Metrics)', 'GOOGLE', 'Actual Google rankings and query data. Per-brand property.', 'PER_BRAND', 'PENDING', 'https://search.google.com/search-console'],
    [6, 'GA4 (via Porter Metrics)', 'GOOGLE', 'Traffic, conversions, and revenue attribution.', 'PER_BRAND', 'PENDING', 'https://analytics.google.com'],
    [7, 'Shopify (CMS)', 'PUBLISHING', 'Content publishing, product data, collections.', 'PER_BRAND', 'PENDING', 'https://shopify.dev/docs/api'],
    [8, 'Google Merchant Center', 'GOOGLE', 'Product feed health, free product surfaces.', 'PER_BRAND', 'PENDING', 'https://merchants.google.com'],
    [9, 'Bing Webmaster Tools', 'MICROSOFT', 'Bing and Copilot visibility data.', 'PER_BRAND', 'PENDING', 'https://www.bing.com/webmasters'],
    [10, 'IndexNow', 'INDEXING', 'Instant URL-change notification (Bing, Yandex).', 'PER_BRAND', 'PENDING', 'https://indexnow.org'],
    [11, 'Hunter', 'OUTREACH', 'Publisher contact discovery, verification, sequences (max 30/day).', 'SHARED', 'PENDING', 'https://hunter.io/api'],
    [12, 'Recraft API', 'CREATIVE', 'Automated editorial imagery for content (API-quality image generation).', 'SHARED', 'PENDING', 'https://www.recraft.ai'],
    [13, 'Brand Asset Storage', 'PUBLISHING', 'Product truth, approved imagery, guides, research per brand.', 'PER_BRAND', 'PENDING', ''],
  ]

  const envVars: Record<string, string> = {
    'SQLite Database (persistent volume)': 'DATABASE_URL',
    'DataForSEO MCP': 'DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD',
    'Activepieces': 'ACTIVEPIECES_API_KEY',
    'Anthropic API': 'ANTHROPIC_API_KEY',
    'Google Search Console (via Porter Metrics)': 'PORTER_ACCESS_TOKEN',
    'GA4 (via Porter Metrics)': 'PORTER_ACCESS_TOKEN',
    'Shopify (CMS)': 'SHOPIFY_ACCESS_TOKEN',
    'Google Merchant Center': 'MERCHANT_CENTER_API_KEY',
    'Bing Webmaster Tools': 'BING_API_KEY',
    'IndexNow': 'INDEXNOW_KEY',
    'Hunter': 'HUNTER_API_KEY',
    'Recraft API': 'RECRAFT_API_KEY',
    'Brand Asset Storage': 'SUPABASE_STORAGE',
  }

  for (const [order, name, layer, purpose, scope, status, docsUrl] of integrationSeeds) {
    await db.integration.create({
      data: { order, name, layer, purpose, scope, status, docsUrl, apiKeyEnvVar: envVars[name] || '' },
    })
  }
}
