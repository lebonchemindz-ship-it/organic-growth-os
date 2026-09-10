// ============================================================
// HUNTER.IO CLIENT (server-only)
// Publisher contact discovery: Domain Search finds the emails
// behind a domain, Email Verifier confirms deliverability before
// anything is sent. Credentials come from the Credential Vault
// (API Keys page — "Hunter.io" service, HUNTER_API_KEY).
//
// Hunter free plan: 25 searches + 50 verifications per month, so
// every call here is counted and surfaced to the owner honestly.
// ============================================================

import { getCredentialValues } from '@/lib/credentials'

const API = 'https://api.hunter.io/v2'

export interface HunterEmail {
  value: string
  type: string // personal | generic | unknown
  confidence: number
  position: string
  firstName: string
  lastName: string
}

export interface DomainSearchResult {
  domain: string
  disposable: boolean
  webmail: boolean
  emails: HunterEmail[]
}

export interface VerifierResult {
  email: string
  status: string // valid | invalid | accept_all | webmail | disposable | unknown
  score: number
}

export interface HunterCheck {
  ok: boolean
  message: string
}

async function fetchWithTimeout(url: string, timeoutMs = 15_000): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function getHunterApiKey(): Promise<string | null> {
  const v = await getCredentialValues('hunter')
  return v.apiKey || null
}

/** Is a Hunter key saved right now? (drives the UI "ready" chips) */
export async function hunterReady(): Promise<boolean> {
  return (await getHunterApiKey()) !== null
}

/**
 * Domain Search — the emails behind a domain with positions and
 * confidence scores. One call = one search against the monthly quota.
 */
export async function hunterDomainSearch(domain: string, limit = 5): Promise<DomainSearchResult | null> {
  const key = await getHunterApiKey()
  if (!key) return null
  const res = await fetchWithTimeout(
    `${API}/domain-search?domain=${encodeURIComponent(domain)}&limit=${limit}&api_key=${encodeURIComponent(key)}`,
    20_000,
  )
  if (!res || !res.ok) return null
  try {
    const json = await res.json() as { data?: Record<string, unknown> }
    const d = json.data
    if (!d) return null
    const emails = Array.isArray(d.emails)
      ? (d.emails as Array<Record<string, unknown>>).map((e) => ({
        value: typeof e.value === 'string' ? e.value : '',
        type: typeof e.type === 'string' ? e.type : 'unknown',
        confidence: typeof e.confidence === 'number' ? e.confidence : 0,
        position: typeof e.position === 'string' ? e.position : '',
        firstName: typeof e.first_name === 'string' ? e.first_name : '',
        lastName: typeof e.last_name === 'string' ? e.last_name : '',
      })).filter((e) => e.value)
      : []
    return {
      domain: typeof d.domain === 'string' ? d.domain : domain,
      disposable: Boolean(d.disposable),
      webmail: Boolean(d.webmail),
      emails,
    }
  } catch {
    return null
  }
}

/**
 * Email Verifier — deliverability status. One call = one
 * verification against the monthly quota.
 */
export async function hunterVerifyEmail(email: string): Promise<VerifierResult | null> {
  const key = await getHunterApiKey()
  if (!key) return null
  const res = await fetchWithTimeout(
    `${API}/email-verifier?email=${encodeURIComponent(email)}&api_key=${encodeURIComponent(key)}`,
    15_000,
  )
  if (!res || !res.ok) return null
  try {
    const json = await res.json() as { data?: Record<string, unknown> }
    const d = json.data
    if (!d) return null
    return {
      email: typeof d.email === 'string' ? d.email : email,
      status: typeof d.status === 'string' ? d.status : 'unknown',
      score: typeof d.score === 'number' ? d.score : 0,
    }
  } catch {
    return null
  }
}

/**
 * Account check — FREE endpoint: consumes none of the 25 monthly
 * searches / 50 verifications. Used by /api/integrations to reconcile
 * the real connection state (returns the account email as evidence).
 */
export async function hunterAccountCheck(): Promise<string | null> {
  const key = await getHunterApiKey()
  if (!key) return null
  const res = await fetchWithTimeout(`${API}/account?api_key=${encodeURIComponent(key)}`)
  if (!res || !res.ok) return null
  try {
    const json = await res.json() as { data?: Record<string, unknown> }
    const email = json.data?.email
    return typeof email === 'string' && email ? email : null
  } catch {
    return null
  }
}

/**
 * Pick the best outreach email from a domain-search result:
 * a person in a content/editor/marketing role beats a generic
 * inbox, and confidence breaks ties.
 */
export function pickBestEmail(emails: HunterEmail[]): HunterEmail | null {
  if (emails.length === 0) return null
  const isRelevantRole = (e: HunterEmail) =>
    /content|editor|market|seo|outreach|author|writer|founder|owner|chief|director|manager|press|media/i.test(e.position)
  const personal = emails.filter((e) => e.type === 'personal')
  const relevant = personal.filter(isRelevantRole)
  const generic = emails.filter((e) => e.type === 'generic')
  const pool = relevant.length > 0 ? relevant : personal.length > 0 ? personal : generic
  if (pool.length === 0) return null
  return pool.sort((a, b) => b.confidence - a.confidence)[0]
}
