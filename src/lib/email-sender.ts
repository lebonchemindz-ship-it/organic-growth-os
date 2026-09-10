// ============================================================
// EMAIL SENDER (server-only, SMTP via nodemailer)
// Sends the real outreach emails. Credentials come from the
// Credential Vault (API Keys page — "Email Sender (SMTP)"
// service): works with Gmail app passwords, Brevo, Zoho, SendGrid
// or any SMTP provider.
//
// The sending identity is the SMTP username itself, so the
// "from" always matches the authenticated account (no spoofing,
// better deliverability).
// ============================================================

import nodemailer from 'nodemailer'
import { getCredentialValues } from '@/lib/credentials'

export interface SmtpConfig {
  host: string
  port: number
  username: string
  password: string
  fromName: string
}

export interface SendResult {
  ok: boolean
  /** provider message id when accepted for delivery */
  messageId: string | null
  error: string | null
}

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const v = await getCredentialValues('smtp')
  if (!v.host || !v.username || !v.password) return null
  const port = Number(v.port) || 465
  return {
    host: v.host,
    port,
    username: v.username,
    password: v.password,
    fromName: v.fromName || v.username.split('@')[0] || 'Outreach',
  }
}

/** Is SMTP configured right now? (drives the UI ready chips) */
export async function smtpReady(): Promise<boolean> {
  return (await getSmtpConfig()) !== null
}

function buildTransport(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465, // 465 = implicit TLS; 587/25 use STARTTLS
    auth: { user: cfg.username, pass: cfg.password },
  })
}

/** Connection test — verifies credentials with the SMTP server. */
export async function verifySmtp(): Promise<SendResult> {
  const cfg = await getSmtpConfig()
  if (!cfg) return { ok: false, messageId: null, error: 'No SMTP credentials saved yet — add the Email Sender (SMTP) service on the API Keys page.' }
  try {
    const transport = buildTransport(cfg)
    await transport.verify()
    return { ok: true, messageId: null, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, messageId: null, error: msg }
  }
}

export async function sendEmail(args: {
  to: string
  subject: string
  text: string
  html?: string
}): Promise<SendResult> {
  const cfg = await getSmtpConfig()
  if (!cfg) {
    return { ok: false, messageId: null, error: 'No SMTP credentials saved — add the Email Sender (SMTP) service on the API Keys page (Gmail app password, Brevo, Zoho…).' }
  }
  try {
    const transport = buildTransport(cfg)
    const info = await transport.sendMail({
      from: `"${cfg.fromName}" <${cfg.username}>`,
      to: args.to,
      replyTo: cfg.username,
      subject: args.subject,
      text: args.text,
      html: args.html ?? args.text.replace(/\n/g, '<br/>'),
    })
    return { ok: true, messageId: info.messageId ?? null, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, messageId: null, error: msg }
  }
}
