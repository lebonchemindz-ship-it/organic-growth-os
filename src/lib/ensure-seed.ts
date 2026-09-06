import { db } from '@/lib/db'
import { seedDatabase } from '@/lib/seed-app'
import { SCHEMA_DDL } from '@/lib/schema-ddl'
import { importEnvCredentials } from '@/lib/credentials'

let seeding: Promise<void> | null = null

/**
 * Ensures the SQLite database has its schema (CREATE TABLE IF NOT EXISTS)
 * and demo data. Critical for ephemeral environments like Vercel serverless,
 * where a fresh /tmp database file is created on each cold start.
 * Also re-imports credentials stored as deployment env vars into the
 * credential vault so keys survive cold starts.
 */
export async function ensureSeeded(): Promise<void> {
  if (seeding) return seeding
  seeding = (async () => {
    // 1. Initialize schema if tables are missing (idempotent DDL)
    // Note: SQLite driver only runs one statement per call, so split them.
    for (const statement of SCHEMA_DDL.split(';')) {
      const trimmed = statement.trim()
      if (!trimmed) continue
      try {
        await db.$executeRawUnsafe(trimmed)
      } catch (ddlErr) {
        console.error('[ensure-seed] DDL statement failed:', trimmed.slice(0, 60), ddlErr)
      }
    }

    // 2. Seed demo data if empty
    try {
      const count = await db.brand.count()
      if (count === 0) {
        console.log('[ensure-seed] database empty — seeding demo data')
        await seedDatabase()
      }
    } catch (seedCheckErr) {
      console.error('[ensure-seed] seed check failed:', seedCheckErr)
    }

    // 3. Cold-start durability — pull env-var credentials into the vault
    try {
      await importEnvCredentials()
    } catch (envImportErr) {
      console.error('[ensure-seed] credential import failed:', envImportErr)
    }
  })().catch((e) => {
    seeding = null
    throw e
  })
  return seeding
}
