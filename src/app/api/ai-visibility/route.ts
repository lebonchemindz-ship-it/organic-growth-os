import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'
import { checkAiMentions } from '@/lib/growth-engine'
import { getCredentialValues } from '@/lib/credentials'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ENGINES = [
  { key: 'chatgptMentioned', label: 'ChatGPT', provider: 'openai' },
  { key: 'geminiMentioned', label: 'Gemini', provider: null },
  { key: 'perplexityMentioned', label: 'Perplexity', provider: null },
  { key: 'claudeMentioned', label: 'Claude', provider: 'anthropic' },
  { key: 'copilotMentioned', label: 'Copilot', provider: null },
] as const

/** Which LLM providers have a usable key right now (vault or env). */
async function providerAvailability(): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {}
  for (const p of ['openai', 'anthropic']) {
    try {
      const cred = await getCredentialValues(p)
      const envKey = p === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY
      out[p] = Boolean(cred?.apiKey || envKey)
    } catch {
      out[p] = Boolean(p === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY)
    }
  }
  return out
}

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded()
    const brandSlug = req.nextUrl.searchParams.get('brand') || 'holy_strips'
    const brand = await db.brand.findUnique({ where: { slug: brandSlug } })
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

    const prompts = await db.aiPrompt.findMany({
      where: { brandId: brand.id },
      orderBy: { createdAt: 'asc' },
    })
    const available = await providerAvailability()

    // engineStats now tell the truth per engine: 'measured' = this engine's
    // answers were actually checked via a real LLM call (checkedVia records
    // the provider), 'ready' = key present but not checked yet,
    // 'no_key' = provider key missing, 'n/a' = engine not integrated.
    const engineStats = ENGINES.map(({ key, label, provider }) => {
      const mentioned = prompts.filter((p) => p[key]).length
      let status: 'measured' | 'ready' | 'no_key' | 'n/a' = 'n/a'
      if (provider) {
        const measured = prompts.some((p) => p.checkedVia === provider)
        status = measured ? 'measured' : available[provider] ? 'ready' : 'no_key'
      }
      return {
        label,
        mentioned,
        total: prompts.length,
        rate: prompts.length ? Math.round((mentioned / prompts.length) * 100) : 0,
        status,
      }
    })

    // mention rate over prompts measured via real LLM answers only
    const llmPrompts = prompts.filter((p) => p.source === 'LLM')
    const rateBase = llmPrompts.length > 0 ? llmPrompts : prompts
    const mentionedPrompts = rateBase.filter((p) =>
      p.chatgptMentioned || p.geminiMentioned || p.perplexityMentioned || p.claudeMentioned || p.copilotMentioned
    )
    const lastCheckedAt = llmPrompts.length > 0
      ? llmPrompts.reduce((max, p) => (p.lastCheckedAt > max ? p.lastCheckedAt : max), llmPrompts[0].lastCheckedAt)
      : null

    return NextResponse.json({
      prompts,
      engineStats,
      summary: {
        totalPrompts: prompts.length,
        mentioned: mentionedPrompts.length,
        mentionRate: rateBase.length ? Math.round((mentionedPrompts.length / rateBase.length) * 100) : 0,
        real: llmPrompts.length > 0,
        checkedPrompts: llmPrompts.length,
        lastCheckedAt,
        improving: prompts.filter((p) => p.trend === 'IMPROVING').length,
        declining: prompts.filter((p) => p.trend === 'DECLINING').length,
        commercial: prompts.filter((p) => ['COMMERCIAL', 'RECOMMENDATION'].includes(p.category)).length,
        avgRankWhenMentioned: mentionedPrompts.length
          ? Math.round((mentionedPrompts.reduce((s, p) => s + p.rankWhenMentioned, 0) / mentionedPrompts.length) * 10) / 10
          : 0,
      },
      canCheck: available.anthropic || available.openai,
    })
  } catch (e) {
    console.error('ai-visibility error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// Run a LIVE AI mention check: builds priority prompts from the real
// GSC queries, asks the configured LLM and records honest results.
export async function POST(req: NextRequest) {
  try {
    await ensureSeeded()
    const body = await req.json().catch(() => ({}))
    const brandSlug = String(body.brandSlug || 'holy_strips')
    const limit = Math.min(Math.max(Number(body.limit) || 10, 5), 15)
    const brand = await db.brand.findUnique({ where: { slug: brandSlug } })
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

    const result = await checkAiMentions(brand.id, brand.name, brand.domain, limit)
    if (!result.ok) {
      const status = result.code === 'no_llm' ? 400 : 400
      return NextResponse.json({ error: result.code, message: result.message }, { status })
    }
    return NextResponse.json(result)
  } catch (e) {
    console.error('ai-visibility check error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
