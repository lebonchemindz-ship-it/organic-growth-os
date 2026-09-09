// ============================================================
// LLM PROVIDER CHAIN — multi-provider chat completions
// Order: Anthropic API → OpenAI API → z-ai-web-dev-sdk (sandbox)
// Keys resolve from the Credential Vault (API Keys tab) first,
// then from environment variables. Works server-side only.
// ============================================================

import { getCredentialValues } from '@/lib/credentials'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LlmResult {
  text: string
  provider: 'anthropic' | 'openai' | 'zai'
}

const MAX_TOKENS = 2048
const TIMEOUT_MS = 60_000

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Anthropic Messages API — used when an Anthropic key is saved in the API Keys tab or set as an env var. */
async function callAnthropic(system: string, messages: ChatMessage[]): Promise<LlmResult | null> {
  const cred = await getCredentialValues('anthropic')
  const key = cred.apiKey || process.env.ANTHROPIC_API_KEY || ''
  if (!key) return null
  const model = cred.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'
  try {
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system,
        messages,
      }),
    })
    if (!res.ok) {
      console.error('[assistant:anthropic] HTTP', res.status, await res.text().catch(() => ''))
      return null
    }
    const data = await res.json()
    const text = (data.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
    if (!text) return null
    return { text, provider: 'anthropic' }
  } catch (e) {
    console.error('[assistant:anthropic] failed:', e instanceof Error ? e.message : e)
    return null
  }
}

/** OpenAI Chat Completions — used when an OpenAI key is saved in the API Keys tab or set as an env var. */
async function callOpenai(system: string, messages: ChatMessage[]): Promise<LlmResult | null> {
  const cred = await getCredentialValues('openai')
  const key = cred.apiKey || process.env.OPENAI_API_KEY || ''
  if (!key) return null
  const model = cred.model || process.env.OPENAI_MODEL || 'gpt-4o-mini'
  try {
    const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
    })
    if (!res.ok) {
      console.error('[assistant:openai] HTTP', res.status, await res.text().catch(() => ''))
      return null
    }
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content
    if (!text) return null
    return { text, provider: 'openai' }
  } catch (e) {
    console.error('[assistant:openai] failed:', e instanceof Error ? e.message : e)
    return null
  }
}

/** z-ai-web-dev-sdk — available in the sandbox environment (no key needed). */
let zaiInstance: any = null

async function getZai(): Promise<any> {
  if (!zaiInstance) {
    const mod = (await import('z-ai-web-dev-sdk')) as { default?: { create: () => Promise<any> } }
    const ZAI = (mod as any).default || (mod as any)
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function callZai(system: string, messages: ChatMessage[], attempt = 0): Promise<LlmResult | null> {
  try {
    const zai = await getZai()
    const completion = await zai.chat.completions.create({
      // system instructions must use the system role so the model treats
      // them as binding protocol rules (not just a previous turn)
      messages: [{ role: 'system', content: system }, ...messages],
      thinking: { type: 'disabled' },
    })
    const text = completion.choices?.[0]?.message?.content
    if (!text) return null
    return { text, provider: 'zai' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const rateLimited = msg.includes('429') || /too many requests/i.test(msg)
    if (rateLimited && attempt < 2) {
      await sleep(3000 * (attempt + 1))
      return callZai(system, messages, attempt + 1)
    }
    console.error('[assistant:zai] unavailable:', msg)
    return null
  }
}

/**
 * Calls the first available LLM provider. Returns null when no provider is
 * reachable (e.g. deployed without keys) — callers should then use the
 * deterministic offline fallback.
 */
export async function llmComplete(system: string, messages: ChatMessage[]): Promise<LlmResult | null> {
  return (
    (await callAnthropic(system, messages)) ||
    (await callOpenai(system, messages)) ||
    (await callZai(system, messages))
  )
}

export function providerLabel(p: string | null | undefined): string {
  switch (p) {
    case 'anthropic': return 'Anthropic Claude'
    case 'openai': return 'OpenAI'
    case 'zai': return 'Z-AI (sandbox)'
    case 'offline': return 'Offline mode'
    default: return '—'
  }
}
