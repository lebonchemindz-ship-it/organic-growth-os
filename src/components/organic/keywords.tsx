'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Search, ArrowUp, ArrowDown, Minus, RefreshCw, Sparkles, Database, AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  useApiData, LoadingGrid, ErrorBox, SectionHeader, KpiCard, fmtNum, humanize,
} from './shared'

interface KeywordRow {
  id: string
  term: string
  intent: string
  funnelStage: string
  monthlyVolume: number
  difficulty: number
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
    live: number
    demo: number
  }
}

const INTENT_FILTERS = ['ALL', 'COMMERCIAL', 'INFORMATIONAL', 'TRANSACTIONAL']

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
  const [intent, setIntent] = useState('ALL')

  const filtered = useMemo(() => {
    if (!data) return []
    return data.keywords.filter(
      (k) =>
        (intent === 'ALL' || k.intent === intent) &&
        (query === '' || k.term.toLowerCase().includes(query.toLowerCase()))
    )
  }, [data, query, intent])

  if (error) return <ErrorBox message={error} />
  if (loading || !data) return <LoadingGrid rows={6} />

  const s = data.summary

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Keyword Universe"
        description="Continuously updated from GSC, DataForSEO, SERPs, People Also Ask and AI query patterns. Positions 4-20 with strong expected return get priority — never chase volume alone."
      />

      <RealDataPanel brandSlug={brandSlug} onDone={refetch} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Tracked" value={s.total} sub={fmtNum(s.totalVolume) + ' total volume'} />
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
        <Select value={intent} onValueChange={setIntent}>
          <SelectTrigger className="h-9 w-[160px] text-xs">
            <SelectValue placeholder="Intent" />
          </SelectTrigger>
          <SelectContent>
            {INTENT_FILTERS.map((i) => (
              <SelectItem key={i} value={i} className="text-xs">{i === 'ALL' ? 'All intents' : humanize(i)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} shown</span>
      </div>

      <Card>
        <ScrollArea className="max-h-[600px]">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[220px]">Keyword</TableHead>
                <TableHead>Position</TableHead>
                <TableHead className="hidden sm:table-cell">Volume</TableHead>
                <TableHead className="hidden md:table-cell">Difficulty</TableHead>
                <TableHead className="hidden lg:table-cell">Intent</TableHead>
                <TableHead className="hidden lg:table-cell">AEO</TableHead>
                <TableHead className="hidden lg:table-cell">GEO</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-12">
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
                      <span className="text-sm font-medium">{k.term}</span>
                      <div className="flex items-center gap-1.5">
                        <SourceBadge source={k.source} />
                        {k.funnelStage ? <Badge variant="outline" className="text-[10px] text-muted-foreground">{k.funnelStage}</Badge> : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><PositionCell row={k} /></TableCell>
                  <TableCell className="hidden sm:table-cell text-sm tabular-nums">{fmtNum(k.monthlyVolume)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className={`text-sm font-medium tabular-nums ${k.difficulty > 60 ? 'text-red-600 dark:text-red-400' : k.difficulty > 35 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {k.difficulty || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge
                      variant="outline"
                      className={`text-[11px] ${
                        k.intent === 'COMMERCIAL' || k.intent === 'TRANSACTIONAL'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      {humanize(k.intent)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm tabular-nums text-muted-foreground">{k.aeoValue}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm tabular-nums text-muted-foreground">{k.geoValue}</TableCell>
                </TableRow>
              ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>
    </div>
  )
}
