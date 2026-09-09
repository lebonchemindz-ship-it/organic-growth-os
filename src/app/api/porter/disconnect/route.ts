// ============================================================
// PORTER DISCONNECT — DELETE /api/porter/disconnect
// Removes the Porter OAuth tokens from the vault AND the
// durable env backup (no resurrection on cold starts).
// PIN-protected (destructive). Does not touch Option 1 — the
// direct Google service-account credentials stay as they are.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { ensureSeeded } from '@/lib/ensure-seed'
import { findCredentialService } from '@/lib/credential-services'
import { deleteCredential, getCredentialValues, getSettingsPin, logCredentialEvent } from '@/lib/credentials'
import { isEnvSyncAvailable, removeEnvVar } from '@/lib/vercel-env'

export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest) {
  try {
    await ensureSeeded()
    const pin = await getSettingsPin()
    if (pin && req.headers.get('x-settings-pin') !== pin) {
      return NextResponse.json({ error: 'invalid_pin', message: 'Invalid settings PIN.' }, { status: 401 })
    }

    const values = await getCredentialValues('porter')
    await deleteCredential('porter')

    const removedVars: string[] = []
    if (isEnvSyncAvailable()) {
      const svc = findCredentialService('porter')
      if (svc) {
        for (const f of svc.fields) {
          if (!values[f.id]) continue
          for (const ev of f.envVars) {
            if (await removeEnvVar(ev)) removedVars.push(ev)
          }
        }
      }
    }

    await logCredentialEvent('Porter Metrics disconnected — tokens and backups removed', { service: 'porter', removedEnvVars: removedVars })
    return NextResponse.json({ message: 'Porter disconnected. Option 1 (direct Google service account) is untouched.', removedVars })
  } catch (e) {
    console.error('[porter] disconnect failed:', e)
    return NextResponse.json({ error: 'disconnect_failed' }, { status: 500 })
  }
}
