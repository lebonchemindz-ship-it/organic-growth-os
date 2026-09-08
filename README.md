# Organic Growth OS 🌱

**An autonomous organic growth operating system** — the web dashboard for the "Organic Growth OS" architecture: one system, one shared tool stack, many brands. It runs SEO, AEO (answer engines), GEO (AI search), content production, publisher outreach and authority building as a continuous machine — with a strict autonomy hierarchy so the owner only intervenes for genuinely consequential decisions.

> Built with Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Prisma · Recharts

---

## ⚠️ Important: the numbers are simulated (demo data)

**All metrics visible in this dashboard are realistic placeholder data, not real data.** Keyword volumes, ranking positions, traffic estimates, AI visibility scores, backlinks, outreach states and weekly reports were **seeded to demonstrate the system** — they are **not** actual measurements from holystrips.com (or any other brand domain).

The dashboard is the *control room*; the numbers become real once you connect the live data sources (DataForSEO, Google Search Console, GA4, Shopify, Anthropic, Hunter…) listed under the **"APIs Required"** tab. Until those connections exist, treat every statistic as illustrative. The UI labels this clearly with an amber "Demo data — not live metrics" badge and banner.

---

## What this is

This dashboard mirrors the full architecture designed in the original Organic Growth OS blueprint:

| Layer | What it holds | In this app |
|---|---|---|
| **Layer 1 — The OS** | Master prompt (`CLAUDE.md`) installed once in Claude: identity, decision engine, autonomy rules, all growth engines, daily loop, weekly owner report | 📋 "The OS — Prompt" tab (copyable) |
| **Layer 2 — Shared infra** | Supabase, DataForSEO MCP, Activepieces, Anthropic API, Hunter, Recraft — connected once | 🔌 "Integrations" tab (13-connection checklist) |
| **Layer 3 — Brands** | Each brand gets its own truth, keywords, competitors, content, outreach — isolated by `brand_id` | 🏢 "Brands" tab (Holy Strips, Armoray, Zero Trace, Fully Nutrition) |

### Core concepts implemented

- **Sprout — the AI Growth Agent** 🤖 — a floating chat agent (bottom-right) that you can actually give tasks to. It reads live system state, runs site audits, queues tasks on the task board, creates content briefs, adds keywords and executes approval decisions — in any language you write (Arabic included). See below.
- **Decision & Autonomy Engine** — every opportunity scored by `VALUE = Impact × Probability × Confidence × Strategic Value × Urgency` (effort-adjusted)
- **Autonomy levels** — 🟢 GREEN executes automatically · 🟡 YELLOW executes at 85%+ confidence · 🔴 RED waits in the Owner Approval Queue **without stopping anything else**
- **Keyword universe** — GSC + DataForSEO + AI query patterns, positions 4-20 prioritized (the refresh sweet spot)
- **Content pipeline** — Brief → Draft → Fact-check → Optimize → Image (Recraft) → Link → Schedule → Publish → Monitor → Refresh
- **Outreach engine** — publisher qualification (min 70/100), 30 contacts/day cap, Day 1 / Day 5 / Day 12 sequences, never spam
- **GEO engine** — brand mention tracking across ChatGPT, Gemini, Perplexity, Claude and Copilot
- **Weekly Owner Report** — one report with a verdict: `YES — strong evidence`, `YES — early positive`, `TOO EARLY`, `MIXED`, or `NO — change required`

---

## 🤖 Sprout — the AI Growth Agent (chatbot)

An agentic assistant embedded in the dashboard. It is **not** a search box — it is an operator with 15 executable tools:

| Category | Tools |
|---|---|
| Read state | `get_overview` · `list_keywords` · `list_opportunities` · `list_content` · `outreach_status` · `ai_visibility` · `list_approvals` · `latest_weekly_report` |
| Do work | `create_task` · `update_task` · `add_keywords` · `create_content_brief` · `run_site_audit` · `decide_approval` |
| Task board | persistent Task table + `/api/tasks` (GET/PATCH) — every action it takes is logged in the brand activity feed |

**How it works:** server-side agent loop (`POST /api/assistant`) — the LLM replies with either a tool call or a final answer (JSON protocol); the server executes tools against the database and loops (max 6 steps) until the answer is composed. Every write is branded, permission-checked and logged as a SystemEvent.

**Providers (in order):** `ANTHROPIC_API_KEY` (recommended) → `OPENAI_API_KEY` → sandbox SDK. Without a key the agent runs in an honest **offline mode**: it still executes system commands (overview, keywords, opportunities, audits) via deterministic parsing and tells you how to enable full intelligence. The toolset mirrors the [OpenSEO](https://github.com/every-app/open-seo) MCP categories (keyword research, rank tracking, backlinks, site audit, AI visibility) — connect OpenSEO or DataForSEO to swap simulated data for live SEO data.

---

## 🔑 API Keys — the credential vault (save keys in the dashboard)

You no longer need the Vercel dashboard or a terminal to connect services. Open **System → API Keys** in the sidebar and paste each key once:

- **Encrypted at rest** — AES-256-GCM in the app database; the UI only shows masked values (`sk-a•••f21x`).
- **Permanent storage, no redeploys** — when `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` are configured, every saved key is also written to the Vercel project's environment variables as runtime-readable values. Every new server instance **restores the vault from that backup automatically on cold start** — no rebuild, no waiting, nothing to click.
- **Immediate effect** — the Sprout agent and the LLM provider chain read the vault first, so a saved Anthropic/OpenAI key wakes the chatbot up **without any redeploy**.
- **Test connection** — one click verifies Anthropic, OpenAI, DataForSEO (shows balance), Hunter, Supabase and Shopify keys against the live services.
- **PIN protection** — set `SETTINGS_PIN` and the dashboard asks for it before saving/removing keys.

Routes: `GET /api/keys` (masked states) · `POST /api/keys` (save + env backup) · `DELETE /api/keys?service=` · `POST /api/keys/test` (live connection tests) · `POST /api/keys/verify` (PIN check + backup restore).

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
| `POST /api/assistant` | **Sprout agent** — chat + tool execution loop |
| `GET /api/tasks?brand=` · `PATCH /api/tasks` | **Task board** — the agent's persistent task queue |
| `GET /api/keys` · `POST` / `DELETE` | **Credential vault** — masked states, save (encrypted + env sync), remove |
| `POST /api/keys/test` · `POST /api/keys/redeploy` | Verify a saved key live · apply env backup |
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
prisma/schema.prisma          # Full OS data model (13 tables, brand_id isolation)
scripts/seed.ts               # Deterministic demo data
src/app/page.tsx              # Single-page dashboard shell (12 sections + agent)
src/app/api/*                 # 14 REST endpoints (incl. assistant + tasks)
src/components/organic/*      # Section components + assistant-panel.tsx
src/lib/assistant/llm.ts      # LLM provider chain (Anthropic → OpenAI → sandbox)
src/lib/assistant/tools.ts    # 15 agent tools (read state + do work)
src/lib/seed-app.ts           # Reusable seed (auto-seed on cold start)
src/lib/ensure-seed.ts        # Empty-database detection
```

## License

MIT — build genuine brands that deserve sustained visibility across search and AI discovery.
