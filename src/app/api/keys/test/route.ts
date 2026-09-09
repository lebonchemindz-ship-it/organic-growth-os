// ============================================================
// CREDENTIAL VAULT — POST /api/keys/test
// Live connection tests: verifies a saved credential with a
// cheap real API call to the provider. PIN-protected.
// Response: { ok: true | false | null, message }
//   ok === null → could not be verified automatically
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { ensureSeeded } from '@/lib/ensure-seed'
import { findCredentialService } from '@/lib/credential-services'
import { getCredentialValues, getSettingsPin } from '@/lib/credentials'
import { testPorterConnection } from '@/lib/porter-mcp'

export const dynamic = 'force-dynamic'

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

interface TestOutcome {
  ok: boolean | null
  message: string
}

async function testAnthropic(values: Record<string, string>): Promise<TestOutcome> {
  const key = values.apiKey
  if (!key) return { ok: null, message: 'No API key saved yet.' }
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: values.model || 'claude-sonnet-4-5', max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }),
  }, 20_000)
  if (!res) return { ok: null, message: 'Could not reach api.anthropic.com (network/timeout) — the key was not rejected.' }
  if (res.ok) return { ok: true, message: 'Connected — Anthropic accepted the key. Sprout is fully live.' }
  if (res.status === 401) return { ok: false, message: 'Rejected — the API key is invalid or revoked.' }
  return { ok: null, message: `Anthropic responded with HTTP ${res.status} — key not rejected, but not confirmed either.` }
}

async function testOpenai(values: Record<string, string>): Promise<TestOutcome> {
  const key = values.apiKey
  if (!key) return { ok: null, message: 'No API key saved yet.' }
  const res = await fetchWithTimeout('https://api.openai.com/v1/models', {
    headers: { authorization: `Bearer ${key}` },
  })
  if (!res) return { ok: null, message: 'Could not reach api.openai.com (network/timeout).' }
  if (res.ok) return { ok: true, message: 'Connected — OpenAI accepted the key.' }
  if (res.status === 401) return { ok: false, message: 'Rejected — the API key is invalid or revoked.' }
  return { ok: null, message: `OpenAI responded with HTTP ${res.status} — key not confirmed.` }
}

async function testDataForSeo(values: Record<string, string>): Promise<TestOutcome> {
  const { login, password } = values
  if (!login || !password) return { ok: null, message: 'Login and password are both required.' }
  const auth = Buffer.from(`${login}:${password}`).toString('base64')
  const res = await fetchWithTimeout('https://api.dataforseo.com/v3/appendix/user_data', {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!res) return { ok: null, message: 'Could not reach api.dataforseo.com (network/timeout).' }
  if (res.status === 401 || res.status === 403) return { ok: false, message: 'Rejected — login or password is incorrect.' }
  try {
    const data = await res.json()
    if (res.ok && (data.status_code === 20000 || data.status_code === 20001)) {
      const money = data.tasks?.[0]?.result?.[0]?.money?.balance
      return { ok: true, message: `Connected${typeof money === 'number' ? ` — account balance: $${money.toFixed(2)}` : ''}.` }
    }
    return { ok: false, message: `DataForSEO returned status_code ${data.status_code ?? 'unknown'} — check the account.` }
  } catch {
    return { ok: null, message: `DataForSEO responded with HTTP ${res.status} — not confirmed.` }
  }
}

async function testHunter(values: Record<string, string>): Promise<TestOutcome> {
  const key = values.apiKey
  if (!key) return { ok: null, message: 'No API key saved yet.' }
  const res = await fetchWithTimeout(`https://api.hunter.io/v2/account?api_key=${encodeURIComponent(key)}`)
  if (!res) return { ok: null, message: 'Could not reach api.hunter.io (network/timeout).' }
  try {
    const data = await res.json()
    if (res.ok && data?.data?.email) {
      const calls = data.data.calls
      return { ok: true, message: `Connected — account ${data.data.email}${calls ? ` (${calls.used}/${calls.limit} searches used)` : ''}.` }
    }
    return { ok: false, message: data?.errors?.[0]?.message || 'Rejected — the API key is invalid.' }
  } catch {
    return { ok: null, message: `Hunter responded with HTTP ${res.status} — not confirmed.` }
  }
}

async function testSupabase(values: Record<string, string>): Promise<TestOutcome> {
  const { url, serviceKey } = values
  if (!url || !serviceKey) return { ok: null, message: 'Project URL and service key are both required.' }
  const cleanUrl = url.replace(/\/+$/, '')
  const res = await fetchWithTimeout(`${cleanUrl}/rest/v1/`, {
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
  })
  if (!res) return { ok: null, message: 'Could not reach the Supabase project (check the URL / network).' }
  if (res.ok) return { ok: true, message: 'Connected — the REST API answered and the key is valid.' }
  if (res.status === 401) return { ok: false, message: 'Rejected — the service key is invalid.' }
  return { ok: null, message: `Supabase responded with HTTP ${res.status} — key not confirmed (is the project paused?).` }
}

async function testShopify(values: Record<string, string>): Promise<TestOutcome> {
  const { domain, accessToken } = values
  if (!domain || !accessToken) return { ok: null, message: 'Store domain and access token are both required.' }
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const res = await fetchWithTimeout(`https://${clean}/admin/api/2024-10/shop.json`, {
    headers: { 'X-Shopify-Access-Token': accessToken, 'content-type': 'application/json' },
  })
  if (!res) return { ok: null, message: 'Could not reach the store (check the domain / network).' }
  if (res.ok) return { ok: true, message: 'Connected — the token can read the store.' }
  if (res.status === 401) return { ok: false, message: 'Rejected — the access token is invalid or expired.' }
  if (res.status === 403) return { ok: false, message: 'Rejected — the token is valid but lacks the required scope (read_shop).' }
  return { ok: null, message: `Shopify responded with HTTP ${res.status} — token not confirmed.` }
}

async function testPorter(values: Record<string, string>): Promise<TestOutcome> {
  const token = values.accessToken
  if (!token) return { ok: null, message: 'Not connected yet — press “Connect Porter” on the Live Stats page (fields here are filled automatically).' }
  const r = await testPorterConnection()
  if (r.ok) {
    const data = r.data as Record<string, unknown> | null
    const user = (data && typeof data === 'object' && typeof data.user === 'object' ? data.user : data) as Record<string, unknown> | null
    const email = user && typeof user.email === 'string' ? user.email : ''
    return { ok: true, message: `Connected — the Porter MCP session is live${email ? ` as ${email}` : ''}.` }
  }
  if (r.error?.status === 401 || r.error?.hint === 'reconnect') {
    return { ok: false, message: 'The Porter token was rejected — press “Connect Porter” on the Live Stats page to log in again.' }
  }
  return { ok: null, message: r.error?.message || 'Could not reach the Porter MCP server (network/timeout).' }
}

const TESTERS: Record<string, (v: Record<string, string>) => Promise<TestOutcome>> = {
  anthropic: testAnthropic,
  openai: testOpenai,
  dataforseo: testDataForSeo,
  hunter: testHunter,
  supabase: testSupabase,
  shopify: testShopify,
  porter: testPorter,
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded()
    const pin = await getSettingsPin()
    if (pin && req.headers.get('x-settings-pin') !== pin) {
      return NextResponse.json({ ok: false, message: 'Invalid settings PIN.' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const serviceId = String(body.service || '')
    const svc = findCredentialService(serviceId)
    if (!svc) {
      return NextResponse.json({ ok: null, message: `Unknown service "${serviceId}".` }, { status: 400 })
    }
    const tester = TESTERS[serviceId]
    if (!tester) {
      return NextResponse.json({ ok: null, message: 'This connection cannot be tested automatically yet — save it and watch the first live task.' })
    }

    const values = await getCredentialValues(serviceId)
    if (!svc.fields.some((f) => values[f.id])) {
      return NextResponse.json({ ok: null, message: 'Nothing saved for this service yet — save the key first.' })
    }

    const outcome = await tester(values)
    return NextResponse.json(outcome)
  } catch (e) {
    console.error('[keys:test] failed:', e)
    return NextResponse.json({ ok: null, message: 'Test failed with an internal error.' }, { status: 500 })
  }
}
