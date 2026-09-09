---
name: porter-metrics
description: >-
  Use the Porter Metrics connector correctly. Load this whenever the user
  mentions Porter, Porter Metrics, or wants marketing data from ad platforms
  (Meta/Facebook Ads, Google Ads, GA4, TikTok, LinkedIn, Shopify, Stripe, …), saved
  blends, hosted reports, write-back actions, or marketing creative (AI
  images, video, voiceover) through Porter. Covers the right first steps
  (whoami, get_knowledge, connect an account), how to read data, how to reach
  the 750+ action catalog, how to recover when no accounts show up, and when to
  report a Porter bug or request a missing feature.
---

# Using the Porter Metrics connector

Porter Metrics is the marketing operating system — one connector with the
tools a marketer or data analyst uses day to day. Beyond live data from 25+
ad-platform and marketing connectors, blends and hosted dashboards, it also
generates AI creative (images, video, text-to-speech voiceover), manages
campaigns on the ad platforms, drives CRM/email marketing, e-commerce, SEO
research and web scraping. The connector exposes 28 fixed tools in five
groups — but the fixed list is NOT the limit: the long tail (750+ operations,
including all creative generation) lives behind `list_actions` /
`execute_action`. Search there before concluding Porter lacks a capability.

## The one habit that makes Porter work

`get_knowledge` is Porter's built-in manual — semantic search over its how-to
skills, error→fix patterns and FAQs. Consulting it at the right moments is what
separates a smooth session from one that guesses at tools and gives up:

- **Before the first data pull, blend, or report against a connector not yet
  used in this conversation** — it returns the field names, prerequisites and
  quirks that connector expects, so the first `query_data` succeeds.
- **On any unexpected error or empty result** — pass the error text as one of
  the `queries`; the KB pairs known errors with their fixes.
- **When the user asks what Porter can do, or how a Porter flow works.**

Pass `queries` as 3–5 rephrasings of the same intent (vary the verb, add
synonyms, mix English/Spanish) — they fuse into one ranked result set.

## Tool groups

- **Management** — `whoami` (who you are + company), `list_connectors` (every
  connector, destination and third-party app, with connection status),
  `list_accounts` (accounts for a connector), `connect_account` (returns an
  authorization URL the user opens in the browser), `disconnect_account`,
  `get_knowledge`, `prepare_upload` (signed URL for heavy payloads).
- **Analytics** — `list_fields`, `query_data` (live pull across accounts),
  `bigquery_join`, `query_blend`, and blend CRUD (`list_blends`, `get_blend`,
  `create_blend`, `update_blend`, `delete_blend`).
- **Reports** — hosted dashboards at `report.portermetrics.com/<id>`:
  `list_reports`, `get_report`, `preview_report`, `create_report`,
  `edit_report`, `duplicate_report`, `delete_report`, `share_report`.
- **Actions** — everything else is an *action* discovered by intent:
  `list_actions(task="…")` → pick one → `execute_action(action, account_id?,
  params)`. The catalog spans ~40 categories: **creative generation (AI
  images, video — text→image, image→video, talking-head —, and text-to-speech
  voiceover)**, ad-platform campaign management (Google/Meta/TikTok/LinkedIn/
  Microsoft/Pinterest/X/Apple/DV360), CRM & email (HubSpot, Klaviyo,
  Mailchimp, ActiveCampaign), e-commerce (Shopify, WooCommerce, Amazon),
  payments and billing (Stripe: charges, refunds, payouts, invoices,
  subscriptions, MRR/churn — read through `query_data`), SEO/SERP research,
  web scraping, blend exports, report email schedules,
  triggers and more.
- **Support** — `report_bug` and `request_feature`, for when Porter itself is
  the problem. See below.

## First run — nobody has connected anything yet

When `list_accounts` (or `list_connectors(connected_only=true)`) comes back
**empty, it means the user has connected nothing yet** — not that Porter has no
data or no connectors. An empty list is never a reason to conclude Porter is
broken. Do this instead:

1. `list_connectors` (no filter) to show the catalog. Slug connectors as it
   returns them: `facebook-ads`, `google-ads`, `google-analytics-4`,
   `tiktok-ads`, `shopify`, `stripe`, …
2. `connect_account(connector="facebook-ads")` → it returns an
   `authorization_url`. **Give that URL to the user and wait** — the OAuth
   happens in their browser; the connector cannot complete it for them.
3. After they confirm, `list_accounts(connector="facebook-ads")` lists their
   accounts. If it's still empty, wait a moment and retry once.

Each account carries a `connection_status`: `connected` (already used in
Porter) or `available` (the platform reports it, but Porter hasn't queried it
yet; billing starts on the first `query_data`). Pass the opaque `account_id`
verbatim into `query_data` and `execute_action` — never truncate or rebuild it.

## Reading data

`list_fields(connector=…)` gives the valid metric/dimension names, then run a
small `query_data` (e.g. last 7 days, 2–3 metrics, include `campaign_name` so
rows label themselves). Reply with the numbers in chat. For a recurring or
cross-connector analysis, save a **blend**; for a shareable dashboard URL,
create a **hosted report** (not a chat table).

## Recovering from errors

Every tool returns a plain object; on failure it carries `error_type`,
`message`, and a `hint` naming the next tool to call. Follow the `hint`.
`execute_action` failures also fill `knowledge` with related KB entries you can
open with `get_knowledge`. When a `hint` or error is unfamiliar, call
`get_knowledge` with the error text as one of the queries before retrying.

## When Porter itself is the problem

Two tools escalate to Porter's team. They are deliberately asymmetric.

**`report_bug`** — Porter is genuinely broken. Call it **yourself, without
asking permission**: the user already told you something failed, and asking
again just loses the report. Tell them afterwards that you filed it and that
bugs reported this way are normally fixed **within 24 hours**. Send
`error_text` (the verbatim error or traceback) and `tool_params` (the failing
call's arguments) — they are what makes it reproducible. Credentials and
oversized values are stripped server-side, so pass what you already have rather
than interrogating the user for it.

**`get_knowledge` is the gate.** Pass the error text as one of the queries
first. If the KB explains the failure, it is not a bug — apply the fix. Only
escalate what the KB does not explain. These are **not** bugs, and filing them
buries the real ones:

| What you see | What it actually is |
|---|---|
| Empty `list_accounts` | A first-run user who connected nothing — `connect_account` |
| Auth / expired-credential error | Their own 3P authorization lapsed — `connect_account` |
| "Unknown field" / "invalid parameter" | A bad argument you passed — fix it from `list_fields` |
| Connector lacks a field or operation | A limit, not a defect — `request_feature` |

**`request_feature`** — Porter works but lacks something the user needs. Search
`list_actions(task="…")` first; the fixed tools are not Porter's limit, and
requesting something that already ships wastes everyone's time. When you find a
real gap, propose it: tell the user what is missing, show them the request, and
ask whether to send it. It only sends with `user_approved=true`, and you must
**never set that on your own** — the request speaks for the user about what they
want. Make `current_behavior` (the concrete limit today) and `expected_behavior`
(how they expect it to work) specific; that contrast is what product triages on.
Never promise a delivery date.

## Common intents → where to go

| The user wants… | Do this |
|---|---|
| "what can Porter do?" | `get_knowledge(queries=["what can Porter do","getting started"])` |
| "show my Facebook/Google spend" | `list_accounts` → `list_fields` → `query_data` |
| "I don't see any accounts" | First-run flow above: `list_connectors` → `connect_account` |
| "blend Facebook + Google daily" | `create_blend` (+ a scheduled export action) |
| "give me a shareable report" | `create_report` → `share_report` |
| "pause campaigns / write back" | `list_actions(task=…)` → `execute_action` |
| "generate an image / video / voiceover ad" | `list_actions(task="generate …")` → `execute_action` (`creative.*`, `audio.*`) |
| "this is broken / Porter has a bug" | `get_knowledge` with the error text → if unexplained, `report_bug` |
| "can Porter add X?" | `list_actions(task="X")` → if truly absent, propose `request_feature`, then ask before sending |
