'use client'

// ============================================================
// API KEYS — the credential vault UI
// Save API keys for every connected service, permanently:
//  • encrypted in the app database (works immediately)
//  • synced to the Vercel project env vars (survives restarts)
// The Sprout agent reads keys from the vault automatically.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  KeyRound, Brain, LineChart, Database, Calendar, Mail, Palette, ShoppingBag,
  Globe, Zap, CheckCircle2, XCircle, Loader2, Eye, EyeOff, ExternalLink,
  ShieldCheck, RefreshCw, Trash2, Lock, Unlock, Sparkles, HardDriveDownload, Cable,
} from 'lucide-react'
import { SectionHeader } from './shared'
import {
  CREDENTIAL_GROUPS,
  CREDENTIAL_SERVICES,
  type CredentialGroupId,
  type CredentialService,
} from '@/lib/credential-services'

interface FieldState { id: string; set: boolean; value: string; envSynced: boolean }
interface ServiceState {
  service: string
  configured: boolean
  source: string | null
  updatedAt: string | null
  fields: FieldState[]
}
interface KeysResponse {
  pinRequired: boolean
  envSyncAvailable: boolean
  storage?: { hosting: 'railway' | 'vercel' | 'local'; permanent: boolean; layers: string[] }
  brain: { live: boolean; provider: string | null }
  services: ServiceState[]
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  anthropic: <Brain className="h-5 w-5" />,
  openai: <Sparkles className="h-5 w-5" />,
  dataforseo: <LineChart className="h-5 w-5" />,
  openseo: <Globe className="h-5 w-5" />,
  supabase: <Database className="h-5 w-5" />,
  activepieces: <Calendar className="h-5 w-5" />,
  hunter: <Mail className="h-5 w-5" />,
  recraft: <Palette className="h-5 w-5" />,
  shopify: <ShoppingBag className="h-5 w-5" />,
  google: <Globe className="h-5 w-5" />,
  porter: <Cable className="h-5 w-5" />,
  bing: <Zap className="h-5 w-5" />,
  merchant: <ShoppingBag className="h-5 w-5" />,
}

const PIN_STORAGE_KEY = 'ogos-settings-pin'

type Feedback = { kind: 'ok' | 'err' | 'info'; text: string } | null

export function ApiKeysView() {
  const [data, setData] = useState<KeysResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [pin, setPin] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({})
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<Record<string, 'save' | 'test' | 'delete' | null>>({})
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({})
  const [restoreMsg, setRestoreMsg] = useState<Feedback>(null)
  const [restoreBusy, setRestoreBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/keys', { cache: 'no-store' })
      const json = (await res.json()) as KeysResponse
      setData(json)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem(PIN_STORAGE_KEY) : null
    if (saved) setPin(saved)
    refresh()
  }, [refresh])

  const pinRequired = data?.pinRequired ?? false
  const unlocked = !pinRequired || Boolean(pin)
  const configuredCount = useMemo(
    () => (data?.services || []).filter((s) => s.configured).length,
    [data],
  )

  function setDraft(service: string, field: string, value: string) {
    setDrafts((d) => ({ ...d, [service]: { ...(d[service] || {}), [field]: value } }))
  }

  function toggleSecret(key: string) {
    setShowSecret((s) => ({ ...s, [key]: !s[key] }))
  }

  async function call(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; json: any }> {
    const headers: Record<string, string> = { 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) }
    if (pin) headers['x-settings-pin'] = pin
    const res = await fetch(url, { ...init, headers })
    let json: any = {}
    try { json = await res.json() } catch { /* empty body */ }
    return { ok: res.ok, status: res.status, json }
  }

  async function save(svc: CredentialService) {
    const values = Object.entries(drafts[svc.id] || {}).filter(([, v]) => v.trim() !== '')
    if (values.length === 0) return
    setBusy((b) => ({ ...b, [svc.id]: 'save' }))
    setFeedback((f) => ({ ...f, [svc.id]: null }))
    try {
      const r = await call('/api/keys', {
        method: 'POST',
        body: JSON.stringify({ service: svc.id, values: Object.fromEntries(values) }),
      })
      if (r.status === 401) {
        setPinError('The PIN was rejected — enter it again.')
        sessionStorage.removeItem(PIN_STORAGE_KEY)
        setPin('')
        return
      }
      if (!r.ok) {
        setFeedback((f) => ({ ...f, [svc.id]: { kind: 'err', text: r.json?.message || 'Save failed.' } }))
        return
      }
      if (r.json?.service) {
        setData((d) => (d ? { ...d, services: d.services.map((s) => (s.service === svc.id ? r.json.service : s)) } : d))
      }
      setDrafts((dd) => ({ ...dd, [svc.id]: {} }))
      const env = r.json?.envSync
      let text: string = r.json?.message || 'Saved.'
      if (env?.available) {
        const syncedAll = !env.failedVars?.length
        text += syncedAll
          ? ' Backed up to the permanent env store — it survives restarts and cold starts.'
          : ' Backed up to the permanent env store.'
        if (env.failedVars?.length) text += ` (env backup failed for: ${env.failedVars.join(', ')})`
      } else if (data?.storage?.permanent) {
        text += ' Stored permanently — encrypted in the vault on the persistent volume.'
      } else {
        text += ' Note: this is a local dev server — the key lives in this server\u2019s database only.'
      }
      setFeedback((f) => ({ ...f, [svc.id]: { kind: 'ok', text } }))
      refresh()
    } catch {
      setFeedback((f) => ({ ...f, [svc.id]: { kind: 'err', text: 'Network error — try again.' } }))
    } finally {
      setBusy((b) => ({ ...b, [svc.id]: null }))
    }
  }

  async function test(svc: CredentialService) {
    setBusy((b) => ({ ...b, [svc.id]: 'test' }))
    setFeedback((f) => ({ ...f, [svc.id]: null }))
    try {
      const r = await call('/api/keys/test', { method: 'POST', body: JSON.stringify({ service: svc.id }) })
      if (r.status === 401) {
        setPinError('The PIN was rejected — enter it again.')
        return
      }
      const ok = r.json?.ok === true
      const note = r.json?.ok === null ? 'info' : ok ? 'ok' : 'err'
      setFeedback((f) => ({ ...f, [svc.id]: { kind: note as 'ok' | 'err' | 'info', text: r.json?.message || 'Test failed.' } }))
    } catch {
      setFeedback((f) => ({ ...f, [svc.id]: { kind: 'err', text: 'Network error — try again.' } }))
    } finally {
      setBusy((b) => ({ ...b, [svc.id]: null }))
    }
  }

  async function remove(svc: CredentialService) {
    if (!window.confirm(`Remove the saved ${svc.name} credentials? This also removes the deployment env backup.`)) return
    setBusy((b) => ({ ...b, [svc.id]: 'delete' }))
    setFeedback((f) => ({ ...f, [svc.id]: null }))
    try {
      const r = await call(`/api/keys?service=${encodeURIComponent(svc.id)}`, { method: 'DELETE' })
      if (r.status === 401) {
        setPinError('The PIN was rejected — enter it again.')
        return
      }
      setFeedback((f) => ({ ...f, [svc.id]: { kind: 'info', text: r.json?.message || 'Removed.' } }))
      refresh()
    } catch {
      setFeedback((f) => ({ ...f, [svc.id]: { kind: 'err', text: 'Network error — try again.' } }))
    } finally {
      setBusy((b) => ({ ...b, [svc.id]: null }))
    }
  }

  async function restoreFromBackup() {
    setRestoreBusy(true)
    setRestoreMsg(null)
    try {
      const r = await call('/api/keys/verify', { method: 'POST', body: '{}' })
      if (r.status === 401) {
        setPinError('The PIN was rejected — enter it again.')
        sessionStorage.removeItem(PIN_STORAGE_KEY)
        setPin('')
        return
      }
      setRestoreMsg(
        r.ok
          ? { kind: 'ok', text: r.json?.message || 'Backup restored.' }
          : { kind: 'err', text: r.json?.message || 'Could not restore from the backup.' },
      )
      refresh()
    } catch {
      setRestoreMsg({ kind: 'err', text: 'Network error — try again.' })
    } finally {
      setRestoreBusy(false)
    }
  }

  function unlock() {
    // verify the PIN (the endpoint also restores any keys from the permanent backup)
    fetch('/api/keys/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-settings-pin': pinInput },
      body: '{}',
    })
      .then((res) => {
        if (res.status === 401) {
          setPinError('Wrong PIN — check it and try again.')
          return
        }
        setPin(pinInput)
        sessionStorage.setItem(PIN_STORAGE_KEY, pinInput)
        setPinError('')
        refresh()
      })
      .catch(() => setPinError('Network error — try again.'))
  }

  const stateOf = (id: string) => data?.services.find((s) => s.service === id)

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the credential vault…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="API Keys"
        description="Save the API key for each service once — encrypted in the vault, backed up to the deployment so it survives restarts, and used automatically by the Sprout agent and every engine. No server or code access needed."
        actions={
          <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-600 dark:text-emerald-400">
            <KeyRound className="h-3 w-3" /> {configuredCount}/{CREDENTIAL_SERVICES.length} connected
          </Badge>
        }
      />

      {/* Sprout brain status */}
      {data?.brain.live ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          <Brain className="h-4 w-4 shrink-0" />
          <p><b>Sprout intelligence: LIVE</b> — running on {data.brain.provider}. The chatbot (bottom-right) now has full intelligence.</p>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <Brain className="h-4 w-4 shrink-0" />
          <p><b>Sprout runs in offline mode.</b> Add an Anthropic (recommended) or OpenAI key below in “AI Brain” to unlock full intelligence — it takes effect immediately after saving.</p>
        </div>
      )}

      {/* How storage works */}
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> How your keys are stored
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 font-medium text-foreground"><Lock className="h-3.5 w-3.5" /> Encrypted vault</p>
              <p className="mt-1 text-xs">Keys are encrypted (AES-256) inside the app database. The dashboard only ever shows masked values.</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 font-medium text-foreground"><HardDriveDownload className="h-3.5 w-3.5" /> Permanent backup</p>
              <p className="mt-1 text-xs">
                {data?.storage?.permanent
                  ? 'Keys also exist as deployment environment variables at the infrastructure level — an independent copy that survives even a database reset.'
                  : 'Each key can also be written to the hosting environment variables — storage that survives restarts and cold starts.'}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 font-medium text-foreground"><RefreshCw className="h-3.5 w-3.5" /> Self-restoring</p>
              <p className="mt-1 text-xs">Every new server instance restores the keys from the backup automatically — no rebuild, no waiting.</p>
            </div>
          </div>
          {data?.envSyncAvailable ? (
            <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                Permanent storage is <b>enabled</b> — saved keys are backed up to the project env store and survive restarts.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 text-xs"
                onClick={restoreFromBackup}
                disabled={restoreBusy || !unlocked}
              >
                {restoreBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Restore keys from backup
              </Button>
            </div>
          ) : data?.storage?.permanent ? (
            <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                Permanent storage is <b>active</b> on this server ({data.storage.hosting === 'railway' ? 'Railway' : 'hosted'}):
                the database lives on a persistent volume and the keys are also held as deployment environment variables —
                everything survives restarts and redeploys.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 text-xs"
                onClick={restoreFromBackup}
                disabled={restoreBusy || !unlocked}
              >
                {restoreBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Restore keys from backup
              </Button>
            </div>
          ) : (
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300">
              <XCircle className="mr-1 inline h-3.5 w-3.5" />
              This is a <b>local development server</b> — keys are saved in this server&apos;s database only. On the Railway
              production deployment, storage is permanent (persistent volume + deployment environment variables) — nothing
              needs to be configured.
            </p>
          )}
          {restoreMsg && (
            <p className={`text-xs ${restoreMsg.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {restoreMsg.text}
            </p>
          )}
        </CardContent>
      </Card>

      {/* PIN gate */}
      {pinRequired && !unlocked && (
        <Card className="border-border/70">
          <CardContent className="p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Lock className="h-4 w-4" /> This dashboard is PIN-protected
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Enter your settings PIN to save, test or remove credentials. (Change it any time via the SETTINGS_PIN env var.)
            </p>
            <div className="mt-3 flex max-w-xs gap-2">
              <Input
                type="password"
                inputMode="numeric"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && unlock()}
                placeholder="Settings PIN"
                className="h-9"
              />
              <Button size="sm" className="h-9" onClick={unlock} disabled={!pinInput}>
                <Unlock className="h-4 w-4" /> Unlock
              </Button>
            </div>
            {pinError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{pinError}</p>}
          </CardContent>
        </Card>
      )}

      {/* Service groups */}
      {CREDENTIAL_GROUPS.map((group) => {
        const services = CREDENTIAL_SERVICES.filter((s) => s.group === (group.id as CredentialGroupId))
        return (
          <div key={group.id} className="space-y-3">
            <div>
              <h3 className="text-sm font-bold tracking-tight">{group.label}</h3>
              <p className="text-xs text-muted-foreground">{group.description}</p>
            </div>
            {services.map((svc) => {
              const state = stateOf(svc.id)
              const busyKind = busy[svc.id]
              const fb = feedback[svc.id]
              const draft = drafts[svc.id] || {}
              const hasDraft = Object.values(draft).some((v) => v.trim() !== '')
              return (
                <Card key={svc.id} className="border-border/70">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        {SERVICE_ICONS[svc.id] ?? <KeyRound className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold">{svc.name}</p>
                          {state?.configured ? (
                            <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> Connected
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">Not set</Badge>
                          )}
                          <a
                            href={svc.docsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] text-emerald-600 hover:underline dark:text-emerald-400"
                          >
                            <ExternalLink className="h-3 w-3" /> get key / docs
                          </a>
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">{svc.tagline}</p>

                        <div className="space-y-2.5">
                          {svc.fields.map((f) => {
                            const fs = state?.fields.find((x) => x.id === f.id)
                            const inputKey = `${svc.id}.${f.id}`
                            const isPassword = f.secret && !showSecret[inputKey]
                            return (
                              <div key={f.id} className="space-y-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <label htmlFor={inputKey} className="text-xs font-medium">
                                    {f.label}
                                    {f.required && <span className="ml-0.5 text-red-500">*</span>}
                                  </label>
                                  {fs?.set && (
                                    <span className="text-[10.5px] text-muted-foreground">
                                      current: <code className="rounded bg-muted px-1 py-0.5 font-mono">{fs.value || '••••'}</code>
                                      {fs.envSynced && (data?.envSyncAvailable || data?.storage?.permanent) && (
                                        <span className="ml-1 text-emerald-600 dark:text-emerald-400">· backed up permanently</span>
                                      )}
                                    </span>
                                  )}
                                </div>
                                {f.multiline ? (
                                  <Textarea
                                    id={inputKey}
                                    value={draft[f.id] ?? ''}
                                    onChange={(e) => setDraft(svc.id, f.id, e.target.value)}
                                    placeholder={f.placeholder}
                                    disabled={!unlocked}
                                    className="min-h-[76px] font-mono text-xs"
                                  />
                                ) : (
                                  <div className="relative">
                                    <Input
                                      id={inputKey}
                                      type={isPassword ? 'password' : 'text'}
                                      value={draft[f.id] ?? ''}
                                      onChange={(e) => setDraft(svc.id, f.id, e.target.value)}
                                      placeholder={f.placeholder}
                                      disabled={!unlocked}
                                      className="h-9 pr-9 font-mono text-xs"
                                      autoComplete="off"
                                    />
                                    {f.secret && (
                                      <button
                                        type="button"
                                        onClick={() => toggleSecret(inputKey)}
                                        aria-label={showSecret[inputKey] ? 'Hide value' : 'Show value'}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                                      >
                                        {showSecret[inputKey] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                      </button>
                                    )}
                                  </div>
                                )}
                                {f.hint && <p className="text-[10.5px] text-muted-foreground/80">{f.hint}</p>}
                              </div>
                            )
                          })}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            className="h-8"
                            onClick={() => save(svc)}
                            disabled={!unlocked || !hasDraft || busyKind === 'save'}
                          >
                            {busyKind === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                            Save
                          </Button>
                          {svc.testable && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              onClick={() => test(svc)}
                              disabled={!unlocked || !state?.configured || busyKind === 'test'}
                            >
                              {busyKind === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                              Test connection
                            </Button>
                          )}
                          {state?.configured && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-red-600 hover:text-red-700 dark:text-red-400"
                              onClick={() => remove(svc)}
                              disabled={!unlocked || busyKind === 'delete'}
                            >
                              {busyKind === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              Remove
                            </Button>
                          )}
                        </div>

                        {fb && (
                          <p
                            className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                              fb.kind === 'ok'
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : fb.kind === 'err'
                                  ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                                  : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {fb.kind === 'ok' && <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />}
                            {fb.kind === 'err' && <XCircle className="mr-1 inline h-3.5 w-3.5" />}
                            {fb.text}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
