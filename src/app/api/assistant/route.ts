// ============================================================
// GROWTH AGENT (Sprout) — POST /api/assistant
// Agentic JSON protocol: the LLM answers either with a tool call
// or a final message; the server executes tools against the DB
// and loops until the final answer (max 6 steps).
// Falls back to a deterministic offline responder when no LLM
// provider is configured (e.g. Vercel without keys).
// v1.7: ALWAYS replies in English, strict execution discipline
// (every write is followed by a verification read), and the full
// conversation is persisted to ChatMessage (survives reloads).
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'
import { llmComplete } from '@/lib/assistant/llm'
import { executeTool, toolSpecPrompt, type ToolContext } from '@/lib/assistant/tools'
import { checkDataForSeoAuth, getDataForSeoConfig } from '@/lib/dataforseo'
import { getPorterConfig } from '@/lib/porter-mcp'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface IncomingMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ExecutedTool {
  name: string
  args: Record<string, unknown>
  summary: string
  ok: boolean
}

const MAX_STEPS = 6

function buildSystemPrompt(ctx: ToolContext, brand: { positioning: string; voice: string; approvedClaims: string; restrictedClaims: string; industry: string }, dataSources: string): string {
  return `You are Sprout — the AI growth agent embedded in the Organic Growth OS dashboard.
You operate the growth machine for the brand "${ctx.brandName}" (${ctx.brandDomain}, industry: ${brand.industry}).
Positioning: ${brand.positioning || 'n/a'}. Voice: ${brand.voice || 'n/a'}.
Approved claims: ${brand.approvedClaims || 'n/a'}. Restricted claims: ${brand.restrictedClaims || 'n/a'}.

YOUR JOB: answer questions AND take action. You are an operator, not a search box — when the user
asks for growth work, use the tools to read live system state and to queue/execute work
(tasks, keyword additions, content briefs, audits, approval decisions).

LANGUAGE RULE (CRITICAL): ALWAYS reply in ENGLISH — even when the user writes in Arabic,
French or any other language. Understand every language, but answer ONLY in English.
Keep UI terms in English.

EXECUTION DISCIPLINE (CRITICAL):
- The user's #1 requirement is that commands actually EXECUTE. NEVER just say "OK, I will do it".
  If the user asks to add/update/delete/change anything (keywords, tasks, content, approvals),
  you MUST call the tool that performs the write BEFORE answering.
- After any write tool (add_keywords, research_keywords, sync_gsc_keywords, create_task,
  update_task, delete_task, create_content_brief, decide_approval), ALWAYS call the matching
  read tool (list_keywords / list_tasks / list_content / list_approvals) to VERIFY the change
  landed, then report the verified result with exact counts (e.g. "the Keywords tab now shows
  34 keywords, 12 of them real GSC queries").
- If a write tool fails, quote its error message EXACTLY — it contains the fix (which
  credentials page to open, which account to connect). Never pretend a failed action succeeded.

LIVE DATA-SOURCE STATUS (checked moments ago — trust this, do not guess):
${dataSources}

AVAILABLE TOOLS:
${toolSpecPrompt()}

PROTOCOL — reply with ONE JSON object and nothing else (no markdown fences, no prose outside JSON):
1. To call a tool: {"action":"tool","tool":"<tool_name>","args":{...}}
2. When you have enough information to answer the user: {"action":"final","message":"<your answer>"}

RULES:
- Chain tools when useful (e.g. get_overview then list_opportunities) but at most ${MAX_STEPS} calls per turn.
- For decisions that materially change direction (spending, risky claims, link purchases), tell the user
  what you recommend and note that RED items live in the Owner Approval Queue — never fake an owner decision.
- Never invent statistics that are not in tool results. If numbers are asked for, call a tool.
  For REAL traffic numbers use get_real_stats (Google Search Console + GA4 via Porter) —
  it returns the only real clicks/impressions/sessions in this system.
- Data authenticity: keywords marked source GSC/DATAFORSEO are REAL (Search Console / DataForSEO); keywords
  marked DEMO or AGENT are estimates. The Live Stats page shows REAL GSC + GA4 numbers when connected.
  Other dashboard metrics (backlinks, AI visibility, opportunities) are demo/simulated until their APIs
  are connected — say so honestly when asked, and point to the exact fix.
- When the owner asks for new keywords: prefer sync_gsc_keywords (real, free) then research_keywords
  (real volumes via DataForSEO). Only fall back to add_keywords with your own ideas if neither works,
  and then say the volumes are unknown.
- Be concise and structured: short paragraphs, bullet lists, bold key numbers.
- If the user asks something outside SEO/growth for the brand, briefly steer back to what you can operate.`
}

function extractJson(text: string): { action: string; tool?: string; args?: Record<string, unknown>; message?: string } | null {
  let t = text.trim()
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(t.slice(start, end + 1))
  } catch {
    return null
  }
}

// ---------- deterministic offline responder (no LLM key configured) ----------

function fmtRows(rows: Array<Record<string, unknown>>, keys: string[]): string {
  return rows.map(r => '• ' + keys.filter(k => r[k] !== undefined && r[k] !== null).map(k => `**${r[k]}**`).join(' · ')).join('\n')
}

async function offlineRespond(message: string, ctx: ToolContext): Promise<{ reply: string; tools: ExecutedTool[] }> {
  const m = message.toLowerCase()
  const tools: ExecutedTool[] = []
  const run = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await executeTool(name, args, ctx)
    tools.push({ name, args, summary: r.summary, ok: r.ok })
    return r
  }

  const has = (...words: string[]) => words.some(w => m.includes(w))

  if (has('overview', 'status', 'summary', 'how are', 'كيف', 'ملخص', 'حالة')) {
    const r = await run('get_overview')
    const d = r.data as Record<string, unknown>
    const report = d.latestReport as Record<string, string> | null
    return {
      reply: `**${ctx.brandName} — overview (demo data)**\n• Keywords tracked: **${d.keywordsTracked}** (${d.keywordsTop10} in top 10)\n• Open opportunities: **${d.openOpportunities}**\n• Content: **${d.contentPublished}** published / ${d.contentTotal} total\n• Active referring domains: **${d.activeReferringDomains}**\n• AI mention rate: **~${d.aiMentionRateApprox}%**\n• Pending approvals: **${d.pendingApprovals}** · Open tasks: **${d.openTasks}**\n\n_Verdict (latest report): ${report?.verdict ?? 'n/a'}_`,
      tools,
    }
  }
  if (has('keyword', 'كلمة', 'كلمات')) {
    const r = await run('list_keywords', { limit: 10 })
    return { reply: `**Top tracked keywords (demo data)**\n${fmtRows(r.data as Array<Record<string, unknown>>, ['term', 'volume', 'position', 'intent'])}\n\nPosition = current rank (empty = not ranking yet).`, tools }
  }
  if (has('opportunit', 'فرص', 'أولويات')) {
    const r = await run('list_opportunities', { limit: 8 })
    return { reply: `**Top opportunities by VALUE score (demo data)**\n${fmtRows(r.data as Array<Record<string, unknown>>, ['title', 'score', 'autonomy', 'status'])}`, tools }
  }
  if (has('task', 'مهام', 'مهامي')) {
    const r = await run('list_tasks', {})
    return { reply: `**Task queue**\n${fmtRows(r.data as Array<Record<string, unknown>>, ['title', 'type', 'status', 'priority'])}`, tools }
  }
  if (has('audit', 'فحص', 'تدقيق')) {
    const r = await run('run_site_audit')
    const d = r.data as { findings: Array<{ check: string; status: string; detail: string }> }
    return { reply: `**Site audit — ${ctx.brandDomain}** (simulated checks; real crawl when DataForSEO/OpenSEO is connected)\n${d.findings.map(f => `• ${f.status === 'PASS' ? '✅' : '⚠️'} **${f.check}** — ${f.detail}`).join('\n')}`, tools }
  }
  if (has('ai', 'visibility', 'chatgpt', 'perplexity', 'الذكاء')) {
    const r = await run('ai_visibility')
    return { reply: `**AI visibility (GEO) prompts**\n${fmtRows(r.data as Array<Record<string, unknown>>, ['prompt', 'chatgpt', 'perplexity', 'claude', 'competitor'])}\n(true = brand mentioned)`, tools }
  }
  return {
    reply: `I'm Sprout, the growth agent for **${ctx.brandName}** — but I'm currently in **offline mode** (no AI provider key saved yet).

I can still run system commands for you right now — try:
• "show me the overview" / "ملخص"
• "list keywords" / "الكلمات"
• "top opportunities" / "الفرص"
• "run a site audit" / "فحص الموقع"

**To unlock full intelligence** (analysis, planning, content briefs, task creation from natural language), open the **API Keys** tab (System → API Keys) in the sidebar and paste an Anthropic API key (recommended — console.anthropic.com, ~$5 to start) or an OpenAI key. It takes effect immediately — no server access needed.`,
    tools,
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded()
    const body = await req.json().catch(() => ({}))
    const incoming: IncomingMessage[] = Array.isArray(body.messages) ? body.messages : []
    const brandSlug = String(body.brandSlug || 'holy_strips')
    const userText = incoming.filter(m => m.role === 'user').slice(-1)[0]?.content || ''

    const brand = await db.brand.findUnique({ where: { slug: brandSlug } })
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // ---------- persist the user message (chat history survives reloads) ----------
    if (userText.trim()) {
      await db.chatMessage.create({
        data: { brandId: brand.id, role: 'user', content: userText.slice(0, 8000) },
      }).catch(() => { /* history is best-effort — never block the reply */ })
    }

    /** Persist the assistant reply and return the response in one place. */
    const finish = async (reply: string, tools: ExecutedTool[], provider: string | null) => {
      await db.chatMessage.create({
        data: {
          brandId: brand.id,
          role: 'assistant',
          content: reply.slice(0, 8000),
          toolsJson: JSON.stringify(tools).slice(0, 12000),
          provider: provider || '',
        },
      }).catch(() => { /* history is best-effort */ })
      return NextResponse.json({ reply, tools, provider, saved: true })
    }

    const ctx: ToolContext = {
      brandId: brand.id,
      brandName: brand.name,
      brandDomain: brand.domain,
      brandSlug: brand.slug,
      // funnels keyword writes through the route that owns the data
      appOrigin: req.nextUrl.origin || `https://${req.headers.get('host') || ''}`,
    }

    // ---------- live data-source states (so Sprout never guesses) ----------
    const [dfsCfg, dfsAuth, porterCfg, kwStats] = await Promise.all([
      getDataForSeoConfig().catch(() => null),
      checkDataForSeoAuth().catch(() => null),
      getPorterConfig().catch(() => null),
      db.keyword.groupBy({ by: ['source'], _count: { _all: true }, where: { brandId: brand.id } }).catch(() => [] as Array<{ source: string; _count: { _all: number } }>),
    ])
    const dfsLine = !dfsCfg
      ? '• DataForSEO: NOT CONFIGURED — no login/password saved on the API Keys page.'
      : dfsAuth?.ok
        ? `• DataForSEO: CONNECTED${typeof dfsAuth.balance === 'number' ? ` (balance $${dfsAuth.balance.toFixed(2)})` : ''} — research_keywords works.`
        : `• DataForSEO: REJECTED — ${dfsAuth?.message || 'credentials rejected'} Until fixed, research_keywords will fail; use sync_gsc_keywords instead.`
    const kwLine = (kwStats && Array.isArray(kwStats) && kwStats.length)
      ? kwStats.map(g => `${g._count._all} ${g.source}`).join(', ')
      : 'none yet'
    const dataSources = [
      dfsLine,
      porterCfg?.accessToken
        ? '• Porter Metrics / Google Search Console: CONNECTED — sync_gsc_keywords works and Live Stats shows real GSC + GA4 numbers.'
        : '• Porter Metrics / Google Search Console: NOT CONNECTED — the owner must open the Live Stats page and press Connect Porter.',
      `• Keyword universe for this brand: ${kwLine} (GSC/DATAFORSEO = real, DEMO/AGENT = estimates).`,
    ].join('\n')

    // ---------- agent loop (first call doubles as provider probe) ----------
    const system = buildSystemPrompt(ctx, brand, dataSources)
    const history = incoming
      .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-12)
      .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))

    const convo: Array<{ role: 'user' | 'assistant'; content: string }> = [...history]
    const executed: ExecutedTool[] = []
    let provider: string | null = null
    let llmAvailable = false

    const forceFinal = async (): Promise<string> => {
      const synth = `${system}\n\nCRITICAL: You have already executed your tool calls and their results are in the conversation. You MUST now reply with ONLY the final JSON object: {"action":"final","message":"<your answer>"}. Do NOT call any more tools. Compose the answer to the user now.`
      try {
        const r = await llmComplete(synth, convo)
        if (!r) return ''
        const parsed = extractJson(r.text)
        provider = r.provider
        if (parsed?.message) return String(parsed.message)
        // model still tried a tool call — do not leak protocol JSON to the user
        return ''
      } catch {
        return ''
      }
    }

    let result = await llmComplete(system, convo)
    if (result) llmAvailable = true

    for (let step = 0; step < MAX_STEPS && result; step++) {
      provider = result.provider
      const parsed = extractJson(result.text)

      if (parsed?.action === 'tool' && parsed.tool) {
        const args = (parsed.args && typeof parsed.args === 'object' ? parsed.args : {}) as Record<string, unknown>
        const toolResult = await executeTool(parsed.tool, args, ctx)
        executed.push({ name: parsed.tool, args, summary: toolResult.summary, ok: toolResult.ok })
        // feed result back
        const stepsLeft = MAX_STEPS - step - 1
        convo.push({ role: 'assistant', content: JSON.stringify({ action: 'tool', tool: parsed.tool, args }) })
        convo.push({
          role: 'user',
          content: `TOOL_RESULT (${parsed.tool}) → ${JSON.stringify({ ok: toolResult.ok, summary: toolResult.summary, data: toolResult.data }).slice(0, 2500)}\n${stepsLeft <= 2 ? `NOTE: only ${stepsLeft} step(s) left — compose your final answer now using {"action":"final","message":"..."}. ` : ''}Continue with the protocol: another {"action":"tool",...} or {"action":"final","message":"..."}.`,
        })
        result = await llmComplete(system, convo)
        continue
      }

      if (parsed?.action === 'final' && parsed.message) {
        return finish(String(parsed.message), executed, provider)
      }

      // Non-JSON or malformed → treat as final answer text (graceful degradation)
      const text = result.text.trim()
      if (text && !text.startsWith('{"action"')) {
        return finish(text, executed, provider)
      }
      result = await llmComplete(system, convo)
    }

    if (llmAvailable) {
      // Step limit reached (or a step failed) — force a synthesis answer
      const synthesis = await forceFinal()
      if (synthesis) {
        return finish(synthesis, executed, provider)
      }
      return finish(
        executed.length
          ? `I ran ${executed.length} tool ${executed.length === 1 ? 'call' : 'calls'}:\n${executed.map(t => `• **${t.name}** — ${t.summary}`).join('\n')}\n\n(The language provider throttled me before I could compose the full answer — ask me to continue.)`
          : 'I could not complete that request — the AI provider is busy. Please try again in a moment.',
        executed,
        provider,
      )
    }

    // ---------- offline path (no LLM provider reachable) ----------
    const offline = await offlineRespond(userText, ctx)
    return finish(offline.reply, offline.tools, 'offline')
  } catch (e) {
    console.error('[assistant] error:', e)
    return NextResponse.json(
      { reply: 'The agent hit an internal error. Try again in a moment.', tools: [], provider: 'error' },
      { status: 200 },
    )
  }
}
