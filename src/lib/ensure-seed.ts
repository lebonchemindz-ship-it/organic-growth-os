import { db } from '@/lib/db'
import { seedDatabase, seedIntegrations } from '@/lib/seed-app'
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

    // 2. Lightweight migrations for databases created by older DDL versions.
    //    v1.6: Keyword.source (DEMO | GSC | DATAFORSEO | AGENT)
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "Keyword" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'DEMO'`)
      console.log('[ensure-seed] added Keyword.source column (v1.6 migration)')
    } catch {
      // column already exists — expected on fresh databases
    }

    // 2b. v1.9: Keyword.impressions + Keyword.clicks (real GSC numbers).
    //     Existing databases need the columns added before the one-time
    //     data fix below can run.
    for (const col of ['impressions', 'clicks']) {
      try {
        await db.$executeRawUnsafe(`ALTER TABLE "Keyword" ADD COLUMN "${col}" INTEGER NOT NULL DEFAULT 0`)
        console.log(`[ensure-seed] added Keyword.${col} column (v1.9 migration)`)
      } catch {
        // column already exists — expected on fresh databases
      }
    }

    // 2c. v1.9 — ONE-TIME honest-numbers fix. Before v1.9 the GSC sync
    //     stored Search Console IMPRESSIONS inside monthlyVolume (real
    //     data, wrong label) and wrote heuristic scores (aeoValue 40/70,
    //     geoValue 35, commercialValue) that looked like measured data.
    //     The owner's rule: only real numbers are ever displayed. This
    //     migration moves the real impressions into the new column,
    //     resets monthlyVolume to 0 (real search volume is only known
    //     via DataForSEO) and zeroes every heuristic score. Guarded by
    //     a _Meta marker so it runs exactly once per database.
    try {
      await db.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "_Meta" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL DEFAULT \'\')')
      const markerV19 = await db.$queryRawUnsafe<Array<{ key: string }>>(
        'SELECT "key" FROM "_Meta" WHERE "key" = \'gsc_honest_numbers_v1\'',
      )
      if (markerV19.length === 0) {
        console.log('[ensure-seed] v1.9: fixing keyword numbers (one-time migration)')
        // real impressions were stored under monthlyVolume for GSC rows
        await db.$executeRawUnsafe(
          `UPDATE "Keyword" SET "impressions" = "monthlyVolume" WHERE "source" = 'GSC' AND "impressions" = 0 AND "monthlyVolume" > 0`,
        )
        // real search volume is unknown until DataForSEO enrichment
        await db.$executeRawUnsafe(
          `UPDATE "Keyword" SET "monthlyVolume" = 0 WHERE "source" = 'GSC'`,
        )
        // heuristic scores are never real measurements — zero them all
        await db.$executeRawUnsafe(
          `UPDATE "Keyword" SET "aeoValue" = 0, "geoValue" = 0, "commercialValue" = 0`,
        )
        await db.$executeRawUnsafe(
          'INSERT OR REPLACE INTO "_Meta" ("key", "value") VALUES (\'gsc_honest_numbers_v1\', \'1\')',
        )
        console.log('[ensure-seed] v1.9 honest-numbers fix complete')
      }
    } catch (v19Err) {
      console.error('[ensure-seed] v1.9 honest-numbers migration failed:', v19Err)
    }

    // 2d. v1.9b — demo-residue wipe. One legacy demo keyword whose term also
    //     exists as a REAL GSC query was "adopted" by the sync (source flipped
    //     to GSC) before the v1.8 purge ran, so its fake difficulty (31) and
    //     fake slugified targetUrl survived. GSC provides neither difficulty
    //     nor landing-page URLs — any such value on a GSC row is residue.
    //     Wiped once, guarded by marker. (A DATAFORSEO row's difficulty is
    //     a real API measurement and is kept.)
    try {
      const markerV19b = await db.$queryRawUnsafe<Array<{ key: string }>>(
        'SELECT "key" FROM "_Meta" WHERE "key" = \'gsc_demo_residue_v1\'',
      )
      if (markerV19b.length === 0) {
        console.log('[ensure-seed] v1.9b: wiping demo residue from adopted GSC rows (one-time)')
        await db.$executeRawUnsafe(
          `UPDATE "Keyword" SET "difficulty" = 0 WHERE "source" != 'DATAFORSEO'`,
        )
        await db.$executeRawUnsafe(
          `UPDATE "Keyword" SET "targetUrl" = '' WHERE "source" = 'GSC'`,
        )
        await db.$executeRawUnsafe(
          'INSERT OR REPLACE INTO "_Meta" ("key", "value") VALUES (\'gsc_demo_residue_v1\', \'1\')',
        )
        console.log('[ensure-seed] v1.9b residue wipe complete')
      }
    } catch (v19bErr) {
      console.error('[ensure-seed] v1.9b residue wipe failed:', v19bErr)
    }

    // 3. v1.8 — ONE-TIME PURGE of legacy demo data.
    //    Databases created before v1.8 were seeded with a synthetic demo
    //    dataset: content items with fake URLs that 404'd on the real
    //    store, random fake clicks/positions, fake publishers, fake
    //    weekly reports, fake integration statuses. The owner's rule:
    //    never show demo numbers as real. This migration deletes every
    //    demo row while PRESERVING all real data (GSC/DataForSEO/agent
    //    keywords, chat history, agent-created tasks and events), then
    //    rebuilds the integration catalog honestly. Idempotent — guarded
    //    by a marker row in the "_Meta" table so it runs exactly once
    //    per database.
    try {
      await db.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "_Meta" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL DEFAULT \'\')')
      const marker = await db.$queryRawUnsafe<Array<{ key: string }>>(
        'SELECT "key" FROM "_Meta" WHERE "key" = \'demo_purge_v1\'',
      )
      if (marker.length === 0) {
        console.log('[ensure-seed] v1.8: purging legacy demo data (one-time migration)')
        // content pipeline — all legacy rows were seeded (fake URLs,
        // fake clicks, fake positions)
        await db.contentItem.deleteMany({})
        // keywords — drop only DEMO rows, keep GSC / DATAFORSEO / AGENT
        await db.keyword.deleteMany({ where: { source: 'DEMO' } })
        // fully synthetic tables
        await db.opportunity.deleteMany({})
        await db.publisher.deleteMany({})
        await db.outreachCampaign.deleteMany({})
        await db.aiPrompt.deleteMany({})
        await db.approvalItem.deleteMany({})
        await db.weeklyReport.deleteMany({})
        await db.backlinkRecord.deleteMany({})
        // demo log events (real event types are kept: CREDENTIAL, TASK,
        // BRIEF_CREATED, SITE_AUDIT, APPROVAL_*, SYSTEM, …)
        await db.systemEvent.deleteMany({
          where: { type: { in: ['DAILY_LOOP', 'CONTENT', 'OUTREACH', 'GEO', 'TECHNICAL_SEO', 'ALERT', 'LEARNING'] } },
        })
        // the 6 seeded demo tasks — agent/owner-created tasks are kept
        await db.task.deleteMany({
          where: {
            title: {
              in: [
                'Audit product page Core Web Vitals',
                'Refresh "B12 for Vegetarians" article',
                'Find 10 unlinked brand mentions',
                'Track 5 new GEO prompts',
                'Research keyword gap vs top competitor',
                'Draft outreach for supplementreviewer.io',
              ],
            },
          },
        })
        // rebuild the integration catalog with honest statuses (also
        // replaces the legacy fake "Supabase (Postgres)" row)
        await seedIntegrations()
        await db.$executeRawUnsafe(
          'INSERT OR REPLACE INTO "_Meta" ("key", "value") VALUES (\'demo_purge_v1\', \'1\')',
        )
        console.log('[ensure-seed] v1.8 purge complete — only real data remains')
      }
    } catch (purgeErr) {
      console.error('[ensure-seed] v1.8 purge failed:', purgeErr)
    }

    // 4. Seed baseline configuration if empty (v1.8: brands + the
    //    integration catalog ONLY — no demo metrics are ever seeded)
    try {
      const count = await db.brand.count()
      if (count === 0) {
        console.log('[ensure-seed] database empty — seeding baseline configuration')
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
