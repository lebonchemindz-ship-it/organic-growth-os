'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import {
  LayoutDashboard, Sparkles, Search, FileText, Users, Bot, ShieldAlert,
  Plug, Building2, FileBarChart, TerminalSquare, KeyRound, Menu, Sprout,
  Activity, FlaskConical, X, ScrollText, BarChart3, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DashboardView } from '@/components/organic/dashboard'
import { OpportunitiesView } from '@/components/organic/opportunities'
import { KeywordsView } from '@/components/organic/keywords'
import { ContentView } from '@/components/organic/content'
import { OutreachView } from '@/components/organic/outreach'
import { AiVisibilityView } from '@/components/organic/ai-visibility'
import { ApprovalsView } from '@/components/organic/approvals'
import { IntegrationsView } from '@/components/organic/integrations'
import { BrandsView } from '@/components/organic/brands'
import { ReportsView } from '@/components/organic/reports'
import { MasterPromptView } from '@/components/organic/master-prompt-view'
import { ApisView } from '@/components/organic/apis-view'
import { ApiKeysView } from '@/components/organic/api-keys-view'
import { LiveStatsView } from '@/components/organic/live-stats'
import { AgentView } from '@/components/organic/agent-view'
import { useApiData } from '@/components/organic/shared'
import { AssistantPanel } from '@/components/organic/assistant-panel'

type SectionId =
  | 'dashboard' | 'live-stats' | 'agent' | 'opportunities' | 'keywords' | 'content' | 'outreach'
  | 'ai' | 'approvals' | 'reports' | 'brands' | 'integrations' | 'master' | 'apis' | 'api-keys'

const NAV: Array<{ group: string; items: Array<{ id: SectionId; label: string; icon: React.ReactNode }> }> = [
  {
    group: 'Operate',
    items: [
      { id: 'agent', label: 'Growth Agent', icon: <Bot className="h-4 w-4" /> },
      { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
      { id: 'live-stats', label: 'Live Stats', icon: <BarChart3 className="h-4 w-4" /> },
      { id: 'opportunities', label: 'Opportunities', icon: <Sparkles className="h-4 w-4" /> },
      { id: 'keywords', label: 'Keywords', icon: <Search className="h-4 w-4" /> },
      { id: 'content', label: 'Content Engine', icon: <FileText className="h-4 w-4" /> },
      { id: 'outreach', label: 'Outreach & Authority', icon: <Users className="h-4 w-4" /> },
      { id: 'ai', label: 'AI Visibility', icon: <Bot className="h-4 w-4" /> },
    ],
  },
  {
    group: 'Own',
    items: [
      { id: 'approvals', label: 'Approvals', icon: <ShieldAlert className="h-4 w-4" /> },
      { id: 'reports', label: 'Weekly Report', icon: <FileBarChart className="h-4 w-4" /> },
    ],
  },
  {
    group: 'System',
    items: [
      { id: 'api-keys', label: 'API Keys', icon: <KeyRound className="h-4 w-4" /> },
      { id: 'brands', label: 'Brands', icon: <Building2 className="h-4 w-4" /> },
      { id: 'integrations', label: 'Integrations', icon: <Plug className="h-4 w-4" /> },
      { id: 'master', label: 'The OS — Prompt', icon: <TerminalSquare className="h-4 w-4" /> },
      { id: 'apis', label: 'APIs Required', icon: <ScrollText className="h-4 w-4" /> },
    ],
  },
]

const SECTION_META: Record<SectionId, { title: string; sub: string }> = {
  dashboard: { title: 'Overview', sub: 'The operating system at a glance' },
  'live-stats': { title: 'Live Stats', sub: 'Real GSC + GA4 statistics — direct or via Porter Metrics' },
  agent: { title: 'Growth Agent', sub: 'Sprout — commands executed for real, chat & tasks saved permanently' },
  opportunities: { title: 'Opportunities', sub: 'Decision & autonomy engine' },
  keywords: { title: 'Keywords', sub: 'The keyword universe' },
  content: { title: 'Content Engine', sub: 'From brief to refresh' },
  outreach: { title: 'Outreach & Authority', sub: 'Earn links, mentions and AI citations' },
  ai: { title: 'AI Visibility', sub: 'GEO engine across LLMs' },
  approvals: { title: 'Approvals', sub: 'Owner approval queue' },
  reports: { title: 'Weekly Report', sub: 'One report that matters' },
  brands: { title: 'Brands', sub: 'Brand fleet & isolation' },
  integrations: { title: 'Integrations', sub: 'The 13-connection checklist' },
  master: { title: 'The OS — Master Prompt', sub: 'Install once as CLAUDE.md' },
  apis: { title: 'APIs Required', sub: 'Everything you need to connect' },
  'api-keys': { title: 'API Keys', sub: 'Save each service key once — stored permanently' },
}

interface BrandsListData {
  brands: Array<{ slug: string; name: string; status: string }>
}

interface DataStatus {
  brain: { provider: string; keyConfigured: boolean }
  porter: { connected: boolean; message: string; gscAccounts: number; ga4Accounts: number }
  dataforseo: { configured: boolean; verified: boolean; balance: number | null; message: string }
  keywords: { total: number; live: number; demo: number; agent: number }
  flags: { realTraffic: boolean; realVolumes: boolean; anyReal: boolean }
}

function NavContent({ active, onNavigate }: { active: SectionId; onNavigate: (id: SectionId) => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {NAV.map((group) => (
        <div key={group.group}>
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-accent-foreground/50">
            {group.group}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
                  active === item.id
                    ? 'bg-sidebar-primary/20 text-sidebar-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                )}
              >
                <span className={cn(active === item.id ? 'text-emerald-400' : 'text-sidebar-foreground/50')}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

const VALID_SECTION_IDS = new Set<string>(NAV.flatMap((g) => g.items.map((i) => i.id)))
const BRAND_STORAGE_KEY = 'og:active-brand'

export default function Home() {
  const [section, setSection] = useState<SectionId>('dashboard')
  const [brandSlug, setBrandSlug] = useState('holy_strips')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(false)
  const [porterNotice, setPorterNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [dataStatus, setDataStatus] = useState<DataStatus | null>(null)

  const refreshDataStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/data-status', { cache: 'no-store' })
      if (res.ok) setDataStatus((await res.json()) as DataStatus)
    } catch {
      /* status badge is best-effort */
    }
  }, [])

  // re-check on every section change (cheap, 30s server-side cache) —
  // async setState in a fetch callback, not a synchronous cascade
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async refresh, setState happens in the fetch callback
  useEffect(() => { refreshDataStatus() }, [refreshDataStatus, section])

  // live re-check when the agent or the owner changes connections/data
  useEffect(() => {
    const onChange = () => refreshDataStatus()
    window.addEventListener('og:data-changed', onChange)
    const interval = setInterval(refreshDataStatus, 60_000)
    return () => {
      window.removeEventListener('og:data-changed', onChange)
      clearInterval(interval)
    }
  }, [refreshDataStatus])

  const anyReal = dataStatus?.flags?.anyReal ?? false
  const realTraffic = dataStatus?.flags?.realTraffic ?? false
  const liveKeywords = dataStatus?.keywords?.live ?? 0
  const dfsVerified = dataStatus?.dataforseo?.verified ?? false

  // Restore the window the user was on: the section lives in the URL hash
  // (e.g. /#outreach), so a page refresh keeps the same view instead of
  // falling back to Overview. Also reacts to hash changes in-session
  // (pasting a shared link) — our own navigate() uses replaceState and
  // never fires hashchange, so there is no feedback loop.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#\/?/, '')
      if (hash && VALID_SECTION_IDS.has(hash)) setSection(hash as SectionId)
    }
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [])

  // Restore the last active brand too (localStorage) — refresh keeps both
  // the window and the brand context.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(BRAND_STORAGE_KEY)
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of persisted brand
        setBrandSlug(stored)
      }
    } catch {
      /* localStorage unavailable — keep the default brand */
    }
  }, [])

  // Porter OAuth return: /?porter=connected | ?porter=error&reason=…
  // Runs once on mount after a full page navigation (external system → state sync).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const result = params.get('porter')
    if (!result) return
    let notice: { kind: 'ok' | 'err'; text: string }
    if (result === 'connected') {
      notice = {
        kind: 'ok',
        text: 'Porter Metrics connected — your Google account links are now one click away. Connect Search Console and GA4 below to load live statistics.',
      }
    } else {
      const reason = params.get('reason') || 'unknown'
      const friendly: Record<string, string> = {
        registration_failed: 'Porter client registration failed — check your connection and try again.',
        state_mismatch: 'The login session expired or was reused — press Connect Porter again.',
        expired_login_session: 'The login attempt took too long — press Connect Porter again.',
        token_exchange_failed: 'Porter rejected the login code — press Connect Porter again.',
        missing_code: 'Porter did not return a login code — press Connect Porter again.',
        access_denied: 'The Porter login was cancelled.',
        internal_error: 'An unexpected error occurred — try again.',
      }
      notice = { kind: 'err', text: friendly[reason] || `Porter login failed (${reason}).` }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time URL-param handoff after OAuth redirect navigation
    setPorterNotice(notice)
    setSection('live-stats')
    params.delete('porter')
    params.delete('reason')
    const qs = params.toString()
    // keep the hash in sync with the forced section so a refresh right after
    // the OAuth return stays on Live Stats as well
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}#live-stats`)
  }, [])

  const { data: brandsData } = useApiData<BrandsListData>('/api/brands')
  const activeBrand = brandsData?.brands.find((b) => b.slug === brandSlug)

  function navigate(id: SectionId) {
    setSection(id)
    setMobileNavOpen(false)
    if (id !== 'live-stats') setPorterNotice(null)
    // mirror the active section into the URL hash so a refresh (or a shared
    // link) opens on the exact same window — never a silent reset to Overview
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}#${id}`)
    }
  }

  function selectBrand(slug: string) {
    setBrandSlug(slug)
    try {
      window.localStorage.setItem(BRAND_STORAGE_KEY, slug)
    } catch {
      /* persistence is best-effort */
    }
  }

  const meta = SECTION_META[section]

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
            <Sprout className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold leading-tight text-sidebar-foreground">Organic Growth OS</p>
            <p className="text-[10px] text-sidebar-foreground/50">v1.7 · agent v2 — persistent chat · live badges</p>
          </div>
        </div>

        <NavContent active={section} onNavigate={navigate} />

        {/* Brand switcher footer */}
        <div className="border-t border-sidebar-border p-3">
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-accent-foreground/50">
            Active brand
          </p>
          <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent/60 px-2.5 py-2">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', anyReal ? 'bg-emerald-400' : 'bg-amber-400')} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-sidebar-foreground">{activeBrand?.name ?? 'Holy Strips'}</p>
              <p className="truncate text-[10px] text-sidebar-foreground/50">{activeBrand?.status === 'ACTIVE' ? 'autonomous operation' : 'pending activation'}</p>
            </div>
            {anyReal ? (
              <Badge variant="outline" className="h-5 shrink-0 border-emerald-500/40 bg-emerald-500/10 px-1.5 text-[9px] text-emerald-600 dark:text-emerald-400">
                LIVE
              </Badge>
            ) : (
              <Badge variant="outline" className="h-5 shrink-0 border-amber-500/40 bg-amber-500/10 px-1.5 text-[9px] text-amber-600 dark:text-amber-400">
                DEMO
              </Badge>
            )}
          </div>
          <button
            onClick={() => navigate('brands')}
            className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-sidebar-foreground/60 hover:text-sidebar-foreground"
          >
            <Activity className="h-3 w-3" /> switch brand →
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur sm:px-6">
          {/* Mobile nav */}
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 lg:hidden" aria-label="Open navigation">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 border-sidebar-border bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex items-center gap-2.5 px-4 py-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                  <Sprout className="h-5 w-5" />
                </span>
                <p className="text-sm font-bold text-sidebar-foreground">Organic Growth OS</p>
              </div>
              <NavContent active={section} onNavigate={navigate} />
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">{meta.title}</h1>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">{meta.sub}</p>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {realTraffic ? (
              <Badge variant="outline" className="gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-600 dark:text-emerald-400">
                <Zap className="h-3 w-3" />
                Live data — real Google metrics
              </Badge>
            ) : anyReal ? (
              <Badge variant="outline" className="gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-600 dark:text-emerald-400">
                <Zap className="h-3 w-3" />
                {liveKeywords > 0 ? `${liveKeywords} real keywords` : 'Real data connected'}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1.5 border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-600 dark:text-amber-400">
                <FlaskConical className="h-3 w-3" />
                Demo data — connect APIs for real metrics
              </Badge>
            )}
            <Badge variant="secondary" className="text-[11px]">{activeBrand?.name ?? 'Holy Strips'}</Badge>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            {!demoBannerDismissed && (
              <div className={cn(
                'mb-5 flex items-start gap-3 rounded-xl border px-4 py-3',
                realTraffic
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
              )}>
                {realTraffic ? (
                  <Zap className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
                  {realTraffic ? (
                    <>
                      <p className="font-semibold">Live data connected — real Google metrics are flowing.</p>
                      <p className="mt-0.5 text-emerald-700/80 dark:text-emerald-300/80">
                        <b>Real right now:</b> Google Search Console + GA4 numbers on the Live Stats page, real GSC
                        keywords in the Keywords tab{dfsVerified ? ', real search volumes via DataForSEO' : ''}, and the
                        Overview KPIs. Backlinks, AI visibility, outreach, content and reports stay empty — they
                        fill only from real actions and connected APIs, never placeholder data.
                      </p>
                    </>
                  ) : anyReal ? (
                    <>
                      <p className="font-semibold">Mixed data: real where connected, empty elsewhere.</p>
                      <p className="mt-0.5 text-amber-700/80 dark:text-amber-300/80">
                        <b>Real right now:</b> {liveKeywords > 0 ? `${liveKeywords} real keywords (Search Console / DataForSEO) in the Keywords tab` : 'some real data sources'}
                        {dfsVerified ? ' and real search volumes via DataForSEO' : ''}. <b>Not yet connected:</b> Google
                        traffic totals — connect Porter on the Live Stats page. Every other section shows only real
                        data or an honest empty state, never placeholders.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold">No real data yet — nothing is connected.</p>
                      <p className="mt-0.5 text-amber-700/80 dark:text-amber-300/80">
                        Connect <b>Porter Metrics</b> on the Live Stats page for real Google Search Console + GA4
                        numbers, and add <b>DataForSEO API</b> credentials on the API Keys page for real search
                        volumes. The badges across the app switch to LIVE automatically as soon as real data flows.
                      </p>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setDemoBannerDismissed(true)}
                  aria-label="Dismiss data status notice"
                  className={cn(
                    'shrink-0 rounded-md p-1 transition-colors',
                    realTraffic
                      ? 'text-emerald-700/60 hover:text-emerald-700 dark:text-emerald-300/60 dark:hover:text-emerald-200'
                      : 'text-amber-700/60 hover:text-amber-700 dark:text-amber-300/60 dark:hover:text-amber-200',
                  )}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {section === 'dashboard' && <DashboardView brandSlug={brandSlug} />}
            {section === 'live-stats' && <LiveStatsView onNavigate={navigate} notice={porterNotice} />}
            {section === 'agent' && <AgentView brandSlug={brandSlug} />}
            {section === 'opportunities' && <OpportunitiesView brandSlug={brandSlug} />}
            {section === 'keywords' && <KeywordsView brandSlug={brandSlug} />}
            {section === 'content' && <ContentView brandSlug={brandSlug} />}
            {section === 'outreach' && <OutreachView brandSlug={brandSlug} />}
            {section === 'ai' && <AiVisibilityView brandSlug={brandSlug} />}
            {section === 'approvals' && <ApprovalsView brandSlug={brandSlug} />}
            {section === 'reports' && <ReportsView brandSlug={brandSlug} />}
            {section === 'brands' && <BrandsView activeSlug={brandSlug} onSelect={selectBrand} />}
            {section === 'integrations' && <IntegrationsView />}
            {section === 'master' && <MasterPromptView />}
            {section === 'apis' && <ApisView onNavigate={navigate} />}
            {section === 'api-keys' && <ApiKeysView />}
          </div>
        </main>

        {/* Sprout — the AI growth agent (floating) */}
        <AssistantPanel brandSlug={brandSlug} />

        {/* Footer */}
        <footer className="mt-auto border-t border-border bg-background px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
            <p>Organic Growth OS — one system, many brands, zero spam.</p>
            <p className="flex items-center gap-1.5">
              <Sprout className="h-3 w-3 text-emerald-500" />
              Discover → Verify → Prioritize → Execute → Measure → Learn
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
