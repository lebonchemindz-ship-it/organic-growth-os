'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Sparkles, Filter, ChevronRight, RefreshCw } from 'lucide-react'
import {
  useApiData, AutonomyBadge, StatusBadge, TypeBadge, LoadingGrid, ErrorBox,
  SectionHeader, ScoreBar, fmtDate, humanize,
} from './shared'

interface Opportunity {
  id: string
  title: string
  type: string
  description: string
  impact: number
  probability: number
  confidence: number
  strategicValue: number
  urgency: number
  effort: number
  opportunityScore: number
  autonomyLevel: string
  status: string
  recommendedAction: string
  keyword: string
  createdAt: string
  completedAt: string | null
}

interface OpportunitiesData {
  opportunities: Opportunity[]
  summary: {
    total: number
    green: number
    yellow: number
    red: number
    completed: number
    avgScore: number
  }
}

const TYPE_FILTERS = ['ALL', 'CONTENT', 'REFRESH', 'TECHNICAL_SEO', 'INTERNAL_LINKS', 'AUTHORITY', 'OUTREACH', 'AEO', 'GEO', 'PRODUCT_SEARCH', 'INDEXING']
const AUTONOMY_FILTERS = ['ALL', 'GREEN', 'YELLOW', 'RED']

export function OpportunitiesView({ brandSlug }: { brandSlug: string }) {
  const { data, loading, error, refetch } = useApiData<OpportunitiesData>(`/api/opportunities?brand=${brandSlug}`)
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [autonomyFilter, setAutonomyFilter] = useState('ALL')
  const [selected, setSelected] = useState<Opportunity | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState<string | null>(null)

  // run the real growth engine: scores the live GSC keyword universe
  // into opportunities (idempotent) and files RED refreshes for approval
  const runEngine = async () => {
    setGenerating(true)
    setGenMsg(null)
    try {
      const res = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandSlug, action: 'generate' }),
      })
      const json = await res.json()
      if (!res.ok) {
        setGenMsg(json.message || 'The engine could not run — is Search Console synced?')
      } else {
        setGenMsg(
          json.created > 0
            ? `Engine analyzed ${json.keywordsAnalyzed} live GSC keywords → ${json.created} new opportunities${json.redFiled > 0 ? ` · ${json.redFiled} RED action${json.redFiled > 1 ? 's' : ''} filed for your approval` : ''}`
            : `Engine analyzed ${json.keywordsAnalyzed} live GSC keywords — every eligible opportunity is already in the queue`,
        )
        refetch()
        window.dispatchEvent(new Event('og:data-changed'))
      }
    } catch {
      setGenMsg('The engine could not run — network error.')
    } finally {
      setGenerating(false)
    }
  }

  const filtered = useMemo(() => {
    if (!data) return []
    return data.opportunities.filter(
      (o) =>
        (typeFilter === 'ALL' || o.type === typeFilter) &&
        (autonomyFilter === 'ALL' || o.autonomyLevel === autonomyFilter)
    )
  }, [data, typeFilter, autonomyFilter])

  if (error) return <ErrorBox message={error} />
  if (loading || !data) return <LoadingGrid rows={6} />

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Decision & Autonomy Engine"
        description="Every opportunity is scored by VALUE = Impact × Probability × Confidence × Strategic Value × Urgency, adjusted downward for effort, cost and risk. GREEN and qualifying YELLOW actions execute autonomously; RED actions wait for you."
        actions={
          <>
            <Button
              size="sm"
              onClick={runEngine}
              disabled={generating}
              className="h-8 gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Running engine…' : 'Generate from GSC data'}
            </Button>
            <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-3 w-3" /> avg score {data.summary.avgScore}
            </Badge>
            <Badge variant="secondary">{data.summary.total} total</Badge>
          </>
        }
      />

      {genMsg ? (
        <p className="-mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs leading-relaxed text-emerald-700 dark:text-emerald-400">
          {genMsg}
        </p>
      ) : null}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_FILTERS.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">{t === 'ALL' ? 'All types' : humanize(t)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={autonomyFilter} onValueChange={setAutonomyFilter}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue placeholder="Autonomy" />
          </SelectTrigger>
          <SelectContent>
            {AUTONOMY_FILTERS.map((a) => (
              <SelectItem key={a} value={a} className="text-xs">{a === 'ALL' ? 'All levels' : a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} shown</span>
      </div>

      {/* Queue table */}
      <p className="-mt-1 text-[11px] text-muted-foreground sm:hidden">
        Swipe the table sideways to see scores & details →
      </p>

      <Card>
        <div className="max-h-[640px] overflow-auto">
          <Table className="min-w-[640px] table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[44%]">Opportunity</TableHead>
                <TableHead className="w-[16%]">Score</TableHead>
                <TableHead className="hidden md:table-cell w-[13%]">Autonomy</TableHead>
                <TableHead className="hidden lg:table-cell w-[11%]">Status</TableHead>
                <TableHead className="hidden lg:table-cell w-[9%]">Effort</TableHead>
                <TableHead className="hidden sm:table-cell w-[11%]">Created</TableHead>
                <TableHead className="w-[4%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-12">
                    <div className="flex flex-col items-center justify-center gap-2 text-center">
                      <Sparkles className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm font-semibold">No opportunities in the queue yet</p>
                      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                        Opportunities are real, data-backed actions — never placeholder ideas. Run the engine
                        with the button above (or sync your keywords): it scores every live Search Console
                        query — striking-distance rankings, CTR gaps, page-2 pushes — and files risky
                        live-page refreshes as RED actions for your approval.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((o) => (
                <TableRow
                  key={o.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(o)}
                >
                  <TableCell>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium leading-snug break-words whitespace-normal">{o.title}</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <TypeBadge type={o.type} />
                        {o.keyword ? (
                          <Badge variant="outline" className="max-w-[220px] truncate text-[10px] text-muted-foreground" title={o.keyword}>“{o.keyword}”</Badge>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex w-24 flex-col gap-1">
                      <span className="text-sm font-bold tabular-nums">{o.opportunityScore}</span>
                      <ScoreBar score={o.opportunityScore} className="w-[72px]" />
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell"><AutonomyBadge level={o.autonomyLevel} /></TableCell>
                  <TableCell className="hidden lg:table-cell"><StatusBadge status={o.status} /></TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-xs tabular-nums text-muted-foreground">{o.effort}/100</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-xs tabular-nums text-muted-foreground">
                    {fmtDate(o.createdAt)}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected ? (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <AutonomyBadge level={selected.autonomyLevel} />
                  <StatusBadge status={selected.status} />
                  <TypeBadge type={selected.type} />
                </div>
                <DialogTitle className="pr-6 text-left text-lg leading-snug">{selected.title}</DialogTitle>
                <DialogDescription className="text-left leading-relaxed">{selected.description}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">Opportunity score</span>
                    <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{selected.opportunityScore}/100</span>
                  </div>
                  <ScoreBar score={selected.opportunityScore} />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    ['Impact', selected.impact],
                    ['Probability', selected.probability],
                    ['Confidence', selected.confidence],
                    ['Strategic value', selected.strategicValue],
                    ['Urgency', selected.urgency],
                    ['Effort (penalty)', selected.effort],
                  ].map(([label, val]) => (
                    <div key={label as string} className="rounded-lg bg-muted/60 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="text-sm font-bold tabular-nums">{val as number}</span>
                        <Progress value={val as number} className="h-1.5 w-16" />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border bg-muted/40 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommended action</p>
                  <p className="mt-1 text-sm">{selected.recommendedAction}</p>
                  {selected.keyword ? (
                    <p className="mt-2 text-xs text-muted-foreground">Target keyword: “{selected.keyword}”</p>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
