'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Mail, Users, Link2, ShieldCheck, TrendingUp } from 'lucide-react'
import {
  useApiData, StatusBadge, LoadingGrid, ErrorBox, SectionHeader, KpiCard, fmtNum, fmtDate, humanize,
} from './shared'

interface Publisher {
  id: string
  name: string
  domain: string
  niche: string
  qualificationScore: number
  contactName: string
  contactEmail: string
  monthlyTraffic: number
  aiCitationPotential: number
  status: string
}

interface Campaign {
  id: string
  subject: string
  personalization: string
  sequenceStage: string
  status: string
  result: string
  sentAt: string | null
  publisher: { name: string; domain: string }
}

interface Backlink {
  id: string
  sourceDomain: string
  sourceUrl: string
  type: string
  authorityScore: number
  referralTraffic: number
  aiCitationValue: boolean
  firstSeenAt: string
}

interface OutreachData {
  campaigns: Campaign[]
  publishers: Publisher[]
  backlinks: Backlink[]
  summary: {
    totalPublishers: number
    qualified: number
    contacted: number
    replied: number
    placed: number
    activeSequences: number
    referringDomains: number
    avgAuthority: number
    referralTraffic: number
    dailyCap: number
  }
}

const SEQUENCE_LABELS: Record<string, string> = {
  DAY_1: 'Day 1 — first contact',
  DAY_5: 'Day 5 — follow-up',
  DAY_12: 'Day 12 — final follow-up',
  REPLIED: 'Replied',
  PLACED: 'Placed',
  DECLINED: 'Declined',
  STOPPED: 'Stopped',
}

export function OutreachView({ brandSlug }: { brandSlug: string }) {
  const { data, loading, error } = useApiData<OutreachData>(`/api/outreach?brand=${brandSlug}`)

  if (error) return <ErrorBox message={error} />
  if (loading || !data) return <LoadingGrid rows={6} />

  const s = data.summary

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Authority & Outreach Engine"
        description="Publisher prospects are qualified before contact — minimum score 70/100, PBNs and link farms rejected. Maximum 30 new qualified contacts per business day. Sequence: Day 1 → Day 5 → Day 12 → stop. Never generic backlink spam."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Qualified publishers" value={s.qualified} sub={`of ${s.totalPublishers} prospected`} icon={<Users className="h-4 w-4" />} accent="positive" />
        <KpiCard label="Replied" value={s.replied} sub={`${s.contacted} contacted`} icon={<Mail className="h-4 w-4" />} />
        <KpiCard label="Active sequences" value={s.activeSequences} sub={`cap ${s.dailyCap}/day`} />
        <KpiCard label="Referring domains" value={s.referringDomains} sub={`avg authority ${s.avgAuthority}`} icon={<Link2 className="h-4 w-4" />} />
        <KpiCard label="Referral traffic" value={`${fmtNum(s.referralTraffic)}/mo`} accent="positive" icon={<TrendingUp className="h-4 w-4" />} />
        <KpiCard label="AI citation sources" value={data.backlinks.filter((b) => b.aiCitationValue).length} sub="high-authority domains" icon={<ShieldCheck className="h-4 w-4" />} />
      </div>

      <Tabs defaultValue="publishers">
        <TabsList className="h-9">
          <TabsTrigger value="publishers" className="text-xs">Publisher pipeline</TabsTrigger>
          <TabsTrigger value="sequences" className="text-xs">Outreach sequences</TabsTrigger>
          <TabsTrigger value="backlinks" className="text-xs">Backlink ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="publishers" className="mt-4">
          <div className="grid gap-3 md:grid-cols-2">
            {data.publishers.length === 0 ? (
              <Card className="border-dashed md:col-span-2">
                <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <Users className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm font-semibold">No publishers prospected yet</p>
                  <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                    The publisher pipeline fills with real, qualified prospects — never placeholder
                    contacts. Ask the Growth Agent to research and qualify publishers in your niche
                    (Hunter verification required) to start building the outreach list.
                  </p>
                </CardContent>
              </Card>
            ) : (
              data.publishers.map((p) => (
              <Card key={p.id} className="border-border/70">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.domain} · {p.niche}</p>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{p.contactName} · {p.contactEmail}</span>
                    <span className="tabular-nums">{fmtNum(p.monthlyTraffic)} visits/mo</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Qualification score (min 70)</span>
                        <span className={`font-bold tabular-nums ${p.qualificationScore >= 70 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {p.qualificationScore}/100
                        </span>
                      </div>
                      <Progress value={p.qualificationScore} className="h-1.5" />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">AI citation potential</span>
                        <span className="font-bold tabular-nums">{p.aiCitationPotential}/100</span>
                      </div>
                      <Progress value={p.aiCitationPotential} className="h-1.5" indicatorColor="bg-teal-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="sequences" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Active outreach — Hunter sequences</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[520px] px-4 pb-4">
                <div className="space-y-2">
                  {data.campaigns.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                      <Mail className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm font-semibold">No outreach sequences yet</p>
                      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                        Outreach campaigns appear here once publishers are qualified and the first
                        sequence is actually sent. Nothing is simulated.
                      </p>
                    </div>
                  ) : (
                    data.campaigns.map((c) => (
                    <div key={c.id} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{c.publisher.name}</p>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              c.status === 'REPLIED'
                                ? 'border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400'
                                : 'border-border text-muted-foreground'
                            }`}
                          >
                            {SEQUENCE_LABELS[c.sequenceStage] ?? c.sequenceStage}
                          </Badge>
                          <StatusBadge status={c.status} />
                        </div>
                      </div>
                      <p className="mt-1.5 text-sm">{c.subject}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.personalization}</p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>via Hunter · {c.publisher.domain}</span>
                        <span>{c.sentAt ? `sent ${fmtDate(c.sentAt)}` : 'queued'}</span>
                      </div>
                      {c.result ? (
                        <>
                          <Separator className="my-2" />
                          <p className="text-xs text-teal-600 dark:text-teal-400">↩ {c.result}</p>
                        </>
                      ) : null}
                    </div>
                  ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backlinks" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Earned authority ledger</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[520px] px-4 pb-4">
                <div className="space-y-2">
                  {data.backlinks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                      <Link2 className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm font-semibold">No backlinks recorded yet</p>
                      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                        This ledger lists only links that actually point to your site — verified, not
                        estimated. It fills automatically once the authority engine starts tracking
                        your real referring domains.
                      </p>
                    </div>
                  ) : (
                    data.backlinks.map((b) => (
                    <div key={b.id} className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{b.sourceDomain}</p>
                          <Badge variant="secondary" className="text-[10px]">{humanize(b.type)}</Badge>
                          {b.aiCitationValue ? (
                            <Badge variant="outline" className="border-teal-500/30 bg-teal-500/10 text-[10px] text-teal-600 dark:text-teal-400">
                              AI citation source
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{b.sourceUrl}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-5">
                        <div className="text-right">
                          <p className="text-sm font-bold tabular-nums">{b.authorityScore}</p>
                          <p className="text-[10px] text-muted-foreground">authority</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{b.referralTraffic}</p>
                          <p className="text-[10px] text-muted-foreground">referral/mo</p>
                        </div>
                        <div className="w-20 text-right text-[11px] text-muted-foreground">
                          first seen {fmtDate(b.firstSeenAt)}
                        </div>
                      </div>
                    </div>
                  ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
