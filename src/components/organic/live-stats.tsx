'use client'

// ============================================================
// LIVE STATS — real Google Search Console & GA4 statistics
// Two data sources, both kept (the first is never removed):
//   Option 1 — Direct Google service account (existing vault
//              credentials; managed on the API Keys page)
//   Option 2 — Porter Metrics MCP (NEW): one browser login,
//              then live GSC + GA4 data through Porter
// The statistics below render from whichever source has live
// data — Porter powers them end-to-end today.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  BarChart3, MousePointerClick, Eye, Percent, Gauge, Users, RefreshCw, ExternalLink,
  Loader2, CheckCircle2, XCircle, Globe, Plug, KeyRound, Lock, Cable, TrendingUp,
  Search, AlertTriangle,
} from 'lucide-react'
import { SectionHeader, KpiCard, fmtNum, fmtDate } from './shared'

// ---------------- types ----------------

interface PorterAccount { id: string; name: string; status: string }

interface StatusResponse {
  connected: boolean
  reason?: string
  detail?: string | null
  mcpUrl: string
  whoami?: { name?: string; email?: string; company?: string; plan?: string } | null
  connectors?: { gsc: string; ga4: string }
  accounts?: { gsc: PorterAccount[]; ga4: PorterAccount[] }
  accountErrors?: { gsc: string | null; ga4: string | null }
  googleDirect?: { configured: boolean; fieldsSet: string[]; fieldCount: number }
}

interface GscDailyPoint { date: string; clicks: number; impressions: number; position: number | null }
interface Ga4DailyPoint { date: string; sessions: number; users: number }

interface StatsResponse {
  connected: boolean
  cached?: boolean
  range: { days: number; from: string; to: string }
  gsc: {
    available: boolean
    accountId: string | null
    accountName: string | null
    reason?: string
    error?: string
    totals: { clicks: number; impressions: number; ctr: number; position: number | null }
    daily: GscDailyPoint[]
    topQueries: Array<{ query: string; clicks: number; impressions: number; position: number | null }>
    topPages: Array<{ page: string; clicks: number; impressions: number; position: number | null }>
  }
  ga4: {
    available: boolean
    accountId: string | null
    accountName: string | null
    reason?: string
    error?: string
    totals: { sessions: number; users: number }
    daily: Ga4DailyPoint[]
  }
  warnings?: string[]
  fetchedAt: string
}

const PIN_STORAGE_KEY = 'ogos-settings-pin'
type Notice = { kind: 'ok' | 'err' | 'info'; text: string } | null

// ---------------- component ----------------

export function LiveStatsView({ onNavigate, notice }: { onNavigate: (id: 'api-keys') => void; notice?: Notice }) {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [days, setDays] = useState(28)
  const [pin, setPin] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [pinPrompt, setPinPrompt] = useState(false)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState<Record<string, Notice>>({})

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem(PIN_STORAGE_KEY) : null
    if (saved) setPin(saved)
  }, [])

  const refreshStatus = useCallback(async (silent = false) => {
    try {
      const res = await fetch('/api/porter/status', { cache: 'no-store' })
      const json = (await res.json()) as StatusResponse
      setStatus(json)
    } catch {
      // a failed background poll keeps the last known status on screen
      // (only an explicit user-triggered refresh resets it)
      if (!silent) setStatus(null)
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => { refreshStatus() }, [refreshStatus])

  // Always-live status: re-check the Porter connection every 2 minutes,
  // silently (a transient failure keeps the last known status). The manual
  // "Refresh accounts" button stays available for an immediate live check.
  useEffect(() => {
    const id = window.setInterval(() => refreshStatus(true), 120_000)
    return () => window.clearInterval(id)
  }, [refreshStatus])

  const hasAccounts = useMemo(() => {
    const a = status?.accounts
    return Boolean((a && a.gsc.length > 0) || (a && a.ga4.length > 0))
  }, [status])

  const fetchStats = useCallback(async (d: number, force: boolean, silent = false) => {
    if (!silent) setStatsLoading(true)
    if (!silent) setStatsError(null)
    try {
      const res = await fetch(`/api/porter/stats?days=${d}${force ? '&refresh=1' : ''}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) {
        // a silent background poll that fails keeps the current data on
        // screen instead of blanking the section on a transient error
        if (!silent) {
          setStatsError(json?.message || json?.error || 'Could not load live statistics.')
          setStats(null)
        }
      } else {
        setStats(json as StatsResponse)
      }
    } catch {
      if (!silent) setStatsError('Network error — try again.')
    } finally {
      if (!silent) setStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status?.connected && hasAccounts) fetchStats(days, false)
    else setStats(null)
  }, [status?.connected, hasAccounts, days, fetchStats])

  // Always-live stats: poll every 60 seconds (cache-aware — the server
  // refreshes from Google/Porter at most every 5 minutes, so external
  // APIs are protected while the numbers stay fresh). Silent: no loading
  // flash, and a failed poll keeps the current data on screen. The manual
  // "Refresh data" button forces an immediate live pull from Google.
  useEffect(() => {
    if (!status?.connected || !hasAccounts) return
    const id = window.setInterval(() => fetchStats(days, false, true), 60_000)
    return () => window.clearInterval(id)
  }, [status?.connected, hasAccounts, days, fetchStats])

  async function callPinProtected(url: string, init: RequestInit, key: string): Promise<{ ok: boolean; status: number; json: any } | null> {
    const headers: Record<string, string> = { 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) }
    if (pin) headers['x-settings-pin'] = pin
    try {
      const res = await fetch(url, { ...init, headers })
      const json = await res.json().catch(() => ({}))
      if (res.status === 401) {
        setPinPrompt(true)
        setMsg((m) => ({ ...m, [key]: { kind: 'err', text: 'Enter your settings PIN first.' } }))
        return null
      }
      return { ok: res.ok, status: res.status, json }
    } catch {
      setMsg((m) => ({ ...m, [key]: { kind: 'err', text: 'Network error — try again.' } }))
      return null
    }
  }

  async function connectGoogle(connector: 'gsc' | 'ga4') {
    const slug = status?.connectors?.[connector]
    if (!slug) return
    setBusy((b) => ({ ...b, [connector]: true }))
    setMsg((m) => ({ ...m, [connector]: null }))
    const r = await callPinProtected('/api/porter/connect-account', {
      method: 'POST',
      body: JSON.stringify({ connector: slug }),
    }, connector)
    if (r) {
      if (r.ok && r.json?.authorizationUrl) {
        window.open(r.json.authorizationUrl, '_blank', 'noopener')
        setMsg((m) => ({
          ...m,
          [connector]: {
            kind: 'ok',
            text: 'Authorization page opened in a new tab — log in with your Google account and allow access, then press “Refresh accounts”.',
          },
        }))
      } else {
        setMsg((m) => ({ ...m, [connector]: { kind: 'err', text: r.json?.message || 'Porter could not start the connection.' } }))
      }
    }
    setBusy((b) => ({ ...b, [connector]: false }))
  }

  async function disconnectPorter() {
    if (!window.confirm('Disconnect Porter Metrics? The live statistics source stops (Option 1 — the direct Google service account — is not touched).')) return
    setBusy((b) => ({ ...b, porter: true }))
    const r = await callPinProtected('/api/porter/disconnect', { method: 'DELETE' }, 'porter')
    if (r && r.ok) {
      setMsg((m) => ({ ...m, porter: { kind: 'info', text: r.json?.message || 'Disconnected.' } }))
      setStats(null)
      refreshStatus()
    }
    setBusy((b) => ({ ...b, porter: false }))
  }

  function submitPin() {
    setPin(pinInput)
    sessionStorage.setItem(PIN_STORAGE_KEY, pinInput)
    setPinPrompt(false)
    setMsg({})
  }

  const gsc = stats?.gsc
  const ga4 = stats?.ga4

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Live Statistics"
        description="Real Google Search Console and GA4 numbers for your site — no more demo data. Two sources are supported and both stay available: the original direct Google service-account connection, and the new Porter Metrics connection (one browser login, no JSON keys)."
        actions={
          status?.connected ? (
            <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> Porter connected
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1.5 border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-600 dark:text-amber-400">
              <Plug className="h-3 w-3" /> Not connected
            </Badge>
          )
        }
      />

      {/* OAuth return notices */}
      {notice && (
        <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
          notice.kind === 'ok'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
        }`}>
          {notice.kind === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <p>{notice.text}</p>
        </div>
      )}

      {/* PIN prompt (needed for connect/disconnect actions) */}
      {pinPrompt && !pin && (
        <Card className="border-border/70">
          <CardContent className="p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><Lock className="h-4 w-4" /> Enter your settings PIN</p>
            <p className="mt-1 text-xs text-muted-foreground">The same PIN you use on the API Keys page — it protects account changes.</p>
            <div className="mt-3 flex max-w-xs gap-2">
              <Input
                type="password"
                inputMode="numeric"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitPin()}
                placeholder="Settings PIN"
                className="h-9"
              />
              <Button size="sm" className="h-9" onClick={submitPin} disabled={!pinInput}>Unlock</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- The two data sources ---- */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Option 1 — existing */}
        <Card className="border-border/70">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-bold">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400"><Globe className="h-4 w-4" /></span>
                Option 1 — Direct Google <span className="text-muted-foreground font-normal">(original)</span>
              </p>
              {status?.googleDirect?.configured ? (
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400">
                  {status.googleDirect.fieldCount} field{status.googleDirect.fieldCount === 1 ? '' : 's'} saved
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">Not set</Badge>
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Google Search Console + GA4 through one service-account JSON key — the original direct route. Kept exactly
              as it was; manage it on the API Keys page under “Google (Search Console + GA4) — Option 1”.
            </p>
            <Button size="sm" variant="outline" className="h-8" onClick={() => onNavigate('api-keys')}>
              <KeyRound className="h-3.5 w-3.5" /> Manage in API Keys
            </Button>
          </CardContent>
        </Card>

        {/* Option 2 — Porter Metrics */}
        <Card className={`border-emerald-500/40 ${status?.connected ? 'bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent' : ''}`}>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-bold">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><Cable className="h-4 w-4" /></span>
                Option 2 — Porter Metrics <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">NEW</span>
              </p>
              {status?.connected ? (
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </Badge>
              ) : null}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Connect Search Console and GA4 through Porter Metrics (mcp.portermetrics.com) with a simple browser login —
              no service-account JSON, no DNS steps. This is the source powering the live statistics below.
            </p>
            {!status?.connected ? (
              <div className="space-y-2">
                {status?.reason === 'token_expired' && (
                  <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    The Porter login expired — press Connect Porter and log in again.
                    {status.detail ? <span className="block text-[11px] opacity-80">{status.detail}</span> : null}
                  </p>
                )}
                <Button size="sm" className="h-8" onClick={() => { window.location.href = '/api/porter/auth/start' }}>
                  <Cable className="h-3.5 w-3.5" /> Connect Porter
                </Button>
                <p className="text-[10.5px] text-muted-foreground/80">
                  You need a (free) Porter Metrics account — create one at portermetrics.com if you don&apos;t have it yet.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {status?.whoami?.email || status?.whoami?.name || 'Logged in'}
                  {status?.whoami?.company ? ` · ${status.whoami.company}` : ''}
                </span>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700 dark:text-red-400" onClick={disconnectPorter} disabled={busy.porter}>
                  {busy.porter ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Disconnect
                </Button>
              </div>
            )}
            {msg.porter && <NoticeLine notice={msg.porter} />}
          </CardContent>
        </Card>
      </div>

      {/* ---- Google account linking via Porter ---- */}
      {status?.connected && status.connectors && (
        <div className="grid gap-3 lg:grid-cols-2">
          {(['gsc', 'ga4'] as const).map((k) => {
            const isGsc = k === 'gsc'
            const slug = status.connectors?.[k] || ''
            const accounts = status.accounts?.[k] || []
            const err = status.accountErrors?.[k]
            const busyK = busy[k]
            return (
              <Card key={k} className="border-border/70">
                <CardContent className="space-y-3 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-bold">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${isGsc ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400' : 'bg-sky-500/15 text-sky-600 dark:text-sky-400'}`}>
                        {isGsc ? <Search className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
                      </span>
                      {isGsc ? 'Google Search Console' : 'Google Analytics 4'}
                    </p>
                    {accounts.length > 0 ? (
                      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400">
                        {accounts.length} account{accounts.length === 1 ? '' : 's'}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">No account yet</Badge>
                    )}
                  </div>

                  {accounts.length > 0 ? (
                    <div className="space-y-1.5">
                      {accounts.slice(0, 5).map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                          <p className="min-w-0 truncate text-xs font-medium">{a.name || a.id}</p>
                          <Badge variant="outline" className={`shrink-0 text-[9px] ${
                            a.status === 'connected'
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                          }`}>
                            {a.status}
                          </Badge>
                        </div>
                      ))}
                      {accounts.length > 5 && <p className="text-[11px] text-muted-foreground">+ {accounts.length - 5} more</p>}
                    </div>
                  ) : err ? (
                    <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">{err}</p>
                  ) : (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Press connect — a Google login page opens in a new tab. Choose the Google account that owns your
                      {isGsc ? ' Search Console property' : ' GA4 property'} and allow access.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" className="h-8" onClick={() => connectGoogle(k)} disabled={busyK}>
                      {busyK ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                      {accounts.length > 0 ? 'Connect another account' : `Connect ${isGsc ? 'Search Console' : 'GA4'}`}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => refreshStatus()} disabled={statusLoading}>
                      {statusLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Refresh accounts
                    </Button>
                  </div>
                  {msg[k] && <NoticeLine notice={msg[k]} />}
                  <p className="text-[10.5px] text-muted-foreground/70">Porter connector: <code className="rounded bg-muted px-1 py-0.5 font-mono">{slug}</code></p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ---- Loading / stats ---- */}
      {statusLoading && (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking the Porter connection…
        </div>
      )}

      {status?.connected && !hasAccounts && (
        <Card className="border-border/70">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-muted-foreground">
              Porter is connected, but no Google account is linked yet. Use the <b>Connect Search Console</b> and <b>Connect GA4</b>{' '}
              buttons above — once at least one account appears, live statistics load here automatically.
            </p>
          </CardContent>
        </Card>
      )}

      {status?.connected && hasAccounts && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <TabsList className="h-9">
                {[7, 28, 90].map((d) => (
                  <TabsTrigger key={d} value={String(d)} className="h-7 px-3 text-xs">Last {d} days</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              {stats?.cached && <Badge variant="secondary" className="text-[10px]">cached</Badge>}
              <Button size="sm" variant="outline" className="h-8" onClick={() => fetchStats(days, true)} disabled={statsLoading}>
                {statsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Refresh data
              </Button>
            </div>
          </div>

          {statsError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{statsError}</div>
          )}

          {statsLoading && !stats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />)}
            </div>
          )}

          {stats && (
            <>
              {/* GSC KPIs */}
              {gsc?.available && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiCard label="Clicks" value={fmtNum(gsc.totals.clicks)} icon={<MousePointerClick className="h-4 w-4" />} sub="Search Console" />
                  <KpiCard label="Impressions" value={fmtNum(gsc.totals.impressions)} icon={<Eye className="h-4 w-4" />} sub="Search Console" />
                  <KpiCard label="CTR" value={`${gsc.totals.ctr.toFixed(2)}%`} icon={<Percent className="h-4 w-4" />} sub="clicks ÷ impressions" />
                  <KpiCard label="Avg position" value={gsc.totals.position !== null ? gsc.totals.position.toFixed(1) : '—'} icon={<Gauge className="h-4 w-4" />} sub="weighted by clicks" />
                </div>
              )}
              {gsc && !gsc.available && (
                <Card className="border-amber-500/30">
                  <CardContent className="flex items-start gap-3 p-4 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <p className="text-muted-foreground">
                      Search Console data is not available yet{gsc.accountId ? '' : ' (no linked account)'}.
                      {gsc.error ? <span className="block text-xs">Porter said: {gsc.error}</span> : null}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* GA4 KPIs */}
              {ga4?.available && (
                <div className={`grid gap-3 ${gsc?.available ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
                  <KpiCard label="Sessions" value={fmtNum(ga4.totals.sessions)} icon={<TrendingUp className="h-4 w-4" />} sub="GA4" />
                  <KpiCard label="Users" value={fmtNum(ga4.totals.users)} icon={<Users className="h-4 w-4" />} sub="GA4" />
                </div>
              )}

              {/* Daily charts */}
              {(gsc?.daily && gsc.daily.length > 0) || (ga4?.daily && ga4.daily.length > 0) ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {gsc && gsc.daily.length > 0 && (
                    <Card className="border-border/70">
                      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Search Console — daily clicks & impressions</CardTitle></CardHeader>
                      <CardContent>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={gsc.daily.map((p) => ({ ...p, label: fmtDate(p.date) }))}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                              <YAxis yAxisId="l" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                              <Line yAxisId="l" type="monotone" dataKey="clicks" name="Clicks" stroke="hsl(152 60% 45%)" strokeWidth={2} dot={false} />
                              <Line yAxisId="r" type="monotone" dataKey="impressions" name="Impressions" stroke="hsl(199 80% 55%)" strokeWidth={1.5} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {ga4 && ga4.daily.length > 0 && (
                    <Card className="border-border/70">
                      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">GA4 — daily sessions & users</CardTitle></CardHeader>
                      <CardContent>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={ga4.daily.map((p) => ({ ...p, label: fmtDate(p.date) }))}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                              <Line type="monotone" dataKey="sessions" name="Sessions" stroke="hsl(258 80% 60%)" strokeWidth={2} dot={false} />
                              <Line type="monotone" dataKey="users" name="Users" stroke="hsl(340 75% 55%)" strokeWidth={1.5} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : null}

              {/* Top queries & pages */}
              {(gsc?.topQueries && gsc.topQueries.length > 0) || (gsc?.topPages && gsc.topPages.length > 0) ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {gsc && gsc.topQueries.length > 0 && (
                    <Card className="border-border/70">
                      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top queries</CardTitle></CardHeader>
                      <CardContent className="px-0 pb-2">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground">
                              <th className="px-4 py-2 font-medium">Query</th>
                              <th className="px-2 py-2 text-right font-medium">Clicks</th>
                              <th className="px-2 py-2 text-right font-medium">Impr.</th>
                              <th className="px-4 py-2 text-right font-medium">Pos.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gsc.topQueries.map((q, i) => (
                              <tr key={i} className="border-b border-border/40 last:border-0">
                                <td className="max-w-[180px] truncate px-4 py-2 font-medium">{q.query}</td>
                                <td className="px-2 py-2 text-right tabular-nums">{fmtNum(q.clicks)}</td>
                                <td className="px-2 py-2 text-right tabular-nums">{fmtNum(q.impressions)}</td>
                                <td className="px-4 py-2 text-right tabular-nums">{q.position !== null ? q.position.toFixed(1) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>
                  )}
                  {gsc && gsc.topPages.length > 0 && (
                    <Card className="border-border/70">
                      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top pages</CardTitle></CardHeader>
                      <CardContent className="px-0 pb-2">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground">
                              <th className="px-4 py-2 font-medium">Page</th>
                              <th className="px-2 py-2 text-right font-medium">Clicks</th>
                              <th className="px-2 py-2 text-right font-medium">Impr.</th>
                              <th className="px-4 py-2 text-right font-medium">Pos.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gsc.topPages.map((p, i) => (
                              <tr key={i} className="border-b border-border/40 last:border-0">
                                <td className="max-w-[180px] truncate px-4 py-2 font-medium" title={p.page}>{p.page}</td>
                                <td className="px-2 py-2 text-right tabular-nums">{fmtNum(p.clicks)}</td>
                                <td className="px-2 py-2 text-right tabular-nums">{fmtNum(p.impressions)}</td>
                                <td className="px-4 py-2 text-right tabular-nums">{p.position !== null ? p.position.toFixed(1) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : null}

              {stats.warnings && stats.warnings.length > 0 && (
                <div className="space-y-1">
                  {stats.warnings.map((w, i) => (
                    <p key={i} className="text-[11px] text-amber-600 dark:text-amber-400">{w}</p>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                Live data via Porter Metrics ({status.mcpUrl.replace(/^https?:\/\//, '')}) · range {fmtDate(stats.range.from)} – {fmtDate(stats.range.to)} ·
                fetched {new Date(stats.fetchedAt).toLocaleTimeString()} · Source: Option 2 (Porter MCP). Option 1 (direct service account) remains available in API Keys.
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}

function NoticeLine({ notice }: { notice: NonNullable<Notice> }) {
  return (
    <p className={`text-xs leading-relaxed ${
      notice.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : notice.kind === 'err' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
    }`}>
      {notice.text}
    </p>
  )
}
