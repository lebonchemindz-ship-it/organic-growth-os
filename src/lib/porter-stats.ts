// ============================================================
// LIVE STATS ENGINE (server-only)
// Real Google Search Console & GA4 statistics through the
// Porter Metrics MCP server. Extracted from /api/porter/stats
// so both the route and Sprout's get_real_stats tool share
// one implementation (with a shared 5-minute cache).
// ============================================================

import {
  discoverConnectorFields,
  findGoogleConnectorSlugs,
  getPorterConfig,
  listPorterAccounts,
  normalizeAccounts,
  pickField,
  porterQuery,
  type PorterConnectorAccount,
} from '@/lib/porter-mcp'

export interface GscStats {
  available: boolean
  slug: string
  accountId: string | null
  accountName: string | null
  reason?: string
  error?: string
  totals: { clicks: number; impressions: number; ctr: number; position: number | null }
  daily: Array<{ date: string; clicks: number; impressions: number; position: number | null }>
  topQueries: Array<{ query: string; clicks: number; impressions: number; position: number | null }>
  topPages: Array<{ page: string; clicks: number; impressions: number; position: number | null }>
}

export interface Ga4Stats {
  available: boolean
  slug: string
  accountId: string | null
  accountName: string | null
  reason?: string
  error?: string
  totals: { sessions: number; users: number }
  daily: Array<{ date: string; sessions: number; users: number }>
}

export interface LiveStats {
  connected: boolean
  source: string
  range: { days: number; from: string; to: string }
  gsc: GscStats
  ga4: Ga4Stats
  warnings: string[]
  fetchedAt: string
}

interface Row {
  [key: string]: unknown
}

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''))
    if (Number.isFinite(n)) return n
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const inner = o.value ?? o.numericValue ?? o.metricValue
    if (inner !== undefined) return num(inner)
  }
  return 0
}

function str(v: unknown): string {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    const inner = (v as Record<string, unknown>).value
    if (typeof inner === 'string') return inner
  }
  return v === null || v === undefined ? '' : String(v)
}

function bestAccount(accounts: PorterConnectorAccount[]): PorterConnectorAccount | null {
  return accounts.find((a) => a.status === 'connected') ?? accounts[0] ?? null
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

const CACHE_TTL_MS = 5 * 60_000
const statsCache = new Map<string, { stats: LiveStats; ts: number }>()

/**
 * Pull real GSC + GA4 statistics via Porter Metrics.
 * Returns { connected: false, reason: 'not_connected' } style data
 * when Porter is not set up — never throws.
 */
export async function fetchLiveStats(days = 28, refresh = false): Promise<LiveStats> {
  const cfg = await getPorterConfig()
  if (!cfg.accessToken) {
    return {
      connected: false,
      source: 'porter',
      range: { days, from: isoDaysAgo(days), to: new Date().toISOString().slice(0, 10) },
      gsc: {
        available: false, slug: '', accountId: null, accountName: null, reason: 'not_connected',
        totals: { clicks: 0, impressions: 0, ctr: 0, position: null },
        daily: [], topQueries: [], topPages: [],
      },
      ga4: {
        available: false, slug: '', accountId: null, accountName: null, reason: 'not_connected',
        totals: { sessions: 0, users: 0 }, daily: [],
      },
      warnings: [],
      fetchedAt: new Date().toISOString(),
    }
  }

  const slugs = await findGoogleConnectorSlugs()
  const cacheKey = `${slugs.gsc}|${slugs.ga4}|${days}`
  if (!refresh) {
    const hit = statsCache.get(cacheKey)
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.stats
  }

  const from = isoDaysAgo(days)
  const to = new Date().toISOString().slice(0, 10)

  const [gscAccountsRaw, ga4AccountsRaw] = await Promise.all([
    listPorterAccounts(slugs.gsc),
    listPorterAccounts(slugs.ga4),
  ])
  const gscAccounts = gscAccountsRaw.ok ? normalizeAccounts(gscAccountsRaw.data) : []
  const ga4Accounts = ga4AccountsRaw.ok ? normalizeAccounts(ga4AccountsRaw.data) : []

  const warnings: string[] = []
  const gsc: GscStats = {
    available: false, slug: slugs.gsc, accountId: null, accountName: null,
    reason: 'no_accounts',
    totals: { clicks: 0, impressions: 0, ctr: 0, position: null },
    daily: [], topQueries: [], topPages: [],
  }
  const ga4: Ga4Stats = {
    available: false, slug: slugs.ga4, accountId: null, accountName: null,
    reason: 'no_accounts',
    totals: { sessions: 0, users: 0 }, daily: [],
  }

  // ---- GSC ----
  const gscAccount = bestAccount(gscAccounts)
  if (gscAccount) {
    gsc.accountId = gscAccount.id
    gsc.accountName = gscAccount.name
    const pool = await discoverConnectorFields(slugs.gsc)
    const mClicks = pickField(pool.metrics, [/^.*_?clicks?$/i, /click/i]) || 'google_search_console_clicks'
    const mImpr = pickField(pool.metrics, [/^.*_?impressions?$/i, /impression/i]) || 'google_search_console_impressions'
    const mPos = pickField(pool.metrics, [/^.*_?position$/i, /average.*pos/i, /pos(ition)?$/i])
    const dDate = pickField(pool.dimensions, [/^.*_?date$/i, /date/i])
    const dQuery = pickField(pool.dimensions, [/^.*_?query$/i, /query/i, /keyword/i, /search_term/i])
    const dPage = pickField(pool.dimensions, [/^.*_?page$/i, /page/i, /landing/i, /url/i, /path/i])

    const coreMetrics = [mClicks, mImpr, ...(mPos ? [mPos] : [])]
    if (!dDate) warnings.push('Search Console date dimension not found — daily chart may be unavailable.')

    const norm = (r: { ok: boolean; rows?: Row[]; error?: { message?: string } }) => (r.ok ? r.rows : []) || []

    if (dDate) {
      const r = await porterQuery({ connector: slugs.gsc, accounts: [gscAccount.id], metrics: coreMetrics, dimensions: [dDate], dateFrom: from, dateTo: to, limit: 400 })
      const rows = norm(r)
      if (rows.length > 0) {
        gsc.available = true
        gsc.daily = rows
          .map((row) => ({
            date: str(row[dDate] ?? row.date ?? ''),
            clicks: num(row[mClicks] ?? row.clicks),
            impressions: num(row[mImpr] ?? row.impressions),
            position: mPos ? num(row[mPos]) : null,
          }))
          .filter((p) => p.date)
          .sort((a, b) => a.date.localeCompare(b.date))
      } else {
        gsc.error = r.error?.message || 'daily query returned no rows'
      }
    }

    if (dQuery) {
      const r = await porterQuery({ connector: slugs.gsc, accounts: [gscAccount.id], metrics: coreMetrics, dimensions: [dQuery], dateFrom: from, dateTo: to, limit: 20, orderBy: mClicks, orderDir: 'desc' })
      const rows = norm(r)
      if (rows.length > 0) {
        gsc.available = true
        gsc.topQueries = rows
          .map((row) => ({
            query: str(row[dQuery] ?? row.query ?? ''),
            clicks: num(row[mClicks] ?? row.clicks),
            impressions: num(row[mImpr] ?? row.impressions),
            position: mPos ? num(row[mPos]) : null,
          }))
          .filter((q) => q.query)
          .sort((a, b) => b.clicks - a.clicks)
          .slice(0, 10)
      }
    }

    if (dPage) {
      const r = await porterQuery({ connector: slugs.gsc, accounts: [gscAccount.id], metrics: coreMetrics, dimensions: [dPage], dateFrom: from, dateTo: to, limit: 20, orderBy: mClicks, orderDir: 'desc' })
      const rows = norm(r)
      if (rows.length > 0) {
        gsc.available = true
        gsc.topPages = rows
          .map((row) => ({
            page: str(row[dPage] ?? row.page ?? ''),
            clicks: num(row[mClicks] ?? row.clicks),
            impressions: num(row[mImpr] ?? row.impressions),
            position: mPos ? num(row[mPos]) : null,
          }))
          .filter((p) => p.page)
          .sort((a, b) => b.clicks - a.clicks)
          .slice(0, 10)
      }
    }

    if (gsc.daily.length > 0) {
      const clicks = gsc.daily.reduce((s, p) => s + p.clicks, 0)
      const impressions = gsc.daily.reduce((s, p) => s + p.impressions, 0)
      gsc.totals = { clicks, impressions, ctr: impressions > 0 ? (clicks / impressions) * 100 : 0, position: null }
      if (mPos) {
        let wsum = 0
        let wtot = 0
        for (const p of gsc.daily) {
          if (p.position === null || p.position === 0) continue
          const w = p.clicks || p.impressions || 1
          wsum += p.position * w
          wtot += w
        }
        if (wtot > 0) gsc.totals.position = wsum / wtot
      }
    }
    if (!gsc.available && gsc.accountId) gsc.reason = 'query_failed'
  }

  // ---- GA4 ----
  const ga4Account = bestAccount(ga4Accounts)
  if (ga4Account) {
    ga4.accountId = ga4Account.id
    ga4.accountName = ga4Account.name
    const pool = await discoverConnectorFields(slugs.ga4)
    const mSessions = pickField(pool.metrics, [/^.*_?sessions?$/i, /session/i])
    const mUsers = pickField(pool.metrics, [/^.*(total|active)_?users?$/i, /users?/i, /page_?views?$/i])
    const dDate = pickField(pool.dimensions, [/^.*_?date$/i, /date/i])

    const metrics = [mSessions, mUsers].filter(Boolean) as string[]
    const dims = dDate ? [dDate] : []

    if (metrics.length > 0) {
      const r = await porterQuery({ connector: slugs.ga4, accounts: [ga4Account.id], metrics, dimensions: dims, dateFrom: from, dateTo: to, limit: 400 })
      if (r.ok && dims.length > 0 && (r.rows || []).length > 0) {
        ga4.available = true
        ga4.daily = (r.rows || [])
          .map((row) => ({
            date: str(row[dDate || 'date'] ?? row.date ?? ''),
            sessions: num(row[mSessions || 'sessions'] ?? row.sessions),
            users: num(row[mUsers || 'totalUsers'] ?? row.totalUsers ?? row.activeUsers ?? 0),
          }))
          .filter((p) => p.date)
          .sort((a, b) => a.date.localeCompare(b.date))
        ga4.totals = {
          sessions: ga4.daily.reduce((s, p) => s + p.sessions, 0),
          users: ga4.daily.reduce((s, p) => s + p.users, 0),
        }
      } else if (r.ok && (r.rows || []).length > 0) {
        const first = (r.rows || [])[0] || {}
        ga4.available = true
        ga4.totals = {
          sessions: num(first[mSessions || 'sessions'] ?? first.sessions),
          users: num(first[mUsers || 'totalUsers'] ?? first.totalUsers),
        }
      } else {
        ga4.error = r.error?.message || 'query returned no rows'
      }
    }
    if (!ga4.available && ga4.accountId) ga4.reason = 'query_failed'
  }

  const stats: LiveStats = {
    connected: true,
    source: 'porter',
    range: { days, from, to },
    gsc,
    ga4,
    warnings,
    fetchedAt: new Date().toISOString(),
  }
  statsCache.set(cacheKey, { stats, ts: Date.now() })
  return stats
}
