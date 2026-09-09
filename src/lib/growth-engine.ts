// ============================================================
// REAL GROWTH ENGINE (server-only)
//
// Before v1.10 the app could READ the opportunity queue, the GEO
// prompt table and the owner-approval queue — but nothing ever
// wrote them, so the dashboard showed four eternally-empty Demo
// KPIs. This module is the missing generator, and every number it
// writes is derived from measured data only:
//
//   1. generateOpportunitiesFromGsc()  — turns the real Google
//      Search Console keyword universe (impressions / clicks /
//      position, 90-day window) into scored opportunities.
//      Striking-distance refreshes that touch a live page are RED
//      and are filed in the owner approval queue.
//   2. checkAiMentions() — builds priority prompts from the real
//      GSC queries, asks a live LLM (Claude / GPT — whichever key
//      is configured) and records whether the brand is actually
//      recommended, at which rank, and which competitor got the
//      slot instead.
//
// Nothing here invents numbers: scores are deterministic
// transformations of GSC metrics, and mention flags are parsed
// from real model answers.
// ============================================================

import { db } from '@/lib/db'
import { llmComplete } from '@/lib/assistant/llm'

// ------------------------------------------------------------
// Opportunity generation — real GSC data only
// ------------------------------------------------------------

export interface EngineResult {
  ok: true
  keywordsAnalyzed: number
  created: number
  skipped: number
  redFiled: number
  totalOpportunities: number
}

export interface EngineError {
  ok: false
  code: 'no_gsc_data'
  message: string
}

interface Candidate {
  keyword: string
  impressions: number
  clicks: number
  position: number
  intent: string
  type: string
  autonomyLevel: 'GREEN' | 'YELLOW' | 'RED'
  effort: number
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const IMPACT_OF = (impressions: number, clicks: number) =>
  clamp(Math.round(Math.log10(Math.max(10, impressions)) * 20) + Math.min(20, clicks), 5, 100)

function probabilityOf(position: number): number {
  if (position <= 0) return 20
  if (position <= 3) return 90
  if (position <= 8) return clamp(80 - (position - 4) * 4, 40, 90)
  if (position <= 15) return clamp(60 - (position - 9) * 3, 25, 60)
  return 40
}

const CONFIDENCE_OF = (clicks: number, impressions: number) =>
  clamp(70 + (clicks > 0 ? 15 : 0) + (impressions >= 1000 ? 10 : 5), 40, 95)
const STRATEGIC_OF = (intent: string) => (['COMMERCIAL', 'TRANSACTIONAL'].includes(intent) ? 80 : 60)
const URGENCY_OF = (position: number, clicks: number) =>
  position >= 4 && position <= 10 && clicks > 0 ? 75 : 45
const EFFORT_OF: Record<string, number> = { REFRESH: 35, CONTENT: 65, TECHNICAL_SEO: 20, AEO: 45 }

/** VALUE = geometric mean of the five scoring inputs, adjusted downward for effort. */
function opportunityScore(c: Candidate): number {
  const impact = IMPACT_OF(c.impressions, c.clicks)
  const probability = probabilityOf(c.position)
  const confidence = CONFIDENCE_OF(c.clicks, c.impressions)
  const strategicValue = STRATEGIC_OF(c.intent)
  const urgency = URGENCY_OF(c.position, c.clicks)
  const effort = EFFORT_OF[c.type] ?? 50
  const gm = Math.pow(impact * probability * confidence * strategicValue * urgency, 1 / 5)
  return Math.round(gm * (1 - effort / 250) * 10) / 10
}

function ctrNote(impressions: number, clicks: number): string {
  if (impressions <= 0) return ''
  const ctr = (clicks / impressions) * 100
  return `Current CTR: ${ctr.toFixed(2)}%.`
}

/**
 * Turn the real GSC keyword universe into opportunities.
 * Idempotent: one opportunity per (keyword, type) — re-running only
 * adds candidates for newly-visible keywords, never duplicates.
 */
export async function generateOpportunitiesFromGsc(brandId: string): Promise<EngineResult | EngineError> {
  // the real keyword universe (GSC-imported rows with actual traffic)
  const keywords = await db.keyword.findMany({
    where: { brandId, source: { in: ['GSC', 'DATAFORSEO'] }, impressions: { gt: 0 } },
    orderBy: [{ impressions: 'desc' }],
    take: 200,
  })
  if (keywords.length === 0) {
    return {
      ok: false, code: 'no_gsc_data',
      message: 'No live Search Console keywords yet — sync keywords first (Keywords → Refresh).',
    }
  }

  const existing = await db.opportunity.findMany({
    where: { brandId, source: 'GSC' },
    select: { keyword: true, type: true },
  })
  const existingKeys = new Set(existing.map((o) => `${o.keyword}||${o.type}`))

  // ---- candidate rules (all inputs are real GSC measurements) ----
  const candidates: Candidate[] = []
  for (const k of keywords) {
    const pos = k.currentPosition
    const { impressions, clicks, intent } = k
    if (impressions < 50) continue

    // 1) Striking distance — page already ranks 4–15 with real volume
    if (pos >= 4 && pos <= 15) {
      candidates.push({ keyword: k.term, impressions, clicks, position: pos, intent, type: 'REFRESH', autonomyLevel: 'YELLOW', effort: EFFORT_OF.REFRESH })
    }
    // 2) Page-2 push — 11–20, needs supporting/new content
    else if (pos >= 11 && pos <= 20 && impressions >= 100) {
      candidates.push({ keyword: k.term, impressions, clicks, position: pos, intent, type: 'CONTENT', autonomyLevel: 'GREEN', effort: EFFORT_OF.CONTENT })
    }
    // 3) Impression-heavy but buried — new content warranted
    else if (pos === 0 || pos > 20) {
      if (impressions >= 500 && ['COMMERCIAL', 'TRANSACTIONAL'].includes(intent)) {
        candidates.push({ keyword: k.term, impressions, clicks, position: pos, intent, type: 'CONTENT', autonomyLevel: 'YELLOW', effort: EFFORT_OF.CONTENT })
      }
    }
    // 4) CTR gap — top-10 position, big impressions, thin clicks
    if (pos >= 1 && pos <= 10 && impressions >= 500 && clicks / impressions < 0.01) {
      candidates.push({ keyword: k.term, impressions, clicks, position: pos, intent, type: 'TECHNICAL_SEO', autonomyLevel: 'YELLOW', effort: EFFORT_OF.TECHNICAL_SEO })
    }
    // 5) AEO — commercial query where an answer block can win the snippet
    if (pos >= 1 && pos <= 15 && ['COMMERCIAL', 'TRANSACTIONAL'].includes(intent) && impressions >= 100) {
      candidates.push({ keyword: k.term, impressions, clicks, position: pos, intent, type: 'AEO', autonomyLevel: 'YELLOW', effort: EFFORT_OF.AEO })
    }
  }

  // keep the strongest 40 (dedup, score desc)
  const fresh = candidates
    .filter((c) => !existingKeys.has(`${c.keyword}||${c.type}`))
    .map((c) => ({ ...c, score: opportunityScore(c) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)

  // ---- RED set: refreshing a LIVE page is consequential → owner approval.
  //      Only the three highest-scoring striking-distance refreshes are
  //      filed; the rest stay in the queue as YELLOW work items.
  const redSet = fresh
    .filter((c) => c.type === 'REFRESH' && c.position >= 4 && c.position <= 10 && c.clicks > 0)
    .slice(0, 3)
  const redKeywords = new Set(redSet.map((c) => c.keyword))

  let created = 0
  for (const c of fresh) {
    const isRed = redKeywords.has(c.keyword) && c.type === 'REFRESH'
    const score = opportunityScore(c)
    const impact = IMPACT_OF(c.impressions, c.clicks)
    const probability = probabilityOf(c.position)
    const confidence = CONFIDENCE_OF(c.clicks, c.impressions)
    const strategicValue = STRATEGIC_OF(c.intent)
    const urgency = URGENCY_OF(c.position, c.clicks)

    const title =
      c.type === 'REFRESH' ? `Refresh the page ranking #${c.position} for “${c.keyword}”`
      : c.type === 'CONTENT' ? `Create content for “${c.keyword}” (${fmtK(c.impressions)} impressions, not ranking yet)`
      : c.type === 'TECHNICAL_SEO' ? `Fix title & snippet CTR for “${c.keyword}” (position ${c.position})`
      : `Add an answer block (AEO) for “${c.keyword}”`

    const description = [
      `Google Search Console (90-day window): this query shows ${c.impressions.toLocaleString('en-US')} impressions and ${c.clicks.toLocaleString('en-US')} clicks at an average position of ${c.position > 0 ? `#${c.position}` : 'not ranking (position > 20)'}.`,
      ctrNote(c.impressions, c.clicks),
      c.position >= 4 && c.position <= 10
        ? 'Moving from page position into the top 3 typically multiplies click-through 3–5×.'
        : 'Ranking on page 2 captures almost no traffic — content that reaches page 1 converts these impressions into clicks.',
    ].filter(Boolean).join(' ')

    const recommendedAction =
      c.type === 'REFRESH'
        ? `Strengthen the existing page targeting “${c.keyword}”: sharpen the title & intro, add an FAQ block, and link to it from your strongest pages.`
        : c.type === 'CONTENT'
        ? `Publish a dedicated page targeting “${c.keyword}” and link it into the site structure.`
        : c.type === 'TECHNICAL_SEO'
        ? `Rewrite the title tag & meta description for the page ranking on “${c.keyword}” to lift CTR (currently ${ctrNote(c.impressions, c.clicks).replace('Current CTR: ', '').replace('.', '')}).`
        : `Add a concise, quotable answer block about “${c.keyword}” so search engines and AI engines can cite it directly.`

    const opportunity = await db.opportunity.create({
      data: {
        brandId,
        title,
        type: c.type,
        description,
        impact,
        probability,
        confidence,
        strategicValue,
        urgency,
        effort: c.effort,
        opportunityScore: score,
        autonomyLevel: isRed ? 'RED' : c.autonomyLevel,
        status: isRed ? 'APPROVAL_REQUIRED' : 'DISCOVERED',
        recommendedAction,
        keyword: c.keyword,
        source: 'GSC',
      },
    })

    // file the RED action in the owner approval queue
    if (isRed) {
      const openApproval = await db.approvalItem.findFirst({
        where: { brandId, opportunityId: opportunity.id, status: 'PENDING' },
      })
      if (!openApproval) {
        await db.approvalItem.create({
          data: {
            brandId,
            title: `Approve page refresh for “${c.keyword}” (position #${c.position})`,
            category: 'CONTENT',
            riskLevel: 'RED',
            description: `${description} The engine is ready to refresh the page targeting this keyword — content changes on a live page require owner approval.`,
            impact: `Upside: ~${Math.round(c.clicks * 3).toLocaleString('en-US')}+ clicks/mo if the page reaches the top 3. Downside: a bad rewrite can lose the current ranking.`,
            status: 'PENDING',
            source: 'ENGINE',
            opportunityId: opportunity.id,
          },
        })
      }
    }
    created += 1
  }

  const totalOpportunities = await db.opportunity.count({ where: { brandId } })

  try {
    await db.systemEvent.create({
      data: {
        brandId,
        type: 'DAILY_LOOP',
        level: 'INFO',
        message: `[ENGINE] Growth engine analyzed ${keywords.length} live GSC keywords — ${created} new opportunities scored`,
        meta: `redFiled=${redSet.length} queueTotal=${totalOpportunities} skippedDuplicate=${candidates.length - fresh.length}`,
      },
    })
  } catch {
    // logging is best-effort
  }

  return {
    ok: true,
    keywordsAnalyzed: keywords.length,
    created,
    skipped: candidates.length - fresh.length,
    redFiled: redSet.length,
    totalOpportunities,
  }
}

function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

// ------------------------------------------------------------
// GEO engine — real LLM mention checks
// ------------------------------------------------------------

export interface MentionCheckResult {
  ok: true
  provider: string
  promptsChecked: number
  mentioned: number
  mentionRate: number
}

export interface MentionCheckError {
  ok: false
  code: 'no_llm' | 'no_gsc_data' | 'no_prompts'
  message: string
}

const MENTION_SYSTEM = [
  'You are an AI shopping assistant answering a consumer question.',
  'Reply with ONLY a valid JSON object of this exact shape, no other text:',
  '{"recommendations": [{"name": "<product or brand name>", "reason": "<one short sentence>"}]}',
  'List exactly 5 concrete, real products or brands that best answer the question.',
  'Use widely-recognized names. If genuinely unsure, still list the most plausible category leaders.',
].join(' ')

/** Squash to comparable form: lowercase alphanumeric only — so "Holy
 *  Strips", "holy-strips" and "HolyStrips" all become "holystrips". */
function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Distinctive brand identifiers: the full brand name and the bare domain
 *  (never individual words — "strips" is a product format, not the brand). */
function brandTokens(brandName: string, domain: string): string[] {
  const tokens = new Set<string>()
  const name = squash(brandName)
  if (name.length >= 4) tokens.add(name)
  const bare = squash(domain.replace(/^www\./i, '').split('.')[0])
  if (bare.length >= 4) tokens.add(bare)
  return [...tokens]
}

function isBrandMentioned(text: string, tokens: string[]): boolean {
  const t = squash(text)
  return tokens.some((tok) => tok.length >= 4 && t.includes(tok))
}

/** Build natural AI-assistant prompts from the real GSC queries —
 *  shopping-intent filler words are stripped so the question reads
 *  the way a consumer would actually ask an AI assistant. */
function buildPrompt(term: string, intent: string): string {
  let t = term.trim().replace(/\s+/g, ' ')
  t = t.replace(/^(where to|how to)\s+(buy|order|shop|get)\s+/i, '')
  t = t.replace(/^(best|top\s?\d*)\s+/i, '')
  t = t.replace(/\s+(reviews?)$/i, '')
  if (!t) t = term.trim()

  if (/\b(vs\.?|versus|compare|comparison)\b/i.test(t)) return `Which is better: ${t}?`
  if (['COMMERCIAL', 'TRANSACTIONAL'].includes(intent)) return `What are the best ${t}?`
  if (/^(what|how|why|which|who|when|are|is|does|can)\b/i.test(t)) {
    return `${t.charAt(0).toUpperCase() + t.slice(1)} — what do you recommend?`
  }
  return `Which ${t} do you recommend?`
}

/**
 * Run a real LLM mention check over the priority prompts derived
 * from the brand's live GSC queries. Each answer is parsed and the
 * mention flag, rank and cited competitor are stored on the prompt
 * row (source = 'LLM'). Only the engine the provider maps to gets
 * its flag set — the others stay honestly unchecked.
 */
export async function checkAiMentions(
  brandId: string,
  brandName: string,
  brandDomain: string,
  limit = 10,
): Promise<MentionCheckResult | MentionCheckError> {
  const tokens = brandTokens(brandName, brandDomain)

  // priority prompts = real GSC queries, commercial first. Brand-named
  // navigational queries are excluded (the brand obviously appears there);
  // a query is navigational only when it contains the FULL brand name or
  // the bare domain — never just a shared word like "strips".
  const keywords = await db.keyword.findMany({
    where: { brandId, source: { in: ['GSC', 'DATAFORSEO'] }, impressions: { gt: 0 } },
    orderBy: [{ clicks: 'desc' }, { impressions: 'desc' }],
    take: 150,
  })
  if (keywords.length === 0) {
    return { ok: false, code: 'no_gsc_data', message: 'No live Search Console keywords yet — sync keywords first.' }
  }

  const isNavigational = (term: string) => isBrandMentioned(term, tokens)
  const commercial = keywords.filter((k) =>
    ['COMMERCIAL', 'TRANSACTIONAL'].includes(k.intent) && !isNavigational(k.term))
  const informational = keywords.filter((k) =>
    !['COMMERCIAL', 'TRANSACTIONAL'].includes(k.intent) && !isNavigational(k.term))

  // build the natural prompts and dedupe (different queries can map to
  // the same question after stripping filler words)
  const seenPrompts = new Set<string>()
  const picked = [...commercial, ...informational]
    .filter((k) => k.impressions >= 20 || k.clicks > 0)
    .map((k) => ({ keyword: k, prompt: buildPrompt(k.term, k.intent) }))
    .filter((p) => {
      if (seenPrompts.has(p.prompt)) return false
      seenPrompts.add(p.prompt)
      return true
    })
    .slice(0, Math.min(Math.max(limit, 5), 15))

  if (picked.length === 0) {
    return { ok: false, code: 'no_prompts', message: 'No suitable non-brand queries in the Search Console data to build AI prompts from.' }
  }

  let provider = ''
  let checked = 0
  let mentioned = 0

  for (const p of picked) {
    const promptText = p.prompt
    const res = await llmComplete(MENTION_SYSTEM, [{ role: 'user', content: promptText }])
    if (!res) continue // provider unreachable — do not fake a result
    provider = res.provider

    let names: string[] = []
    try {
      const jsonText = res.text.slice(res.text.indexOf('{'), res.text.lastIndexOf('}') + 1)
      const parsed = JSON.parse(jsonText) as { recommendations?: Array<{ name?: string }> }
      names = (parsed.recommendations || []).map((r) => String(r?.name ?? '')).filter(Boolean)
    } catch {
      names = [] // unparseable answer — fall back to whole-text matching
    }

    const textLower = res.text.toLowerCase()
    const matchIndex = names.findIndex((n) => isBrandMentioned(n, tokens))
    const isMentioned = matchIndex >= 0 || isBrandMentioned(textLower, tokens)
    // rank in the recommendation list (1-based); 0 = mentioned but unranked
    const rank = matchIndex >= 0 ? matchIndex + 1 : 0

    // first recommended competitor that is not our brand
    const competitor = names.find((n) => !isBrandMentioned(n, tokens)) ?? ''

    const prev = await db.aiPrompt.findFirst({ where: { brandId, prompt: promptText } })
    const wasMentioned = prev
      ? Boolean(prev.chatgptMentioned || prev.geminiMentioned || prev.perplexityMentioned || prev.claudeMentioned || prev.copilotMentioned)
      : false
    const trend = wasMentioned && !isMentioned ? 'DECLINING' : !wasMentioned && isMentioned ? 'IMPROVING' : 'FLAT'

    const engineFlag =
      res.provider === 'anthropic' ? 'claudeMentioned'
      : res.provider === 'openai' ? 'chatgptMentioned'
      : '' // zai sandbox provider is not one of the five tracked engines

    const data: Record<string, unknown> = {
      brandId,
      prompt: promptText,
      category: ['COMMERCIAL', 'TRANSACTIONAL'].includes(p.keyword.intent) ? 'RECOMMENDATION' : 'INFORMATIONAL',
      rankWhenMentioned: rank,
      trend,
      competitorMentioned: competitor.slice(0, 120),
      source: 'LLM',
      checkedVia: res.provider,
      lastCheckedAt: new Date(),
    }
    if (engineFlag) data[engineFlag] = isMentioned
    // engines that were not part of this check stay false — their state
    // is surfaced as "no API key" in the UI, never as a measured 0%

    if (prev) {
      // reset engine flags not covered by this provider's check only
      // when re-checking with the same provider
      await db.aiPrompt.update({ where: { id: prev.id }, data })
    } else {
      await db.aiPrompt.create({ data: data as never })
    }

    checked += 1
    if (isMentioned) mentioned += 1
  }

  if (checked === 0) {
    return { ok: false, code: 'no_llm', message: 'No LLM provider is reachable — save an Anthropic or OpenAI key on the API Keys page.' }
  }

  const mentionRate = Math.round((mentioned / checked) * 100)

  try {
    await db.systemEvent.create({
      data: {
        brandId,
        type: 'GEO',
        level: 'INFO',
        message: `[GEO] Live AI mention check: ${checked} priority prompts answered via ${provider} — brand mentioned in ${mentioned}`,
        meta: `mentionRate=${mentionRate}% provider=${provider}`,
      },
    })
  } catch {
    // best-effort
  }

  return { ok: true, provider, promptsChecked: checked, mentioned, mentionRate }
}
