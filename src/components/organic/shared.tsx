'use client'

import { useEffect, useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ============================================================
// Data fetching hook
// ============================================================

export function useApiData<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // urlOverride lets a view force a LIVE pull (e.g. ?refresh=1 to
  // bypass server-side caches) without changing its regular url.
  const refetch = useCallback(async (urlOverride?: string) => {
    try {
      setError(null)
      const res = await fetch(urlOverride ?? url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    setLoading(true)
    refetch()
  }, [refetch])

  // Live refresh: when Sprout executes a tool that mutates data
  // (add_keywords, create_task, …) it dispatches 'og:data-changed'.
  // Every mounted view refetches so updates appear instantly —
  // no manual page reload needed.
  useEffect(() => {
    const onChange = () => refetch()
    window.addEventListener('og:data-changed', onChange)
    return () => window.removeEventListener('og:data-changed', onChange)
  }, [refetch])

  // Always-live data: re-fetch every 60 seconds so every section of the
  // dashboard continuously reflects the database (and the live sources it
  // materializes from). Safe by design — all GET endpoints have server-side
  // caches (30s–5min) that absorb the polling, so external APIs (Porter /
  // DataForSEO) are never hammered, yet the UI never sits on stale data for
  // long. The refetch is silent: `loading` stays false, no skeleton flash.
  useEffect(() => {
    const id = window.setInterval(() => refetch(), 60_000)
    return () => window.clearInterval(id)
  }, [refetch])

  return { data, loading, error, refetch }
}

// ============================================================
// Formatters
// ============================================================

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function humanize(s: string): string {
  return s
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ============================================================
// Badges
// ============================================================

const AUTONOMY_STYLES: Record<string, string> = {
  GREEN: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  YELLOW: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  RED: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
}

export function AutonomyBadge({ level }: { level: string }) {
  return (
    <Badge variant="outline" className={cn('font-semibold', AUTONOMY_STYLES[level] || '')}>
      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {level}
    </Badge>
  )
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  PUBLISHED: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  MONITORING: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30',
  PLACED: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  REPLIED: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30',
  NEGOTIATING: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30',
  CONNECTED: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  ACTIVE: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  WON: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  APPROVAL_REQUIRED: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  PENDING: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  PENDING_ACTIVATION: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  QUEUED: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  SCHEDULED: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  BLOCKED: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  REJECTED: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  DECLINING: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  DECLINED: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  LOST: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn(STATUS_COLORS[status] || 'bg-muted text-muted-foreground border-border')}>
      {humanize(status)}
    </Badge>
  )
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="secondary" className="text-[11px] font-medium">
      {type.replace(/_/g, ' ')}
    </Badge>
  )
}

// ============================================================
// Realness chip — LIVE (real API data) vs DEMO (simulated)
// ============================================================

export function RealnessChip({ real, label }: { real: boolean; label?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-4.5 shrink-0 gap-1 px-1.5 text-[9px] font-semibold uppercase tracking-wide',
        real
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
      )}
    >
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', real ? 'bg-emerald-500' : 'bg-amber-500')} />
      {label ?? (real ? 'Live' : 'Demo')}
    </Badge>
  )
}

// ============================================================
// Layout primitives
// ============================================================

export function KpiCard({
  label,
  value,
  sub,
  icon,
  accent = 'default',
  real,
}: {
  label: string
  value: string | number
  sub?: React.ReactNode
  icon?: React.ReactNode
  accent?: 'default' | 'positive' | 'warning' | 'danger'
  /** true = backed by a live API right now; false/undefined = demo estimate */
  real?: boolean
}) {
  const accents = {
    default: '',
    positive: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
  }
  return (
    <Card className="border-border/70">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <div className="flex items-center gap-1.5">
            {real !== undefined && <RealnessChip real={real} />}
            {icon ? <span className="text-muted-foreground/70">{icon}</span> : null}
          </div>
        </div>
        <p className={cn('mt-2 text-2xl font-bold tabular-nums', accents[accent])}>{value}</p>
        {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  )
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function LoadingGrid({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
      {message}
    </div>
  )
}

export function TrendDelta({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-muted-foreground">flat</span>
  const positive = value > 0
  return (
    <span className={positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
      {positive ? '▲' : '▼'} {Math.abs(value)}
      {suffix}
    </span>
  )
}

// Score bar (0-100) used across opportunities & reports
export function ScoreBar({ score, className }: { score: number; className?: string }) {
  const color = score >= 66 ? 'bg-emerald-500' : score >= 33 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
    </div>
  )
}
