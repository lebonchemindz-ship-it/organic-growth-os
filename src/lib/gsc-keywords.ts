// ============================================================
// GSC → KEYWORD UNIVERSE SYNC (server-only)
// Pulls the REAL search queries visitors use on Google
// (clicks / impressions / average position) through the
// connected Porter Metrics MCP → Google Search Console
// connector, and upserts them into the brand's keyword
// universe so the Keywords section shows live data.
//
// Requires: Porter connected (Live Stats → Connect Porter).
// Keywords imported here are marked source = "GSC".
// ============================================================

import { db } from '@/lib/db'
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

export interface GscQueryRow {
  term: string
  clicks: number
  impressions: number
  position: number | null
}

export interface SyncResult {
  ok: true
  accountName: string | null
  days: number
  fetched: number
  added: number
  updated: number
  topMovers: Array<{ term: string; position: number; clicks: number; delta: number }>
}

export interface SyncError {
  ok: false
  code: 'not_connected' | 'no_accounts' | 'query_failed'
  message: string
}

function toNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''))
    if (Number.isFinite(n)) return n
  }
  return 0
}

function toStr(v: unknown): string {
  if (typeof v === 'string') return v
  if (v === null || v === undefined) return ''
  return String(v)
}

/** GSC queries don't carry intent — infer a reasonable one. */
function classifyIntent(term: string): { intent: string; funnel: string; commercialValue: number } {
  const t = term.toLowerCase()
  if (/\b(buy|order|shop|purchase|price|pricing|cheap|deal|discount)\b/.test(t)) return { intent: 'TRANSACTIONAL', funnel: 'BOFU', commercialValue: 85 }
  if (/\b(best|top|vs\.?|versus|compare|comparison|alternative|review|recommend)\b/.test(t)) return { intent: 'COMMERCIAL', funnel: 'MOFU', commercialValue: 65 }
  if (/^(what|how|why|when|which|who|is|are|does|can)\b/.test(t)) return { intent: 'INFORMATIONAL', funnel: 'TOFU', commercialValue: 25 }
  return { intent: 'INFORMATIONAL', funnel: 'TOFU', commercialValue: 35 }
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Fetch the real queries from Search Console via Porter.
 * Field ids are discovered live (e.g. google_search_console_query) and the
 * query uses the verified query_data contract: accounts[], date_range{date_from,date_to}.
 */
export async function fetchGscQueries(days = 90, limit = 1000): Promise<{ rows: GscQueryRow[]; accountName: string | null } | SyncError> {
  const cfg = await getPorterConfig()
  if (!cfg.accessToken) {
    return {
      ok: false, code: 'not_connected',
      message: 'Porter Metrics is not connected — open Live Stats → Connect Porter (one browser login), then sync again.',
    }
  }

  const slugs = await findGoogleConnectorSlugs()
  const accountsRes = await listPorterAccounts(slugs.gsc)
  const accounts: PorterConnectorAccount[] = accountsRes.ok ? normalizeAccounts(accountsRes.data) : []
  const account = accounts.find((a) => a.status === 'connected') ?? accounts[0] ?? null
  if (!account) {
    return { ok: false, code: 'no_accounts', message: 'No Google Search Console account linked in Porter — connect Search Console on the Live Stats page.' }
  }

  // discover the real field ids (prefixed, e.g. google_search_console_clicks)
  const pool = await discoverConnectorFields(slugs.gsc)
  const mClicks = pickField(pool.metrics, [/^.*_?clicks?$/i, /click/i]) || 'google_search_console_clicks'
  const mImpr = pickField(pool.metrics, [/^.*_?impressions?$/i, /impression/i]) || 'google_search_console_impressions'
  const mPos = pickField(pool.metrics, [/^.*_?position$/i, /average.*pos/i, /pos(ition)?$/i])
  const dQuery = pickField(pool.dimensions, [/^.*_?query$/i, /query/i, /keyword/i, /search_term/i]) || 'google_search_console_query'

  const from = isoDaysAgo(Math.min(Math.max(days, 7), 90))
  const to = new Date().toISOString().slice(0, 10)

  const r = await porterQuery({
    connector: slugs.gsc,
    accounts: [account.id],
    metrics: [mClicks, mImpr, ...(mPos ? [mPos] : [])],
    dimensions: [dQuery],
    dateFrom: from,
    dateTo: to,
    limit,
    orderBy: mClicks,
    orderDir: 'desc',
  })

  if (!r.ok) {
    return { ok: false, code: 'query_failed', message: `Search Console query failed: ${r.error?.message || 'unknown error'}` }
  }

  const rows: GscQueryRow[] = (r.rows || [])
    .map((row) => ({
      term: toStr(row[dQuery] ?? row.query ?? row.keyword ?? ''),
      clicks: toNumber(row[mClicks] ?? row.clicks),
      impressions: toNumber(row[mImpr] ?? row.impressions),
      position: mPos ? toNumber(row[mPos]) || null : null,
    }))
    .filter((q) => q.term)
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)

  if (rows.length === 0) {
    return { ok: false, code: 'query_failed', message: r.error?.message || 'Search Console returned no queries for this period — try a longer range or verify the site has search traffic.' }
  }

  return { rows: rows.slice(0, limit), accountName: account.name }
}

/**
 * Import the real GSC queries into the keyword universe.
 * - new queries → bulk-created (source GSC, real position + impressions)
 * - existing terms → position/volume refreshed (delta kept via previousPosition)
 */
export async function syncGscKeywords(brandId: string, brandDomain: string, days = 90): Promise<SyncResult | SyncError> {
  const fetched = await fetchGscQueries(days)
  if (!('rows' in fetched)) return fetched as SyncError

  const rows = fetched.rows
  const gscTerms = new Set(rows.map((r) => r.term))
  const existingRows = await db.keyword.findMany({ where: { brandId, term: { in: [...gscTerms] } } })
  const existingByTerm = new Map(existingRows.map((k) => [k.term, k]))

  const toCreate: Array<Record<string, unknown>> = []
  let added = 0
  let updated = 0
  const movers: Array<{ term: string; position: number; clicks: number; delta: number }> = []

  for (const q of rows) {
    const existing = existingByTerm.get(q.term)
    const pos = q.position && q.position > 0 ? Math.max(1, Math.round(q.position)) : 0
    const { intent, funnel, commercialValue } = classifyIntent(q.term)

    if (!existing) {
      toCreate.push({
        brandId,
        term: q.term,
        intent,
        funnelStage: funnel,
        monthlyVolume: q.impressions,
        difficulty: 0,
        currentPosition: pos,
        previousPosition: 0,
        targetUrl: '',
        commercialValue,
        aeoValue: /^(what|how|why|when|which|who|is|are|does|can)\b/i.test(q.term) ? 70 : 40,
        geoValue: 35,
        status: 'TRACKING',
        source: 'GSC',
      })
      if (q.clicks > 0 || q.position) movers.push({ term: q.term, position: pos, clicks: q.clicks, delta: 0 })
    } else {
      const delta = existing.currentPosition > 0 && pos > 0 ? existing.currentPosition - pos : 0
      const keepVolume = existing.source === 'DATAFORSEO' && existing.monthlyVolume > 0
      const needsUpdate =
        existing.currentPosition !== pos ||
        (!keepVolume && existing.monthlyVolume !== q.impressions) ||
        (existing.source !== 'DATAFORSEO' && existing.source !== 'GSC')
      if (needsUpdate) {
        await db.keyword.update({
          where: { id: existing.id },
          data: {
            currentPosition: pos,
            previousPosition: existing.currentPosition || 0,
            monthlyVolume: keepVolume ? existing.monthlyVolume : q.impressions,
            source: existing.source === 'DATAFORSEO' ? existing.source : 'GSC',
            status: 'TRACKING',
          },
        })
        updated += 1
      }
      if (delta !== 0) movers.push({ term: q.term, position: pos, clicks: q.clicks, delta })
    }
  }

  if (toCreate.length > 0) {
    try {
      await db.keyword.createMany({ data: toCreate as never, skipDuplicates: true })
      added = toCreate.length
    } catch {
      // createMany unsupported / failed → per-row insert fallback
      for (const k of toCreate) {
        try {
          await db.keyword.create({ data: k as never })
          added += 1
        } catch {
          // duplicate or transient — skip
        }
      }
    }
  }

  try {
    await db.systemEvent.create({
      data: {
        brandId,
        type: 'CREDENTIAL',
        level: 'INFO',
        message: `[GSC_SYNC] Imported ${added} new + updated ${updated} keywords from Google Search Console (${brandDomain})`,
        meta: `account=${fetched.accountName || 'n/a'} days=${days}`,
      },
    })
  } catch {
    // never fail the sync because logging failed
  }

  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.clicks - a.clicks)

  return {
    ok: true,
    accountName: fetched.accountName,
    days,
    fetched: rows.length,
    added,
    updated,
    topMovers: movers.slice(0, 10),
  }
}

// ------------------------------------------------------------
// Materialize-on-read (v1.6 architecture fix)
// Every Vercel serverless ROUTE is a separate function with its
// own ephemeral SQLite — writes from one function (e.g. the sync
// route or the assistant) are invisible to the keywords route's
// instances. The fix: the keywords route materializes the GSC
// keyword universe directly from the SOURCE OF TRUTH (Google
// Search Console via Porter) on read — once per instance and at
// most every 5 minutes while warm. Real data therefore survives
// every cold start, everywhere, without any extra database.
// ------------------------------------------------------------

const MATERIALIZED_TTL_MS = 5 * 60_000
const materializedAt = new Map<string, number>()
const materializing = new Map<string, Promise<void>>()

/**
 * Ensure the brand's keyword universe carries the REAL GSC queries.
 * Fast no-op when this instance already materialized recently.
 * Never throws — a Porter/GSC failure just leaves current data as-is.
 */
export async function ensureGscMaterialized(brandId: string, brandDomain: string): Promise<void> {
  const last = materializedAt.get(brandId) ?? 0
  if (Date.now() - last < MATERIALIZED_TTL_MS) return
  const inFlight = materializing.get(brandId)
  if (inFlight) return inFlight

  const job = (async () => {
    try {
      const r = await syncGscKeywords(brandId, brandDomain, 90)
      materializedAt.set(brandId, Date.now())
      if (r.ok) {
        console.log(`[gsc-keywords] materialized ${r.added} new + ${r.updated} updated GSC keywords for ${brandDomain}`)
      }
    } catch (e) {
      console.error('[gsc-keywords] materialization failed:', e instanceof Error ? e.message : e)
    } finally {
      materializing.delete(brandId)
    }
  })()
  materializing.set(brandId, job)
  return job
}
