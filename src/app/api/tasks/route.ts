// ============================================================
// TASK BOARD — GET /api/tasks?brand=  ·  PATCH /api/tasks
// The Growth Agent's persistent task queue.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'

export const dynamic = 'force-dynamic'

const STATUS_ORDER: Record<string, number> = { RUNNING: 0, QUEUED: 1, DONE: 2, FAILED: 3 }

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded()
    const brandSlug = req.nextUrl.searchParams.get('brand') || 'holy_strips'
    const brand = await db.brand.findUnique({ where: { slug: brandSlug } })
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

    const tasks = await db.task.findMany({
      where: { brandId: brand.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    const sorted = [...tasks].sort(
      (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
    )
    return NextResponse.json({
      brand: { slug: brand.slug, name: brand.name },
      tasks: sorted.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        type: t.type,
        priority: t.priority,
        autonomy: t.autonomy,
        status: t.status,
        source: t.source,
        result: t.result,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
      })),
      counts: {
        queued: tasks.filter(t => t.status === 'QUEUED').length,
        running: tasks.filter(t => t.status === 'RUNNING').length,
        done: tasks.filter(t => t.status === 'DONE').length,
        failed: tasks.filter(t => t.status === 'FAILED').length,
      },
    })
  } catch (e) {
    console.error('[tasks:GET] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureSeeded()
    const body = await req.json().catch(() => ({}))
    const id = String(body.id || '')
    const status = String(body.status || '').toUpperCase()
    if (!id || !['QUEUED', 'RUNNING', 'DONE', 'FAILED'].includes(status)) {
      return NextResponse.json({ error: 'id and valid status required' }, { status: 400 })
    }
    const existing = await db.task.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const task = await db.task.update({
      where: { id },
      data: {
        status,
        result: body.result !== undefined ? String(body.result) : existing.result,
        completedAt: status === 'DONE' || status === 'FAILED' ? new Date() : null,
      },
    })
    await db.systemEvent.create({
      data: {
        brandId: existing.brandId,
        type: 'ASSISTANT',
        level: 'INFO',
        message: `[TASK_UPDATED] Task "${task.title}" → ${status}`,
        meta: String(body.result || ''),
      },
    })
    return NextResponse.json({ task: { id: task.id, status: task.status, title: task.title, result: task.result } })
  } catch (e) {
    console.error('[tasks:PATCH] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
