import { db } from '@/lib/db'

// Deterministic pseudo-random for stable demo data
let seedState = 42
function rand() {
  seedState = (seedState * 16807) % 2147483647
  return seedState / 2147483647
}
function randInt(min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)]
}
function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
}
function daysFromNow(n: number) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000)
}

function computeScore(impact: number, probability: number, confidence: number, strategic: number, urgency: number, effort: number) {
  const raw = (impact * probability * confidence * strategic * urgency) / Math.pow(100, 4) // 0-100
  const adjusted = raw * (1 - effort / 250) // effort penalty
  return Math.round(Math.max(0, Math.min(100, adjusted)) * 10) / 10
}

const STATUS_POOL = ['DISCOVERED', 'VERIFIED', 'PRIORITIZED', 'EXECUTING', 'SCHEDULED', 'TESTING', 'MONITORING', 'COMPLETED']

export async function seedDatabase() {
  // wipe
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
  await db.brand.deleteMany()

  // ============================================================
  // BRANDS
  // ============================================================
  const holyStrips = await db.brand.create({
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
      baselineScore: 38,
    },
  })

  const armoray = await db.brand.create({
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

  const zeroTrace = await db.brand.create({
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

  const fullyNutrition = await db.brand.create({
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

  // ============================================================
  // KEYWORDS — Holy Strips keyword universe
  // ============================================================
  const kwSeeds: Array<[string, string, string, number, number, number]> = [
    ['best b12 supplement', 'COMMERCIAL', 'BOFU', 5400, 62, 14],
    ['methylcobalamin benefits', 'INFORMATIONAL', 'TOFU', 2900, 35, 8],
    ['b12 strips', 'COMMERCIAL', 'BOFU', 1600, 28, 6],
    ['dissolvable supplements', 'INFORMATIONAL', 'TOFU', 880, 24, 11],
    ['vitamin strips vs pills', 'COMMERCIAL', 'MOFU', 720, 19, 4],
    ['how to take b12 without pills', 'INFORMATIONAL', 'TOFU', 590, 12, 3],
    ['best energy supplements for runners', 'COMMERCIAL', 'MOFU', 3300, 58, 22],
    ['b12 for vegetarians', 'INFORMATIONAL', 'TOFU', 4400, 41, 17],
    ['supplement strips for travel', 'COMMERCIAL', 'MOFU', 480, 15, 2],
    ['vitamin d3 strips', 'COMMERCIAL', 'BOFU', 1300, 31, 9],
    ['immune support supplements', 'COMMERCIAL', 'MOFU', 6600, 66, 31],
    ['best vitamin c supplement', 'COMMERCIAL', 'BOFU', 9900, 71, 38],
    ['what is methylcobalamin', 'INFORMATIONAL', 'TOFU', 2400, 22, 5],
    ['b12 deficiency symptoms', 'INFORMATIONAL', 'TOFU', 22000, 55, 0],
    ['pill free vitamins', 'COMMERCIAL', 'MOFU', 390, 18, 7],
    ['best supplements for travelers', 'COMMERCIAL', 'MOFU', 1900, 44, 19],
    ['energy strips supplement', 'COMMERCIAL', 'BOFU', 1100, 21, 1],
    ['b12 absorption comparison', 'INFORMATIONAL', 'TOFU', 880, 17, 12],
    ['clean label supplements', 'COMMERCIAL', 'MOFU', 1600, 38, 26],
    ['vitamin strips for kids', 'COMMERCIAL', 'MOFU', 2400, 33, 0],
  ]

  for (const [term, intent, funnel, volume, difficulty, position] of kwSeeds) {
    const drift = position > 0 ? randInt(-3, 2) : 0
    await db.keyword.create({
      data: {
        brandId: holyStrips.id,
        term,
        intent,
        funnelStage: funnel,
        monthlyVolume: volume,
        difficulty,
        currentPosition: Math.max(0, position + drift),
        previousPosition: position,
        targetUrl: position > 0 ? `https://holystrips.com/${term.replace(/\s+/g, '-')}` : '',
        commercialValue: intent === 'COMMERCIAL' ? randInt(55, 95) : randInt(10, 40),
        aeoValue: intent === 'INFORMATIONAL' ? randInt(50, 90) : randInt(20, 60),
        geoValue: randInt(30, 85),
        status: position === 0 ? 'PARKED' : (position <= 10 ? 'TARGETED' : 'TRACKING'),
      },
    })
  }

  // ============================================================
  // OPPORTUNITIES — Decision Engine queue
  // ============================================================
  const oppSeeds: Array<[string, string, string, number, number, number, number, number, number, string]> = [
    ['Refresh "what-is-methylcobalamin" hub page', 'REFRESH', 'Page ranks #5 with weak internal linking and outdated FAQ. Positions 4-10 refresh pattern detected as 3.2x traffic multiplier in learning engine.', 82, 88, 90, 74, 60, 25, 'GREEN'],
    ['Build "vitamin strips vs pills" comparison cluster', 'CONTENT', 'Ranking #4. Create supporting sub-pages for subqueries. Commercial intent, BOFU adjacent.', 76, 80, 85, 70, 55, 45, 'GREEN'],
    ['Fix structured data on 14 product pages', 'TECHNICAL_SEO', 'Product schema missing supplement facts markup. Rich result eligibility at 0%. Reversible, evidence-supported.', 68, 92, 95, 62, 72, 20, 'GREEN'],
    ['Outreach: 12 qualified health publishers for roundup inclusion', 'OUTREACH', 'Publisher gap analysis shows competitors cited in 18 roundups where Holy Strips is absent. All prospects score 70+.', 84, 65, 80, 88, 68, 55, 'GREEN'],
    ['Create AEO answer blocks for top 10 informational keywords', 'AEO', 'Add Question > direct answer > explanation > evidence structure to 10 pages. ChatGPT and Perplexity already cite 2 of them partially.', 72, 75, 82, 78, 50, 35, 'GREEN'],
    ['Internal linking restructure of blog hub', 'INTERNAL_LINKS', '38 articles with avg 1.2 internal links. Crawl depth 4 for money pages. Link authority flow unoptimized.', 74, 78, 88, 65, 45, 30, 'GREEN'],
    ['New article: "B12 for vegetarians" (position 17, 4400 vol)', 'CONTENT', 'Ranking #17 with thin content. Full rebuild with expert quotes and comparison table. Strong commercial adjacency.', 70, 72, 80, 72, 58, 50, 'YELLOW'],
    ['Merchant Center feed optimization', 'PRODUCT_SEARCH', '32 products, 6 warnings: missing GTINs, weak titles. Free product surface eligibility improvement.', 66, 85, 90, 60, 64, 28, 'GREEN'],
    ['AI citation gap: 5 priority prompts missing brand', 'GEO', 'Brand absent from "best b12 supplement" style prompts on ChatGPT and Perplexity. Cited competitors all appear in 2+ authority domains Holy Strips lacks.', 80, 58, 75, 85, 62, 60, 'YELLOW'],
    ['IndexNow submission for 23 updated URLs', 'INDEXING', 'Batch of recently refreshed pages not yet re-crawled. Eligible for IndexNow ping.', 40, 90, 95, 35, 80, 10, 'GREEN'],
    ['Redirect cleanup: 47 chain redirects', 'TECHNICAL_SEO', 'Redirect chains up to 3 hops on legacy collection URLs. Consolidate to direct 301s.', 52, 90, 92, 48, 40, 22, 'GREEN'],
    ['Unlinked mention reclamation: 9 domains', 'AUTHORITY', '9 sites mention Holy Strips without linking. Reclamation emails historically convert at 22%.', 64, 70, 85, 72, 55, 18, 'GREEN'],
    ['Strong claim: "clinically absorbed 2x faster" — needs owner approval', 'CONTENT', 'New health claim exceeds approved Brand Truth. Legally sensitive, difficult to reverse if challenged. RED classified.', 88, 60, 55, 90, 50, 15, 'RED'],
    ['Paid placement negotiation with major publisher', 'OUTREACH', 'Publisher responded to outreach with $2,400 sponsored post offer. Financially material, requires owner approval.', 76, 75, 90, 82, 65, 10, 'RED'],
    ['Canonical fix on duplicate collection pages', 'TECHNICAL_SEO', '3 collection URLs serving near-duplicate content with conflicting canonicals.', 58, 88, 92, 52, 70, 15, 'GREEN'],
    ['Comparison page: Holy Strips vs capsule brands', 'CONTENT', 'BOFU comparison page targeting branded queries. Requires competitor data verification.', 78, 68, 75, 76, 48, 55, 'YELLOW'],
  ]

  for (const [title, type, description, impact, probability, confidence, strategicValue, urgency, effort, autonomyLevel] of oppSeeds) {
    const score = computeScore(impact, probability, confidence, strategicValue, urgency, effort)
    const status = autonomyLevel === 'RED' ? 'APPROVAL_REQUIRED' : pick(STATUS_POOL)
    await db.opportunity.create({
      data: {
        brandId: holyStrips.id,
        title,
        type,
        description,
        impact, probability, confidence, strategicValue, urgency, effort,
        opportunityScore: score,
        autonomyLevel,
        status,
        recommendedAction: autonomyLevel === 'RED' ? 'OWNER_APPROVAL_REQUIRED' : (status === 'COMPLETED' ? 'Completed — measuring outcome' : 'EXECUTE_AUTONOMOUSLY'),
        keyword: title.includes('"') ? title.split('"')[1] : '',
        createdAt: daysAgo(randInt(1, 21)),
        completedAt: status === 'COMPLETED' ? daysAgo(randInt(0, 5)) : null,
      },
    })
  }

  // ============================================================
  // CONTENT PIPELINE
  // ============================================================
  const contentSeeds: Array<[string, string, string, string, number, string]> = [
    ['What Is Methylcobalamin? The Complete Guide', 'ARTICLE', 'PUBLISHED', 'what is methylcobalamin', 2800, 'GREEN'],
    ['Vitamin Strips vs Pills: Full Comparison', 'COMPARISON', 'PUBLISHED', 'vitamin strips vs pills', 2400, 'GREEN'],
    ['How B12 Absorption Actually Works', 'ARTICLE', 'PUBLISHED', 'b12 absorption comparison', 1900, 'GREEN'],
    ['Best Supplements for Travel: Pill-Free Options', 'ARTICLE', 'PUBLISHED', 'best supplements for travelers', 2100, 'GREEN'],
    ['B12 for Vegetarians: Complete Nutrition Guide', 'ARTICLE', 'DRAFTING', 'b12 for vegetarians', 1450, 'GREEN'],
    ['Dissolvable Supplements: Science & Benefits', 'ARTICLE', 'FACT_CHECK', 'dissolvable supplements', 1600, 'GREEN'],
    ['Energy Strips: How They Work', 'ARTICLE', 'OPTIMIZING', 'energy strips supplement', 1100, 'GREEN'],
    ['Vitamin D3 Strips Buyer Guide', 'ARTICLE', 'IMAGING', 'vitamin d3 strips', 1300, 'GREEN'],
    ['Pill-Free Vitamins: A Practical Guide', 'ARTICLE', 'LINKING', 'pill free vitamins', 950, 'GREEN'],
    ['Holy Strips vs Capsule Brands', 'COMPARISON', 'BRIEF', 'vitamin strips vs pills', 0, 'YELLOW'],
    ['B12 Deficiency Symptoms (When to Act)', 'ARTICLE', 'SCHEDULED', 'b12 deficiency symptoms', 3200, 'GREEN'],
    ['Immune Support: Vitamin C + D3 Synergy', 'TOPICAL_HUB', 'BRIEF', 'immune support supplements', 0, 'GREEN'],
    ['What Is Methylcobalamin (refresh v2)', 'REFRESH', 'MONITORING', 'what is methylcobalamin', 3100, 'GREEN'],
    ['Supplement Strips for Travel', 'ARTICLE', 'PUBLISHED', 'supplement strips for travel', 1750, 'GREEN'],
    ['Clean Label Supplements Guide', 'AUTHORITY_ASSET', 'DRAFTING', 'clean label supplements', 2200, 'GREEN'],
  ]

  for (const [title, type, stage, keyword, wordCount, autonomyLevel] of contentSeeds) {
    const published = stage === 'PUBLISHED' || stage === 'MONITORING'
    await db.contentItem.create({
      data: {
        brandId: holyStrips.id,
        title,
        type,
        stage,
        keyword,
        wordCount,
        autonomyLevel,
        hasImages: ['PUBLISHED', 'MONITORING', 'IMAGING', 'SCHEDULED'].includes(stage),
        internalLinks: published ? randInt(3, 12) : randInt(0, 3),
        scheduledFor: stage === 'SCHEDULED' ? daysFromNow(randInt(1, 6)) : null,
        publishedAt: published ? daysAgo(randInt(3, 40)) : null,
        url: published ? `https://holystrips.com/blogs/news/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}` : '',
        organicClicks: published ? randInt(80, 1400) : 0,
        position: published ? randInt(2, 19) : 0,
      },
    })
  }

  // ============================================================
  // PUBLISHERS & OUTREACH
  // ============================================================
  const pubSeeds: Array<[string, string, string, number, string, string, number, number, string]> = [
    ['Wellness Weekly', 'wellnessweekly.com', 'Health & wellness', 86, 'Sara Kim', 'sara@wellnessweekly.com', 145000, 78, 'CONTACTED'],
    ['The Supplement Reviewer', 'supplementreviewer.io', 'Supplement reviews', 92, 'James Park', 'james@supplementreviewer.io', 210000, 91, 'NEGOTIATING'],
    ['Runner\'s Digest', 'runnersdigest.co', 'Endurance sports', 81, 'Maya Torres', 'maya@runnersdigest.co', 98000, 65, 'REPLIED'],
    ['Clean Eating Journal', 'cleaneatingjournal.com', 'Clean nutrition', 78, 'Laura Chen', 'laura@cleaneatingjournal.com', 76000, 59, 'CONTACTED'],
    ['Nutrition Science Today', 'nutriscitoday.org', 'Science-grounded nutrition', 88, 'Dr. Ellen Voss', 'editor@nutriscitoday.org', 187000, 95, 'QUALIFIED'],
    ['Travel Fit Magazine', 'travelfitmag.com', 'Travel & fitness', 72, 'Omar Haddad', 'omar@travelfitmag.com', 54000, 44, 'QUALIFIED'],
    ['Vitamin Insider', 'vitamininsider.com', 'Vitamin industry news', 83, 'Priya Nair', 'priya@vitamininsider.com', 132000, 82, 'CONTACTED'],
    ['Pure Form Lab Blog', 'pureformlab.com', 'Lab-verified supplements', 77, 'Tom Becker', 'tom@pureformlab.com', 61000, 51, 'PROSPECT'],
    ['Everyday Athlete', 'everydayathlete.io', 'Fitness lifestyle', 74, 'Chris Doyle', 'chris@everydayathlete.io', 87000, 48, 'QUALIFIED'],
    ['Holistic Health Post', 'holistichealthpost.com', 'Holistic wellness', 71, 'Anna Lucia', 'anna@holistichealthpost.com', 49000, 42, 'PROSPECT'],
  ]

  const publishers: Record<string, string> = {}
  for (const [name, domain, niche, score, contactName, contactEmail, monthlyTraffic, aiCitationPotential, status] of pubSeeds) {
    const p = await db.publisher.create({
      data: {
        brandId: holyStrips.id,
        name, domain, niche,
        qualificationScore: score,
        contactName, contactEmail,
        monthlyTraffic,
        aiCitationPotential,
        status,
      },
    })
    publishers[domain] = p.id
  }

  const outreachSeeds: Array<[string, string, string, string, string, string]> = [
    ['wellnessweekly.com', 'Your readers ask about pill-free options — data from 400+ reviews', 'Referenced their Jan article on supplement fatigue; offered exclusive reader discount code + sample kit.', 'DAY_5', 'SENT', ''],
    ['supplementreviewer.io', 'Roundup inclusion: Holy Strips B12 vs capsules lab data', 'Sent independent lab COA; proposed inclusion in Q4 "Best B12" roundup with verified specs.', 'REPLIED', 'REPLIED', 'Asked about sponsored placement pricing'],
    ['runnersdigest.co', 'Pill-free B12 for your marathon training calendar', 'Mentioned their Boston Marathon coverage; offered 3-month supply for their editorial team trial.', 'DAY_12', 'SENT', ''],
    ['cleaneatingjournal.com', 'Clean-label strips — zero fillers, COA attached', 'Aligned with their "no hidden ingredients" series; shared full formulation transparency doc.', 'DAY_1', 'SENT', ''],
    ['nutriscitoday.org', 'Expert contribution: methylcobalamin bioavailability data', 'Offered their editor a guest data piece with citations; matched their science-review criteria.', 'DAY_1', 'QUEUED', ''],
    ['vitamininsider.com', 'Vitamin format trend data for your industry report', 'Shared proprietary survey data (1,200 respondents) on format preferences; offered co-citation.', 'DAY_5', 'SENT', ''],
    ['everydayathlete.io', 'Product trial for your gear review section', 'Offered full product line trial; matched their "everyday testing" editorial format.', 'DAY_1', 'QUEUED', ''],
  ]

  for (const [domain, subject, personalization, sequenceStage, status, result] of outreachSeeds) {
    await db.outreachCampaign.create({
      data: {
        brandId: holyStrips.id,
        publisherId: publishers[domain],
        subject,
        personalization,
        sequenceStage,
        status,
        result,
        sentAt: status === 'QUEUED' ? null : daysAgo(randInt(1, 14)),
        lastReplyAt: status === 'REPLIED' ? daysAgo(randInt(0, 4)) : null,
      },
    })
  }

  // ============================================================
  // AI VISIBILITY (GEO)
  // ============================================================
  const aiSeeds: Array<[string, string, boolean, boolean, boolean, boolean, boolean, string, string]> = [
    ['best b12 supplement 2026', 'RECOMMENDATION', false, false, true, false, false, 'IMPROVING', 'Care/of'],
    ['what is the best form of b12', 'INFORMATIONAL', true, false, true, true, false, 'IMPROVING', 'Jarrow'],
    ['supplements for vegetarians with low energy', 'COMMERCIAL', false, true, false, false, false, 'FLAT', 'Ritual'],
    ['best vitamins for travel', 'RECOMMENDATION', false, false, false, false, false, 'FLAT', 'Persona'],
    ['vitamin strips vs pills which is better', 'COMPARISON', true, true, true, false, true, 'IMPROVING', 'Vital4U'],
    ['pill free vitamin brands', 'COMMERCIAL', true, false, true, true, false, 'IMPROVING', 'Frunutta'],
    ['how do dissolvable supplements work', 'INFORMATIONAL', true, true, true, true, true, 'IMPROVING', '—'],
    ['clean label supplement brands', 'RECOMMENDATION', false, true, false, false, false, 'FLAT', 'Ritual'],
    ['best vitamin c for immune support', 'COMMERCIAL', false, false, true, false, false, 'DECLINING', 'LivOn'],
    ['b12 for runners and athletes', 'COMMERCIAL', false, false, false, false, false, 'FLAT', 'Nuun'],
  ]

  for (const [prompt, category, cg, ge, px, cl, co, trend, competitor] of aiSeeds) {
    const mentionCount = [cg, ge, px, cl, co].filter(Boolean).length
    await db.aiPrompt.create({
      data: {
        brandId: holyStrips.id,
        prompt,
        category,
        chatgptMentioned: cg,
        geminiMentioned: ge,
        perplexityMentioned: px,
        claudeMentioned: cl,
        copilotMentioned: co,
        rankWhenMentioned: mentionCount > 0 ? randInt(1, 4) : 0,
        trend,
        competitorMentioned: competitor,
        lastCheckedAt: daysAgo(randInt(0, 6)),
      },
    })
  }

  // ============================================================
  // OWNER APPROVAL QUEUE (RED)
  // ============================================================
  const approvalSeeds: Array<[string, string, string, string]> = [
    ['Approve "2x faster absorption" health claim', 'CLAIM', 'New product page copy claims clinical absorption advantage. Exceeds approved Brand Truth claims list. Legally sensitive if challenged. Reversible only via public retraction.', 'If approved: potential +18% conversion on product pages. If challenged: regulatory complaint risk.'],
    ['Paid placement: $2,400 sponsored post on The Supplement Reviewer', 'PAID_PLACEMENT', 'Publisher offered paid roundup inclusion. Financially material ($2,400). Policy: buying backlinks requires approval.', 'Referring domain DR 72, est. 1,100 referral visits/mo, likely AI citation source. FTC disclosure required.'],
    ['Delete 11 legacy blog posts (2019-2021)', 'DELETION', 'Thin, outdated posts with zero traffic in 90 days. Deletion is difficult to reverse and affects internal link graph.', 'Removes 47 internal links; 8 redirects required. Expected crawl-budget improvement.'],
  ]

  for (const [title, category, description, impact] of approvalSeeds) {
    await db.approvalItem.create({
      data: { brandId: holyStrips.id, title, category, description, impact, status: 'PENDING' },
    })
  }

  // ============================================================
  // WEEKLY REPORTS — 8 weeks of history
  // ============================================================
  const weekData: Array<[number, number, string, number, number, number, number, number, number, number, number]> = [
    [56, 38, 'FLAT', 1, 4, 0, 0, 1420, 0, 12, 10],
    [49, 39, 'IMPROVING', 1, 4, 2, 0, 1510, 90, 12, 12],
    [42, 41, 'IMPROVING', 2, 5, 3, 1, 1740, 230, 14, 15],
    [35, 44, 'IMPROVING', 2, 6, 3, 1, 1980, 240, 15, 19],
    [28, 47, 'IMPROVING', 3, 7, 4, 2, 2340, 360, 18, 24],
    [21, 51, 'STRONGLY_IMPROVING', 3, 8, 5, 1, 2870, 530, 21, 31],
    [14, 55, 'STRONGLY_IMPROVING', 4, 9, 6, 2, 3420, 550, 25, 38],
    [7, 58, 'STRONGLY_IMPROVING', 5, 10, 7, 1, 3960, 540, 29, 44],
  ]

  for (const [ago, score, direction, top3, top10, gained, lost, clicks, delta, refDomains, aiRate] of weekData) {
    await db.weeklyReport.create({
      data: {
        brandId: holyStrips.id,
        weekOf: daysAgo(ago),
        organicGrowthScore: score,
        direction,
        top3Count: top3,
        top10Count: top10,
        keywordsGained: gained,
        keywordsLost: lost,
        organicClicks: clicks,
        organicClicksDelta: delta,
        referringDomains: refDomains,
        aiMentionRate: aiRate,
        biggestWins: ago === 7
          ? '"what is methylcobalamin" #12 to #5 (+312% clicks). Runner\'s Digest trial confirmed. Perplexity citations: 2 new prompts.'
          : 'Steady gains across tracked keywords.',
        biggestProblems: ago === 7
          ? '"best vitamin c supplement" slipped to #38. Merchant Center: 6 feed warnings pending. Brand absent from 3 priority commercial prompts.'
          : 'No critical issues.',
        learned: ago === 7
          ? 'Refresh pattern validated: pages at positions 4-15 produce ~3.2x more traffic gain per hour than new informational articles. Shifting 60% of content capacity to refreshes.'
          : 'Patterns accumulating.',
        nextActions: ago === 7
          ? '1) Execute refresh queue (6 pages). 2) Complete Merchant Center feed fix. 3) Day-5 outreach follow-ups (4 publishers). 4) Publish B12-for-vegetarians draft. 5) AEO answer blocks for top 10 keywords.'
          : 'Continued daily loop.',
        verdict: ago <= 14 ? 'YES_EARLY_POSITIVE' : 'TOO_EARLY_TO_DETERMINE',
        confidenceLevel: ago === 7 ? 'MEDIUM' : 'LOW',
      },
    })
  }

  // ============================================================
  // INTEGRATIONS — the 13-connection checklist
  // ============================================================
  const integrationSeeds: Array<[number, string, string, string, string, string, string]> = [
    [1, 'Supabase (Postgres)', 'DATABASE', 'Permanent OS database & persistent memory. Brand isolation via brand_id on every table.', 'SHARED', 'CONNECTED', 'https://supabase.com/docs'],
    [2, 'DataForSEO MCP', 'INTELLIGENCE', 'SERPs, keywords, competitors, backlinks, technical audits, AI data. Official Claude Code MCP server.', 'SHARED', 'CONNECTED', 'https://docs.dataforseo.com'],
    [3, 'Activepieces', 'AUTOMATION', '24/7 scheduler & orchestration layer. Runs the 16 OS flows even when laptop is off.', 'SHARED', 'CONNECTED', 'https://activepieces.com/docs'],
    [4, 'Anthropic API', 'BRAIN', 'Runs Claude automatically inside Activepieces flows (headless daily loop).', 'SHARED', 'CONNECTED', 'https://console.anthropic.com'],
    [5, 'Google Search Console', 'GOOGLE', 'Actual Google rankings and query data. Per-brand property.', 'PER_BRAND', 'CONNECTED', 'https://search.google.com/search-console'],
    [6, 'GA4', 'GOOGLE', 'Traffic, conversions, and revenue attribution.', 'PER_BRAND', 'CONNECTED', 'https://analytics.google.com'],
    [7, 'Shopify (CMS)', 'PUBLISHING', 'Content publishing, product data, collections.', 'PER_BRAND', 'CONNECTED', 'https://shopify.dev/docs/api'],
    [8, 'Google Merchant Center', 'GOOGLE', 'Product feed health, free product surfaces.', 'PER_BRAND', 'PENDING', 'https://merchants.google.com'],
    [9, 'Bing Webmaster Tools', 'MICROSOFT', 'Bing & Copilot visibility data.', 'PER_BRAND', 'PENDING', 'https://www.bing.com/webmasters'],
    [10, 'IndexNow', 'INDEXING', 'Instant URL-change notification (Bing, Yandex).', 'PER_BRAND', 'PENDING', 'https://indexnow.org'],
    [11, 'Hunter', 'OUTREACH', 'Publisher contact discovery, verification, sequences (max 30/day).', 'SHARED', 'PENDING', 'https://hunter.io/api'],
    [12, 'Recraft API', 'CREATIVE', 'Automated editorial imagery for content (API-quality image generation).', 'SHARED', 'PENDING', 'https://www.recraft.ai'],
    [13, 'Brand Asset Storage', 'PUBLISHING', 'Product truth, approved imagery, guides, research per brand.', 'PER_BRAND', 'PENDING', ''],
  ]

  const envVars: Record<string, string> = {
    'Supabase (Postgres)': 'SUPABASE_URL / SUPABASE_SECRET_KEY',
    'DataForSEO MCP': 'DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD',
    'Activepieces': 'ACTIVEPIECES_API_KEY',
    'Anthropic API': 'ANTHROPIC_API_KEY',
    'Google Search Console': 'GSC_API_KEY',
    'GA4': 'GA4_API_KEY',
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
      data: {
        order, name, layer, purpose, scope, status, docsUrl,
        apiKeyEnvVar: envVars[name] || '',
        connectedAt: status === 'CONNECTED' ? daysAgo(randInt(1, 10)) : null,
      },
    })
  }

  // ============================================================
  // BACKLINK LEDGER
  // ============================================================
  const blSeeds: Array<[string, string, string, number, number]> = [
    ['wellnessweekly.com', 'https://wellnessweekly.com/b12-guide', 'EDITORIAL', 68, 240],
    ['runnersdigest.co', 'https://runnersdigest.co/gear-trials', 'REVIEW', 61, 180],
    ['nutriscitoday.org', 'https://nutriscitoday.org/format-bioavailability', 'EDITORIAL', 74, 310],
    ['everydayathlete.io', 'https://everydayathlete.io/supplements', 'ROUNDUP', 52, 90],
    ['plantbasednews.org', 'https://plantbasednews.org/b12-feature', 'MENTION', 82, 540],
    ['supplementgeek.com', 'https://supplementgeek.com/strips-review', 'REVIEW', 58, 130],
    ['vitamininsider.com', 'https://vitamininsider.com/format-trends', 'MENTION', 71, 260],
  ]
  for (const [domain, url, type, auth, traffic] of blSeeds) {
    await db.backlinkRecord.create({
      data: {
        brandId: holyStrips.id,
        sourceDomain: domain,
        sourceUrl: url,
        type,
        authorityScore: auth,
        referralTraffic: traffic,
        aiCitationValue: auth > 70,
        firstSeenAt: daysAgo(randInt(10, 90)),
      },
    })
  }

  // ============================================================
  // SYSTEM EVENTS (daily loop log)
  // ============================================================
  const eventSeeds: Array<[string, string, string, string]> = [
    ['DAILY_LOOP', 'INFO', 'Daily operating cycle completed', '13/13 steps OK. 0 errors. 6 opportunities executed, 2 queued for tomorrow.'],
    ['CONTENT', 'INFO', 'Published "Supplement Strips for Travel"', 'Scheduled publish executed on Shopify. IndexNow ping sent. Monitoring started.'],
    ['OUTREACH', 'INFO', 'Day-5 follow-ups sent (4 publishers)', 'Wellness Weekly, Clean Eating Journal, Vitamin Insider, Travel Fit Magazine. Under 30/day cap.'],
    ['GEO', 'WARN', 'AI visibility check: brand missing on 3 commercial prompts', 'Perplexity "best b12 supplement" cites 3 competitors. Citation-gap analysis queued as opportunity.'],
    ['DAILY_LOOP', 'INFO', 'Daily operating cycle completed', '12/13 steps OK. 1 warning (Merchant Center feed).'],
    ['TECHNICAL_SEO', 'INFO', 'Structured data fix deployed to 14 product pages', 'Product schema: supplement facts markup added. Rich result eligibility re-submitted.'],
    ['ALERT', 'INFO', 'No critical alerts', 'No deindexation, no traffic collapse, no security issues. Emergency channel silent.'],
    ['LEARNING', 'INFO', 'Experiment conclusion: refresh multiplier', 'Positions 4-15 refresh produced 3.2x traffic gain per hour vs new articles. Prioritization weights updated.'],
    ['CONTENT', 'INFO', 'Draft completed: "B12 for Vegetarians"', '1,450 words. Awaiting fact-check stage. GREEN autonomy — no approval needed.'],
    ['DAILY_LOOP', 'INFO', 'Daily operating cycle completed', '13/13 steps OK. Weekly report generated and delivered to owner.'],
  ]
  for (const [type, level, message, meta] of eventSeeds) {
    await db.systemEvent.create({
      data: {
        brandId: holyStrips.id,
        type, level, message, meta,
        createdAt: daysAgo(randInt(0, 7)),
      },
    })
  }

  // ============================================================
  // GROWTH AGENT TASKS — the assistant's task queue
  // ============================================================
  const taskSeeds: Array<[string, string, string, string, string, string]> = [
    ['Audit product page Core Web Vitals', 'Check LCP/CLS/INP on top 5 Shopify product pages and queue fixes above the fold.', 'AUDIT', 'HIGH', 'DONE', '3 pages improved (LCP 3.1s → 1.9s). 1 image lazy-load fix pending review.'],
    ['Refresh "B12 for Vegetarians" article', 'Position 8 with rising CTR. Add FAQ block, update 2026 stats, strengthen internal links to B12 product page.', 'CONTENT', 'HIGH', 'DONE', 'Refreshed and republished. Position 8 → 5 after 9 days. +142 organic clicks/week.'],
    ['Find 10 unlinked brand mentions', 'Scan for Holy Strips mentions without links; prepare reclamation emails (22% historical conversion).', 'AUTHORITY', 'MEDIUM', 'RUNNING', '9 mentions found so far, 4 emails drafted.'],
    ['Track 5 new GEO prompts', 'Add conversational buyer prompts to the AI visibility tracker (Perplexity + ChatGPT weekly check).', 'GEO', 'MEDIUM', 'QUEUED', ''],
    ['Research keyword gap vs top competitor', 'Compare keyword universe against the market leader in dissolvable supplements; find low-difficulty opportunities.', 'KEYWORD_RESEARCH', 'MEDIUM', 'QUEUED', ''],
    ['Draft outreach for supplementreviewer.io', 'Roundup inclusion pitch with lab COA attached. Day-1 email ready for review.', 'OUTREACH', 'LOW', 'QUEUED', ''],
  ]
  for (const [title, description, type, priority, status, result] of taskSeeds) {
    await db.task.create({
      data: {
        brandId: holyStrips.id,
        title, description, type, priority, status, result,
        source: status === 'QUEUED' ? 'ASSISTANT' : 'DAILY_LOOP',
        autonomy: 'GREEN',
        createdAt: daysAgo(randInt(0, 6)),
        completedAt: status === 'DONE' ? daysAgo(randInt(0, 3)) : null,
      },
    })
  }

  console.log('Seed complete:')
  console.log('  Brands:', await db.brand.count())
  console.log('  Keywords:', await db.keyword.count())
  console.log('  Opportunities:', await db.opportunity.count())
  console.log('  Content:', await db.contentItem.count())
  console.log('  Publishers:', await db.publisher.count())
  console.log('  Outreach:', await db.outreachCampaign.count())
  console.log('  AI prompts:', await db.aiPrompt.count())
  console.log('  Approvals:', await db.approvalItem.count())
  console.log('  Reports:', await db.weeklyReport.count())
  console.log('  Integrations:', await db.integration.count())
  console.log('  Backlinks:', await db.backlinkRecord.count())
  console.log('  Events:', await db.systemEvent.count())
  console.log('  Tasks:', await db.task.count())
}

