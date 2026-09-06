import { db } from '@/lib/db'
import { seedDatabase } from '@/lib/seed-app'

let seeding: Promise<void> | null = null

/**
 * Ensures the database has data (auto-seeds when empty).
 * Critical for ephemeral environments like Vercel serverless,
 * where a fresh SQLite file is created per cold start.
 */
export async function ensureSeeded(): Promise<void> {
  if (seeding) return seeding
  seeding = (async () => {
    const count = await db.brand.count()
    if (count === 0) {
      console.log('[ensure-seed] database empty — seeding demo data')
      await seedDatabase()
    }
  })().catch((e) => {
    seeding = null
    throw e
  })
  return seeding
}
