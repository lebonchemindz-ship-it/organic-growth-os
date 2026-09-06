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
import { Search, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import {
  useApiData, StatusBadge, LoadingGrid, ErrorBox, SectionHeader, KpiCard, fmtNum, humanize,
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
  }
}

const INTENT_FILTERS = ['ALL', 'COMMERCIAL', 'INFORMATIONAL', 'TRANSACTIONAL']

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

export function KeywordsView({ brandSlug }: { brandSlug: string }) {
  const { data, loading, error } = useApiData<KeywordsData>(`/api/keywords?brand=${brandSlug}`)
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Tracked" value={s.total} sub={fmtNum(s.totalVolume) + ' total volume'} />
        <KpiCard label="Top 3" value={s.top3} accent="positive" />
        <KpiCard label="Top 10" value={s.top10} accent="positive" />
        <KpiCard label="Positions 11-20" value={s.positions1120} sub="refresh sweet spot" />
        <KpiCard label="Not ranking" value={s.notRanking} />
        <KpiCard label="Commercial intent" value={data.keywords.filter((k) => k.intent === 'COMMERCIAL').length} />
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
              {filtered.map((k) => (
                <TableRow key={k.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">{k.term}</span>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={k.status} />
                        {k.funnelStage ? <Badge variant="outline" className="text-[10px] text-muted-foreground">{k.funnelStage}</Badge> : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><PositionCell row={k} /></TableCell>
                  <TableCell className="hidden sm:table-cell text-sm tabular-nums">{fmtNum(k.monthlyVolume)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className={`text-sm font-medium tabular-nums ${k.difficulty > 60 ? 'text-red-600 dark:text-red-400' : k.difficulty > 35 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {k.difficulty}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge
                      variant="outline"
                      className={`text-[11px] ${
                        k.intent === 'COMMERCIAL'
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
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>
    </div>
  )
}
