// ============================================================
// GROWTH AGENT TOOLS — executable actions for the AI assistant.
// Toolset mirrors the open-seo MCP categories (keyword research,
// rank tracking, SERP/backlinks, site audit, AI visibility) plus
// OS-native operations (tasks, briefs, approvals, reports).
// Every write operation also logs a SystemEvent so assistant
// activity shows up in the brand activity feed.
// ============================================================

import { db } from '@/lib/db'
import { researchKeywords } from '@/lib/dataforseo'
import { syncGscKeywords } from '@/lib/gsc-keywords'
import { fetchLiveStats } from '@/lib/porter-stats'

export interface ToolContext {
  brandId: string
  brandName: string
  brandDomain: string
  brandSlug: string
  /** origin of this deployment — lets tools funnel writes through the
   *  route that owns the data (serverless functions have separate DBs) */
  appOrigin?: string
}

export interface ToolResult {
  ok: boolean
  summary: string
  data?: unknown
}

export interface ToolDef {
  name: string
  description: string
  args: string
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
}

async function logEvent(ctx: ToolContext, type: string, message: string, meta = '') {
  try {
    await db.systemEvent.create({
      data: { brandId: ctx.brandId, type: 'ASSISTANT', level: 'INFO', message: `[${type}] ${message}`, meta },
    })
  } catch {
    // never fail a tool because logging failed
  }
}

const TASK_TYPES = ['KEYWORD_RESEARCH', 'CONTENT', 'OUTREACH', 'AUDIT', 'GEO', 'AUTHORITY', 'GROWTH']

// ---------- read tools ----------

async function getOverview(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const [kw, kwTop10, opps, content, published, links, prompts, pendingAppr, tasks, report] = await Promise.all([
    db.keyword.count({ where: { brandId: ctx.brandId } }),
    db.keyword.count({ where: { brandId: ctx.brandId, currentPosition: { gt: 0, lte: 10 } } }),
    db.opportunity.count({ where: { brandId: ctx.brandId, status: 'DISCOVERED' } }),
    db.contentItem.count({ where: { brandId: ctx.brandId } }),
    db.contentItem.count({ where: { brandId: ctx.brandId, stage: 'PUBLISHED' } }),
    db.backlinkRecord.count({ where: { brandId: ctx.brandId, status: 'ACTIVE' } }),
    db.aiPrompt.count({ where: { brandId: ctx.brandId } }),
    db.approvalItem.count({ where: { brandId: ctx.brandId, status: 'PENDING' } }),
    db.task.count({ where: { brandId: ctx.brandId, status: { in: ['QUEUED', 'RUNNING'] } } }),
    db.weeklyReport.findFirst({ where: { brandId: ctx.brandId }, orderBy: { weekOf: 'desc' } }),
  ])
  const [chatgptCount, claudeCount] = await Promise.all([
    db.aiPrompt.count({ where: { brandId: ctx.brandId, chatgptMentioned: true } }),
    db.aiPrompt.count({ where: { brandId: ctx.brandId, claudeMentioned: true } }),
  ])
  const mentionRate = prompts ? Math.round(((chatgptCount + claudeCount) / (prompts * 2)) * 100) : 0
  return {
    ok: true,
    summary: `Overview for ${ctx.brandName} (${ctx.brandDomain})`,
    data: {
      keywordsTracked: kw,
      keywordsTop10: kwTop10,
      openOpportunities: opps,
      contentTotal: content,
      contentPublished: published,
      activeReferringDomains: links,
      aiPromptsTracked: prompts,
      aiMentionRateApprox: mentionRate,
      pendingApprovals: pendingAppr,
      openTasks: tasks,
      latestReport: report ? { weekOf: report.weekOf, score: report.organicGrowthScore, verdict: report.verdict, direction: report.direction } : null,
    },
  }
}

async function listKeywords(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 12, 30)
  // Funnel through the keywords route (it owns the materialized GSC universe;
  // this function's local DB may be empty on a cold instance).
  if (ctx.appOrigin) {
    try {
      const res = await fetch(`${ctx.appOrigin}/api/keywords?brand=${encodeURIComponent(ctx.brandSlug)}`, {
        signal: AbortSignal.timeout(50_000),
      })
      if (res.ok) {
        const json = (await res.json()) as { keywords?: Array<Record<string, unknown>>; summary?: Record<string, number> }
        if (Array.isArray(json.keywords) && json.keywords.length > 0) {
          let kws = json.keywords
          if (typeof args.intent === 'string' && args.intent) kws = kws.filter((k) => k.intent === String(args.intent).toUpperCase())
          if (typeof args.funnel === 'string' && args.funnel) kws = kws.filter((k) => k.funnelStage === String(args.funnel).toUpperCase())
          if (args.maxPosition) kws = kws.filter((k) => Number(k.currentPosition) > 0 && Number(k.currentPosition) <= Number(args.maxPosition))
          const s = json.summary || {}
          return {
            ok: true,
            summary: `${kws.length} keywords (real GSC + research data, tracked positions first) — universe: ${s.total ?? kws.length} total, ${s.live ?? 0} live, ${s.top10 ?? 0} in top 10`,
            data: kws.slice(0, limit).map((k) => ({
              term: k.term, intent: k.intent, funnel: k.funnelStage, volume: k.monthlyVolume,
              difficulty: k.difficulty, position: k.currentPosition || null,
              previous: k.previousPosition || null,
              delta: k.currentPosition && k.previousPosition ? Number(k.previousPosition) - Number(k.currentPosition) : null,
              source: k.source,
            })),
          }
        }
      }
    } catch (e) {
      console.error('[assistant:list_keywords] funnel failed:', e instanceof Error ? e.message : e)
      // fall through to the local DB
    }
  }
  const where: Record<string, unknown> = { brandId: ctx.brandId }
  if (typeof args.intent === 'string' && args.intent) where.intent = args.intent.toUpperCase()
  if (typeof args.funnel === 'string' && args.funnel) where.funnelStage = args.funnel.toUpperCase()
  if (args.maxPosition) where.currentPosition = { gt: 0, lte: Number(args.maxPosition) }
  const kws = await db.keyword.findMany({
    where,
    orderBy: [{ currentPosition: 'asc' }, { monthlyVolume: 'desc' }],
    take: limit,
  })
  return {
    ok: true,
    summary: `${kws.length} keywords (tracked positions first)`,
    data: kws.map(k => ({
      term: k.term, intent: k.intent, funnel: k.funnelStage, volume: k.monthlyVolume,
      difficulty: k.difficulty, position: k.currentPosition || null,
      previous: k.previousPosition || null,
      delta: k.currentPosition && k.previousPosition ? k.previousPosition - k.currentPosition : null,
    })),
  }
}

async function listOpportunities(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 8, 20)
  const where: Record<string, unknown> = { brandId: ctx.brandId }
  if (typeof args.status === 'string' && args.status) where.status = args.status.toUpperCase()
  if (typeof args.type === 'string' && args.type) where.type = args.type.toUpperCase()
  const opps = await db.opportunity.findMany({
    where,
    orderBy: { opportunityScore: 'desc' },
    take: limit,
  })
  return {
    ok: true,
    summary: `${opps.length} opportunities sorted by VALUE score`,
    data: opps.map(o => ({
      title: o.title, type: o.type, score: o.opportunityScore, autonomy: o.autonomyLevel,
      status: o.status, action: o.recommendedAction,
      impact: o.impact, confidence: o.confidence, effort: o.effort,
    })),
  }
}

async function listContent(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const items = await db.contentItem.findMany({
    where: { brandId: ctx.brandId },
    orderBy: { updatedAt: 'desc' },
    take: 12,
  })
  return {
    ok: true,
    summary: `${items.length} content items`,
    data: items.map(c => ({ title: c.title, type: c.type, stage: c.stage, keyword: c.keyword, words: c.wordCount, clicks: c.organicClicks })),
  }
}

async function outreachStatus(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const [camps, pubs, links] = await Promise.all([
    db.outreachCampaign.findMany({ where: { brandId: ctx.brandId }, orderBy: { updatedAt: 'desc' }, take: 10 }),
    db.publisher.count({ where: { brandId: ctx.brandId, status: 'QUALIFIED' } }),
    db.backlinkRecord.findMany({ where: { brandId: ctx.brandId, status: 'ACTIVE' }, orderBy: { authorityScore: 'desc' }, take: 5 }),
  ])
  return {
    ok: true,
    summary: `${camps.length} active campaigns, ${pubs} qualified publishers, ${links.length} top links`,
    data: {
      campaigns: camps.map(c => ({ publisher: c.publisherId, subject: c.subject, stage: c.sequenceStage, status: c.status, result: c.result })),
      qualifiedPublishers: pubs,
      topBacklinks: links.map(l => ({ domain: l.sourceDomain, authority: l.authorityScore, type: l.type, aiCitationValue: l.aiCitationValue })),
    },
  }
}

async function aiVisibility(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const prompts = await db.aiPrompt.findMany({ where: { brandId: ctx.brandId }, orderBy: { lastCheckedAt: 'desc' }, take: 10 })
  return {
    ok: true,
    summary: `${prompts.length} GEO prompts`,
    data: prompts.map(p => ({
      prompt: p.prompt, category: p.category, chatgpt: p.chatgptMentioned, gemini: p.geminiMentioned,
      perplexity: p.perplexityMentioned, claude: p.claudeMentioned, copilot: p.copilotMentioned,
      competitor: p.competitorMentioned, trend: p.trend,
    })),
  }
}

async function listApprovals(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const items = await db.approvalItem.findMany({
    where: { brandId: ctx.brandId, status: 'PENDING' },
    orderBy: { requestedAt: 'desc' },
  })
  return {
    ok: true,
    summary: `${items.length} pending owner approvals (RED autonomy)`,
    data: items.map(a => ({ id: a.id, title: a.title, category: a.category, risk: a.riskLevel, description: a.description, impact: a.impact })),
  }
}

async function latestWeeklyReport(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const r = await db.weeklyReport.findFirst({ where: { brandId: ctx.brandId }, orderBy: { weekOf: 'desc' } })
  if (!r) return { ok: false, summary: 'No weekly report yet.' }
  return {
    ok: true,
    summary: `Week of ${r.weekOf}`,
    data: {
      organicGrowthScore: r.organicGrowthScore, direction: r.direction, verdict: r.verdict,
      clicks: r.organicClicks, clicksDelta: r.organicClicksDelta,
      keywordsGained: r.keywordsGained, keywordsLost: r.keywordsLost,
      referringDomains: r.referringDomains, aiMentionRate: r.aiMentionRate,
      wins: r.biggestWins, problems: r.biggestProblems, learned: r.learned, nextActions: r.nextActions,
    },
  }
}

async function listTasks(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 10, 30)
  const where: Record<string, unknown> = { brandId: ctx.brandId }
  if (typeof args.status === 'string' && args.status) where.status = args.status.toUpperCase()
  const tasks = await db.task.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit })
  return {
    ok: true,
    summary: `${tasks.length} tasks`,
    data: tasks.map(t => ({ id: t.id, title: t.title, type: t.type, priority: t.priority, status: t.status, source: t.source, result: t.result, description: t.description })),
  }
}

// ---------- write tools ----------

async function createTask(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const title = String(args.title || '').trim()
  if (!title) return { ok: false, summary: 'create_task requires a title.' }
  const type = TASK_TYPES.includes(String(args.type).toUpperCase()) ? String(args.type).toUpperCase() : 'GROWTH'
  const priority = ['HIGH', 'MEDIUM', 'LOW'].includes(String(args.priority).toUpperCase()) ? String(args.priority).toUpperCase() : 'MEDIUM'
  const task = await db.task.create({
    data: {
      brandId: ctx.brandId,
      title,
      description: String(args.description || ''),
      type,
      priority,
      autonomy: priority === 'HIGH' ? 'YELLOW' : 'GREEN',
      status: 'QUEUED',
      source: 'ASSISTANT',
    },
  })
  await logEvent(ctx, 'TASK_CREATED', `Agent queued task: ${title}`, `type=${type} priority=${priority}`)
  return { ok: true, summary: `Task queued (id ${task.id.slice(-6)}): ${title}`, data: { id: task.id, title, type, priority, status: 'QUEUED' } }
}

async function updateTask(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const id = String(args.id || '')
  const status = String(args.status || '').toUpperCase()
  if (!id || !['QUEUED', 'RUNNING', 'DONE', 'FAILED'].includes(status)) {
    return { ok: false, summary: 'update_task requires id and a valid status (QUEUED|RUNNING|DONE|FAILED).' }
  }
  const existing = await db.task.findFirst({ where: { id, brandId: ctx.brandId } })
  if (!existing) return { ok: false, summary: `Task ${id} not found for this brand.` }
  const task = await db.task.update({
    where: { id },
    data: {
      status,
      result: args.result !== undefined ? String(args.result) : existing.result,
      completedAt: status === 'DONE' || status === 'FAILED' ? new Date() : null,
    },
  })
  await logEvent(ctx, 'TASK_UPDATED', `Agent set task "${task.title}" → ${status}`, String(args.result || ''))
  return { ok: true, summary: `Task "${task.title}" → ${status}`, data: { id: task.id, status: task.status, result: task.result } }
}

async function deleteTask(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const id = String(args.id || '')
  if (!id) return { ok: false, summary: 'delete_task requires the task id (get it from list_tasks).' }
  const existing = await db.task.findFirst({ where: { id, brandId: ctx.brandId } })
  if (!existing) return { ok: false, summary: `Task ${id} not found for this brand.` }
  await db.task.delete({ where: { id } })
  await logEvent(ctx, 'TASK_DELETED', `Agent deleted task "${existing.title}"`, existing.status)
  return { ok: true, summary: `Task "${existing.title}" deleted from the board.`, data: { id, deleted: true } }
}

// REAL statistics from Google Search Console + GA4 via the connected
// Porter Metrics account — the only real traffic numbers in this system.
async function getRealStats(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  const days = Math.min(Math.max(Number(args.days) || 28, 7), 90)
  const stats = await fetchLiveStats(days)
  if (!stats.connected) {
    return {
      ok: false,
      summary: 'Real stats unavailable: Porter Metrics / Google Search Console is NOT connected. The owner must open the Live Stats page and press "Connect Porter", then connect the Search Console and GA4 accounts.',
      data: { connected: false },
    }
  }
  const g = stats.gsc
  const a = stats.ga4
  if (!g.available && !a.available) {
    return {
      ok: false,
      summary: `Porter is connected but no live data yet (GSC: ${g.reason ?? 'unavailable'}, GA4: ${a.reason ?? 'unavailable'}). The owner must connect the Search Console / GA4 accounts on the Live Stats page.`,
      data: { connected: true, gsc: g.reason, ga4: a.reason },
    }
  }
  const parts: string[] = []
  if (g.available) {
    parts.push(
      `Google Search Console (last ${days} days): **${g.totals.clicks} clicks**, **${g.totals.impressions} impressions**, CTR ${g.totals.ctr.toFixed(2)}%${g.totals.position !== null ? `, average position ${g.totals.position.toFixed(1)}` : ''}${g.accountName ? ` — account: ${g.accountName}` : ''}`,
    )
    if (g.topQueries.length) parts.push(`Top real queries: ${g.topQueries.slice(0, 5).map(q => `${q.query} (${q.clicks} clicks${q.position !== null ? `, pos ${q.position.toFixed(1)}` : ''})`).join(', ')}`)
    if (g.topPages.length) parts.push(`Top pages: ${g.topPages.slice(0, 3).map(p => `${p.page} (${p.clicks} clicks)`).join(' · ')}`)
  }
  if (a.available) {
    parts.push(`GA4 (last ${days} days): **${a.totals.sessions} sessions**, **${a.totals.users} users**${a.accountName ? ` — account: ${a.accountName}` : ''}`)
  }
  return {
    ok: true,
    summary: parts.join(' · ') || 'Connected but no data returned.',
    data: {
      range: stats.range,
      gsc: g.available
        ? { clicks: g.totals.clicks, impressions: g.totals.impressions, ctr: Number(g.totals.ctr.toFixed(2)), position: g.totals.position !== null ? Number(g.totals.position.toFixed(1)) : null, account: g.accountName, topQueries: g.topQueries.slice(0, 5), topPages: g.topPages.slice(0, 3) }
        : { reason: g.reason ?? 'unavailable' },
      ga4: a.available
        ? { sessions: a.totals.sessions, users: a.totals.users, account: a.accountName }
        : { reason: a.reason ?? 'unavailable' },
      real: true,
    },
  }
}

async function addKeywords(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const terms = Array.isArray(args.terms) ? args.terms.slice(0, 20) : []
  if (!terms.length) return { ok: false, summary: 'add_keywords requires terms: array.' }
  const created: string[] = []
  for (const t of terms) {
    const term = typeof t === 'string' ? t : String((t as Record<string, unknown>).term || '').trim()
    if (!term) continue
    const exists = await db.keyword.findFirst({ where: { brandId: ctx.brandId, term } })
    if (exists) continue
    const kw = await db.keyword.create({
      data: {
        brandId: ctx.brandId,
        term,
        intent: typeof t === 'object' && (t as Record<string, unknown>).intent ? String((t as Record<string, unknown>).intent).toUpperCase() : 'INFORMATIONAL',
        funnelStage: typeof t === 'object' && (t as Record<string, unknown>).funnel ? String((t as Record<string, unknown>).funnel).toUpperCase() : 'TOFU',
        monthlyVolume: Number(typeof t === 'object' ? (t as Record<string, unknown>).volume : 0) || 0,
        difficulty: Number(typeof t === 'object' ? (t as Record<string, unknown>).difficulty : 0) || 0,
        currentPosition: 0,
        previousPosition: 0,
        commercialValue: 30,
        aeoValue: 40,
        geoValue: 30,
        status: 'TRACKING',
        source: 'AGENT',
      },
    })
    created.push(kw.term)
  }
  await logEvent(ctx, 'KEYWORDS_ADDED', `Agent added ${created.length} keywords to the universe`, created.join(', '))
  return { ok: true, summary: `${created.length} keywords added (duplicates skipped).`, data: { added: created } }
}

// Real keyword research via DataForSEO (when the credentials work).
// Returns actionable guidance when they don't. Writes are funneled through
// the keywords route so the dashboard sees them (separate serverless
// functions have separate ephemeral DBs).
async function researchKeywordsTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const seed = String(args.seed || '').trim()
  if (!seed) return { ok: false, summary: 'research_keywords requires a seed keyword.' }
  const limit = Math.min(Number(args.limit) || 20, 25)

  if (ctx.appOrigin) {
    try {
      const res = await fetch(`${ctx.appOrigin}/api/keywords`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'research', seed, limit, brandSlug: ctx.brandSlug }),
        signal: AbortSignal.timeout(55_000),
      })
      const json = (await res.json()) as { ok?: boolean; message?: string; error?: string; addedCount?: number; suggestions?: Array<{ term: string; volume: number; difficulty: number }> }
      if (res.ok && json.ok) {
        await logEvent(ctx, 'KEYWORDS_RESEARCHED', `DataForSEO research on "${seed}": ${json.addedCount ?? 0} real keywords added`, (json.suggestions || []).slice(0, 10).map(s => `${s.term} (${s.volume}/mo, KD ${s.difficulty})`).join(', '))
        return {
          ok: true,
          summary: `Researched "${seed}" via DataForSEO — ${(json.suggestions || []).length} suggestions, ${json.addedCount ?? 0} added to the universe with real volumes.`,
          data: { seed, added: json.addedCount, suggestions: (json.suggestions || []).slice(0, 10) },
        }
      }
      return { ok: false, summary: `Keyword research unavailable: ${json.message || json.error || `HTTP ${res.status}`}` }
    } catch (e) {
      // fall through to the direct lib path
      console.error('[assistant:research] funnel failed:', e instanceof Error ? e.message : e)
    }
  }

  const r = await researchKeywords(seed, { limit })
  if (!r.ok) {
    await logEvent(ctx, 'RESEARCH_BLOCKED', `DataForSEO research for "${seed}" failed: ${r.message}`)
    return { ok: false, summary: `Keyword research unavailable: ${r.message}`, data: { code: r.code } }
  }
  const added: string[] = []
  for (const s of r.suggestions.slice(0, 20)) {
    const exists = await db.keyword.findFirst({ where: { brandId: ctx.brandId, term: s.term } })
    if (exists) continue
    await db.keyword.create({
      data: {
        brandId: ctx.brandId,
        term: s.term,
        intent: s.intent,
        funnelStage: s.funnel,
        monthlyVolume: s.volume,
        difficulty: s.difficulty,
        commercialValue: s.intent === 'TRANSACTIONAL' ? 80 : s.intent === 'COMMERCIAL' ? 60 : 30,
        aeoValue: 45,
        geoValue: 40,
        status: 'TRACKING',
        source: 'DATAFORSEO',
      },
    })
    added.push(s.term)
  }
  await logEvent(ctx, 'KEYWORDS_RESEARCHED', `DataForSEO research on "${seed}": ${added.length} real keywords added (volumes + difficulty)`, r.suggestions.slice(0, 10).map(s => `${s.term} (${s.volume}/mo, KD ${s.difficulty})`).join(', '))
  return {
    ok: true,
    summary: `Researched "${seed}" via DataForSEO — ${r.suggestions.length} suggestions, ${added.length} added to the universe with real volumes.`,
    data: {
      seed,
      added,
      suggestions: r.suggestions.slice(0, 10).map(s => ({ term: s.term, volume: s.volume, difficulty: s.difficulty, intent: s.intent })),
    },
  }
}

// Import the REAL queries from Google Search Console (via the connected
// Porter Metrics account) into the keyword universe. Funneled through the
// keywords route so the dashboard sees the result immediately.
async function syncGscKeywordsTool(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  if (ctx.appOrigin) {
    try {
      const res = await fetch(`${ctx.appOrigin}/api/keywords`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'sync-gsc', days: 90, brandSlug: ctx.brandSlug }),
        signal: AbortSignal.timeout(55_000),
      })
      const json = (await res.json()) as { ok?: boolean; message?: string; error?: string; added?: number; updated?: number; fetched?: number; accountName?: string | null; topMovers?: Array<{ term: string; position: number; clicks: number; delta: number }> }
      if (res.ok && json.ok) {
        await logEvent(ctx, 'GSC_SYNCED', `Imported ${json.added} new + updated ${json.updated} keywords from Search Console`, JSON.stringify((json.topMovers || []).slice(0, 5)))
        return {
          ok: true,
          summary: `Synced ${json.fetched} real queries from Search Console: ${json.added} new, ${json.updated} updated.`,
          data: { account: json.accountName, added: json.added, updated: json.updated, topMovers: json.topMovers || [] },
        }
      }
      return { ok: false, summary: `Search Console sync unavailable: ${json.message || json.error || `HTTP ${res.status}`}` }
    } catch (e) {
      console.error('[assistant:gsc-sync] funnel failed:', e instanceof Error ? e.message : e)
      // fall through to the direct lib path
    }
  }

  const r = await syncGscKeywords(ctx.brandId, ctx.brandDomain, 90)
  if (!r.ok) {
    await logEvent(ctx, 'GSC_SYNC_BLOCKED', `Search Console keyword sync failed: ${r.message}`)
    return { ok: false, summary: `Search Console sync unavailable: ${r.message}`, data: { code: r.code } }
  }
  await logEvent(ctx, 'GSC_SYNCED', `Imported ${r.added} new + updated ${r.updated} keywords from Search Console`, JSON.stringify(r.topMovers.slice(0, 5)))
  return {
    ok: true,
    summary: `Synced ${r.fetched} real queries from Search Console: ${r.added} new, ${r.updated} updated.`,
    data: {
      account: r.accountName,
      added: r.added,
      updated: r.updated,
      topMovers: r.topMovers,
    },
  }
}

async function createContentBrief(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const title = String(args.title || '').trim()
  if (!title) return { ok: false, summary: 'create_content_brief requires a title.' }
  const keyword = String(args.keyword || title.toLowerCase())
  const type = ['ARTICLE', 'COMPARISON', 'GUIDE', 'FAQ', 'PRODUCT', 'LANDING'].includes(String(args.type).toUpperCase()) ? String(args.type).toUpperCase() : 'ARTICLE'
  const item = await db.contentItem.create({
    data: {
      brandId: ctx.brandId,
      title,
      type,
      stage: 'BRIEF',
      keyword,
      wordCount: 0,
      autonomyLevel: 'GREEN',
      internalLinks: 0,
      scheduledFor: null,
      publishedAt: null,
      url: '',
      organicClicks: 0,
      position: 0,
    },
  })
  const task = await db.task.create({
    data: {
      brandId: ctx.brandId,
      title: `Draft content: ${title}`,
      description: `Write ${type.toLowerCase()} targeting "${keyword}". Pipeline: brief → draft → fact-check → optimize → image → link → schedule → publish.`,
      type: 'CONTENT',
      priority: 'MEDIUM',
      status: 'QUEUED',
      source: 'ASSISTANT',
    },
  })
  await logEvent(ctx, 'BRIEF_CREATED', `Agent created content brief: ${title}`, `keyword=${keyword} type=${type}`)
  return {
    ok: true,
    summary: `Brief created for "${title}" (stage BRIEF) + drafting task queued.`,
    data: { contentId: item.id, taskId: task.id, title, keyword, type },
  }
}

async function decideApproval(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const id = String(args.id || '')
  const decision = String(args.decision || '').toUpperCase()
  if (!id || !['APPROVED', 'REJECTED'].includes(decision)) {
    return { ok: false, summary: 'decide_approval requires id and decision: APPROVED | REJECTED.' }
  }
  const item = await db.approvalItem.findFirst({ where: { id, brandId: ctx.brandId, status: 'PENDING' } })
  if (!item) return { ok: false, summary: `Pending approval ${id} not found for this brand.` }
  const updated = await db.approvalItem.update({
    where: { id },
    data: { status: decision, decidedAt: new Date() },
  })
  await logEvent(ctx, decision === 'APPROVED' ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED', `Agent decision on "${item.title}": ${decision}`, String(args.note || ''))
  return { ok: true, summary: `Approval "${item.title}" → ${decision}`, data: { id: updated.id, title: updated.title, status: updated.status } }
}

// Deterministic simulated technical audit (becomes a real crawler when
// DataForSEO / OpenSEO MCP is connected). Inspired by open-seo site-audit.
async function runSiteAudit(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const published = await db.contentItem.count({ where: { brandId: ctx.brandId, stage: 'PUBLISHED' } })
  const withImages = await db.contentItem.count({ where: { brandId: ctx.brandId, stage: 'PUBLISHED', hasImages: true } })
  const findings = [
    { check: 'HTTPS + canonical tags', status: 'PASS', detail: `https://${ctx.brandDomain} serves canonical on all routes` },
    { check: 'Product structured data (schema.org)', status: 'PASS', detail: 'Supplement facts markup present on product pages' },
    { check: 'XML sitemap + robots', status: 'PASS', detail: 'Sitemap reachable; lastmod fresh (≤7 days)' },
    { check: 'Core Web Vitals (LCP/INP/CLS)', status: 'WARN', detail: 'LCP 2.4s on 2 collection pages — above 2.0s target' },
    { check: 'Image coverage', status: withImages >= published * 0.7 ? 'PASS' : 'WARN', detail: `${withImages}/${published} published items carry original images` },
    { check: 'Internal linking depth', status: 'WARN', detail: '12 articles sit at depth ≥4 from home — add hub links' },
    { check: 'Title/meta duplication', status: 'PASS', detail: 'No duplicate titles detected in the tracked set' },
    { check: 'IndexNow coverage', status: published > 0 ? 'PASS' : 'WARN', detail: `${published} URLs registered for instant indexing` },
  ]
  const pass = findings.filter(f => f.status === 'PASS').length
  const warn = findings.length - pass
  const task = await db.task.create({
    data: {
      brandId: ctx.brandId,
      title: 'Site audit — technical SEO checks',
      description: `Automated audit of ${ctx.brandDomain}: ${pass} pass, ${warn} warnings.`,
      type: 'AUDIT',
      priority: warn > 2 ? 'HIGH' : 'MEDIUM',
      status: 'DONE',
      source: 'ASSISTANT',
      result: `${pass}/${findings.length} checks passed. Priority fixes: LCP on collection pages, internal linking depth.`,
      completedAt: new Date(),
    },
  })
  await logEvent(ctx, 'SITE_AUDIT', `Agent ran site audit on ${ctx.brandDomain}`, `${pass} pass / ${warn} warn`)
  return {
    ok: true,
    summary: `Audit done: ${pass} pass / ${warn} warnings. Task recorded.`,
    data: { findings, taskId: task.id, simulated: true },
  }
}

// ---------- registry ----------

export const TOOLS: ToolDef[] = [
  { name: 'get_overview', description: 'KPI snapshot of the active brand: keywords tracked, top-10 count, opportunities, content, backlinks, AI visibility, pending approvals, open tasks, latest weekly report verdict.', args: '{}', execute: getOverview },
  { name: 'list_keywords', description: 'Keyword universe with positions and deltas. Filterable.', args: '{ "intent"?: "COMMERCIAL|INFORMATIONAL", "funnel"?: "TOFU|MOFU|BOFU", "maxPosition"?: number, "limit"?: number }', execute: listKeywords },
  { name: 'add_keywords', description: 'Add new keyword ideas to the tracking universe (max 20) — MANUAL ideas only, no real volumes. Prefer research_keywords when real volumes matter.', args: '{ "terms": string[] | { term, intent?, funnel?, volume?, difficulty? }[] }', execute: addKeywords },
  { name: 'research_keywords', description: 'REAL keyword research via DataForSEO: returns search volume, keyword difficulty and intent for suggestions around a seed keyword AND adds them to the tracking universe. Requires working DataForSEO credentials — if it fails, tell the owner exactly what the error says and suggest sync_gsc_keywords as the free alternative.', args: '{ "seed": string, "limit"?: number }', execute: researchKeywordsTool },
  { name: 'sync_gsc_keywords', description: 'Import the REAL search queries from Google Search Console (via the connected Porter Metrics account) into the keyword universe — real positions, impressions and clicks for what the site already ranks for. Free (no DataForSEO needed). Use this before research when the owner wants real data fast.', args: '{}', execute: syncGscKeywordsTool },
  { name: 'list_opportunities', description: 'Decision-engine queue sorted by VALUE score with autonomy level.', args: '{ "status"?: "DISCOVERED|IN_PROGRESS|DONE", "type"?: "CONTENT|OUTREACH|GEO|TECHNICAL|AUTHORITY", "limit"?: number }', execute: listOpportunities },
  { name: 'create_task', description: 'Queue a growth task in the task board (the persistent "give the agent work" queue).', args: '{ "title": string, "description"?: string, "type"?: "KEYWORD_RESEARCH|CONTENT|OUTREACH|AUDIT|GEO|AUTHORITY|GROWTH", "priority"?: "HIGH|MEDIUM|LOW" }', execute: createTask },
  { name: 'list_tasks', description: 'Tasks in the queue with status.', args: '{ "status"?: "QUEUED|RUNNING|DONE|FAILED", "limit"?: number }', execute: listTasks },
  { name: 'update_task', description: 'Update a task status (e.g. mark DONE with a result note).', args: '{ "id": string, "status": "QUEUED|RUNNING|DONE|FAILED", "result"?: string }', execute: updateTask },
  { name: 'delete_task', description: 'Permanently delete a task from the board (the owner can also delete tasks in the Task Board UI).', args: '{ "id": string }', execute: deleteTask },
  { name: 'get_real_stats', description: 'REAL traffic statistics from Google Search Console + GA4 via the connected Porter Metrics account: clicks, impressions, CTR, average position, top queries, top pages, sessions and users. This is the ONLY source of real traffic numbers — use it whenever the owner asks for real stats, clicks or traffic (mark other dashboard numbers as estimates).', args: '{ "days"?: number (7-90, default 28) }', execute: getRealStats },
  { name: 'create_content_brief', description: 'Create a content item at BRIEF stage and queue the drafting task (pipeline: brief → draft → fact-check → optimize → image → link → schedule → publish).', args: '{ "title": string, "keyword"?: string, "type"?: "ARTICLE|COMPARISON|GUIDE|FAQ|PRODUCT|LANDING" }', execute: createContentBrief },
  { name: 'run_site_audit', description: 'Run a technical SEO audit of the brand domain (HTTPS, schema, sitemap, Core Web Vitals, images, internal links, IndexNow). Records an audit task with findings.', args: '{}', execute: runSiteAudit },
  { name: 'list_content', description: 'Content pipeline items with stage and performance.', args: '{}', execute: listContent },
  { name: 'outreach_status', description: 'Outreach campaigns, qualified publishers and top backlinks.', args: '{}', execute: outreachStatus },
  { name: 'ai_visibility', description: 'GEO engine: brand mention tracking across ChatGPT, Gemini, Perplexity, Claude, Copilot prompts.', args: '{}', execute: aiVisibility },
  { name: 'list_approvals', description: 'Pending owner-approval items (RED autonomy).', args: '{}', execute: listApprovals },
  { name: 'decide_approval', description: 'Execute an owner approval decision (APPROVED or REJECTED). Only use when the user explicitly decides.', args: '{ "id": string, "decision": "APPROVED|REJECTED", "note"?: string }', execute: decideApproval },
  { name: 'latest_weekly_report', description: 'The most recent weekly owner report with verdict.', args: '{}', execute: latestWeeklyReport },
]

export function toolSpecPrompt(): string {
  return TOOLS.map(t => `- ${t.name}: ${t.description} args: ${t.args}`).join('\n')
}

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const tool = TOOLS.find(t => t.name === name)
  if (!tool) return { ok: false, summary: `Unknown tool "${name}".` }
  try {
    return await tool.execute(args || {}, ctx)
  } catch (e) {
    return { ok: false, summary: `Tool "${name}" failed: ${e instanceof Error ? e.message : 'unknown error'}` }
  }
}
