// ============================================================
// DATAFORSEO CLIENT (server-only)
// Real keyword research: search volume, keyword difficulty,
// CPC and competition from the DataForSEO Labs API.
// Credentials come from the Credential Vault (API Keys page).
//
// IMPORTANT: DataForSEO API credentials are NOT the dashboard
// email+password — they are generated under
// app.dataforseo.com → API Access. This module maps the
// provider's error codes to actionable messages so the owner
// (and Sprout) always know exactly what to fix.
// ============================================================

import { getCredentialValues } from '@/lib/credentials'

const API = 'https://api.dataforseo.com'

export interface DataForSeoConfig {
  login: string
  password: string
}

export interface AuthCheck {
  ok: boolean
  balance: number | null
  /** provider status code (40100 = not authorized) */
  statusCode: number | null
  message: string
}

export interface KeywordSuggestion {
  term: string
  volume: number
  difficulty: number
  cpc: number
  competition: number
  intent: 'INFORMATIONAL' | 'COMMERCIAL' | 'TRANSACTIONAL'
  funnel: 'TOFU' | 'MOFU' | 'BOFU'
}

export interface ResearchOutcome {
  ok: true
  seed: string
  locationName: string
  suggestions: KeywordSuggestion[]
}

export interface ResearchError {
  ok: false
  code: 'no_credentials' | 'invalid_credentials' | 'no_results' | 'network'
  message: string
  statusCode?: number
}

// auth check cache — 60s per warm instance
let authCache: { check: AuthCheck; ts: number } | null = null

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 30_000): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function getDataForSeoConfig(): Promise<DataForSeoConfig | null> {
  const v = await getCredentialValues('dataforseo')
  if (!v.login || !v.password) return null
  return { login: v.login, password: v.password }
}

function authHeader(cfg: DataForSeoConfig): string {
  return `Basic ${Buffer.from(`${cfg.login}:${cfg.password}`).toString('base64')}`
}

/**
 * Verify the saved credentials with the cheapest authoritative call.
 * GET /v3/appendix/user_data returns 40100 for wrong API login/password
 * and the account balance on success.
 */
export async function checkDataForSeoAuth(force = false): Promise<AuthCheck> {
  if (!force && authCache && Date.now() - authCache.ts < 60_000) return authCache.check
  const cfg = await getDataForSeoConfig()
  if (!cfg) {
    const check: AuthCheck = {
      ok: false, balance: null, statusCode: null,
      message: 'No DataForSEO credentials saved yet — add them on the API Keys page.',
    }
    authCache = { check, ts: Date.now() }
    return check
  }
  const res = await fetchWithTimeout(`${API}/v3/appendix/user_data`, {
    method: 'GET',
    headers: { authorization: authHeader(cfg) },
  }, 15_000)
  if (!res) {
    const check: AuthCheck = { ok: false, balance: null, statusCode: null, message: 'Could not reach api.dataforseo.com (network/timeout).' }
    authCache = { check, ts: Date.now() }
    return check
  }
  try {
    const data = await res.json() as { status_code?: number; status_message?: string; tasks?: Array<{ result?: Array<{ money?: { balance?: number } }> }> }
    const code = data.status_code ?? null
    if (res.ok && code === 20000) {
      const balance = data.tasks?.[0]?.result?.[0]?.money?.balance ?? null
      const check: AuthCheck = { ok: true, balance, statusCode: 20000, message: typeof balance === 'number' ? `Connected — balance $${balance.toFixed(2)}.` : 'Connected.' }
      authCache = { check, ts: Date.now() }
      return check
    }
    const check: AuthCheck = {
      ok: false, balance: null, statusCode: code,
      message: code === 40100
        ? 'Rejected (40100) — the API login/password is incorrect. DataForSEO API credentials are NOT your dashboard email+password: generate them at app.dataforseo.com → API Access, then update them on the API Keys page.'
        : `DataForSEO rejected the request (status ${code ?? res.status}) — check the account.`,
    }
    authCache = { check, ts: Date.now() }
    return check
  } catch {
    const check: AuthCheck = { ok: false, balance: null, statusCode: null, message: `DataForSEO responded with HTTP ${res.status} — not confirmed.` }
    authCache = { check, ts: Date.now() }
    return check
  }
}

// ------------------------------------------------------------
// REAL BACKLINK PROFILE — Backlinks Summary API
// Used by the dashboard "Referring Domains" KPI. Costs a fraction
// of a cent per call, cached 6h per domain per warm instance.
// ------------------------------------------------------------

export interface BacklinksSummary {
  ok: boolean
  /** live count of unique referring domains pointing at the target */
  referringDomains: number | null
  /** live total backlinks count */
  backlinks: number | null
  message: string
}

let backlinksCache = new Map<string, { summary: BacklinksSummary; ts: number }>()
const BACKLINKS_TTL_MS = 6 * 60 * 60_000
// failures (bad key, empty wallet) must NOT stick for 6 hours —
// the moment the owner fixes the key the next read retries live
const BACKLINKS_FAILURE_TTL_MS = 60_000

/**
 * Drop all in-memory DataForSEO caches. Called when the owner
 * saves or removes DataForSEO credentials so a NEW key takes
 * effect immediately (never re-shows a stale 40100 rejection).
 */
export function resetDataForSeoCaches(): void {
  authCache = null
  backlinksCache.clear()
}

export async function fetchBacklinksSummary(domain: string, force = false): Promise<BacklinksSummary> {
  const key = domain.toLowerCase()
  if (!force) {
    const hit = backlinksCache.get(key)
    if (hit && Date.now() - hit.ts < (hit.summary.ok ? BACKLINKS_TTL_MS : BACKLINKS_FAILURE_TTL_MS)) return hit.summary
  }

  // fail fast on bad/missing credentials so we never charge a doomed call
  const auth = await checkDataForSeoAuth()
  if (!auth.ok) {
    const summary: BacklinksSummary = { ok: false, referringDomains: null, backlinks: null, message: auth.message }
    backlinksCache.set(key, { summary, ts: Date.now() })
    return summary
  }

  const cfg = await getDataForSeoConfig()
  if (!cfg) {
    const summary: BacklinksSummary = { ok: false, referringDomains: null, backlinks: null, message: 'No DataForSEO credentials saved.' }
    backlinksCache.set(key, { summary, ts: Date.now() })
    return summary
  }

  const res = await fetchWithTimeout(`${API}/v3/backlinks/summary/live`, {
    method: 'POST',
    headers: { authorization: authHeader(cfg), 'content-type': 'application/json' },
    body: JSON.stringify([{ target: domain, mode: 'as_is' }]),
  }, 30_000)

  if (!res) {
    const summary: BacklinksSummary = { ok: false, referringDomains: null, backlinks: null, message: 'Could not reach api.dataforseo.com (network/timeout).' }
    backlinksCache.set(key, { summary, ts: Date.now() })
    return summary
  }

  try {
    const data = await res.json() as {
      status_code?: number
      status_message?: string
      tasks?: Array<{
        status_code?: number
        status_message?: string
        result?: Array<Record<string, unknown>>
      }>
    }
    const rootCode = data.status_code ?? null
    const taskCode = data.tasks?.[0]?.status_code ?? null
    if (rootCode === 40100 || taskCode === 40100) {
      const summary: BacklinksSummary = { ok: false, referringDomains: null, backlinks: null, message: 'Rejected (40100) — the DataForSEO API login/password is incorrect. Generate real API credentials at app.dataforseo.com → API Access.' }
      backlinksCache.set(key, { summary, ts: Date.now() })
      return summary
    }
    if (rootCode === 40202 || taskCode === 40202) {
      const summary: BacklinksSummary = { ok: false, referringDomains: null, backlinks: null, message: 'Your DataForSEO account ran out of funds — top up at app.dataforseo.com.' }
      backlinksCache.set(key, { summary, ts: Date.now() })
      return summary
    }
    const result = data.tasks?.[0]?.result?.[0]
    const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    const referringDomains = num(result?.referring_domains)
    const backlinks = num(result?.backlinks)
    if (referringDomains === null) {
      const summary: BacklinksSummary = { ok: false, referringDomains: null, backlinks: null, message: `DataForSEO returned no backlink summary for ${domain} (status ${rootCode ?? res.status}).` }
      backlinksCache.set(key, { summary, ts: Date.now() })
      return summary
    }
    const summary: BacklinksSummary = { ok: true, referringDomains, backlinks, message: `Live backlink profile for ${domain} via DataForSEO.` }
    backlinksCache.set(key, { summary, ts: Date.now() })
    return summary
  } catch {
    const summary: BacklinksSummary = { ok: false, referringDomains: null, backlinks: null, message: `DataForSEO responded with HTTP ${res.status} — not confirmed.` }
    backlinksCache.set(key, { summary, ts: Date.now() })
    return summary
  }
}

// ------------------------------------------------------------
// BULK KEYWORD METRICS — Labs "Bulk Search Volume" +
// "Bulk Keyword Difficulty" endpoints. Fills the REAL Volume &
// Difficulty columns for tracked GSC keywords in two cheap
// batched calls (up to 1000 keywords per request each).
// ------------------------------------------------------------

export interface BulkKeywordMetric {
  volume: number
  difficulty: number
}

export interface BulkMetricsOutcome {
  ok: boolean
  /** lowercase term → real metrics (only terms DataForSEO knows) */
  metrics: Map<string, BulkKeywordMetric>
  volumeCount: number
  difficultyCount: number
  /** exact USD DataForSEO charged for these calls */
  cost: number
  messages: string[]
}

/** minimum balance guard so enrichment can never drain the wallet */
export const MIN_ENRICH_BALANCE = 0.25

interface LabsTask {
  status_code?: number
  status_message?: string
  cost?: number
  result?: Array<Record<string, unknown>>
}

function labItems(task: LabsTask | undefined): Record<string, unknown>[] {
  const result = task?.result
  if (!Array.isArray(result) || result.length === 0) return []
  // standard shape: result[0].items — but accept a bare item list too
  const first = result[0]
  const items = (first as { items?: unknown })?.items
  if (Array.isArray(items)) return items as Record<string, unknown>[]
  return result as Record<string, unknown>[]
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** search volume from an item: `search_volume` or the newest `monthly_searches` entry */
function volumeOf(item: Record<string, unknown>): number {
  const direct = num(item.search_volume)
  if (direct !== null) return Math.max(0, Math.round(direct))
  const history = item.monthly_searches
  if (Array.isArray(history)) {
    const dated = history
      .map((m) => m as { year?: unknown; month?: unknown; search_volume?: unknown })
      .filter((m) => num(m.search_volume) !== null)
      .sort((a, b) => (num(a.year) ?? 0) - (num(b.year) ?? 0) || (num(a.month) ?? 0) - (num(b.month) ?? 0))
    if (dated.length > 0) return Math.max(0, Math.round(num(dated[dated.length - 1].search_volume) ?? 0))
  }
  return 0
}

async function bulkCall(
  path: string,
  cfg: DataForSeoConfig,
  terms: string[],
  locationName: string,
  languageName: string,
  debug = false,
): Promise<{ items: Record<string, unknown>[]; cost: number; statusCode: number | null; message: string | null; sample: unknown }> {
  const res = await fetchWithTimeout(`${API}${path}`, {
    method: 'POST',
    headers: { authorization: authHeader(cfg), 'content-type': 'application/json' },
    body: JSON.stringify([{ location_name: locationName, language_name: languageName, keywords: terms }]),
  }, 60_000)
  if (!res) return { items: [], cost: 0, statusCode: null, message: `Could not reach ${path} (network/timeout).`, sample: null }
  try {
    const data = await res.json() as { status_code?: number; status_message?: string; cost?: number; tasks?: LabsTask[] }
    const task = data.tasks?.[0]
    const code = data.status_code ?? task?.status_code ?? null
    const cost = num(data.cost) ?? 0
    const sample = debug ? (task?.result?.[0] ?? null) : null
    if (code === 40100) {
      return { items: [], cost, statusCode: 40100, message: 'Rejected (40100) — the DataForSEO API login/password is incorrect. Generate real API credentials at app.dataforseo.com → API Access.', sample }
    }
    if (code === 40202) {
      return { items: [], cost, statusCode: 40202, message: 'Your DataForSEO account ran out of funds — top up at app.dataforseo.com.', sample }
    }
    if (code !== 20000) {
      return { items: [], cost, statusCode: code, message: `DataForSEO ${path} failed (status ${code ?? res.status}: ${data.status_message || task?.status_message || 'unknown'}).`, sample }
    }
    return { items: labItems(task), cost, statusCode: code, message: null, sample }
  } catch {
    return { items: [], cost: 0, statusCode: null, message: `DataForSEO ${path} responded with HTTP ${res.status} — not confirmed.`, sample: null }
  }
}

/**
 * Real metrics for exact keywords via two Labs bulk endpoints:
 *   • /google/bulk_search_volume/live         → search volume
 *   • /google/bulk_keyword_difficulty/live    → difficulty
 * Pass ONLY the terms you are missing each metric for — every
 * term is billed, already-enriched keywords are never re-charged.
 * Failures of one endpoint never block the other; every outcome
 * carries the exact cost so the caller can stay honest about
 * what was spent.
 */
export async function fetchBulkKeywordMetrics(
  volumeTerms: string[],
  difficultyTerms: string[],
  opts: { locationName?: string; languageName?: string; debug?: boolean } = {},
): Promise<BulkMetricsOutcome> {
  const metrics = new Map<string, BulkKeywordMetric>()
  const messages: string[] = []
  const samples: Array<{ endpoint: string; result: unknown }> = []
  const debug = Boolean(opts.debug)
  let cost = 0

  const auth = await checkDataForSeoAuth()
  if (!auth.ok) {
    return { ok: false, metrics, volumeCount: 0, difficultyCount: 0, cost: 0, messages: [auth.message] }
  }
  if (auth.balance !== null && auth.balance < MIN_ENRICH_BALANCE) {
    return {
      ok: false, metrics, volumeCount: 0, difficultyCount: 0, cost: 0,
      messages: [`DataForSEO balance is too low ($${auth.balance.toFixed(2)}) — top up at app.dataforseo.com to enrich more keywords.`],
    }
  }
  const cfg = await getDataForSeoConfig()
  if (!cfg || (volumeTerms.length === 0 && difficultyTerms.length === 0)) {
    return { ok: false, metrics, volumeCount: 0, difficultyCount: 0, cost: 0, messages: [cfg ? 'No keywords to enrich.' : 'No DataForSEO credentials saved.'] }
  }

  const locationName = (opts.locationName || 'United States').trim()
  const languageName = (opts.languageName || 'English').trim()

  if (volumeTerms.length > 0) {
    const volume = await bulkCall('/v3/dataforseo_labs/google/bulk_search_volume/live', cfg, volumeTerms, locationName, languageName, debug)
    cost += volume.cost
    if (volume.message) messages.push(volume.message)
    if (debug && volume.sample !== null) samples.push({ endpoint: 'labs_volume', result: volume.sample })
    for (const item of volume.items) {
      const kw = typeof item.keyword === 'string' ? item.keyword.toLowerCase() : ''
      if (!kw) continue
      const entry = metrics.get(kw) ?? { volume: 0, difficulty: 0 }
      entry.volume = volumeOf(item)
      metrics.set(kw, entry)
    }
  }

  if (difficultyTerms.length > 0) {
    const difficulty = await bulkCall('/v3/dataforseo_labs/google/bulk_keyword_difficulty/live', cfg, difficultyTerms, locationName, languageName, debug)
    cost += difficulty.cost
    if (difficulty.message) messages.push(difficulty.message)
    if (debug && difficulty.sample !== null) samples.push({ endpoint: 'difficulty', result: difficulty.sample })
    for (const item of difficulty.items) {
      const kw = typeof item.keyword === 'string' ? item.keyword.toLowerCase() : ''
      if (!kw) continue
      const kd = num(item.keyword_difficulty)
      if (kd === null) continue
      const entry = metrics.get(kw) ?? { volume: 0, difficulty: 0 }
      entry.difficulty = Math.max(0, Math.min(100, Math.round(kd)))
      metrics.set(kw, entry)
    }
  }

  const volumeCount = [...metrics.values()].filter((m) => m.volume > 0).length
  const difficultyCount = [...metrics.values()].filter((m) => m.difficulty > 0).length
  const outcome: BulkMetricsOutcome = {
    ok: volumeCount > 0 || difficultyCount > 0,
    metrics, volumeCount, difficultyCount, cost, messages,
  }
  if (debug) (outcome as BulkMetricsOutcome & { samples?: unknown }).samples = samples
  return outcome
}

/** Cheap intent/funnel heuristic (DataForSEO does not classify intent). */
function classify(term: string): { intent: KeywordSuggestion['intent']; funnel: KeywordSuggestion['funnel'] } {
  const t = term.toLowerCase()
  if (/\b(buy|order|shop|purchase|price|pricing|cheap|deal|discount|coupon)\b/.test(t)) return { intent: 'TRANSACTIONAL', funnel: 'BOFU' }
  if (/\b(best|top|vs\.?|versus|compare|comparison|alternative|alternatives|review|reviews|recommend)\b/.test(t)) return { intent: 'COMMERCIAL', funnel: 'MOFU' }
  return { intent: 'INFORMATIONAL', funnel: 'TOFU' }
}

/**
 * Keyword research via DataForSEO Labs → Google keyword suggestions.
 * Costs a few tenths of a cent per call on a funded account.
 */
export async function researchKeywords(
  seed: string,
  opts: { locationName?: string; languageName?: string; limit?: number } = {},
): Promise<ResearchOutcome | ResearchError> {
  const cfg = await getDataForSeoConfig()
  if (!cfg) {
    return {
      ok: false, code: 'no_credentials',
      message: 'No DataForSEO credentials saved yet — add the API login + password on the API Keys page (DataForSEO service).',
    }
  }

  // fail fast on known-bad credentials so we never charge a doomed request
  const auth = await checkDataForSeoAuth()
  if (!auth.ok && auth.statusCode === 40100) {
    return { ok: false, code: 'invalid_credentials', statusCode: 40100, message: auth.message }
  }

  const locationName = (opts.locationName || 'United States').trim()
  const languageName = (opts.languageName || 'English').trim()
  const limit = Math.min(Math.max(opts.limit || 20, 5), 25)

  const res = await fetchWithTimeout(`${API}/v3/dataforseo_labs/google/keyword_suggestions/live`, {
    method: 'POST',
    headers: { authorization: authHeader(cfg), 'content-type': 'application/json' },
    body: JSON.stringify([{ keyword: seed, location_name: locationName, language_name: languageName, limit }]),
  }, 45_000)

  if (!res) return { ok: false, code: 'network', message: 'Could not reach api.dataforseo.com (network/timeout) — no credits were spent.' }

  let data: {
    status_code?: number
    status_message?: string
    tasks?: Array<{
      status_code?: number
      status_message?: string
      result?: Array<{ items?: Array<Record<string, unknown>> }>
    }>
  }
  try {
    data = await res.json()
  } catch {
    return { ok: false, code: 'network', message: `DataForSEO responded with HTTP ${res.status} — not confirmed.` }
  }

  const rootCode = data.status_code
  if (rootCode === 40100 || (data.tasks?.[0]?.status_code === 40100)) {
    return {
      ok: false, code: 'invalid_credentials', statusCode: 40100,
      message: 'Rejected (40100) — the API login/password is incorrect. DataForSEO API credentials are generated at app.dataforseo.com → API Access (they are NOT your dashboard email+password). Update them on the API Keys page.',
    }
  }
  if (rootCode === 40202 || data.tasks?.[0]?.status_code === 40202) {
    return {
      ok: false, code: 'invalid_credentials', statusCode: 40202,
      message: 'Your DataForSEO account ran out of funds — top up the balance at app.dataforseo.com.',
    }
  }

  const items = data.tasks?.[0]?.result?.[0]?.items
  if (!Array.isArray(items) || items.length === 0) {
    return {
      ok: false, code: 'no_results', statusCode: rootCode ?? undefined,
      message: `DataForSEO returned no keyword suggestions for "${seed}" (status ${rootCode ?? res.status}: ${data.status_message || data.tasks?.[0]?.status_message || 'no items'}).`,
    }
  }

  const suggestions: KeywordSuggestion[] = []
  for (const raw of items) {
    const term = typeof raw.keyword === 'string' ? raw.keyword.trim() : ''
    if (!term || term.toLowerCase() === seed.toLowerCase()) continue
    const info = (raw.keyword_info || {}) as Record<string, unknown>
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
    const { intent, funnel } = classify(term)
    suggestions.push({
      term,
      volume: Math.round(num(info.search_volume)),
      difficulty: Math.round(num(info.keyword_difficulty)),
      cpc: Math.round(num(info.cpc) * 100) / 100,
      competition: Math.round(num(info.competition) * 100) / 100,
      intent,
      funnel,
    })
  }
  suggestions.sort((a, b) => b.volume - a.volume)

  return { ok: true, seed, locationName, suggestions: suggestions.slice(0, limit) }
}
