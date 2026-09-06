import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'

export const dynamic = 'force-dynamic'

const ENGINES = [
  { key: 'chatgptMentioned', label: 'ChatGPT' },
  { key: 'geminiMentioned', label: 'Gemini' },
  { key: 'perplexityMentioned', label: 'Perplexity' },
  { key: 'claudeMentioned', label: 'Claude' },
  { key: 'copilotMentioned', label: 'Copilot' },
] as const

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

    const engineStats = ENGINES.map(({ key, label }) => {
      const mentioned = prompts.filter((p) => p[key]).length
      return {
        label,
        mentioned,
        total: prompts.length,
        rate: prompts.length ? Math.round((mentioned / prompts.length) * 100) : 0,
      }
    })

    const mentionedPrompts = prompts.filter((p) =>
      p.chatgptMentioned || p.geminiMentioned || p.perplexityMentioned || p.claudeMentioned || p.copilotMentioned
    )

    return NextResponse.json({
      prompts,
      engineStats,
      summary: {
        totalPrompts: prompts.length,
        mentioned: mentionedPrompts.length,
        mentionRate: prompts.length ? Math.round((mentionedPrompts.length / prompts.length) * 100) : 0,
        improving: prompts.filter((p) => p.trend === 'IMPROVING').length,
        declining: prompts.filter((p) => p.trend === 'DECLINING').length,
        commercial: prompts.filter((p) => ['COMMERCIAL', 'RECOMMENDATION'].includes(p.category)).length,
        avgRankWhenMentioned: mentionedPrompts.length
          ? Math.round((mentionedPrompts.reduce((s, p) => s + p.rankWhenMentioned, 0) / mentionedPrompts.length) * 10) / 10
          : 0,
      },
    })
  } catch (e) {
    console.error('ai-visibility error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
