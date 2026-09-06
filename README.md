# Organic Growth OS 🌱

**An autonomous organic growth operating system** — the web dashboard for the "Organic Growth OS" architecture: one system, one shared tool stack, many brands. It runs SEO, AEO (answer engines), GEO (AI search), content production, publisher outreach and authority building as a continuous machine — with a strict autonomy hierarchy so the owner only intervenes for genuinely consequential decisions.

> Built with Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Prisma · Recharts

---

## What this is

This dashboard mirrors the full architecture designed in the original Organic Growth OS blueprint:

| Layer | What it holds | In this app |
|---|---|---|
| **Layer 1 — The OS** | Master prompt (`CLAUDE.md`) installed once in Claude: identity, decision engine, autonomy rules, all growth engines, daily loop, weekly owner report | 📋 "The OS — Prompt" tab (copyable) |
| **Layer 2 — Shared infra** | Supabase, DataForSEO MCP, Activepieces, Anthropic API, Hunter, Recraft — connected once | 🔌 "Integrations" tab (13-connection checklist) |
| **Layer 3 — Brands** | Each brand gets its own truth, keywords, competitors, content, outreach — isolated by `brand_id` | 🏢 "Brands" tab (Holy Strips, Armoray, Zero Trace, Fully Nutrition) |

### Core concepts implemented

- **Decision & Autonomy Engine** — every opportunity scored by `VALUE = Impact × Probability × Confidence × Strategic Value × Urgency` (effort-adjusted)
- **Autonomy levels** — 🟢 GREEN executes automatically · 🟡 YELLOW executes at 85%+ confidence · 🔴 RED waits in the Owner Approval Queue **without stopping anything else**
- **Keyword universe** — GSC + DataForSEO + AI query patterns, positions 4-20 prioritized (the refresh sweet spot)
- **Content pipeline** — Brief → Draft → Fact-check → Optimize → Image (Recraft) → Link → Schedule → Publish → Monitor → Refresh
- **Outreach engine** — publisher qualification (min 70/100), 30 contacts/day cap, Day 1 / Day 5 / Day 12 sequences, never spam
- **GEO engine** — brand mention tracking across ChatGPT, Gemini, Perplexity, Claude and Copilot
- **Weekly Owner Report** — one report with a verdict: `YES — strong evidence`, `YES — early positive`, `TOO EARLY`, `MIXED`, or `NO — change required`

---

## Getting started

```bash
# install
bun install

# configure the database (SQLite for local dev)
echo 'DATABASE_URL="file:./db/custom.db"' > .env

# create schema
bun run db:push

# run
bun run dev
```

The app **auto-seeds** demo data on first request (4 brands, keywords, opportunities, content, outreach, AI prompts, reports) — so it works immediately in any fresh environment, including serverless.

### Optional: re-seed manually

```bash
bun run scripts/seed.ts
```

---

## API routes

| Route | Purpose |
|---|---|
| `GET /api/overview?brand=` | Dashboard KPIs, weekly history, autonomy mix, activity feed |
| `GET /api/brands` | Brand fleet + per-brand stats |
| `GET /api/keywords?brand=` | Keyword universe + summary |
| `GET /api/opportunities?brand=` | Decision engine queue (scored) |
| `GET /api/content?brand=` | Content pipeline + stage counts |
| `GET /api/outreach?brand=` | Publishers, sequences, backlink ledger |
| `GET /api/ai-visibility?brand=` | GEO prompts + per-engine stats |
| `GET /api/approvals?brand=` · `PATCH /api/approvals` | Owner approval queue (approve/reject) |
| `GET /api/reports?brand=` | Weekly reports + archive |
| `GET /api/integrations` | The 13-connection checklist |
| `GET /api/master-prompt` | The full CLAUDE.md OS prompt + brand activation prompt |
| `GET /api/health` | Liveness + database check |

---

## APIs you need to connect for real operation

See the **"APIs Required"** tab inside the app for the full breakdown (auth, pricing, env vars, docs). Summary:

**Day one (required):** Anthropic API (the brain) · Supabase (persistent memory) · DataForSEO (SEO/GEO intelligence) · Activepieces (24/7 scheduler) · GSC + GA4 (per brand) · Shopify (per brand)

**Week one:** Hunter.io (outreach) · Merchant Center (product search) · Bing Webmaster + IndexNow

**When content scales:** Recraft API (editorial imagery)

**Total ≈ $85–225/mo — replaces $250–500/mo of overlapping SEO tools.**

```env
# .env example
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_SECRET_KEY=
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=
ACTIVEPIECES_API_KEY=
HUNTER_API_KEY=
RECRAFT_API_KEY=
GSC_SITE_URL=
GA4_PROPERTY_ID=
SHOPIFY_STORE_DOMAIN=
SHOPIFY_ACCESS_TOKEN=
MERCHANT_ID=
BING_API_KEY=
INDEXNOW_KEY=
```

---

## Guardrails baked into the design

Never: fabricate reviews · impersonate customers · manufacture Reddit conversations · fabricate studies or statistics · publish unsupported health claims · use PBNs · send generic mass outreach · buy links without approval · sacrifice brand credibility for ranking metrics.

---

## Project structure

```
prisma/schema.prisma          # Full OS data model (12 tables, brand_id isolation)
scripts/seed.ts               # Deterministic demo data
src/app/page.tsx              # Single-page dashboard shell (12 sections)
src/app/api/*                 # 12 REST endpoints
src/components/organic/*      # Section components
src/lib/seed-app.ts           # Reusable seed (auto-seed on cold start)
src/lib/ensure-seed.ts        # Empty-database detection
```

## License

MIT — build genuine brands that deserve sustained visibility across search and AI discovery.
