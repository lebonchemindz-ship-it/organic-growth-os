'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { FileText, ImageIcon, Link2, CalendarClock, ExternalLink } from 'lucide-react'
import {
  useApiData, AutonomyBadge, StatusBadge, LoadingGrid, ErrorBox, SectionHeader, KpiCard, fmtNum, fmtDate, humanize,
} from './shared'

interface ContentItem {
  id: string
  title: string
  type: string
  stage: string
  keyword: string
  wordCount: number
  autonomyLevel: string
  hasImages: boolean
  internalLinks: number
  scheduledFor: string | null
  publishedAt: string | null
  url: string
  organicClicks: number
  position: number
}

interface ContentData {
  items: ContentItem[]
  byStage: Record<string, number>
  summary: {
    total: number
    published: number
    inProduction: number
    scheduled: number
    totalWords: number
    totalOrganicClicks: number
    withImages: number
  }
}

const PIPELINE = [
  { stage: 'BRIEF', label: 'Brief', hint: 'Opportunity validated, search intent inspected, SERPs analyzed' },
  { stage: 'DRAFTING', label: 'Drafting', hint: 'Writing with information-gap and entity coverage' },
  { stage: 'FACT_CHECK', label: 'Fact check', hint: 'Claims verified against Brand Truth' },
  { stage: 'OPTIMIZING', label: 'Optimizing', hint: 'SEO + AEO + GEO requirements applied' },
  { stage: 'IMAGING', label: 'Imaging', hint: 'Recraft editorial visuals generated' },
  { stage: 'LINKING', label: 'Linking', hint: 'Internal links implemented' },
  { stage: 'SCHEDULED', label: 'Scheduled', hint: 'Queued for Shopify publish' },
  { stage: 'PUBLISHED', label: 'Published', hint: 'Live, IndexNow pinged' },
  { stage: 'MONITORING', label: 'Monitoring', hint: 'Performance tracked vs baseline' },
  { stage: 'REFRESHING', label: 'Refreshing', hint: 'Evidence-driven update cycle' },
]

export function ContentView({ brandSlug }: { brandSlug: string }) {
  const { data, loading, error } = useApiData<ContentData>(`/api/content?brand=${brandSlug}`)

  if (error) return <ErrorBox message={error} />
  if (loading || !data) return <LoadingGrid rows={6} />

  const s = data.summary

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Content Engine"
        description="No arbitrary publishing quotas. Every piece exists because the data said so — drafted, fact-checked, illustrated via Recraft, internally linked, scheduled and published without owner approval when it qualifies as routine GREEN content."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Total assets" value={s.total} />
        <KpiCard label="Published" value={s.published} accent="positive" />
        <KpiCard label="In production" value={s.inProduction} />
        <KpiCard label="Scheduled" value={s.scheduled} sub="queued for publish" />
        <KpiCard label="Words produced" value={fmtNum(s.totalWords)} />
        <KpiCard label="Organic clicks" value={fmtNum(s.totalOrganicClicks)} icon={<FileText className="h-4 w-4" />} accent="positive" />
      </div>

      {/* Pipeline visualization */}
      <TooltipProvider delayDuration={200}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Production pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-1.5 overflow-x-auto pb-2">
              {PIPELINE.map((p, i) => {
                const count = data.byStage[p.stage] ?? 0
                return (
                  <div key={p.stage} className="flex min-w-0 flex-1 items-stretch gap-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`flex min-w-[86px] flex-1 cursor-default flex-col items-center justify-center rounded-lg border px-2 py-3 transition-colors ${
                            count > 0
                              ? 'border-emerald-500/30 bg-emerald-500/10'
                              : 'border-border bg-muted/40 opacity-60'
                          }`}
                        >
                          <span className={`text-lg font-bold tabular-nums ${count > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                            {count}
                          </span>
                          <span className="whitespace-nowrap text-[10px] font-medium text-muted-foreground">{p.label}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-52 text-center text-xs">
                        <p className="font-semibold">{p.label}</p>
                        <p className="text-muted-foreground">{p.hint}</p>
                      </TooltipContent>
                    </Tooltip>
                    {i < PIPELINE.length - 1 ? (
                      <div className="flex items-center text-muted-foreground/40">
                        <div className="h-px w-2 bg-border sm:w-3" />
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </TooltipProvider>

      {/* Items list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All content assets</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[560px] px-4 pb-4">
            <div className="space-y-2">
              {data.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 p-3 transition-colors hover:border-emerald-500/30 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium leading-snug">{item.title}</p>
                      {item.autonomyLevel !== 'GREEN' ? <AutonomyBadge level={item.autonomyLevel} /> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <StatusBadge status={item.stage} />
                      <Badge variant="secondary" className="text-[10px]">{item.type.replace(/_/g, ' ')}</Badge>
                      {item.keyword ? <span>“{item.keyword}”</span> : null}
                      {item.wordCount > 0 ? <span className="tabular-nums">{fmtNum(item.wordCount)} words</span> : null}
                      {item.hasImages ? (
                        <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" /> {item.hasImages ? 'imaged' : ''}</span>
                      ) : null}
                      {item.internalLinks > 0 ? (
                        <span className="flex items-center gap-1"><Link2 className="h-3 w-3" />{item.internalLinks}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    {item.organicClicks > 0 ? (
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{fmtNum(item.organicClicks)}</p>
                        <p className="text-[10px] text-muted-foreground">clicks/mo</p>
                      </div>
                    ) : null}
                    {item.position > 0 ? (
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums">#{item.position}</p>
                        <p className="text-[10px] text-muted-foreground">position</p>
                      </div>
                    ) : null}
                    <div className="w-24 text-right text-[11px] text-muted-foreground">
                      {item.publishedAt ? (
                        <span>live {fmtDate(item.publishedAt)}</span>
                      ) : item.scheduledFor ? (
                        <span className="flex items-center justify-end gap-1"><CalendarClock className="h-3 w-3" />{fmtDate(item.scheduledFor)}</span>
                      ) : (
                        <span>in production</span>
                      )}
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 flex items-center justify-end gap-1 text-emerald-600 hover:underline dark:text-emerald-400"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3" /> open
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
