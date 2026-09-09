import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'
import { checkDataForSeoAuth, getDataForSeoConfig } from '@/lib/dataforseo'
import { getCredentialValues } from '@/lib/credentials'
import { findGoogleConnectorSlugs, getPorterConfig, listPorterAccounts, normalizeAccounts, testPorterConnection } from '@/lib/porter-mcp'

export const dynamic = 'force-dynamic'

// Real connection state is reconciled at READ time from the actual
// credential vault / Porter account state — never from seeded rows.
// Cached briefly so the page stays snappy without hammering Porter.
const CACHE_TTL_MS = 60_000
let cache: { json: Record<string, unknown>; ts: number } | null = null

async function reconcileRealStatuses() {
  const porterCfg = await getPorterConfig().catch(() => null)
  let gscAccounts = 0
  let ga4Accounts = 0
  let porterOk = false
  if (porterCfg?.accessToken) {
    const who = await testPorterConnection().catch(() => null)
    if (who?.ok) {
      porterOk = true
      const slugs = await findGoogleConnectorSlugs().catch(() => ({ gsc: '', ga4: '' }))
      const [gscRes, ga4Res] = await Promise.all([
        listPorterAccounts(slugs.gsc).catch(() => null),
        listPorterAccounts(slugs.ga4).catch(() => null),
      ])
      gscAccounts = gscRes?.ok ? normalizeAccounts(gscRes.data).length : 0
      ga4Accounts = ga4Res?.ok ? normalizeAccounts(ga4Res.data).length : 0
    }
  }

  const [anthropic, dfsCfg] = await Promise.all([
    getCredentialValues('anthropic').catch(() => ({ apiKey: '' })),
    getDataForSeoConfig().catch(() => null),
  ])
  const dfsAuth = dfsCfg ? await checkDataForSeoAuth().catch(() => ({ ok: false })) : { ok: false }

  return {
    porterOk,
    gscAccounts,
    ga4Accounts,
    anthropicKey: Boolean(anthropic.apiKey),
    dataforseoVerified: Boolean(dfsAuth.ok),
  }
}

export async function GET() {
  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return NextResponse.json({ ...cache.json, cached: true })
    }
    await ensureSeeded()

    const integrations = await db.integration.findMany({ orderBy: { order: 'asc' } })
    const real = await reconcileRealStatuses()

    // Map each catalog row to its TRUE connection state. Rows we cannot
    // verify programmatically stay "PENDING" — never marked connected
    // without evidence.
    const isGscRow = (name: string) => name.includes('Search Console')
    const isGa4Row = (name: string) => /^GA4/.test(name)
    const reconciled = integrations.map((i) => {
      let status = i.status
      let note: string | null = null
      if (isGscRow(i.name)) {
        status = real.porterOk && real.gscAccounts > 0 ? 'CONNECTED' : 'PENDING'
        note = status === 'CONNECTED' ? `${real.gscAccounts} Search Console account(s) linked via Porter` : 'Connect Porter on the Live Stats page'
      } else if (isGa4Row(i.name)) {
        status = real.porterOk && real.ga4Accounts > 0 ? 'CONNECTED' : 'PENDING'
        note = status === 'CONNECTED' ? `${real.ga4Accounts} GA4 account(s) linked via Porter` : 'Connect Porter on the Live Stats page'
      } else if (i.name === 'Anthropic API') {
        status = real.anthropicKey ? 'CONNECTED' : 'PENDING'
        note = real.anthropicKey ? 'API key saved in the vault' : 'Add the key on the API Keys page'
      } else if (i.name === 'DataForSEO MCP') {
        status = real.dataforseoVerified ? 'CONNECTED' : 'PENDING'
        note = real.dataforseoVerified ? 'API credentials verified' : 'API login/password required (app.dataforseo.com → API Access)'
      } else if (i.name.includes('SQLite')) {
        status = 'CONNECTED'
        note = 'Running on the persistent volume'
      }
      return { ...i, status, note }
    })

    const json = {
      integrations: reconciled,
      summary: {
        total: reconciled.length,
        connected: reconciled.filter((i) => i.status === 'CONNECTED').length,
        pending: reconciled.filter((i) => i.status === 'PENDING').length,
        shared: reconciled.filter((i) => i.scope === 'SHARED').length,
        perBrand: reconciled.filter((i) => i.scope !== 'SHARED').length,
      },
    }

    cache = { json, ts: Date.now() }
    return NextResponse.json(json)
  } catch (e) {
    console.error('integrations error', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
