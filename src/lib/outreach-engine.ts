// ============================================================
// OUTREACH ENGINE (server-only)
// The full publisher pipeline, fully automated and honest:
//   1. DISCOVER   — candidate domains from a live SERP lookup
//                   (DataForSEO) or a pasted domain list
//   2. VERIFY     — Hunter.io Domain Search finds the contact
//                   email, Email Verifier confirms deliverability
//   3. QUALIFY    — deterministic 0-100 score, min 70 to qualify
//   4. CONTACT    — personalized Day-1 email via SMTP (LLM-
//                   written when a brain key exists, template
//                   otherwise), capped at 30 new contacts/day
//   5. FOLLOW UP  — Day 5 and Day 12 sequels sent automatically
//                   (on page open, button, or agent tool)
//
// Nothing is simulated: every publisher row carries a verified
// email, every campaign row a real SMTP send result.
// ============================================================

import { db } from '@/lib/db'
import { fetchSerpDomains } from '@/lib/dataforseo'
import { hunterDomainSearch, hunterVerifyEmail, pickBestEmail, getHunterApiKey } from '@/lib/hunter'
import { sendEmail, getSmtpConfig } from '@/lib/email-sender'
import { llmComplete } from '@/lib/assistant/llm'

/** max new qualified contacts per business day (design rule) */
export const DAILY_CONTACT_CAP = 30

// ------------------------------------------------------------
// Candidate domains
// ------------------------------------------------------------

/** Platforms, social networks, marketplaces and aggregators that
 * are never publisher outreach targets. */
const JUNK_DOMAINS = new Set([
  'google.com', 'youtube.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
  'linkedin.com', 'pinterest.com', 'reddit.com', 'quora.com', 'wikipedia.org', 'wikimedia.org',
  'amazon.com', 'ebay.com', 'aliexpress.com', 'alibaba.com', 'temu.com', 'etsy.com',
  'walmart.com', 'target.com', 'shopify.com', 'apple.com', 'microsoft.com', 'yahoo.com',
  'bing.com', 'yandex.com', 'tiktok.com', 'snapchat.com', 'whatsapp.com', 'telegram.org',
  'medium.com', 'blogger.com', 'wordpress.com', 'tumblr.com', 'stackoverflow.com',
  'github.com', 'booking.com', 'tripadvisor.com', 'britannica.com', 'imdb.com',
  'rottentomatoes.com', 'digg.com', 'buzzfeed.com', 'cnn.com', 'bbc.com', 'nytimes.com',
])

function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .split(':')[0]
}

function prettifyName(domain: string): string {
  const root = domain.split('.')[0] || domain
  return root.charAt(0).toUpperCase() + root.slice(1)
}

// ------------------------------------------------------------
// 1 + 2 + 3 — discovery, verification, qualification
// ------------------------------------------------------------

export interface DiscoverySummary {
  ok: boolean
  code?: 'hunter_missing' | 'seed_required' | 'serp_failed' | 'no_candidates' | 'smtp_missing' | 'send_failed'
  message: string
  domainsConsidered: number
  added: number
  qualified: number
  skipped: number
  hunterSearchesUsed: number
  hunterVerificationsUsed: number
  publishers?: Array<{ domain: string; name: string; score: number; email: string; qualified: boolean }>
  autoLaunch?: LaunchSummary | null
}

const isRelevantRole = (position: string) =>
  /content|editor|market|seo|outreach|author|writer|founder|owner|chief|director|manager|press|media/i.test(position)

export async function discoverPublishers(
  brandId: string,
  brandDomain: string,
  opts: { seed?: string; domains?: string[]; limit?: number; autoLaunch?: boolean; brandName?: string },
): Promise<DiscoverySummary> {
  const summary: DiscoverySummary = {
    ok: false, message: '', domainsConsidered: 0, added: 0, qualified: 0,
    skipped: 0, hunterSearchesUsed: 0, hunterVerificationsUsed: 0, autoLaunch: null,
  }

  const hunterKey = await getHunterApiKey()
  if (!hunterKey) {
    summary.code = 'hunter_missing'
    summary.message = 'Hunter.io API key missing — save it on the API Keys page (Outreach group) first. Hunter finds and verifies the publisher contact emails.'
    return summary
  }

  const seed = (opts.seed || '').trim()
  let pasted: string[] = (opts.domains || []).map(normalizeDomain).filter((d) => d.includes('.') && !JUNK_DOMAINS.has(d))

  // dedupe pasted
  pasted = [...new Set(pasted)]

  let candidates: Array<{ domain: string; bestPosition: number | null }> = []

  if (pasted.length > 0) {
    candidates = pasted.map((d) => ({ domain: d, bestPosition: null }))
    summary.message = `Using ${pasted.length} pasted domain(s) — free (no DataForSEO SERP call).`
  } else {
    if (!seed) {
      summary.code = 'seed_required'
      summary.message = 'Enter a niche keyword (e.g. "vitamin supplements") or paste specific publisher domains.'
      return summary
    }
    const serp = await fetchSerpDomains(seed, { depth: 20 })
    if (!serp.ok) {
      summary.code = 'serp_failed'
      summary.message = `${serp.message} You can also paste publisher domains manually below (free, uses only Hunter).`
      return summary
    }
    candidates = serp.domains.map((d) => ({ domain: d.domain, bestPosition: d.bestPosition }))
    summary.message = serp.message
  }

  // exclude the brand's own domain + junk + existing publishers
  const own = normalizeDomain(brandDomain)
  const existing = new Set(
    (await db.publisher.findMany({ where: { brandId }, select: { domain: true } })).map((p) => normalizeDomain(p.domain)),
  )
  const junkRoot = (d: string) => [...JUNK_DOMAINS].some((j) => d === j || d.endsWith(`.${j}`))
  candidates = candidates.filter((c) => c.domain !== own && !existing.has(c.domain) && !junkRoot(c.domain))

  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 25)
  if (candidates.length === 0) {
    summary.code = 'no_candidates'
    summary.message = 'No new candidate domains after filtering (already tracked, your own domain or platforms were removed).'
    return summary
  }
  candidates = candidates.slice(0, limit)
  summary.domainsConsidered = candidates.length

  const created: Array<{ domain: string; name: string; score: number; email: string; qualified: boolean }> = []
  const createdIds: string[] = []

  for (const c of candidates) {
    // --- Hunter Domain Search (1 search = 1 monthly quota unit) ---
    const search = await hunterDomainSearch(c.domain, 5)
    summary.hunterSearchesUsed += 1
    if (!search || search.disposable || search.webmail || search.emails.length === 0) {
      summary.skipped += 1
      continue
    }
    const best = pickBestEmail(search.emails)
    if (!best || !best.value) {
      summary.skipped += 1
      continue
    }

    // --- Hunter Email Verifier (1 verification = 1 quota unit) ---
    const verified = await hunterVerifyEmail(best.value)
    summary.hunterVerificationsUsed += 1
    const vStatus = verified?.status ?? 'unknown'
    if (vStatus === 'invalid' || vStatus === 'disposable' || vStatus === 'webmail') {
      summary.skipped += 1 // never contact a bad address
      continue
    }

    // --- deterministic qualification score (0-100) ---
    let score = 30 // topically relevant (found via niche SERP or owner-provided)
    if (c.bestPosition !== null) {
      if (c.bestPosition <= 10) score += 15
      else if (c.bestPosition <= 30) score += 8
    }
    if (vStatus === 'valid') score += 15
    else if (vStatus === 'accept_all') score += 8
    if (best.type === 'personal') score += 10
    if (isRelevantRole(best.position)) score += 5
    if (verified && verified.score >= 80) score += 5
    score = Math.min(100, score)

    const contactName = [best.firstName, best.lastName].filter(Boolean).join(' ').trim()
    const qualified = score >= 70
    const publisher = await db.publisher.create({
      data: {
        brandId,
        name: prettifyName(c.domain),
        domain: c.domain,
        niche: seed || 'manual',
        qualificationScore: score,
        contactName: contactName || best.position || '',
        contactEmail: best.value,
        status: qualified ? 'QUALIFIED' : 'PROSPECT',
        monthlyTraffic: 0, // unknown at discovery — never guessed
        aiCitationPotential: Math.min(95, 30 + Math.round(score / 2) + (isRelevantRole(best.position) ? 10 : 0)),
      },
    })
    createdIds.push(publisher.id)
    created.push({ domain: c.domain, name: publisher.name, score, email: best.value, qualified })
    if (qualified) summary.qualified += 1
    summary.added += 1
  }

  summary.ok = true
  summary.message = summary.added > 0
    ? `Discovered ${summary.added} publisher(s) — ${summary.qualified} qualified (score ≥ 70). Used ${summary.hunterSearchesUsed} Hunter search(es) + ${summary.hunterVerificationsUsed} verification(s).${summary.skipped > 0 ? ` ${summary.skipped} domain(s) skipped: no email found or unverified address.` : ''}`
    : `No publishers added — ${summary.skipped} domain(s) had no usable verified contact email (Hunter searches used: ${summary.hunterSearchesUsed}).`
  summary.publishers = created

  // --- optional auto-launch: start outreach immediately ---
  if (opts.autoLaunch && createdIds.length > 0) {
    summary.autoLaunch = await launchOutreach(brandId, opts.brandName || '', brandDomain, { publisherIds: createdIds })
  }

  return summary
}

// ------------------------------------------------------------
// Email composition — LLM-personalized when a brain key exists,
// honest template fallback otherwise
// ------------------------------------------------------------

interface ComposeInput {
  stage: 'DAY_1' | 'DAY_5' | 'DAY_12'
  brandName: string
  brandDomain: string
  publisher: { name: string; domain: string; niche: string; contactName: string }
  previousSubject?: string
}

export interface ComposedEmail {
  subject: string
  text: string
  personalization: string
  provider: string
}

const OPT_OUT = 'If you would rather not hear from us again, just reply "no thanks" and we will not follow up.'

function templateEmail(input: ComposeInput): ComposedEmail {
  const { stage, brandName, brandDomain, publisher } = input
  const hi = input.publisher.contactName ? `Hi ${publisher.contactName},` : 'Hi,'
  if (stage === 'DAY_1') {
    const text = [
      hi,
      '',
      `I run ${brandName} (${brandDomain}). We publish practical, well-researched content in ${publisher.niche || 'your niche'} and noticed ${publisher.name} covers the same topics for a similar audience.`,
      '',
      'Would you be open to a guest article, a product mention, or a content swap? Happy to share examples of what we publish.',
      '',
      'Either way — keep up the good work.',
      '',
      `${brandName} · ${brandDomain}`,
      '',
      OPT_OUT,
    ].join('\n')
    return { subject: `Content collaboration idea for ${publisher.name}`, text, personalization: 'Template (no LLM key configured)', provider: 'template' }
  }
  if (stage === 'DAY_5') {
    const text = [
      hi,
      '',
      `Following up on my email from a few days ago — I still think a ${publisher.niche || 'content'} collaboration between ${brandName} and ${publisher.name} could work well for both audiences.`,
      '',
      'Interested? One short reply is enough.',
      '',
      `${brandName} · ${brandDomain}`,
      '',
      OPT_OUT,
    ].join('\n')
    return { subject: `Re: ${input.previousSubject || `Content collaboration idea for ${publisher.name}`}`, text, personalization: 'Template follow-up (Day 5)', provider: 'template' }
  }
  const text = [
    hi,
    '',
    `Last note from me — if a ${publisher.niche || 'content'} collaboration is not interesting for ${publisher.name} right now, no problem at all and I will not follow up again.`,
    '',
    `The offer stays open if things change. Thanks for reading.`,
    '',
    `${brandName} · ${brandDomain}`,
  ].join('\n')
  return { subject: `Re: ${input.previousSubject || `Content collaboration idea for ${publisher.name}`} — last note`, text, personalization: 'Template final follow-up (Day 12)', provider: 'template' }
}

const COMPOSE_SYSTEM = [
  'You write short, honest outreach emails from a small brand to a website publisher.',
  'Hard rules: under 120 words, plain text only, no flattery, no buzzwords, no "I hope this finds you well",',
  'one specific and reasonable ask, reference something concrete about the publisher site,',
  `always end the body with this exact line: "${OPT_OUT}"`,
  'Output ONLY a JSON object of this exact shape, no other text: {"subject": "<subject>", "body": "<email body>"}',
].join(' ')

async function composeEmail(input: ComposeInput): Promise<ComposedEmail> {
  const { stage, brandName, brandDomain, publisher } = input
  const stageLabel = stage === 'DAY_1' ? 'first contact (Day 1)' : stage === 'DAY_5' ? 'polite follow-up (Day 5, the first email was sent 4 days ago and got no reply)' : 'final follow-up (Day 12, no reply so far — after this we stop)'
  const user = [
    `Write the ${stageLabel} email.`,
    `Brand: ${brandName} (${brandDomain}).`,
    `Publisher: ${publisher.name} (${publisher.domain}), niche: ${publisher.niche || 'same niche as the brand'}, contact person: ${publisher.contactName || 'unknown'}.`,
    stage !== 'DAY_1' ? `The original subject line was: "${input.previousSubject || ''}" — keep it as a "Re:" or a clear follow-up subject.` : '',
  ].filter(Boolean).join('\n')

  const res = await llmComplete(COMPOSE_SYSTEM, [{ role: 'user', content: user }])
  if (res) {
    try {
      const jsonText = res.text.slice(res.text.indexOf('{'), res.text.lastIndexOf('}') + 1)
      const parsed = JSON.parse(jsonText) as { subject?: string; body?: string }
      if (parsed.subject && parsed.body) {
        let body = parsed.body.trim()
        if (!body.toLowerCase().includes('no thanks')) body += `\n\n${OPT_OUT}`
        const firstSentence = body.split(/[.!?\n]/).find((s) => s.trim().length > 20)?.trim() ?? body.slice(0, 120)
        return {
          subject: parsed.subject.trim().slice(0, 120),
          text: body,
          personalization: `${firstSentence.slice(0, 140)}…`,
          provider: res.provider,
        }
      }
    } catch {
      // fall through to template
    }
  }
  return templateEmail(input)
}

// ------------------------------------------------------------
// 4 — launch outreach (Day 1) with the 30/day cap
// ------------------------------------------------------------

export interface LaunchSummary {
  ok: boolean
  message: string
  campaignsCreated: number
  emailsSent: number
  sendFailures: number
  capReached: boolean
  details?: Array<{ publisher: string; to: string; sent: boolean; error?: string }>
}

async function logEvent(brandId: string, message: string, meta = '') {
  try {
    await db.systemEvent.create({
      data: { brandId, type: 'OUTREACH', level: 'INFO', message, meta },
    })
  } catch {
    // never fail the engine because logging failed
  }
}

export async function launchOutreach(
  brandId: string,
  brandName: string,
  brandDomain: string,
  opts: { publisherIds?: string[]; limit?: number } = {},
): Promise<LaunchSummary> {
  const out: LaunchSummary = { ok: false, message: '', campaignsCreated: 0, emailsSent: 0, sendFailures: 0, capReached: false, details: [] }

  const smtp = await getSmtpConfig()
  if (!smtp) {
    out.message = 'Email Sender (SMTP) is not configured — add it on the API Keys page (Gmail app password, Brevo, Zoho…) so outreach emails can actually be sent.'
    return out
  }

  // 30 new contacts per business day
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  const sentToday = await db.outreachCampaign.count({ where: { brandId, sentAt: { gte: startOfDay } } })
  let remaining = DAILY_CONTACT_CAP - sentToday
  if (remaining <= 0) {
    out.capReached = true
    out.message = `Daily cap reached — ${sentToday} contacts already emailed today (max ${DAILY_CONTACT_CAP}). The engine resumes tomorrow.`
    return out
  }

  // targets: specific publishers, or all qualified ones without a campaign
  let targets
  if (opts.publisherIds && opts.publisherIds.length > 0) {
    targets = await db.publisher.findMany({ where: { brandId, id: { in: opts.publisherIds } } })
  } else {
    const withCampaigns = await db.publisher.findMany({
      where: { brandId },
      select: { id: true, outreach: { select: { status: true } } },
    })
    const hasActive = new Set(
      withCampaigns
        .filter((p) => p.outreach.some((c) => c.status !== 'STOPPED' && c.status !== 'DECLINED'))
        .map((p) => p.id),
    )
    const eligible = withCampaigns.filter((p) => !hasActive.has(p.id)).map((p) => p.id)
    targets = await db.publisher.findMany({
      where: { brandId, id: { in: eligible }, status: 'QUALIFIED', contactEmail: { not: '' } },
      orderBy: { qualificationScore: 'desc' },
    })
  }
  targets = targets.filter((p) => p.contactEmail)

  const limit = opts.limit ?? DAILY_CONTACT_CAP
  if (targets.length === 0) {
    out.message = 'No qualified publishers waiting for outreach — run a discovery first (score ≥ 70 with a verified email).'
    return out
  }

  for (const publisher of targets.slice(0, Math.min(limit, remaining))) {
    // retry an earlier failed/queued attempt for the same publisher
    const existing = await db.outreachCampaign.findFirst({
      where: { brandId, publisherId: publisher.id, status: 'QUEUED' },
    })

    const composed = await composeEmail({
      stage: 'DAY_1',
      brandName: brandName || 'The team',
      brandDomain,
      publisher: { name: publisher.name, domain: publisher.domain, niche: publisher.niche, contactName: publisher.contactName },
    })

    const send = await sendEmail({ to: publisher.contactEmail, subject: composed.subject, text: composed.text })
    remaining -= 1

    const data = {
      subject: composed.subject,
      personalization: composed.personalization,
      sequenceStage: 'DAY_1',
      status: send.ok ? 'SENT' : 'QUEUED',
      sentAt: send.ok ? new Date() : null,
      result: send.ok ? `via ${smtp.host} · message ${send.messageId}` : `send failed: ${send.error}`,
    }
    if (existing) {
      await db.outreachCampaign.update({ where: { id: existing.id }, data })
    } else {
      await db.outreachCampaign.create({ data: { brandId, publisherId: publisher.id, ...data } })
      out.campaignsCreated += 1
    }
    if (send.ok) {
      out.emailsSent += 1
      await db.publisher.update({ where: { id: publisher.id }, data: { status: 'CONTACTED' } })
    } else {
      out.sendFailures += 1
    }
    out.details?.push({ publisher: publisher.name, to: publisher.contactEmail, sent: send.ok, error: send.error ?? undefined })
  }

  if (remaining <= 0) out.capReached = true
  out.ok = out.emailsSent > 0
  out.message = out.emailsSent > 0
    ? `Day-1 outreach sent: ${out.emailsSent} email(s) delivered via ${smtp.host} (${out.campaignsCreated} new sequence(s)).${out.sendFailures > 0 ? ` ${out.sendFailures} send failure(s) — see the campaign rows for the exact error.` : ''}`
    : `No emails delivered — ${out.sendFailures} failure(s). Check the SMTP credentials on the API Keys page.`
  await logEvent(brandId, out.message, '')
  return out
}

// ------------------------------------------------------------
// 5 — automatic Day 5 / Day 12 follow-ups
// ------------------------------------------------------------

export interface FollowupSummary {
  ok: boolean
  message: string
  day5Sent: number
  day12Sent: number
  failures: number
  /** campaigns whose next follow-up is not due yet */
  pending: number
}

const DAY_MS = 24 * 60 * 60_000

export async function sendDueFollowups(
  brandId: string,
  brandName: string,
  brandDomain: string,
): Promise<FollowupSummary> {
  const out: FollowupSummary = { ok: true, message: '', day5Sent: 0, day12Sent: 0, failures: 0, pending: 0 }

  const smtp = await getSmtpConfig()
  if (!smtp) {
    out.ok = false
    out.message = 'Email Sender (SMTP) is not configured — follow-ups can only be queued, not sent. Add SMTP on the API Keys page.'
    return out
  }

  const campaigns = await db.outreachCampaign.findMany({
    where: { brandId, status: 'SENT', sequenceStage: { in: ['DAY_1', 'DAY_5', 'DAY_12'] } },
    include: { publisher: true },
  })

  const now = Date.now()
  for (const c of campaigns) {
    const sentAt = c.sentAt ? c.sentAt.getTime() : null
    if (sentAt === null) continue

    if (c.sequenceStage === 'DAY_1') {
      if (now - sentAt < 4 * DAY_MS) { out.pending += 1; continue }
      const composed = await composeEmail({
        stage: 'DAY_5', brandName: brandName || 'The team', brandDomain,
        publisher: { name: c.publisher.name, domain: c.publisher.domain, niche: c.publisher.niche, contactName: c.publisher.contactName },
        previousSubject: c.subject,
      })
      const send = await sendEmail({ to: c.publisher.contactEmail, subject: composed.subject, text: composed.text })
      if (send.ok) {
        out.day5Sent += 1
        await db.outreachCampaign.update({
          where: { id: c.id },
          data: { sequenceStage: 'DAY_5', sentAt: new Date(), status: 'SENT', result: `Day-5 follow-up sent via ${smtp.host}` },
        })
      } else {
        out.failures += 1
      }
    } else if (c.sequenceStage === 'DAY_5') {
      if (now - sentAt < 7 * DAY_MS) { out.pending += 1; continue }
      const composed = await composeEmail({
        stage: 'DAY_12', brandName: brandName || 'The team', brandDomain,
        publisher: { name: c.publisher.name, domain: c.publisher.domain, niche: c.publisher.niche, contactName: c.publisher.contactName },
        previousSubject: c.subject,
      })
      const send = await sendEmail({ to: c.publisher.contactEmail, subject: composed.subject, text: composed.text })
      if (send.ok) {
        out.day12Sent += 1
        await db.outreachCampaign.update({
          where: { id: c.id },
          data: { sequenceStage: 'DAY_12', sentAt: new Date(), status: 'SENT', result: 'Day-12 final follow-up sent — sequence ends here (no reply).' },
        })
      } else {
        out.failures += 1
      }
    } else {
      // DAY_12 already sent — the sequence is over, nothing more to do
      out.pending += 1
    }
  }

  const total = out.day5Sent + out.day12Sent
  if (total > 0) {
    out.message = `Follow-ups sent: ${out.day5Sent} Day-5, ${out.day12Sent} Day-12.${out.failures > 0 ? ` ${out.failures} failure(s).` : ''}`
    await logEvent(brandId, out.message, '')
  } else {
    out.message = `No follow-ups due right now — ${out.pending} sequence(s) in progress.${out.failures > 0 ? ` ${out.failures} failure(s) on the last attempt.` : ''}`
  }
  return out
}

// ------------------------------------------------------------
// reply handling (manual — inbox access is out of scope)
// ------------------------------------------------------------

export async function markCampaignReplied(campaignId: string, brandId: string): Promise<{ ok: boolean; message: string }> {
  const campaign = await db.outreachCampaign.findFirst({ where: { id: campaignId, brandId } })
  if (!campaign) return { ok: false, message: 'Campaign not found.' }
  await db.outreachCampaign.update({
    where: { id: campaign.id },
    data: { status: 'REPLIED', sequenceStage: 'REPLIED', lastReplyAt: new Date(), result: campaign.result || 'Reply received — sequence auto-paused.' },
  })
  await db.publisher.update({ where: { id: campaign.publisherId }, data: { status: 'REPLIED' } })
  return { ok: true, message: 'Marked as replied — the sequence stops automatically (no more follow-ups for this publisher).' }
}
