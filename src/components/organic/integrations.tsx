'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { CheckCircle2, Circle, ExternalLink, KeyRound, Layers } from 'lucide-react'
import {
  useApiData, LoadingGrid, ErrorBox, SectionHeader, KpiCard, fmtDate,
} from './shared'

interface Integration {
  id: string
  order: number
  name: string
  layer: string
  purpose: string
  scope: string
  status: string
  docsUrl: string
  apiKeyEnvVar: string
  connectedAt: string | null
}

interface IntegrationsData {
  integrations: Integration[]
  summary: { total: number; connected: number; pending: number; shared: number; perBrand: number }
}

export function IntegrationsView() {
  const { data, loading, error } = useApiData<IntegrationsData>('/api/integrations')

  if (error) return <ErrorBox message={error} />
  if (loading || !data) return <LoadingGrid rows={6} />

  const s = data.summary
  const pct = Math.round((s.connected / s.total) * 100)

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Integration Stack"
        description="One connection at a time, tested before continuing. Shared infrastructure connects once — per-brand connections (GSC, GA4, Shopify, Merchant Center, Bing) repeat for each brand you activate."
        actions={
          <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Layers className="h-3 w-3" /> {s.connected}/{s.total} connected
          </Badge>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Connected" value={s.connected} accent="positive" icon={<CheckCircle2 className="h-4 w-4" />} />
        <KpiCard label="Pending" value={s.pending} accent="warning" />
        <KpiCard label="Shared infra" value={s.shared} sub="connect once" />
        <KpiCard label="Per-brand" value={s.perBrand} sub="repeat per brand" />
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">Stack completion</span>
            <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </CardContent>
      </Card>

      <div className="space-y-2.5">
        {data.integrations.map((i) => (
          <Card key={i.id} className="border-border/70">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex shrink-0 items-center gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold tabular-nums ${
                    i.status === 'CONNECTED'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {i.order}
                </span>
                {i.status === 'CONNECTED' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Circle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{i.name}</p>
                  <Badge variant="secondary" className="text-[10px]">{i.layer.replace(/_/g, ' ')}</Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      i.scope === 'SHARED'
                        ? 'border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {i.scope === 'SHARED' ? 'shared — connect once' : i.scope.replace(/_/g, ' ').toLowerCase()}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{i.purpose}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  {i.apiKeyEnvVar ? (
                    <span className="flex items-center gap-1">
                      <KeyRound className="h-3 w-3" />
                      <code className="rounded bg-muted px-1 py-0.5 font-mono">{i.apiKeyEnvVar}</code>
                    </span>
                  ) : null}
                  {i.connectedAt ? <span>connected {fmtDate(i.connectedAt)}</span> : <span>not connected yet</span>}
                  {i.docsUrl ? (
                    <a
                      href={i.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      <ExternalLink className="h-3 w-3" /> docs
                    </a>
                  ) : null}
                </div>
              </div>

              <Badge
                variant="outline"
                className={`shrink-0 ${
                  i.status === 'CONNECTED'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                }`}
              >
                {i.status === 'CONNECTED' ? 'Connected' : 'Pending'}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
