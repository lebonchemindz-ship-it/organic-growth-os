import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/ensure-seed'
import { checkDataForSeoAuth, getDataForSeoConfig } from '@/lib/dataforseo'
import { getCredentialValues } from '@/lib/credentials'
import { hunterAccountCheck } from '@/lib/hunter'
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

  const [anthropic, dfsCfg, hunter, recraft, activepieces, shopify, bing, merchant] = await Promise.all([
    getCredentialValues('anthropic').catch(() => ({ apiKey: '' })),
    getDataForSeoConfig().catch(() => null),
    getCredentialValues('hunter').catch(() => ({} as Record<string, string>)),
    getCredentialValues('recraft').catch(() => ({} as Record<string, string>)),
    getCredentialValues('activepieces').catch(() => ({} as Record<string, string>)),
    getCredentialValues('shopify').catch(() => ({} as Record<string, string>)),
    getCredentialValues('bing').catch(() => ({} as Record<string, string>)),
    getCredentialValues('merchant').catch(() => ({} as Record<string, string>)),
  ])
  const dfsAuth = dfsCfg ? await checkDataForSeoAuth().catch(() => ({ ok: false })) : { ok: false }

  // Hunter: live account check as evidence — the /v2/account endpoint is
  // FREE (consumes none of the 25 monthly searches / 50 verifications).
  // Falls back to plain key presence when Hunter is unreachable.
  const hunterAccount = hunter.apiKey
    ? await hunterAccountCheck().catch(() => null)
    : null

  return {
    porterOk,
    gscAccounts,
    ga4Accounts,
    anthropicKey: Boolean(anthropic.apiKey),
    dataforseoVerified: Boolean(dfsAuth.ok),
    hunter: { key: Boolean(hunter.apiKey), account: hunterAccount },
    recraftKey: Boolean(recraft.apiKey),
    activepieces: Boolean(activepieces.webhookUrl || activepieces.apiKey),
    shopify: Boolean(shopify.domain && shopify.accessToken),
    bingKey: Boolean(bing.bingApiKey),
    indexnowKey: Boolean(bing.indexnowKey),
    merchant: Boolean(merchant.merchantId || merchant.apiKey),
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

    // Map each catalog row to its TRUE connection state, reconciled from
    // the credential vault / live checks. Rows we cannot verify
    // programmatically stay "PENDING" — never marked connected
    // without evidence (key saved counts as evidence for untestable
    // services, matching the Anthropic row's existing standard).
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
      } else if (i.name === 'Hunter') {
        status = real.hunter.key ? 'CONNECTED' : 'PENDING'
        note = real.hunter.account
          ? `Account ${real.hunter.account} verified — key saved in the vault`
          : real.hunter.key
            ? 'API key saved in the vault'
            : 'Add the API key on the API Keys page (hunter.io/api-keys)'
      } else if (i.name === 'Recraft API') {
        status = real.recraftKey ? 'CONNECTED' : 'PENDING'
        note = real.recraftKey ? 'API key saved in the vault' : 'Add the API key on the API Keys page (recraft.ai/developers)'
      } else if (i.name === 'Activepieces') {
        status = real.activepieces ? 'CONNECTED' : 'PENDING'
        note = real.activepieces ? 'Webhook + API key saved in the vault' : 'Add the webhook URL / API key on the API Keys page'
      } else if (i.name === 'Shopify (CMS)') {
        status = real.shopify ? 'CONNECTED' : 'PENDING'
        note = real.shopify ? 'Store domain + access token saved in the vault' : 'Add store domain + admin access token on the API Keys page'
      } else if (i.name === 'Bing Webmaster Tools') {
        status = real.bingKey ? 'CONNECTED' : 'PENDING'
        note = real.bingKey ? 'API key saved in the vault' : 'Add the Bing API key on the API Keys page'
      } else if (i.name === 'IndexNow') {
        status = real.indexnowKey ? 'CONNECTED' : 'PENDING'
        note = real.indexnowKey ? 'IndexNow key saved in the vault' : 'Add the IndexNow key on the API Keys page'
      } else if (i.name === 'Google Merchant Center') {
        status = real.merchant ? 'CONNECTED' : 'PENDING'
        note = real.merchant ? 'Merchant ID / API key saved in the vault' : 'Add the Merchant ID + API key on the API Keys page'
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
