'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Globe, Package, Users, CheckCircle2, Clock } from 'lucide-react'
import {
  useApiData, StatusBadge, LoadingGrid, ErrorBox, SectionHeader, KpiCard, humanize,
} from './shared'

interface BrandRow {
  id: string
  slug: string
  name: string
  domain: string
  status: string
  industry: string
  description: string
  positioning: string
  targetAudience: string
  voice: string
  approvedClaims: string
  restrictedClaims: string
  baselineScore: number
  stats: { keywords: number; opportunities: number; content: number; reports: number; currentScore: number }
}

interface BrandsData {
  brands: BrandRow[]
}

export function BrandsView({ activeSlug, onSelect }: { activeSlug: string; onSelect: (slug: string) => void }) {
  const { data, loading, error } = useApiData<BrandsData>('/api/brands')

  if (error) return <ErrorBox message={error} />
  if (loading || !data) return <LoadingGrid rows={4} />

  const active = data.brands.find((b) => b.slug === activeSlug) ?? data.brands[0]
  const pending = data.brands.filter((b) => b.status !== 'ACTIVE')

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Brand Fleet"
        description="One Organic Growth OS installed once. One shared software stack connected once. The database separates and remembers each brand. Every table carries a brand_id — nothing ever mixes."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Brands on OS" value={data.brands.length} />
        <KpiCard label="Active" value={data.brands.filter((b) => b.status === 'ACTIVE').length} accent="positive" icon={<CheckCircle2 className="h-4 w-4" />} />
        <KpiCard label="Awaiting activation" value={pending.length} accent="warning" icon={<Clock className="h-4 w-4" />} />
        <KpiCard label="Combined keywords" value={data.brands.reduce((s, b) => s + b.stats.keywords, 0)} />
      </div>

      {/* Active brand — Brand Truth card */}
      {active ? (
        <Card className="border-emerald-500/25">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold">{active.name}</h3>
                  <StatusBadge status={active.status} />
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    <Globe className="mr-1 h-3 w-3" /> {active.domain}
                  </Badge>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{active.description}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{active.stats.currentScore}</p>
                <p className="text-xs text-muted-foreground">current growth score</p>
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Progress vs baseline</span>
                <span className="tabular-nums text-muted-foreground">baseline {active.baselineScore} → {active.stats.currentScore}</span>
              </div>
              <Progress value={active.stats.currentScore} className="h-2" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Positioning</p>
                <p className="mt-1 text-sm leading-relaxed">{active.positioning}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Target audience</p>
                <p className="mt-1 text-sm leading-relaxed">{active.targetAudience}</p>
              </div>
              <div className="rounded-lg bg-emerald-500/10 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Approved claims</p>
                <p className="mt-1 text-xs leading-relaxed">{active.approvedClaims}</p>
              </div>
              <div className="rounded-lg bg-red-500/10 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Restricted claims</p>
                <p className="mt-1 text-xs leading-relaxed">{active.restrictedClaims}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center sm:grid-cols-4">
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-lg font-bold tabular-nums">{active.stats.keywords}</p>
                <p className="text-[11px] text-muted-foreground">keywords tracked</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-lg font-bold tabular-nums">{active.stats.opportunities}</p>
                <p className="text-[11px] text-muted-foreground">opportunities</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-lg font-bold tabular-nums">{active.stats.content}</p>
                <p className="text-[11px] text-muted-foreground">content assets</p>
              </div>
              <div className="hidden rounded-lg bg-muted/50 p-2.5 sm:block">
                <p className="text-lg font-bold tabular-nums">{active.stats.reports}</p>
                <p className="text-[11px] text-muted-foreground">weekly reports</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* All brands grid */}
      <div className="grid gap-3 md:grid-cols-2">
        {data.brands.map((b) => {
          const isActive = b.slug === activeSlug
          const selectable = b.status === 'ACTIVE'
          return (
            <Card
              key={b.id}
              className={`cursor-pointer border-border/70 transition-all ${
                isActive ? 'border-emerald-500/50 ring-1 ring-emerald-500/25' : selectable ? 'hover:border-emerald-500/30' : 'opacity-80'
              }`}
              onClick={() => selectable && onSelect(b.slug)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold">{b.name}</p>
                      <StatusBadge status={b.status} />
                      {isActive ? (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400">
                          viewing
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{b.domain} · {b.industry}</p>
                  </div>
                  <Package className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-sm font-bold tabular-nums">{b.stats.keywords}</p>
                    <p className="text-[10px] text-muted-foreground">keywords</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold tabular-nums">{b.stats.opportunities}</p>
                    <p className="text-[10px] text-muted-foreground">opps</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold tabular-nums">{b.stats.content}</p>
                    <p className="text-[10px] text-muted-foreground">content</p>
                  </div>
                  <div>
                    <p className={`text-sm font-bold tabular-nums ${b.status === 'ACTIVE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                      {b.stats.currentScore}
                    </p>
                    <p className="text-[10px] text-muted-foreground">score</p>
                  </div>
                </div>
                {b.status !== 'ACTIVE' ? (
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                    <Users className="h-3 w-3" /> Awaiting brand truth intake + per-brand connections (GSC, GA4, Shopify, Merchant Center, Bing)
                  </p>
                ) : (
                  <p className="mt-3 text-[11px] text-muted-foreground">Click anywhere on this card to switch the dashboard to {b.name} →</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
