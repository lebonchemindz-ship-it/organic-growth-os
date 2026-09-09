// ============================================================
// AGENT CHAT HISTORY — /api/assistant/messages
// GET    → ?brand=holy_strips&limit=200 — the persisted Sprout
//          conversation (user + assistant messages, tools, provider)
// DELETE → ?brand=…&id=<messageId>  — delete ONE message
// DELETE → ?brand=…&all=1           — clear the whole conversation
// The chat survives page reloads and server restarts; the owner
// can delete any message or wipe the history at any time.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'

export const dynamic = 'force-dynamic'

interface StoredTool {
  name: string
  args?: Record<string, unknown>
  summary?: string
  ok?: boolean
}

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded()
    const brandSlug = req.nextUrl.searchParams.get('brand') || 'holy_strips'
    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 200, 1), 500)

    const brand = await db.brand.findUnique({ where: { slug: brandSlug } })
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

    const rows = await db.chatMessage.findMany({
      where: { brandId: brand.id },
      orderBy: { createdAt: 'asc' },
      take: limit,
    })

    const messages = rows.map((m) => {
      let tools: StoredTool[] = []
      try {
        tools = m.toolsJson ? (JSON.parse(m.toolsJson) as StoredTool[]) : []
      } catch {
        tools = []
      }
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        tools,
        provider: m.provider,
        createdAt: m.createdAt,
      }
    })

    return NextResponse.json({
      brand: { slug: brand.slug, name: brand.name },
      count: messages.length,
      messages,
    })
  } catch (e) {
    console.error('[assistant:messages:GET] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureSeeded()
    const brandSlug = req.nextUrl.searchParams.get('brand') || 'holy_strips'
    const id = req.nextUrl.searchParams.get('id')
    const all = req.nextUrl.searchParams.get('all') === '1'

    const brand = await db.brand.findUnique({ where: { slug: brandSlug } })
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

    if (all) {
      const wiped = await db.chatMessage.deleteMany({ where: { brandId: brand.id } })
      await db.systemEvent.create({
        data: {
          brandId: brand.id,
          type: 'ASSISTANT',
          level: 'INFO',
          message: '[CHAT_CLEARED] Conversation history cleared by the owner',
          meta: `${wiped.count} messages deleted`,
        },
      }).catch(() => { /* best-effort log */ })
      return NextResponse.json({ ok: true, deleted: wiped.count })
    }

    if (!id) {
      return NextResponse.json({ error: 'Provide id=<messageId> or all=1' }, { status: 400 })
    }

    const existing = await db.chatMessage.findFirst({ where: { id, brandId: brand.id } })
    if (!existing) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

    await db.chatMessage.delete({ where: { id } })
    return NextResponse.json({ ok: true, deleted: 1 })
  } catch (e) {
    console.error('[assistant:messages:DELETE] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
