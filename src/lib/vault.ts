// ============================================================
// CREDENTIAL VAULT — encryption helpers (server-only)
// AES-256-GCM. The key comes from ENCRYPTION_KEY (env) or a
// deterministic fallback so values stay decryptable across
// restarts even when no key is configured. Set ENCRYPTION_KEY
// in production for real protection.
// ============================================================

import crypto from 'node:crypto'

const FALLBACK_SECRET = 'organic-growth-os::credential-vault::v1::fallback-key'

function vaultKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.trim()
    ? process.env.ENCRYPTION_KEY.trim()
    : FALLBACK_SECRET
  return crypto.createHash('sha256').update(secret).digest()
}

/** Encrypt a UTF-8 string → "iv:tag:ciphertext" (all base64). */
export function encryptString(plaintext: string): string {
  try {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey(), iv)
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':')
  } catch (e) {
    console.error('[vault] encrypt failed:', e instanceof Error ? e.message : e)
    return ''
  }
}

/** Decrypt "iv:tag:ciphertext" back to the original string. Returns '' on failure. */
export function decryptString(blob: string): string {
  try {
    const parts = blob.split(':')
    if (parts.length !== 3) return ''
    const [iv, tag, data] = parts
    const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey(), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    const dec = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()])
    return dec.toString('utf8')
  } catch {
    return ''
  }
}

/** Mask a secret for display: keep the first 4 and last 4 characters. */
export function maskSecret(value: string): string {
  if (!value) return ''
  const v = value.trim()
  if (v.length <= 10) return '••••••••'
  // private keys: show just the BEGIN marker
  if (v.startsWith('-----')) return `${v.slice(0, 15)}…`
  return `${v.slice(0, 4)}••••${v.slice(-4)}`
}

export function encryptJson(obj: Record<string, string>): string {
  return encryptString(JSON.stringify(obj))
}

export function decryptJson(blob: string): Record<string, string> {
  if (!blob) return {}
  const raw = decryptString(blob)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') out[k] = v
      }
      return out
    }
    return {}
  } catch {
    return {}
  }
}
