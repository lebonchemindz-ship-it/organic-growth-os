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
