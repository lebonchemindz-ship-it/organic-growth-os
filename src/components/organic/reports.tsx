'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ArrowUp, ArrowDown, Minus, FileBarChart, Sparkles, ListChecks } from 'lucide-react'
import {
  useApiData, LoadingGrid, ErrorBox, SectionHeader, KpiCard, fmtNum, fmtDate,
} from './shared'

interface Report {
  id: string
  weekOf: string
  organicGrowthScore: number
  direction: string
  top3Count: number
  top10Count: number
  keywordsGained: number
  keywordsLost: number
  organicClicks: number
  organicClicksDelta: number
  referringDomains: number
  aiMentionRate: number
  biggestWins: string
  biggestProblems: string
  learned: string
  nextActions: string
  verdict: string
  confidenceLevel: string
}

interface ReportsData {
  reports: Report[]
  latest: Report | null
}

const DIRECTION_META: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  STRONGLY_IMPROVING: { label: 'Strongly improving', icon: <ArrowUp className="h-4 w-4" />, cls: 'text-emerald-600 dark:text-emerald-400' },
  IMPROVING: { label: 'Improving', icon: <ArrowUp className="h-3.5 w-3.5" />, cls: 'text-emerald-600 dark:text-emerald-400' },
  FLAT: { label: 'Flat', icon: <Minus className="h-4 w-4" />, cls: 'text-muted-foreground' },
  DECLINING: { label: 'Declining', icon: <ArrowDown className="h-4 w-4" />, cls: 'text-red-600 dark:text-red-400' },
  STRONGLY_DECLINING: { label: 'Strongly declining', icon: <ArrowDown className="h-4 w-4" />, cls: 'text-red-600 dark:text-red-400' },
}

const VERDICT_STYLES: Record<string, string> = {
  YES_STRONG_EVIDENCE: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  YES_EARLY_POSITIVE: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  TOO_EARLY_TO_DETERMINE: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  MIXED: 'border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400',
  NO_CHANGE_REQUIRED: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
}

const VERDICT_LABELS: Record<string, string> = {
  YES_STRONG_EVIDENCE: 'YES — strong evidence',
  YES_EARLY_POSITIVE: 'YES — early positive evidence',
  TOO_EARLY_TO_DETERMINE: 'Too early to determine',
  MIXED: 'Mixed',
  NO_CHANGE_REQUIRED: 'NO — strategy requires change',
}

export function ReportsView({ brandSlug }: { brandSlug: string }) {
  const { data, loading, error } = useApiData<ReportsData>(`/api/reports?brand=${brandSlug}`)

  if (error) return <ErrorBox message={error} />
  if (loading || !data) return <LoadingGrid rows={6} />

  const latest = data.latest
  const chartData = [...data.reports].reverse().map((r) => ({
    ...r,
    label: fmtDate(r.weekOf),
  }))

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Weekly Owner Report"
        description="One concise report per week — no daily noise. It answers the business question: are we actually moving in the right direction, and is this worth our time?"
      />

      {latest ? (
        <>
          {/* Verdict + KPIs */}
          <Card className="border-emerald-500/25">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileBarChart className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Week of {fmtDate(latest.weekOf)}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className={`flex items-center gap-1.5 text-sm font-medium ${DIRECTION_META[latest.direction]?.cls ?? ''}`}>
                    {DIRECTION_META[latest.direction]?.icon} {DIRECTION_META[latest.direction]?.label ?? latest.direction}
                  </span>
                  <Badge variant="outline" className={`text-xs font-semibold ${VERDICT_STYLES[latest.verdict] ?? ''}`}>
                    {VERDICT_LABELS[latest.verdict] ?? latest.verdict}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <KpiCard label="Growth score" value={latest.organicGrowthScore} sub="0-100 composite" accent="positive" />
                <KpiCard label="Top 3" value={latest.top3Count} />
                <KpiCard label="Top 10" value={latest.top10Count} />
                <KpiCard label="Keywords gained" value={`+${latest.keywordsGained}`} accent="positive" />
                <KpiCard label="Keywords lost" value={`-${latest.keywordsLost}`} accent={latest.keywordsLost > 2 ? 'danger' : 'default'} />
                <KpiCard label="Referring domains" value={latest.referringDomains} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Biggest wins</p>
                    <p className="mt-1 text-sm leading-relaxed">{latest.biggestWins}</p>
                  </div>
                  <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Biggest problems</p>
                    <p className="mt-1 text-sm leading-relaxed">{latest.biggestProblems}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" /> What was learned
                    </p>
                    <p className="mt-1 text-sm leading-relaxed">{latest.learned}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <ListChecks className="h-3.5 w-3.5" /> Next week&apos;s highest-value actions
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{latest.nextActions}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trend chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Score &amp; traffic history</CardTitle>
            </CardHeader>
            <CardContent className="pl-0 pr-4">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} className="text-muted-foreground" tickLine={false} axisLine={false} width={44} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} className="text-muted-foreground" tickLine={false} axisLine={false} width={36} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'var(--card-foreground)',
                      }}
                    />
                    <Line yAxisId="left" type="monotone" dataKey="organicClicks" name="Organic clicks" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line yAxisId="right" type="monotone" dataKey="organicGrowthScore" name="Growth score" stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="aiMentionRate" name="AI mention %" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* Archive */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Report archive</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[400px] px-4 pb-4">
            <div className="space-y-1">
              {data.reports.map((r, i) => (
                <div key={r.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs tabular-nums text-muted-foreground">{fmtDate(r.weekOf)}</span>
                      <span className={`flex items-center gap-1 text-xs font-medium ${DIRECTION_META[r.direction]?.cls ?? ''}`}>
                        {DIRECTION_META[r.direction]?.icon} {DIRECTION_META[r.direction]?.label ?? r.direction}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="tabular-nums">score <b>{r.organicGrowthScore}</b></span>
                      <span className="tabular-nums text-muted-foreground">{fmtNum(r.organicClicks)} clicks</span>
                      <span className="tabular-nums text-muted-foreground">+{r.keywordsGained}/-{r.keywordsLost} kw</span>
                      <span className="tabular-nums text-muted-foreground">{r.aiMentionRate}% AI</span>
                      <Badge variant="outline" className={`text-[10px] ${VERDICT_STYLES[r.verdict] ?? ''}`}>
                        {VERDICT_LABELS[r.verdict] ?? r.verdict}
                      </Badge>
                    </div>
                  </div>
                  {i < data.reports.length - 1 ? <Separator className="opacity-50" /> : null}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
