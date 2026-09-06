import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await ensureSeeded()
    const integrations = await db.integration.findMany({
      orderBy: { order: 'asc' },
    })
    return NextResponse.json({
      integrations,
      summary: {
        total: integrations.length,
        connected: integrations.filter((i) => i.status === 'CONNECTED').length,
        pending: integrations.filter((i) => i.status === 'PENDING').length,
        shared: integrations.filter((i) => i.scope === 'SHARED').length,
        perBrand: integrations.filter((i) => i.scope !== 'SHARED').length,
      },
    })
  } catch (e) {
    console.error('integrations error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
