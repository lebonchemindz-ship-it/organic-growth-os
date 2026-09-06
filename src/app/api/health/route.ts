import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await db.brand.count()
    return NextResponse.json({ status: 'ok', database: 'connected' })
  } catch {
    return NextResponse.json({ status: 'degraded', database: 'unavailable' }, { status: 503 })
  }
}
