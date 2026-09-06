'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Search, ExternalLink, KeyRound, DollarSign, Brain, Database, Calendar, Mail, Palette, LineChart, ShoppingBag, Globe, Zap, ScrollText } from 'lucide-react'
import { SectionHeader } from './shared'

interface ApiSpec {
  name: string
  role: string
  purpose: string
  authType: string
  envVars: string[]
  pricing: string
  docsUrl: string
  layer: string
  icon: React.ReactNode
  priority: 1 | 2 | 3
}

const APIS: ApiSpec[] = [
  {
    name: 'Anthropic API (Claude)',
    role: 'The brain',
    purpose: 'Runs the Organic Growth OS itself — Claude Code / Claude API executes the daily loop, decision engine, content production and weekly reports. This dashboard mirrors what Claude does.',
    authType: 'API key (Bearer)',
    envVars: ['ANTHROPIC_API_KEY'],
    pricing: 'Claude Sonnet ≈ $3/$15 per M tokens; daily loop ≈ $2-6/day per brand',
    docsUrl: 'https://console.anthropic.com',
    layer: 'Layer 1 — Intelligence',
    icon: <Brain className="h-5 w-5" />,
    priority: 1,
  },
  {
    name: 'Supabase',
    role: 'Persistent memory',
    purpose: 'Postgres database + storage. The authoritative system of record for all 4 data classes: Brand Truth, Observed Intelligence, Operational State, Learning & Outcomes. Every table carries brand_id.',
    authType: 'sb_secret_… key (server-side only, bypasses RLS)',
    envVars: ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_ANON_KEY (optional dashboard)'],
    pricing: 'Free tier: 500MB DB + 1GB storage; Pro $25/mo',
    docsUrl: 'https://supabase.com/docs',
    layer: 'Layer 2 — Infrastructure',
    icon: <Database className="h-5 w-5" />,
    priority: 1,
  },
  {
    name: 'DataForSEO',
    role: 'SEO & GEO intelligence',
    purpose: 'SERPs, keyword data, search volumes, difficulty, competitor keywords, backlink intelligence, technical audit signals, and AI/LLM SERP data. Replaces $250-500/mo of overlapping SEO tools. Official MCP server for Claude Code.',
    authType: 'Basic auth (login:password), API credits',
    envVars: ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'],
    pricing: 'Pay-as-you-go from $0.006/request; ≈ $50-150/mo for one brand at full cadence',
    docsUrl: 'https://docs.dataforseo.com',
    layer: 'Layer 2 — Intelligence',
    icon: <LineChart className="h-5 w-5" />,
    priority: 1,
  },
  {
    name: 'Activepieces',
    role: '24/7 scheduler',
    purpose: 'The always-on orchestration layer that triggers the 16 OS flows (daily intelligence, opportunity engine, content, outreach, monitoring, weekly report, emergency alert) even when your laptop is off. Cheaper than Zapier, simpler than n8n.',
    authType: 'API key + piece connections',
    envVars: ['ACTIVEPIECES_API_KEY', 'ACTIVEPIECES_WEBHOOK_URL'],
    pricing: 'Free: 1,000 tasks/mo; Pro $25/mo',
    docsUrl: 'https://activepieces.com/docs',
    layer: 'Layer 2 — Automation',
    icon: <Calendar className="h-5 w-5" />,
    priority: 1,
  },
  {
    name: 'Hunter.io',
    role: 'Publisher outreach',
    purpose: 'Contact discovery, email verification and outreach sequences for the Authority Engine. Caps at 30 qualified contacts/day with Day 1 / Day 5 / Day 12 sequences. Verify before sending — never spam.',
    authType: 'API key',
    envVars: ['HUNTER_API_KEY'],
    pricing: 'Free: 25 searches/mo; Starter $34/mo (500 searches + 1,000 verifications)',
    docsUrl: 'https://hunter.io/api-documentation',
    layer: 'Layer 2 — Outreach',
    icon: <Mail className="h-5 w-5" />,
    priority: 2,
  },
  {
    name: 'Recraft API',
    role: 'Editorial imagery',
    purpose: 'API-quality image generation for blog visuals: comparison diagrams, concept illustrations, and data graphics. Chosen for automation/API reliability over raw prettiness. Real product photos stay the source of truth for packaging.',
    authType: 'API key (Bearer)',
    envVars: ['RECRAFT_API_KEY'],
    pricing: 'Free: 50 credits/day; from $12/mo',
    docsUrl: 'https://www.recraft.ai/developers',
    layer: 'Layer 2 — Creative',
    icon: <Palette className="h-5 w-5" />,
    priority: 3,
  },
  {
    name: 'Google Search Console API',
    role: 'Ground truth rankings',
    purpose: 'Real Google rankings, impressions, CTR and query data per brand property. Feeds the keyword engine with actual performance — not tool estimates. Core input for the weekly report.',
    authType: 'OAuth 2.0 (service account with property access)',
    envVars: ['GSC_CLIENT_EMAIL', 'GSC_PRIVATE_KEY', 'GSC_SITE_URL'],
    pricing: 'Free',
    docsUrl: 'https://developers.google.com/webmaster-tools',
    layer: 'Per-brand — Google',
    icon: <Globe className="h-5 w-5" />,
    priority: 1,
  },
  {
    name: 'Google Analytics Data API (GA4)',
    role: 'Traffic & revenue',
    purpose: 'Organic sessions, conversions and revenue attribution per brand. Connects growth activity to business results — the weekly report answers "is this worth our time?" from here.',
    authType: 'OAuth 2.0 / service account',
    envVars: ['GA4_PROPERTY_ID', 'GA4_CLIENT_EMAIL', 'GA4_PRIVATE_KEY'],
    pricing: 'Free',
    docsUrl: 'https://developers.google.com/analytics/devguides/reporting/data/v1',
    layer: 'Per-brand — Google',
    icon: <LineChart className="h-5 w-5" />,
    priority: 1,
  },
  {
    name: 'Shopify Admin API',
    role: 'Publishing & product data',
    purpose: 'Publishes content to the blog, reads the product catalog, collections and Supplement Facts for Brand Truth. The content engine schedules and publishes here autonomously when content qualifies GREEN.',
    authType: 'Admin API access token (custom app)',
    envVars: ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ACCESS_TOKEN'],
    pricing: 'Included with Shopify plan',
    docsUrl: 'https://shopify.dev/docs/api/admin-graphql',
    layer: 'Per-brand — Publishing',
    icon: <ShoppingBag className="h-5 w-5" />,
    priority: 1,
  },
  {
    name: 'Google Merchant Center API',
    role: 'Product search visibility',
    purpose: 'Product feed health: approvals, disapprovals, warnings, titles, GTINs, pricing, availability. Keeps the product-search engine honest — product data must remain factually accurate.',
    authType: 'OAuth 2.0 / service account',
    envVars: ['MERCHANT_ID', 'MERCHANT_CENTER_API_KEY'],
    pricing: 'Free',
    docsUrl: 'https://developers.google.com/shopping-content',
    layer: 'Per-brand — Google',
    icon: <ShoppingBag className="h-5 w-5" />,
    priority: 2,
  },
  {
    name: 'Bing Webmaster + IndexNow',
    role: 'Bing & Copilot visibility',
    purpose: 'Bing/Copilot indexing data and instant URL-change notification (Bing, Yandex, Naver). The indexing engine pings IndexNow when eligible URLs are created, updated or removed — never repeatedly for unchanged pages.',
    authType: 'API key (IndexNow key file)',
    envVars: ['BING_API_KEY', 'INDEXNOW_KEY'],
    pricing: 'Free',
    docsUrl: 'https://www.indexnow.org/documentation',
    layer: 'Per-brand — Microsoft',
    icon: <Zap className="h-5 w-5" />,
    priority: 2,
  },
  {
    name: 'OpenSEO (open-seo)',
    role: 'All-in-one SEO toolbox · alternative',
    purpose: 'Open-source alternative to Semrush/Ahrefs (github.com/every-app/open-seo). Exposes keyword research, rank tracking, competitor insights, backlinks, site audits and AI visibility through an MCP server that agents (Claude Code, the Sprout chatbot) can call directly. Bring your own DataForSEO key — pay-as-you-go. Use it as the OS SEO-data brain instead of wiring DataForSEO endpoints yourself, or self-host on Cloudflare/Docker.',
    authType: 'API key (hosted) or self-hosted MCP endpoint',
    envVars: ['OPENSEO_API_KEY', 'OPENSEO_MCP_URL'],
    pricing: 'Hosted $10/mo · self-hosted free + DataForSEO usage',
    docsUrl: 'https://github.com/every-app/open-seo',
    layer: 'Layer 2 — Intelligence (optional)',
    icon: <Globe className="h-5 w-5" />,
    priority: 3,
  },
]

const PRIORITY_LABELS: Record<number, { label: string; cls: string }> = {
  1: { label: 'Required day one', cls: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400' },
  2: { label: 'Needed week one', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  3: { label: 'Nice to have', cls: 'border-border text-muted-foreground' },
}

export function ApisView() {
  const [query, setQuery] = useState('')

  const filtered = APIS.filter(
    (a) =>
      query === '' ||
      a.name.toLowerCase().includes(query.toLowerCase()) ||
      a.role.toLowerCase().includes(query.toLowerCase()) ||
      a.purpose.toLowerCase().includes(query.toLowerCase())
  )

  const dayOne = APIS.filter((a) => a.priority === 1)
  const totalMonthly = '$85-225/mo total (replaces $250-500/mo of overlapping SEO tools)'

  return (
    <div className="space-y-5">
      <SectionHeader
        title="APIs & Credentials Required"
        description="Every external system the Organic Growth OS needs to run for real. Connect in priority order — one connection at a time, tested before continuing. All keys live in environment variables, never in code. The Sprout agent (bottom-right) already understands this stack."
        actions={
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <DollarSign className="h-3 w-3" /> {totalMonthly}
          </Badge>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter APIs…" className="h-9 pl-8 text-sm" />
      </div>

      {/* Quick env reference */}
      <Card className="border-emerald-500/25 bg-emerald-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ScrollText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> .env quick reference
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-auto rounded-lg border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
{`# Layer 1 — the brain
ANTHROPIC_API_KEY=

# Layer 2 — shared infrastructure (connect once)
SUPABASE_URL=
SUPABASE_SECRET_KEY=
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=
ACTIVEPIECES_API_KEY=
HUNTER_API_KEY=
RECRAFT_API_KEY=

# Optional — OpenSEO as the all-in-one SEO data brain
OPENSEO_API_KEY=
OPENSEO_MCP_URL=

# Per-brand (repeat per brand)
GSC_SITE_URL=            GA4_PROPERTY_ID=
SHOPIFY_STORE_DOMAIN=    SHOPIFY_ACCESS_TOKEN=
MERCHANT_ID=             BING_API_KEY=
INDEXNOW_KEY=`}
          </pre>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {filtered.map((api) => (
          <Card key={api.name} className="border-border/70">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  {api.icon}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold">{api.name}</p>
                    <Badge variant="secondary" className="text-[10px]">{api.role}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${PRIORITY_LABELS[api.priority].cls}`}>
                      {PRIORITY_LABELS[api.priority].label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">{api.layer}</Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{api.purpose}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <KeyRound className="h-3 w-3" /> {api.authType}
                    </span>
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> {api.pricing}
                    </span>
                    <a
                      href={api.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      <ExternalLink className="h-3 w-3" /> documentation
                    </a>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {api.envVars.map((v) => (
                      <code key={v} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px]">{v}</code>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Connection order (one at a time, test each)</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="ml-4 list-decimal space-y-1.5 text-sm text-muted-foreground">
            {dayOne.map((a) => (
              <li key={a.name}>
                <span className="font-medium text-foreground">{a.name}</span> — {a.role.toLowerCase()}
              </li>
            ))}
            <li>Hunter → Recraft → Merchant Center → Bing/IndexNow — completes the 13-connection checklist</li>
            <li>
              Then run the <span className="font-medium text-foreground">Brand Activation prompt</span> per brand (see The OS tab) — the system
              builds its own baseline, keyword universe and opportunity queue from there
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
