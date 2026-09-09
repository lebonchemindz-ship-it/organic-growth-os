'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Search, ArrowUp, ArrowDown, Minus, RefreshCw, Sparkles, Database, AlertTriangle, CheckCircle2, KeyRound } from 'lucide-react'
import {
  useApiData, LoadingGrid, ErrorBox, SectionHeader, KpiCard, fmtNum,
} from './shared'

interface KeywordRow {
  id: string
  term: string
  intent: string
  funnelStage: string
  monthlyVolume: number // REAL search volume — DataForSEO only; 0 = unknown
  difficulty: number // REAL keyword difficulty — DataForSEO only; 0 = unknown
  impressions: number // REAL GSC impressions (90d)
  clicks: number // REAL GSC clicks (90d)
  currentPosition: number
  previousPosition: number
  change: number
  targetUrl: string
  commercialValue: number
  aeoValue: number
  geoValue: number
  status: string
  source: string
}

interface KeywordsData {
  keywords: KeywordRow[]
  summary: {
    total: number
    top3: number
    top10: number
    positions1120: number
    notRanking: number
    totalVolume: number
    totalImpressions?: number
    totalClicks?: number
    hasRealVolume?: boolean
    hasRealDifficulty?: boolean
    live: number
    demo: number
  }
}

function SourceBadge({ source }: { source: string }) {
  if (source === 'GSC') {
    return (
      <Badge variant="outline" className="text-[10px] border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400">
        Search Console
      </Badge>
    )
  }
  if (source === 'DATAFORSEO') {
    return (
      <Badge variant="outline" className="text-[10px] border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400">
        DataForSEO
      </Badge>
    )
  }
  if (source === 'AGENT') {
    return (
      <Badge variant="outline" className="text-[10px] border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
        Sprout idea
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      demo
    </Badge>
  )
}

interface ResearchResponse {
  ok?: boolean
  error?: string
  message?: string
  addedCount?: number
  enriched?: number
  suggestions?: Array<{ term: string; volume: number; difficulty: number }>
}

interface SyncResponse {
  ok?: boolean
  error?: string
  code?: string
  message?: string
  added?: number
  updated?: number
  fetched?: number
  accountName?: string | null
  topMovers?: Array<{ term: string; position: number; clicks: number; delta: number }>
}

function PositionCell({ row }: { row: KeywordRow }) {
  if (row.currentPosition === 0) {
    return <span className="text-sm text-muted-foreground">not ranking</span>
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-bold tabular-nums">#{row.currentPosition}</span>
      {row.change !== 0 ? (
        <span
          className={`flex items-center gap-0.5 text-xs font-medium tabular-nums ${
            row.change > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {row.change > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {Math.abs(row.change)}
        </span>
      ) : (
        <Minus className="h-3 w-3 text-muted-foreground" />
      )}
    </div>
  )
}

function RealDataPanel({ brandSlug, onDone }: { brandSlug: string; onDone: () => void }) {
  const [seed, setSeed] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [researching, setResearching] = useState(false)
  const [result, setResult] = useState<{ kind: 'sync' | 'research'; ok: boolean; text: string } | null>(null)

  const doSync = async () => {
    setSyncing(true)
    setResult(null)
    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'sync-gsc', brandSlug, days: 90 }),
      })
      const json = (await res.json()) as SyncResponse
      if (json.ok) {
        const movers = (json.topMovers || []).slice(0, 3)
          .map(m => `“${m.term}” → #${m.position}${m.delta ? ` (${m.delta > 0 ? '+' : ''}${m.delta})` : ''}`)
          .join(' · ')
        setResult({
          kind: 'sync', ok: true,
          text: `Imported ${json.added ?? 0} new + updated ${json.updated ?? 0} keywords from ${json.accountName || 'Search Console'}${movers ? ` — movers: ${movers}` : ''}.`,
        })
        onDone()
      } else {
        setResult({ kind: 'sync', ok: false, text: json.message || 'Search Console sync failed.' })
      }
    } catch {
      setResult({ kind: 'sync', ok: false, text: 'Network error — could not reach the sync endpoint.' })
    } finally {
      setSyncing(false)
    }
  }

  const doResearch = async () => {
    if (!seed.trim()) return
    setResearching(true)
    setResult(null)
    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'research', seed: seed.trim(), brandSlug, limit: 20 }),
      })
      const json = (await res.json()) as ResearchResponse
      if (json.ok) {
        setResult({
          kind: 'research', ok: true,
          text: `Researched “${seed.trim()}” — ${json.addedCount ?? 0} new keywords added, ${json.enriched ?? 0} enriched with real volumes.`,
        })
        onDone()
      } else {
        setResult({ kind: 'research', ok: false, text: json.message || 'Keyword research failed.' })
      }
    } catch {
      setResult({ kind: 'research', ok: false, text: 'Network error — could not reach the research endpoint.' })
    } finally {
      setResearching(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          <h3 className="text-sm font-semibold">Real keyword data</h3>
          <Badge variant="outline" className="text-[10px] border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400">
            live sources
          </Badge>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Import the real queries your visitors search on Google (positions, impressions, clicks) from Search Console — or research
        new keywords with real volumes and difficulty via DataForSEO. Imported keywords replace demo data.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button onClick={doSync} disabled={syncing || researching} size="sm" className="h-9">
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing from Search Console…' : 'Sync from Search Console'}
        </Button>

        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Sparkles className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doResearch() }}
              placeholder="Research a seed keyword (DataForSEO)…"
              className="h-9 pl-8 text-sm"
              disabled={researching || syncing}
            />
          </div>
          <Button onClick={doResearch} disabled={researching || syncing || !seed.trim()} size="sm" variant="outline" className="h-9 shrink-0">
            {researching ? 'Researching…' : 'Research'}
          </Button>
        </div>
      </div>

      {result && (
        <div className={`mt-3 flex items-start gap-2 rounded-md border p-3 text-xs leading-relaxed ${
          result.ok
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
            : 'border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400'
        }`}>
          {result.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{result.text}</span>
        </div>
      )}
    </Card>
  )
}

export function KeywordsView({ brandSlug }: { brandSlug: string }) {
  const { data, loading, error, refetch } = useApiData<KeywordsData>(`/api/keywords?brand=${brandSlug}`)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!data) return []
    return data.keywords.filter(
      (k) => query === '' || k.term.toLowerCase().includes(query.toLowerCase())
    )
  }, [data, query])

  if (error) return <ErrorBox message={error} />
  if (loading || !data) return <LoadingGrid rows={6} />

  const s = data.summary
  // Volume & Difficulty columns only exist once REAL DataForSEO numbers do —
  // the owner's rule: never show placeholder metrics
  const showVolume = !!s.hasRealVolume
  const showDifficulty = !!s.hasRealDifficulty
  const colCount = 4 + (showVolume ? 1 : 0) + (showDifficulty ? 1 : 0)

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Keyword Universe"
        description="Live from Google Search Console — the real queries visitors search, with real positions, impressions and clicks (90-day window). Search volume & keyword difficulty appear only when real DataForSEO data exists."
      />

      <RealDataPanel brandSlug={brandSlug} onDone={refetch} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Tracked"
          value={s.total}
          sub={s.hasRealVolume ? fmtNum(s.totalVolume) + ' total volume' : fmtNum(s.totalImpressions ?? 0) + ' impressions (90d)'}
        />
        <KpiCard label="Top 3" value={s.top3} accent="positive" />
        <KpiCard label="Top 10" value={s.top10} accent="positive" />
        <KpiCard label="Positions 11-20" value={s.positions1120} sub="refresh sweet spot" />
        <KpiCard label="Not ranking" value={s.notRanking} />
        <KpiCard
          label="Real data"
          value={s.live ?? 0}
          sub={s.demo ? `${s.demo} demo rows` : 'all live'}
          accent={s.live ? 'positive' : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter keywords…"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} shown</span>
      </div>

      {!showVolume && (
        <div className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-medium">Volume & Difficulty are hidden until real data exists.</span>{' '}
            They require the DataForSEO API — add your API login &amp; password on the API Keys page and they
            will appear with real numbers only. Positions, impressions and clicks come from your live
            Google Search Console connection.
          </span>
        </div>
      )}

      <p className="-mt-1 text-[11px] text-muted-foreground sm:hidden">
        Swipe the table sideways to see positions & metrics →
      </p>

      <Card>
        <div className="max-h-[600px] overflow-auto">
          <Table className="min-w-[520px] table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[38%] max-w-[330px]">Keyword</TableHead>
                <TableHead className="w-[13%]">Position</TableHead>
                <TableHead className="hidden sm:table-cell w-[12%]" title="Real clicks from Google Search Console (90 days)">Clicks</TableHead>
                <TableHead className="hidden sm:table-cell w-[13%]" title="Real impressions from Google Search Console (90 days)">Impressions</TableHead>
                {showVolume ? <TableHead className="hidden lg:table-cell w-[12%]" title="Real monthly search volume (DataForSEO)">Volume</TableHead> : null}
                {showDifficulty ? <TableHead className="hidden lg:table-cell w-[12%]" title="Real keyword difficulty (DataForSEO)">Difficulty</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={colCount} className="py-12">
                    <div className="flex flex-col items-center justify-center gap-2 text-center">
                      <Search className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm font-semibold">No keywords tracked yet</p>
                      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                        Press “Sync from Search Console” above to import the real queries your visitors
                        search — actual positions, impressions and clicks straight from Google. Keyword
                        research with real search volumes unlocks once DataForSEO API keys are saved on the
                        API Keys page.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((k) => (
                <TableRow key={k.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium leading-snug break-words whitespace-normal">{k.term}</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <SourceBadge source={k.source} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><PositionCell row={k} /></TableCell>
                  <TableCell className="hidden sm:table-cell text-sm tabular-nums">{k.clicks > 0 ? fmtNum(k.clicks) : '—'}</TableCell>
                  <TableCell className="hidden sm:table-cell text-sm tabular-nums">{k.impressions > 0 ? fmtNum(k.impressions) : '—'}</TableCell>
                  {showVolume ? (
                    <TableCell className="hidden lg:table-cell text-sm tabular-nums">{k.monthlyVolume > 0 ? fmtNum(k.monthlyVolume) : '—'}</TableCell>
                  ) : null}
                  {showDifficulty ? (
                    <TableCell className="hidden lg:table-cell">
                      <span className={`text-sm font-medium tabular-nums ${k.difficulty > 60 ? 'text-red-600 dark:text-red-400' : k.difficulty > 35 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {k.difficulty > 0 ? k.difficulty : '—'}
                      </span>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}
