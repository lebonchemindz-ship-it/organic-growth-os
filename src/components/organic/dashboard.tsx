'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts'
import {
  TrendingUp, Search, Link2, Bot, FileText, Users, AlertTriangle,
  CheckCircle2, Activity, Sparkles, Zap, MousePointerClick, Eye, Gauge, RefreshCw,
} from 'lucide-react'
import {
  useApiData, KpiCard, SectionHeader, LoadingGrid, ErrorBox, RealnessChip,
  fmtNum, fmtDate, humanize, TrendDelta,
} from './shared'

interface WeeklyPoint {
  weekOf: string
  organicGrowthScore: number
  organicClicks: number
  aiMentionRate: number
  referringDomains: number
  top10Count: number
}

interface OverviewData {
  brand: { slug: string; name: string; domain: string; status: string; baselineScore: number }
  kpis: {
    organicGrowthScore: number
    scoreDirection: string
    organicClicks: number
    clicksDelta: number
    top3: number
    top10: number
    trackedKeywords: number
    realTrackedKeywords?: number
    referringDomains: number
    aiMentionRate: number
    pendingOpportunities: number
    activeOpportunities: number
    publishedContent: number
    totalContent: number
    qualifiedPublishers: number
    pendingApprovals: number
  }
  kpiReal?: {
    organicClicks: boolean
    top3: boolean
    top10: boolean
    trackedKeywords: boolean
    referringDomains: boolean
    aiMentionRate: boolean
    pendingOpportunities: boolean
    pendingApprovals: boolean
  }
  kpiNotes?: {
    referringDomains: string | null
    aiMentionRate: string | null
  }
  live?: {
    traffic: boolean
    clicks: number | null
    impressions: number | null
    ctr: number | null
    position: number | null
    sessions: number | null
    users: number | null
    gscAccount: string | null
    ga4Account: string | null
    gscTopQueries: Array<{ query: string; clicks: number; impressions: number; position: number | null }>
    range: { days: number; from: string; to: string } | null
  }
  realHistory?: WeeklyPoint[] | null
  autonomyMix: { GREEN: number; YELLOW: number; RED: number }
  weeklyHistory: WeeklyPoint[]
  latestReport: any
  recentEvents: Array<{ id: string; type: string; level: string; message: string; meta: string; createdAt: string }>
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  DAILY_LOOP: <Activity className="h-3.5 w-3.5" />,
  CONTENT: <FileText className="h-3.5 w-3.5" />,
  OUTREACH: <Users className="h-3.5 w-3.5" />,
  GEO: <Bot className="h-3.5 w-3.5" />,
  LEARNING: <Sparkles className="h-3.5 w-3.5" />,
  ALERT: <AlertTriangle className="h-3.5 w-3.5" />,
  APPROVAL: <CheckCircle2 className="h-3.5 w-3.5" />,
  TECHNICAL_SEO: <Search className="h-3.5 w-3.5" />,
}

const DIRECTION_LABELS: Record<string, string> = {
  STRONGLY_IMPROVING: 'Strongly improving',
  IMPROVING: 'Improving',
  FLAT: 'Flat',
  DECLINING: 'Declining',
  STRONGLY_DECLINING: 'Strongly declining',
}

const VERDICT_LABELS: Record<string, string> = {
  YES_STRONG_EVIDENCE: 'YES — Strong evidence',
  YES_EARLY_POSITIVE: 'YES — Early positive evidence',
  TOO_EARLY_TO_DETERMINE: 'Too early to determine',
  MIXED: 'Mixed',
  NO_CHANGE_REQUIRED: 'NO — Strategy requires change',
}

export function DashboardView({ brandSlug }: { brandSlug: string }) {
  const { data, loading, error, refetch } = useApiData<OverviewData>(`/api/overview?brand=${brandSlug}`)
  const [forceRefreshing, setForceRefreshing] = useState(false)

  // Force-live pull: ?refresh=1 bypasses every server-side cache for
  // the KPI sources (Google via Porter, DataForSEO backlinks) so the
  // owner always sees numbers straight from the source.
  const doForceRefresh = async () => {
    setForceRefreshing(true)
    try {
      await refetch(`/api/overview?brand=${brandSlug}&refresh=1`)
    } finally {
      setForceRefreshing(false)
    }
  }

  if (error) return <ErrorBox message={error} />
  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />)}
        </div>
        <LoadingGrid rows={3} />
      </div>
    )
  }

  const { brand, kpis, kpiReal, kpiNotes, live, realHistory, autonomyMix, weeklyHistory, latestReport, recentEvents } = data
  const history = realHistory && realHistory.length > 0 ? realHistory : weeklyHistory
  const chartData = history.map((w) => ({
    ...w,
    label: fmtDate(w.weekOf),
  }))
  const usingRealHistory = Boolean(realHistory && realHistory.length > 0)

  const totalAutonomy = autonomyMix.GREEN + autonomyMix.YELLOW + autonomyMix.RED || 1

  return (
    <div className="space-y-6">
      {/* Real data banner (replaces the demo verdict card when Google is connected) */}
      {live?.traffic ? (
        <Card className="border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  Real Google data — last {live.range?.days ?? 28} days
                  <RealnessChip real />
                </p>
                <p className="text-xs text-muted-foreground">
                  {live.gscAccount ? `Search Console: ${live.gscAccount}` : ''}
                  {live.ga4Account ? ` · GA4: ${live.ga4Account}` : ''}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
              <div className="text-right">
                <p className="flex items-center justify-end gap-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  <MousePointerClick className="h-4 w-4" /> {fmtNum(live.clicks ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground">real clicks</p>
              </div>
              <div className="text-right">
                <p className="flex items-center justify-end gap-1 text-2xl font-bold tabular-nums">
                  <Eye className="h-4 w-4 text-muted-foreground" /> {fmtNum(live.impressions ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground">impressions</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums">{live.ctr !== null ? `${live.ctr}%` : '—'}</p>
                <p className="text-xs text-muted-foreground">CTR</p>
              </div>
              <div className="text-right">
                <p className="flex items-center justify-end gap-1 text-2xl font-bold tabular-nums">
                  <Gauge className="h-4 w-4 text-muted-foreground" /> {live.position !== null ? live.position : '—'}
                </p>
                <p className="text-xs text-muted-foreground">avg position</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : latestReport ? (
        <Card className="border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  Weekly verdict: {VERDICT_LABELS[latestReport.verdict] ?? latestReport.verdict}
                  <RealnessChip real={false} label="Demo" />
                </p>
                <p className="text-xs text-muted-foreground">
                  {DIRECTION_LABELS[latestReport.direction] ?? latestReport.direction} · week of {fmtDate(latestReport.weekOf)} · confidence {latestReport.confidenceLevel?.toLowerCase()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {kpis.organicGrowthScore}
                </p>
                <p className="text-xs text-muted-foreground">Growth score / 100</p>
              </div>
              <div className="hidden text-right sm:block">
                <p className="text-3xl font-bold tabular-nums">{kpis.aiMentionRate}%</p>
                <p className="text-xs text-muted-foreground">AI mention rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* force-live refresh bar — always give the owner a working button */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          KPIs refresh automatically every 60 seconds — a manual refresh forces a live pull from Google & DataForSEO.
        </p>
        <Button onClick={doForceRefresh} disabled={forceRefreshing} size="sm" variant="outline" className="h-8 shrink-0">
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${forceRefreshing ? 'animate-spin' : ''}`} />
          {forceRefreshing ? 'Pulling live data…' : 'Refresh live KPIs'}
        </Button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label={live?.traffic ? 'Real Clicks / 28d' : 'Organic Clicks / wk'}
          value={fmtNum(kpis.organicClicks)}
          sub={live?.traffic
            ? (live.sessions !== null ? `${fmtNum(live.sessions)} GA4 sessions · ${fmtNum(live.users)} users` : 'from Google Search Console')
            : <TrendDelta value={kpis.clicksDelta} suffix="/wk" />}
          icon={<TrendingUp className="h-4 w-4" />}
          accent={kpis.clicksDelta > 0 ? 'positive' : 'default'}
          real={kpiReal?.organicClicks}
        />
        <KpiCard
          label="Top 3 Keywords"
          value={kpis.top3}
          sub={`${kpis.top10} in top 10 of ${kpis.trackedKeywords}${kpis.realTrackedKeywords ? ` (${kpis.realTrackedKeywords} real)` : ''}`}
          icon={<Search className="h-4 w-4" />}
          accent="positive"
          real={kpiReal?.top3}
        />
        <KpiCard
          label="Referring Domains"
          value={kpis.referringDomains}
          sub={kpiReal?.referringDomains
            ? `live profile · ${brand.domain}`
            : 'needs valid DataForSEO API keys'}
          icon={<Link2 className="h-4 w-4" />}
          real={kpiReal?.referringDomains}
        />
        <KpiCard
          label="AI Mention Rate"
          value={`${kpis.aiMentionRate}%`}
          sub={kpiReal?.aiMentionRate && kpiNotes?.aiMentionRate ? kpiNotes.aiMentionRate : 'run a live check — GEO Engine'}
          icon={<Bot className="h-4 w-4" />}
          accent={kpis.aiMentionRate >= 40 ? 'positive' : 'warning'}
          real={kpiReal?.aiMentionRate}
        />
        <KpiCard
          label="Open Opportunities"
          value={kpis.pendingOpportunities}
          sub={kpiReal?.pendingOpportunities
            ? `${kpis.activeOpportunities} in engine · ${kpis.pendingOpportunities} open now · from live GSC data`
            : 'engine runs after keyword sync'}
          icon={<Sparkles className="h-4 w-4" />}
          real={kpiReal?.pendingOpportunities}
        />
        <KpiCard
          label="Owner Approvals"
          value={kpis.pendingApprovals}
          sub={kpiReal?.pendingApprovals
            ? (kpis.pendingApprovals > 0 ? 'RED actions waiting for your decision' : 'all RED actions handled — engine keeps watching')
            : 'engine files RED actions here'}
          icon={<AlertTriangle className="h-4 w-4" />}
          accent={kpis.pendingApprovals > 0 ? 'danger' : 'default'}
          real={kpiReal?.pendingApprovals}
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span>{usingRealHistory ? 'Real organic clicks (daily)' : 'Organic clicks & growth score'}</span>
              <span className="flex items-center gap-2">
                {usingRealHistory && <RealnessChip real />}
                <Badge variant="secondary" className="text-[10px]">{usingRealHistory ? 'Google Search Console' : '8-week history'}</Badge>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pl-0 pr-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} className="text-muted-foreground" tickLine={false} axisLine={false} width={44} />
                  {!usingRealHistory && (
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} className="text-muted-foreground" tickLine={false} axisLine={false} width={30} domain={[0, 100]} />
                  )}
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: 'var(--card-foreground)',
                    }}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="organicClicks" name="Organic clicks" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  {!usingRealHistory && (
                    <Line yAxisId="right" type="monotone" dataKey="organicGrowthScore" name="Growth score" stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI visibility &amp; authority trend</CardTitle>
          </CardHeader>
          <CardContent className="pl-0 pr-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" tickLine={false} axisLine={false} width={36} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: 'var(--card-foreground)',
                    }}
                  />
                  <Bar dataKey="aiMentionRate" name="AI mention %" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="top10Count" name="Top-10 keywords" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Autonomy + activity */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Autonomy engine mix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="font-medium">GREEN — auto-execute</span>
                </span>
                <span className="tabular-nums text-muted-foreground">{autonomyMix.GREEN}</span>
              </div>
              <Progress value={(autonomyMix.GREEN / totalAutonomy) * 100} className="h-2" indicatorColor="bg-emerald-500" />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span className="font-medium">YELLOW — execute @ 85%+ confidence</span>
                </span>
                <span className="tabular-nums text-muted-foreground">{autonomyMix.YELLOW}</span>
              </div>
              <Progress value={(autonomyMix.YELLOW / totalAutonomy) * 100} className="h-2" indicatorColor="bg-amber-500" />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  <span className="font-medium">RED — owner approval</span>
                </span>
                <span className="tabular-nums text-muted-foreground">{autonomyMix.RED}</span>
              </div>
              <Progress value={(autonomyMix.RED / totalAutonomy) * 100} className="h-2" indicatorColor="bg-red-500" />
            </div>
            <Separator />
            <p className="text-xs leading-relaxed text-muted-foreground">
              A RED action never stops unrelated GREEN or YELLOW work. It waits in the Owner Approval Queue while the
              system keeps operating.
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/60 p-2.5">
                <p className="text-lg font-bold tabular-nums">{kpis.publishedContent}</p>
                <p className="text-[11px] text-muted-foreground">published pages</p>
              </div>
              <div className="rounded-lg bg-muted/60 p-2.5">
                <p className="text-lg font-bold tabular-nums">{kpis.qualifiedPublishers}</p>
                <p className="text-[11px] text-muted-foreground">qualified publishers</p>
              </div>
              <div className="rounded-lg bg-muted/60 p-2.5">
                <p className="text-lg font-bold tabular-nums">{brand.baselineScore}</p>
                <p className="text-[11px] text-muted-foreground">baseline score</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Daily loop — system activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[340px] px-4 pb-4">
              <div className="space-y-1">
                {recentEvents.map((ev, i) => (
                  <div key={ev.id}>
                    <div className="flex items-start gap-3 py-2.5">
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                          ev.level === 'WARN'
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : ev.level === 'CRITICAL'
                              ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                              : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {EVENT_ICONS[ev.type] ?? <Activity className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">{ev.message}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{ev.meta}</p>
                      </div>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {fmtDate(ev.createdAt)}
                      </span>
                    </div>
                    {i < recentEvents.length - 1 ? <Separator className="opacity-50" /> : null}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
