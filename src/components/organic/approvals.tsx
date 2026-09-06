'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertTriangle, Check, X, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import {
  useApiData, StatusBadge, LoadingGrid, ErrorBox, SectionHeader, KpiCard, fmtDate, humanize,
} from './shared'

interface ApprovalItem {
  id: string
  title: string
  category: string
  riskLevel: string
  description: string
  impact: string
  requestedAt: string
  status: string
  decidedAt: string | null
}

interface ApprovalsData {
  items: ApprovalItem[]
  summary: { pending: number; approved: number; rejected: number }
}

export function ApprovalsView({ brandSlug }: { brandSlug: string }) {
  const { data, loading, error, refetch } = useApiData<ApprovalsData>(`/api/approvals?brand=${brandSlug}`)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED') {
    setBusyId(id)
    try {
      const res = await fetch('/api/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision }),
      })
      if (!res.ok) throw new Error('Decision failed')
      toast.success(decision === 'APPROVED' ? 'Approved — action released for execution' : 'Rejected — daily loop continues')
      await refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record decision')
    } finally {
      setBusyId(null)
    }
  }

  if (error) return <ErrorBox message={error} />
  if (loading || !data) return <LoadingGrid rows={4} />

  const s = data.summary
  const pending = data.items.filter((i) => i.status === 'PENDING')
  const decided = data.items.filter((i) => i.status !== 'PENDING')

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Owner Approval Queue"
        description="Only RED actions reach you: consequential, hard-to-reverse, financially material, legally sensitive or reputationally meaningful decisions. Everything else runs autonomously — a RED action never halts unrelated GREEN or YELLOW work."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard label="Waiting for you" value={s.pending} icon={<AlertTriangle className="h-4 w-4" />} accent={s.pending > 0 ? 'danger' : 'positive'} />
        <KpiCard label="Approved" value={s.approved} accent="positive" />
        <KpiCard label="Rejected" value={s.rejected} />
      </div>

      {pending.length === 0 ? (
        <Card className="border-emerald-500/25 bg-emerald-500/5">
          <CardContent className="flex items-center gap-3 p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Check className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Queue is clear</p>
              <p className="text-xs text-muted-foreground">Nothing needs your attention. The system is operating autonomously.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pending.map((item) => (
            <Card key={item.id} className="border-red-500/25">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-6 items-center gap-1.5 rounded-md bg-red-500/15 px-2 text-[11px] font-semibold text-red-600 dark:text-red-400">
                        <ShieldAlert className="h-3 w-3" /> RED · {humanize(item.category)}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">requested {fmtDate(item.requestedAt)}</span>
                    </div>
                    <p className="text-base font-semibold leading-snug">{item.title}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                    {item.impact ? (
                      <div className="rounded-lg bg-muted/60 p-2.5">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Impact assessment</p>
                        <p className="mt-0.5 text-sm">{item.impact}</p>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2 sm:flex-col">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-600/90 text-white"
                      disabled={busyId === item.id}
                      onClick={() => decide(item.id, 'APPROVED')}
                    >
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
                      disabled={busyId === item.id}
                      onClick={() => decide(item.id, 'REJECTED')}
                    >
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {decided.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="max-h-72 px-4 pb-4">
              <div className="space-y-2 pt-4">
                {decided.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {humanize(item.category)} · decided {fmtDate(item.decidedAt)}
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
