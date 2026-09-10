'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Mail, Users, Link2, ShieldCheck, TrendingUp, Search, Send, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
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

interface EngineStatus {
  hunterReady: boolean
  smtpReady: boolean
  dueFollowups: number
  sentToday: number
  dailyCap: number
}

interface OutreachData {
  campaigns: Campaign[]
  publishers: Publisher[]
  backlinks: Backlink[]
  engine?: EngineStatus
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

interface ActionOutcome {
  ok?: boolean
  message?: string
}

export function OutreachView({ brandSlug }: { brandSlug: string }) {
  const { data, loading, error, refetch } = useApiData<OutreachData>(`/api/outreach?brand=${brandSlug}`)

  // discovery form state
  const [showDiscovery, setShowDiscovery] = useState(false)
  const [seed, setSeed] = useState('')
  const [domains, setDomains] = useState('')
  const [limit, setLimit] = useState(10)
  const [autoLaunch, setAutoLaunch] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [discoveryResult, setDiscoveryResult] = useState<string | null>(null)

  // engine action state
  const [launchingAll, setLaunchingAll] = useState(false)
  const [sendingFollowups, setSendingFollowups] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [busyPublisher, setBusyPublisher] = useState<string | null>(null)
  const [busyCampaign, setBusyCampaign] = useState<string | null>(null)

  // AUTO follow-ups: on mount, silently send any due Day-5 / Day-12
  // emails (this is what makes the sequence fully automatic — every
  // time the dashboard opens, the engine catches up).
  const autoFollowupsDone = useRef(false)
  useEffect(() => {
    if (autoFollowupsDone.current || !data) return
    autoFollowupsDone.current = true
    if ((data.engine?.dueFollowups ?? 0) > 0) {
      fetch(`/api/outreach`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'followups', brandSlug }),
      })
        .then((r) => r.json())
        .then((out: ActionOutcome) => {
          if (out?.message) setActionMessage(out.message)
          refetch()
        })
        .catch(() => {})
    }
  }, [data, brandSlug, refetch])

  const post = async (body: Record<string, unknown>): Promise<ActionOutcome | null> => {
    try {
      const res = await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandSlug, ...body }),
      })
      return await res.json()
    } catch {
      return null
    }
  }

  const runDiscovery = async () => {
    setDiscovering(true)
    setDiscoveryResult(null)
    try {
      const out = await post({
        action: 'discover',
        seed: seed.trim(),
        domains: domains.trim(),
        limit,
        autoLaunch,
      })
      setDiscoveryResult(out?.message || 'Discovery finished.')
      if (out?.ok) {
        setSeed('')
        setDomains('')
        setShowDiscovery(false)
      }
      refetch()
    } finally {
      setDiscovering(false)
    }
  }

  const launchAll = async () => {
    setLaunchingAll(true)
    setActionMessage(null)
    try {
      const out = await post({ action: 'launch' })
      setActionMessage(out?.message || 'Done.')
      refetch()
    } finally {
      setLaunchingAll(false)
    }
  }

  const sendFollowupsNow = async () => {
    setSendingFollowups(true)
    setActionMessage(null)
    try {
      const out = await post({ action: 'followups' })
      setActionMessage(out?.message || 'No follow-ups due.')
      refetch()
    } finally {
      setSendingFollowups(false)
    }
  }

  const launchPublisher = async (publisherId: string) => {
    setBusyPublisher(publisherId)
    setActionMessage(null)
    try {
      const out = await post({ action: 'launch', publisherIds: [publisherId] })
      setActionMessage(out?.message || 'Done.')
      refetch()
    } finally {
      setBusyPublisher(null)
    }
  }

  const markReplied = async (campaignId: string) => {
    setBusyCampaign(campaignId)
    try {
      const out = await post({ action: 'mark-replied', campaignId })
      setActionMessage(out?.message || 'Done.')
      refetch()
    } finally {
      setBusyCampaign(null)
    }
  }

  if (error) return <ErrorBox message={error} />
  if (loading || !data) return <LoadingGrid rows={6} />

  const s = data.summary
  const engine = data.engine
  const qualifiedWithoutCampaign = data.publishers.filter(
    (p) => p.qualificationScore >= 70 && p.contactEmail && !['CONTACTED', 'REPLIED', 'NEGOTIATING', 'PLACED', 'DO_NOT_CONTACT'].includes(p.status),
  )

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Authority & Outreach Engine"
        description="Publisher prospects are qualified before contact — minimum score 70/100, verified emails only (Hunter), PBNs and link farms rejected. Maximum 30 new qualified contacts per business day. Sequence: Day 1 → Day 5 → Day 12 → stop. Never generic backlink spam."
        actions={
          <>
            <Button size="sm" className="h-8" onClick={() => setShowDiscovery((v) => !v)}>
              <Search className="mr-2 h-3.5 w-3.5" />
              Discover publishers
            </Button>
            <Button
              size="sm" variant="outline" className="h-8"
              onClick={sendFollowupsNow} disabled={sendingFollowups}
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${sendingFollowups ? 'animate-spin' : ''}`} />
              Send due follow-ups{engine && engine.dueFollowups > 0 ? ` (${engine.dueFollowups})` : ''}
            </Button>
          </>
        }
      />

      {/* engine status strip */}
      <Card className="border-border/70">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3.5 text-xs">
          <span className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${engine?.hunterReady ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="font-medium">Hunter.io</span>
            <span className="text-muted-foreground">{engine?.hunterReady ? 'connected' : 'key missing — API Keys'}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${engine?.smtpReady ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="font-medium">Email sender (SMTP)</span>
            <span className="text-muted-foreground">{engine?.smtpReady ? 'connected' : 'not configured — API Keys'}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">daily cap {engine?.sentToday ?? 0}/{engine?.dailyCap ?? 30}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">follow-ups auto-send on open</span>
          </span>
        </CardContent>
      </Card>

      {/* discovery panel */}
      {showDiscovery && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4" />
              Discover publishers — real domains, verified contacts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Niche keyword</p>
                <Input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  placeholder='e.g. "vitamin supplements" / "sleep aids"'
                  className="h-9"
                />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  A live Google SERP lookup (DataForSEO) finds the domains that actually rank for your niche — a few cents per run.
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium">…or paste specific domains (free)</p>
                <Textarea
                  value={domains}
                  onChange={(e) => setDomains(e.target.value)}
                  placeholder="healthline.com&#10;example-blog.com"
                  className="min-h-[72px] text-xs"
                />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  One domain per line — skips the SERP cost, Hunter still verifies every contact.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium">Domains to try</p>
                <Input
                  type="number" min={1} max={25}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="h-8 w-16"
                />
                <span className="text-[11px] text-muted-foreground">max 25 (Hunter monthly free quota)</span>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox checked={autoLaunch} onCheckedChange={(v) => setAutoLaunch(Boolean(v))} />
                <span className="text-xs font-medium">Contact them automatically (Day-1 email after discovery)</span>
              </label>
            </div>
            <Button onClick={runDiscovery} disabled={discovering || (!seed.trim() && !domains.trim())}>
              <Search className={`mr-2 h-4 w-4 ${discovering ? 'animate-pulse' : ''}`} />
              {discovering ? 'Researching domains + verifying contacts…' : 'Start discovery'}
            </Button>
            {discoveryResult && (
              <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-xs leading-relaxed">
                {discoveryResult}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* action feedback */}
      {actionMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* SMTP warning */}
      {engine && !engine.smtpReady && qualifiedWithoutCampaign.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {qualifiedWithoutCampaign.length} qualified publisher(s) ready — but the Email Sender (SMTP) is not configured yet.
            Add it on the API Keys page (Gmail app password, Brevo or Zoho — takes one minute) and the engine will send the outreach automatically.
          </span>
        </div>
      )}

      {/* bulk launch bar */}
      {qualifiedWithoutCampaign.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{qualifiedWithoutCampaign.length}</span>{' '}
            qualified publisher(s) waiting for outreach
            {engine?.smtpReady ? ' — one click sends all Day-1 emails (cap applies).' : ' — configure SMTP first.'}
          </p>
          <Button size="sm" className="h-8" onClick={launchAll} disabled={launchingAll || !engine?.smtpReady}>
            <Send className={`mr-2 h-3.5 w-3.5 ${launchingAll ? 'animate-pulse' : ''}`} />
            {launchingAll ? 'Sending Day-1 emails…' : 'Start outreach for all'}
          </Button>
        </div>
      )}

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
                    Press <span className="font-semibold">Discover publishers</span> above — the engine runs a live SERP
                    lookup (or uses domains you paste), finds each site&apos;s contact email via Hunter, verifies it, and
                    scores every publisher before anything is sent.
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
                    <span>{p.contactName || '—'} · {p.contactEmail || 'no email found'}</span>
                    <span className="tabular-nums">{p.monthlyTraffic > 0 ? `${fmtNum(p.monthlyTraffic)} visits/mo` : 'traffic unknown'}</span>
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
                  {p.qualificationScore >= 70 && p.contactEmail && !['CONTACTED', 'REPLIED', 'NEGOTIATING', 'PLACED', 'DO_NOT_CONTACT'].includes(p.status) && (
                    <Button
                      size="sm" variant="outline" className="mt-3 h-7 text-xs"
                      onClick={() => launchPublisher(p.id)}
                      disabled={busyPublisher === p.id || !engine?.smtpReady}
                    >
                      <Send className="mr-1.5 h-3 w-3" />
                      {busyPublisher === p.id ? 'Sending…' : 'Start outreach'}
                    </Button>
                  )}
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
                        Sequences start automatically after discovery (when SMTP is configured) or with the
                        Start outreach button. Day 5 and Day 12 follow-ups send themselves — nothing is simulated.
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
                      {c.status === 'SENT' && c.sequenceStage !== 'REPLIED' && (
                        <Button
                          size="sm" variant="ghost" className="mt-2 h-7 text-xs"
                          onClick={() => markReplied(c.id)}
                          disabled={busyCampaign === c.id}
                        >
                          <Mail className="mr-1.5 h-3 w-3" />
                          {busyCampaign === c.id ? 'Saving…' : 'Mark as replied'}
                        </Button>
                      )}
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
