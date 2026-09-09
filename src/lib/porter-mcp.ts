// ============================================================
// PORTER METRICS — MCP client + OAuth 2.0 (server-only)
// Secondary statistics source for Google Search Console &
// GA4: the owner logs into Porter once in the browser (OAuth
// authorization-code + PKCE), tokens live in the credential
// vault (encrypted + durable env backup), and every stat is
// pulled live through Porter's MCP server (JSON-RPC 2.0 over
// Streamable HTTP).
//
// Auth flow (public client, no client secret):
//   /register   → dynamic client registration → client_id
//   /authorize  → browser login (code + state + PKCE S256)
//   /token      → code exchange / refresh_token grant
// ============================================================

import { createHash, randomBytes } from 'crypto'
import { findCredentialService } from '@/lib/credential-services'
import { getCredentialValues, logCredentialEvent, saveCredentialValues } from '@/lib/credentials'
import { isEnvSyncAvailable, upsertEnvVar } from '@/lib/vercel-env'

const DEFAULT_MCP_URL = 'https://mcp.portermetrics.com/mcp'
const PROTOCOL_VERSION = '2025-03-26'
const CLIENT_INFO = { name: 'organic-growth-os', version: '1.5.0' }

export interface PorterConfig {
  mcpUrl: string
  clientId: string | null
  accessToken: string | null
  refreshToken: string | null
  tokenExpires: number | null // epoch ms
}

export interface PorterCallOutcome {
  ok: boolean
  data?: unknown
  error?: { message: string; hint?: string; status?: number }
}

// ------------------------------------------------------------
// Config + persistence
// ------------------------------------------------------------

export async function getPorterConfig(): Promise<PorterConfig> {
  const v = await getCredentialValues('porter')
  return {
    mcpUrl: v.mcpUrl?.trim() || DEFAULT_MCP_URL,
    clientId: v.clientId?.trim() || null,
    accessToken: v.accessToken?.trim() || null,
    refreshToken: v.refreshToken?.trim() || null,
    tokenExpires: v.tokenExpires ? Date.parse(v.tokenExpires) || null : null,
  }
}

/** Save porter field values to the vault (+ durable env backup). */
async function persistPorterValues(values: Record<string, string>): Promise<void> {
  await saveCredentialValues('porter', values)
  if (isEnvSyncAvailable()) {
    const svc = findCredentialService('porter')
    if (svc) {
      for (const f of svc.fields) {
        const val = values[f.id]
        if (!val) continue
        for (const ev of f.envVars) await upsertEnvVar(ev, val) // best-effort
      }
    }
  }
}

// ------------------------------------------------------------
// OAuth helpers (PKCE + dynamic client registration)
// ------------------------------------------------------------

/** OAuth server base derived from the MCP endpoint (same host). */
function oauthBase(mcpUrl: string): string {
  try {
    return new URL(mcpUrl).origin
  } catch {
    return 'https://mcp.portermetrics.com'
  }
}

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function randomState(): string {
  return randomBytes(24).toString('base64url')
}

/** RFC 7591 dynamic client registration → client_id (public client). */
export async function registerClient(mcpUrl: string, redirectUri: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    const res = await fetch(`${oauthBase(mcpUrl)}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Organic Growth OS',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_method: 'none',
        response_types: ['code'],
      }),
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timer)
    if (!res.ok) {
      console.error('[porter] client registration failed:', res.status)
      return null
    }
    const data = (await res.json()) as { client_id?: string }
    return data.client_id || null
  } catch (e) {
    console.error('[porter] client registration error:', e instanceof Error ? e.message : e)
    return null
  }
}

export function buildAuthorizeUrl(
  mcpUrl: string,
  clientId: string,
  redirectUri: string,
  state: string,
  codeChallenge: string,
): string {
  const u = new URL(`${oauthBase(mcpUrl)}/authorize`)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('scope', 'openid email profile')
  u.searchParams.set('state', state)
  u.searchParams.set('code_challenge', codeChallenge)
  u.searchParams.set('code_challenge_method', 'S256')
  return u.toString()
}

export interface PorterTokens {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

async function tokenRequest(mcpUrl: string, form: Record<string, string>): Promise<PorterTokens | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)
    const res = await fetch(`${oauthBase(mcpUrl)}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timer)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[porter] token request failed:', res.status, body.slice(0, 300))
      return null
    }
    const data = (await res.json()) as PorterTokens
    return data.access_token ? data : null
  } catch (e) {
    console.error('[porter] token request error:', e instanceof Error ? e.message : e)
    return null
  }
}

export function exchangeCode(
  mcpUrl: string,
  code: string,
  verifier: string,
  redirectUri: string,
  clientId: string,
): Promise<PorterTokens | null> {
  return tokenRequest(mcpUrl, {
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
  })
}

export function refreshAccessToken(mcpUrl: string, refreshToken: string, clientId: string): Promise<PorterTokens | null> {
  return tokenRequest(mcpUrl, {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  })
}

/** Persist fresh OAuth tokens (called after code exchange or refresh). */
export async function savePorterTokens(t: PorterTokens, clientId?: string): Promise<void> {
  const values: Record<string, string> = { accessToken: t.access_token }
  if (t.refresh_token) values.refreshToken = t.refresh_token
  if (typeof t.expires_in === 'number' && t.expires_in > 0) {
    values.tokenExpires = new Date(Date.now() + t.expires_in * 1000).toISOString()
  }
  if (clientId) values.clientId = clientId
  await persistPorterValues(values)
}

// ------------------------------------------------------------
// MCP transport — JSON-RPC 2.0 over Streamable HTTP
// ------------------------------------------------------------

let rpcId = 0
let mcpSessionId: string | null = null // warm-instance session cache

interface HttpResult {
  status: number
  sessionId: string | null
  text: string
  contentType: string
}

async function mcpHttp(
  mcpUrl: string,
  token: string,
  body: unknown,
  timeoutMs: number,
): Promise<HttpResult | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`,
    }
    if (mcpSessionId) headers['mcp-session-id'] = mcpSessionId
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    })
    const text = await res.text()
    return {
      status: res.status,
      sessionId: res.headers.get('mcp-session-id'),
      text,
      contentType: res.headers.get('content-type') || '',
    }
  } catch (e) {
    console.error('[porter] MCP request error:', e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Parse a JSON-RPC response body — plain JSON or text/event-stream. */
function parseRpc(text: string, contentType: string, wantId: number): Record<string, unknown> | null {
  const tryJson = (raw: string): Record<string, unknown> | null => {
    try {
      const j = JSON.parse(raw)
      return typeof j === 'object' && j !== null ? (j as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  if (contentType.includes('text/event-stream')) {
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = tryJson(trimmed.slice(5).trim())
      if (payload && (payload.id === wantId || payload.result || payload.error)) return payload
    }
    return null
  }
  return tryJson(text)
}

/** Extract usable data from an MCP tool result (structuredContent or text JSON). */
function extractToolData(result: Record<string, unknown>): unknown {
  if (result.structuredContent !== undefined && result.structuredContent !== null) {
    return result.structuredContent
  }
  const content = result.content
  if (Array.isArray(content)) {
    const texts: string[] = []
    for (const c of content) {
      if (c && typeof c === 'object' && (c as { type?: string }).type === 'text' && typeof (c as { text?: string }).text === 'string') {
        texts.push((c as { text: string }).text)
      }
    }
    if (texts.length === 1) {
      try {
        return JSON.parse(texts[0])
      } catch {
        return texts[0]
      }
    }
    if (texts.length > 1) {
      const merged: unknown[] = []
      let allJson = true
      for (const t of texts) {
        try {
          merged.push(JSON.parse(t))
        } catch {
          allJson = false
          break
        }
      }
      if (allJson) return merged
      return texts.join('\n')
    }
  }
  return result
}

function extractToolError(result: Record<string, unknown>): string | null {
  if (!result.isError) return null
  const content = result.content
  if (Array.isArray(content)) {
    for (const c of content) {
      if (c && typeof c === 'object' && typeof (c as { text?: string }).text === 'string') {
        return (c as { text: string }).text
      }
    }
  }
  return 'The tool reported an error.'
}

async function ensureMcpSession(mcpUrl: string, token: string): Promise<{ ok: boolean; authFailed: boolean }> {
  if (mcpSessionId) return { ok: true, authFailed: false }
  const init = await mcpHttp(
    mcpUrl,
    token,
    { jsonrpc: '2.0', id: ++rpcId, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO } },
    20_000,
  )
  if (!init) return { ok: false, authFailed: false }
  if (init.status === 401) return { ok: false, authFailed: true }
  if (init.status >= 400) return { ok: false, authFailed: false }
  if (init.sessionId) mcpSessionId = init.sessionId
  // notifications/initialized — no response expected (202), fire and forget
  await mcpHttp(mcpUrl, token, { jsonrpc: '2.0', method: 'notifications/initialized' }, 10_000)
  return { ok: true, authFailed: false }
}

/** Get a usable access token (proactive refresh when expiring). */
async function getValidAccessToken(cfg: PorterConfig): Promise<{ token: string; refreshed: boolean } | null> {
  if (!cfg.accessToken) return null
  const expiring = !cfg.tokenExpires || Date.now() > cfg.tokenExpires - 120_000
  if (expiring && cfg.refreshToken && cfg.clientId) {
    const t = await refreshAccessToken(cfg.mcpUrl, cfg.refreshToken, cfg.clientId)
    if (t) {
      await savePorterTokens(t)
      return { token: t.access_token, refreshed: true }
    }
    // refresh failed — fall through with the existing token; the call
    // itself will surface 401 if the token really is dead
  }
  return { token: cfg.accessToken, refreshed: false }
}

/**
 * Call a Porter MCP tool. Handles: token refresh on 401, session
 * re-initialization on 404 (expired session), JSON and SSE bodies.
 */
export async function porterToolCall(
  name: string,
  args: Record<string, unknown>,
  opts: { timeoutMs?: number; mcpUrl?: string } = {},
): Promise<PorterCallOutcome> {
  const cfg = opts.mcpUrl ? { ...(await getPorterConfig()), mcpUrl: opts.mcpUrl } : await getPorterConfig()
  const got = await getValidAccessToken(cfg)
  if (!got) {
    return {
      ok: false,
      error: {
        message: 'Porter Metrics is not connected yet — press “Connect Porter” on the Live Stats page first.',
        hint: 'connect',
      },
    }
  }
  let token = got.token
  const timeoutMs = opts.timeoutMs ?? 60_000

  for (let attempt = 0; attempt < 3; attempt++) {
    const sess = await ensureMcpSession(cfg.mcpUrl, token)
    if (sess.authFailed && attempt === 0) {
      // try one hard refresh, then retry
      if (cfg.refreshToken && cfg.clientId) {
        const t = await refreshAccessToken(cfg.mcpUrl, cfg.refreshToken, cfg.clientId)
        if (t) {
          await savePorterTokens(t)
          token = t.access_token
          mcpSessionId = null
          continue
        }
      }
      return { ok: false, error: { message: 'The Porter session expired — press “Connect Porter” again to re-login.', hint: 'reconnect', status: 401 } }
    }
    if (!sess.ok && attempt > 0) return { ok: false, error: { message: 'Could not open an MCP session with Porter (network/timeout).' } }
    if (!sess.ok) {
      mcpSessionId = null
      continue
    }

    const id = ++rpcId
    const res = await mcpHttp(
      cfg.mcpUrl,
      token,
      { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } },
      timeoutMs,
    )
    if (!res) return { ok: false, error: { message: 'Could not reach the Porter MCP server (network/timeout).' } }

    if (res.status === 401 && attempt === 0) {
      if (cfg.refreshToken && cfg.clientId) {
        const t = await refreshAccessToken(cfg.mcpUrl, cfg.refreshToken, cfg.clientId)
        if (t) {
          await savePorterTokens(t)
          token = t.access_token
          mcpSessionId = null
          continue
        }
      }
      return { ok: false, error: { message: 'The Porter access token was rejected — press “Connect Porter” again.', hint: 'reconnect', status: 401 } }
    }
    if (res.status === 404) {
      // expired MCP session → re-initialize once
      mcpSessionId = null
      continue
    }
    if (res.status >= 400) {
      return { ok: false, error: { message: `Porter MCP responded with HTTP ${res.status}.`, status: res.status } }
    }

    const payload = parseRpc(res.text, res.contentType, id)
    if (!payload) return { ok: false, error: { message: 'Could not parse the Porter MCP response.' } }
    if (payload.error) {
      const err = payload.error as { message?: string; data?: { hint?: string; error_type?: string } }
      return { ok: false, error: { message: err.message || 'Porter MCP error.', hint: err.data?.hint } }
    }
    const result = payload.result as Record<string, unknown> | undefined
    if (!result) return { ok: false, error: { message: 'Porter MCP returned no result.' } }
    const toolError = extractToolError(result)
    if (toolError) {
      // tool-level error — the body often carries error_type/message/hint JSON
      let message = toolError
      try {
        const parsed = typeof toolError === 'string' ? JSON.parse(toolError) : toolError
        if (parsed && typeof parsed === 'object') {
          const p = parsed as { message?: string; error_message?: string; hint?: string }
          message = p.message || p.error_message || toolError
          return { ok: false, error: { message, hint: p.hint } }
        }
      } catch {
        /* plain text error */
      }
      return { ok: false, error: { message } }
    }
    return { ok: true, data: extractToolData(result) }
  }
  return { ok: false, error: { message: 'Porter MCP call failed after retries.' } }
}

// ------------------------------------------------------------
// High-level helpers
// ------------------------------------------------------------

function asArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
  if (data && typeof data === 'object') {
    for (const key of ['connectors', 'accounts', 'rows', 'results', 'data', 'items', 'fields']) {
      const v = (data as Record<string, unknown>)[key]
      if (Array.isArray(v)) return v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    }
  }
  return []
}

/** Unwrap a Porter payload into a plain object array (many tools wrap rows in data/rows/items/…). */
export function unwrapPorterList(data: unknown): Record<string, unknown>[] {
  return asArray(data)
}

export interface PorterConnectorAccount {
  id: string
  name: string
  status: string // "connected" | "available" | …
}

export function normalizeAccounts(data: unknown): PorterConnectorAccount[] {
  return asArray(data).map((a) => {
    const id = (a.account_id ?? a.id ?? a.accountId ?? a.external_id ?? '') as string
    const name = (a.account_name ?? a.name ?? a.displayName ?? a.account ?? id) as string
    const status = (a.connection_status ?? a.status ?? 'available') as string
    return { id: String(id), name: String(name), status: String(status) }
  })
}

const GSC_MATCH = /google[-_ ]?search[-_ ]?console|search[-_ ]?console/i
const GA4_MATCH = /google[-_ ]?analytics/i

/** Discover the Porter connector slugs for GSC and GA4 (falls back to defaults). */
export async function findGoogleConnectorSlugs(): Promise<{ gsc: string; ga4: string }> {
  const fallback = { gsc: 'google-search-console', ga4: 'google-analytics-4' }
  const r = await porterToolCall('list_connectors', {}, { timeoutMs: 25_000 })
  if (!r.ok) return fallback
  let gsc: string | null = null
  let ga4: string | null = null
  for (const c of asArray(r.data)) {
    const slug = String(c.slug ?? c.id ?? c.connector ?? '')
    if (!slug) continue
    if (!gsc && GSC_MATCH.test(slug)) gsc = slug
    if (!ga4 && GA4_MATCH.test(slug)) ga4 = slug
  }
  return { gsc: gsc || fallback.gsc, ga4: ga4 || fallback.ga4 }
}

export function listPorterAccounts(connector: string): Promise<PorterCallOutcome> {
  return porterToolCall('list_accounts', { connector }, { timeoutMs: 30_000 })
}

export function connectPorterAccount(connector: string): Promise<PorterCallOutcome> {
  return porterToolCall('connect_account', { connector }, { timeoutMs: 30_000 })
}

/** True when the Porter connection is usable (whoami answers). */
export async function testPorterConnection(): Promise<PorterCallOutcome> {
  return porterToolCall('whoami', {}, { timeoutMs: 25_000 })
}

// ------------------------------------------------------------
// Correct query_data layer (v1.6)
// The real query_data contract (verified against the live MCP
// server, 2026-09): accounts is a REQUIRED ARRAY of account ids,
// the date range is an OBJECT {date_from, date_to} (or a preset),
// metrics/dimensions take the FIELD IDS from list_fields, and
// results come back as {columns: [{id}], rows: [[…]], row_count}.
// ------------------------------------------------------------

export interface PorterQueryParams {
  connector: string
  /** account ids verbatim from list_accounts */
  accounts: string[]
  /** field ids from discoverConnectorFields */
  metrics: string[]
  dimensions: string[]
  dateFrom: string // YYYY-MM-DD
  dateTo: string // YYYY-MM-DD
  limit?: number
  /** optional field id to sort by (descending by default) */
  orderBy?: string
  orderDir?: 'asc' | 'desc'
}

export interface PorterQueryOutcome {
  ok: boolean
  rows?: Array<Record<string, unknown>>
  rowCount?: number
  truncated?: boolean
  error?: { message?: string; hint?: string }
}

export interface ConnectorFields {
  metrics: string[]
  dimensions: string[]
}

/** Field ids (not display names) for a connector, split into metrics/dimensions. */
export async function discoverConnectorFields(connector: string): Promise<ConnectorFields> {
  const r = await porterToolCall('list_fields', { connector }, { timeoutMs: 30_000 })
  if (!r.ok) return { metrics: [], dimensions: [] }
  const metrics: string[] = []
  const dimensions: string[] = []
  for (const f of unwrapPorterList(r.data)) {
    const id = String(f.id ?? f.name ?? f.field ?? f.field_name ?? '')
    if (!id) continue
    const kind = String(f.type ?? f.field_type ?? f.category ?? '')
    if (/dimension/i.test(kind)) dimensions.push(id)
    else if (/metric/i.test(kind)) metrics.push(id)
  }
  return { metrics, dimensions }
}

/** Pick the first field id matching any pattern. */
export function pickField(pool: string[], patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const hit = pool.find((f) => p.test(f))
    if (hit) return hit
  }
  return null
}

function toNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''))
    if (Number.isFinite(n)) return n
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const inner = o.value ?? o.numericValue ?? o.metricValue
    if (inner !== undefined) return toNumber(inner)
  }
  return 0
}

/**
 * Normalize any query_data payload into flat row objects keyed by field id.
 * Handles: {columns, rows: [[…]]} (the live shape), GA4-style
 * dimensionValues/metricValues, and plain arrays of objects.
 */
export function normalizeQueryRows(data: unknown): Array<Record<string, unknown>> {
  if (!data || typeof data !== 'object') return []
  const o = data as Record<string, unknown>

  // shape 1 (verified live): {columns: [{id, name}], rows: [["1.0", …]]}
  if (Array.isArray(o.columns) && Array.isArray(o.rows)) {
    const ids = o.columns.map((c) => {
      if (typeof c === 'string') return c
      if (c && typeof c === 'object') return String((c as Record<string, unknown>).id ?? (c as Record<string, unknown>).name ?? '')
      return ''
    })
    return (o.rows as unknown[])
      .filter((r) => Array.isArray(r))
      .map((r) => {
        const row: Record<string, unknown> = {}
        ;(r as unknown[]).forEach((v, i) => {
          if (ids[i]) row[ids[i]] = typeof v === 'string' ? v : v
        })
        return row
      })
  }

  // shape 2: array of objects (flat or GA4-style)
  let rows: unknown = Array.isArray(data) ? data : o.rows ?? o.data ?? o.results ?? o.items ?? [o]
  if (!Array.isArray(rows)) return []
  return (rows as unknown[])
    .filter((r) => r && typeof r === 'object' && !Array.isArray(r))
    .map((r) => {
      const row = r as Record<string, unknown>
      const dimVals = row.dimensionValues
      const metVals = row.metricValues
      if (Array.isArray(dimVals) || Array.isArray(metVals)) {
        const dimHeaders = Array.isArray(row.dimensionHeaders) ? row.dimensionHeaders.map((h) => String((h as Record<string, unknown>).name)) : []
        const metHeaders = Array.isArray(row.metricHeaders) ? row.metricHeaders.map((h) => String((h as Record<string, unknown>).name)) : []
        const flat: Record<string, unknown> = {}
        if (Array.isArray(dimVals)) dimVals.forEach((v, i) => { if (dimHeaders[i]) flat[dimHeaders[i]] = typeof v === 'object' && v ? String((v as Record<string, unknown>).value ?? v) : v })
        if (Array.isArray(metVals)) metVals.forEach((v, i) => { if (metHeaders[i]) flat[metHeaders[i]] = toNumber(v) })
        return flat
      }
      return row
    })
}

/** Run a query_data call with the correct parameter shape. */
export async function porterQuery(params: PorterQueryParams): Promise<PorterQueryOutcome> {
  const r = await porterToolCall('query_data', {
    connector: params.connector,
    accounts: params.accounts,
    metrics: params.metrics,
    dimensions: params.dimensions,
    date_range: { date_from: params.dateFrom, date_to: params.dateTo },
    limit: params.limit ?? 1000,
    ...(params.orderBy ? { order_by: [{ field: params.orderBy, direction: params.orderDir ?? 'desc' }] } : {}),
  }, { timeoutMs: 55_000 })
  if (!r.ok) return { ok: false, error: r.error }
  const data = r.data as Record<string, unknown> | null
  const rows = normalizeQueryRows(data)
  const coverage = data && typeof data === 'object' ? (data as Record<string, unknown>).coverage : null
  const emptyNote = coverage && typeof coverage === 'object'
    ? String((coverage as Record<string, unknown>).note ?? '')
    : ''
  return {
    ok: true,
    rows,
    rowCount: typeof data?.row_count === 'number' ? (data.row_count as number) : rows.length,
    truncated: Boolean(data?.truncated),
    error: rows.length === 0 && emptyNote ? { message: emptyNote } : undefined,
  }
}
