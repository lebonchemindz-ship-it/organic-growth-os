// ============================================================
// PORTER LIVE STATS — GET /api/porter/stats?days=28[&refresh=1]
// Real statistics for the brand from Google Search Console and
// GA4, pulled live through the Porter Metrics MCP server:
//   • GSC: clicks, impressions, CTR, avg position, daily series,
//          top queries, top pages
//   • GA4: sessions, users, daily series
// Field names are discovered per-connector via list_fields, the
// query_data parameter shape falls back across variants, and
// rows are normalized (flat objects or GA4-style header/rows).
// Results are cached 5 minutes per warm server instance.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { ensureSeeded } from '@/lib/ensure-seed'
import {
  findGoogleConnectorSlugs,
  getPorterConfig,
  listPorterAccounts,
  normalizeAccounts,
  porterToolCall,
  unwrapPorterList,
  type PorterConnectorAccount,
} from '@/lib/porter-mcp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ---------------- response types ----------------

interface Row {
  [key: string]: unknown
}

interface GscSection {
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

interface Ga4Section {
  available: boolean
  slug: string
  accountId: string | null
  accountName: string | null
  reason?: string
  error?: string
  totals: { sessions: number; users: number }
  daily: Array<{ date: string; sessions: number; users: number }>
}

// ---------------- helpers ----------------

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

/** Normalize Porter rows: flat key/value objects OR GA4-style headers+values arrays. */
function normalizeRows(data: unknown): Row[] {
  let rows: unknown = data
  if (rows && typeof rows === 'object' && !Array.isArray(rows)) {
    const o = rows as Record<string, unknown>
    rows = o.rows ?? o.data ?? o.results ?? o.items ?? [o]
  }
  if (!Array.isArray(rows)) return []
  return rows.map((r) => {
    if (!r || typeof r !== 'object') return {}
    const o = r as Record<string, unknown>
    const dimVals = o.dimensionValues
    const metVals = o.metricValues
    if (Array.isArray(dimVals) || Array.isArray(metVals)) {
      const dimHeaders = Array.isArray(o.dimensionHeaders) ? o.dimensionHeaders.map((h) => str((h as Record<string, unknown>).name)) : []
      const metHeaders = Array.isArray(o.metricHeaders) ? o.metricHeaders.map((h) => str((h as Record<string, unknown>).name)) : []
      const row: Row = {}
      if (Array.isArray(dimVals)) dimVals.forEach((v, i) => { if (dimHeaders[i]) row[dimHeaders[i]] = str(v) })
      if (Array.isArray(metVals)) metVals.forEach((v, i) => { if (metHeaders[i]) row[metHeaders[i]] = num(v) })
      // also keep any flat keys present (account_id, campaign_name, …)
      for (const [k, v] of Object.entries(o)) {
        if (!['dimensionValues', 'metricValues', 'dimensionHeaders', 'metricHeaders'].includes(k)) row[k] = v
      }
      return row
    }
    return o as Row
  })
}

interface FieldPool {
  metrics: string[]
  dimensions: string[]
}

async function discoverFields(connector: string): Promise<FieldPool> {
  const r = await porterToolCall('list_fields', { connector }, { timeoutMs: 30_000 })
  if (!r.ok) return { metrics: [], dimensions: [] }
  const metrics: string[] = []
  const dimensions: string[] = []
  for (const f of unwrapPorterList(r.data)) {
    const name = str(f.name ?? f.field ?? f.id ?? f.field_name ?? '')
    if (!name) continue
    const kind = str(f.type ?? f.field_type ?? f.category ?? '')
    if (/dimension/i.test(kind)) dimensions.push(name)
    else if (/metric/i.test(kind)) metrics.push(name)
    else { metrics.push(name); dimensions.push(name) }
  }
  return { metrics, dimensions }
}

function pick(pool: string[], patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const hit = pool.find((f) => p.test(f))
    if (hit) return hit
  }
  return null
}

/** Try query_data across plausible parameter shapes; first success wins. */
async function queryPorter(
  connector: string,
  accountId: string | null,
  metrics: string[],
  dimensions: string[],
  from: string,
  to: string,
  limit: number,
): Promise<{ ok: true; rows: Row[] } | { ok: false; error: string }> {
  const attempts: Array<Record<string, unknown>> = [
    { connector, metrics, dimensions, start_date: from, end_date: to, ...(accountId ? { account_id: accountId } : {}), limit },
    { connector, metrics, dimensions, date_range: { start: from, end: to }, ...(accountId ? { account_id: accountId } : {}) },
    { connector, metrics, dimensions, date_range: `${from}/${to}`, ...(accountId ? { account_id: accountId } : {}) },
    { connector, metrics, dimensions, start_date: from, end_date: to, limit },
  ]
  let lastError = 'query failed'
  for (const params of attempts) {
    const r = await porterToolCall('query_data', params, { timeoutMs: 55_000 })
    if (r.ok) {
      const rows = normalizeRows(r.data)
      if (rows.length > 0) return { ok: true, rows }
      lastError = 'query returned no rows'
      continue // empty but valid → try next shape (some shapes silently ignore filters)
    }
    lastError = r.error?.message || lastError
  }
  return { ok: false, error: lastError }
}

function bestAccount(accounts: PorterConnectorAccount[]): PorterConnectorAccount | null {
  return accounts.find((a) => a.status === 'connected') ?? accounts[0] ?? null
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

// ---------------- cache ----------------

const CACHE_TTL_MS = 5 * 60_000
const statsCache = new Map<string, { json: unknown; ts: number }>()

// ---------------- route ----------------

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded()
    const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 28, 7), 90)
    const refresh = req.nextUrl.searchParams.get('refresh') === '1'

    const cfg = await getPorterConfig()
    if (!cfg.accessToken) {
      return NextResponse.json({ error: 'not_connected', message: 'Connect Porter first (Live Stats → Connect Porter).' }, { status: 400 })
    }

    const slugs = await findGoogleConnectorSlugs()
    const cacheKey = `${slugs.gsc}|${slugs.ga4}|${days}`
    if (!refresh) {
      const hit = statsCache.get(cacheKey)
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
        return NextResponse.json({ ...(hit.json as Record<string, unknown>), cached: true })
      }
    }

    const from = isoDaysAgo(days)
    const to = new Date().toISOString().slice(0, 10)

    // ---- GSC ----
    const [gscAccountsRaw, ga4AccountsRaw] = await Promise.all([
      listPorterAccounts(slugs.gsc),
      listPorterAccounts(slugs.ga4),
    ])
    const gscAccounts = gscAccountsRaw.ok ? normalizeAccounts(gscAccountsRaw.data) : []
    const ga4Accounts = ga4AccountsRaw.ok ? normalizeAccounts(ga4AccountsRaw.data) : []

    const warnings: string[] = []
    const emptyGsc: GscSection = {
      available: false, slug: slugs.gsc, accountId: null, accountName: null,
      reason: 'no_accounts',
      totals: { clicks: 0, impressions: 0, ctr: 0, position: null },
      daily: [], topQueries: [], topPages: [],
    }
    const emptyGa4: Ga4Section = {
      available: false, slug: slugs.ga4, accountId: null, accountName: null,
      reason: 'no_accounts',
      totals: { sessions: 0, users: 0 }, daily: [],
    }

    const gsc: GscSection = { ...emptyGsc }
    const ga4: Ga4Section = { ...emptyGa4 }

    // ---- GSC queries ----
    const gscAccount = bestAccount(gscAccounts)
    if (gscAccount) {
      gsc.accountId = gscAccount.id
      gsc.accountName = gscAccount.name
      const pool = await discoverFields(slugs.gsc)
      const mClicks = pick(pool.metrics, [/^clicks?$/i, /clicks?\b/i, /click.*count/i])
      const mImpr = pick(pool.metrics, [/^impressions?$/i, /impression/i])
      const mPos = pick(pool.metrics, [/^(average_)?position$/i, /(avg|average).*pos/i, /pos(ition)?\b/i])
      const dDate = pick(pool.dimensions, [/^date$/i, /date/i])
      const dQuery = pick(pool.dimensions, [/^(search)?query$/i, /query/i, /keyword/i, /^search_term/i])
      const dPage = pick(pool.dimensions, [/^page$/i, /page/i, /landing/i, /^url$/i, /path/i])

      const coreMetrics = [mClicks, mImpr, mPos].filter(Boolean) as string[]
      if (coreMetrics.length === 0) coreMetrics.push('clicks', 'impressions', 'position') // safe default names
      if (!dDate) warnings.push('Search Console date dimension not found — daily chart may be unavailable.')

      // daily series (includes position for the weighted average)
      if (dDate) {
        const r = await queryPorter(slugs.gsc, gscAccount.id, coreMetrics, [dDate], from, to, 400)
        if (r.ok) {
          gsc.available = true
          gsc.daily = r.rows
            .map((row) => ({
              date: str(row[dDate] ?? row.date ?? ''),
              clicks: num(row[mClicks || 'clicks'] ?? row.clicks),
              impressions: num(row[mImpr || 'impressions'] ?? row.impressions),
              position: mPos ? num(row[mPos]) : null,
            }))
            .filter((p) => p.date)
            .sort((a, b) => a.date.localeCompare(b.date))
        } else {
          gsc.error = r.error
        }
      }

      // top queries
      if (dQuery) {
        const r = await queryPorter(slugs.gsc, gscAccount.id, coreMetrics, [dQuery], from, to, 20)
        if (r.ok) {
          gsc.available = true
          gsc.topQueries = r.rows
            .map((row) => ({
              query: str(row[dQuery] ?? row.query ?? ''),
              clicks: num(row[mClicks || 'clicks'] ?? row.clicks),
              impressions: num(row[mImpr || 'impressions'] ?? row.impressions),
              position: mPos ? num(row[mPos]) : null,
            }))
            .filter((q) => q.query)
            .sort((a, b) => b.clicks - a.clicks)
            .slice(0, 10)
        }
      }

      // top pages
      if (dPage) {
        const r = await queryPorter(slugs.gsc, gscAccount.id, coreMetrics, [dPage], from, to, 20)
        if (r.ok) {
          gsc.available = true
          gsc.topPages = r.rows
            .map((row) => ({
              page: str(row[dPage] ?? row.page ?? ''),
              clicks: num(row[mClicks || 'clicks'] ?? row.clicks),
              impressions: num(row[mImpr || 'impressions'] ?? row.impressions),
              position: mPos ? num(row[mPos]) : null,
            }))
            .filter((p) => p.page)
            .sort((a, b) => b.clicks - a.clicks)
            .slice(0, 10)
        }
      }

      // totals from the daily series (robust — no extra query shape needed)
      if (gsc.daily.length > 0) {
        const clicks = gsc.daily.reduce((s, p) => s + p.clicks, 0)
        const impressions = gsc.daily.reduce((s, p) => s + p.impressions, 0)
        gsc.totals = {
          clicks,
          impressions,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          position: null,
        }
        if (mPos) {
          // weighted average position (by clicks, falling back to impressions)
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
        if (!gsc.available) gsc.reason = 'query_failed'
      }
    }

    // ---- GA4 queries ----
    const ga4Account = bestAccount(ga4Accounts)
    if (ga4Account) {
      ga4.accountId = ga4Account.id
      ga4.accountName = ga4Account.name
      const pool = await discoverFields(slugs.ga4)
      const mSessions = pick(pool.metrics, [/^sessions?$/i, /sessions?/i, /session/i])
      const mUsers = pick(pool.metrics, [/^total_?users?$/i, /total_?users?/i, /^active_?users?$/i, /^(screen_)?page_?views$/i])
      const dDate = pick(pool.dimensions, [/^date$/i, /date/i])

      const metrics = [mSessions, mUsers].filter(Boolean) as string[]
      if (metrics.length === 0) metrics.push('sessions', 'totalUsers')
      const dims = dDate ? [dDate] : []

      const r = await queryPorter(slugs.ga4, ga4Account.id, metrics, dims, from, to, 400)
      if (r.ok && dims.length > 0) {
        ga4.available = true
        ga4.daily = r.rows
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
      } else if (r.ok) {
        // totals-only response (no dimension support)
        const first = r.rows[0] || {}
        ga4.available = true
        ga4.totals = {
          sessions: num(first[mSessions || 'sessions'] ?? first.sessions),
          users: num(first[mUsers || 'totalUsers'] ?? first.totalUsers),
        }
      } else {
        ga4.error = r.error
      }
    }

    const json = {
      connected: true,
      source: 'porter',
      range: { days, from, to },
      gsc,
      ga4,
      warnings,
      fetchedAt: new Date().toISOString(),
    }
    statsCache.set(cacheKey, { json, ts: Date.now() })
    return NextResponse.json(json)
  } catch (e) {
    console.error('[porter] stats failed:', e)
    return NextResponse.json({ error: 'stats_failed', message: 'Could not pull live statistics.' }, { status: 500 })
  }
}
