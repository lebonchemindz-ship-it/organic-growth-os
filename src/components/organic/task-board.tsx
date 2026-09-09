'use client'

// ============================================================
// TASK BOARD — reusable agent task list with delete
// Used by the floating AssistantPanel (compact) and the
// full-page Growth Agent view (full). Supports:
//   • mark DONE / FAILED (PATCH /api/tasks)
//   • delete a single task (DELETE /api/tasks?id=)
//   • clear the whole board (DELETE /api/tasks?all=1)
//   • live refresh when the agent creates/updates tasks
//     (listens to the 'og:data-changed' window event)
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  CheckCircle2, XCircle, Loader2, RefreshCw, Trash2,
} from 'lucide-react'
import { notifyDataChanged } from './use-agent-chat'

export interface TaskItem {
  id: string
  title: string
  description: string
  type: string
  priority: string
  status: string
  source: string
  result: string
  createdAt: string
}

const STATUS_BADGE: Record<string, string> = {
  QUEUED: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300',
  RUNNING: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300',
  DONE: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  FAILED: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300',
}

const PRIORITY_DOT: Record<string, string> = {
  HIGH: 'bg-red-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-sky-500',
}

export function TaskBoard({ brandSlug, variant = 'compact' }: { brandSlug: string; variant?: 'compact' | 'full' }) {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tasks?brand=${encodeURIComponent(brandSlug)}`, { cache: 'no-store' })
      if (res.ok) {
        const json = await res.json()
        setTasks(json.tasks || [])
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [brandSlug])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  // live refresh when the agent (or the owner in another tab) changes tasks
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ tools?: string[] }>).detail
      if (detail?.tools?.some((t) => t.includes('task'))) loadTasks()
    }
    window.addEventListener('og:data-changed', onChange)
    return () => window.removeEventListener('og:data-changed', onChange)
  }, [loadTasks])

  async function updateTask(id: string, status: 'DONE' | 'FAILED') {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)))
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
    } catch {
      /* optimistic */
    }
  }

  async function deleteTask(id: string) {
    setDeleting(id)
    const backup = tasks
    setTasks((prev) => prev.filter((t) => t.id !== id))
    try {
      const res = await fetch(`/api/tasks?brand=${encodeURIComponent(brandSlug)}&id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) setTasks(backup)
      notifyDataChanged([{ name: 'delete_task', args: { id }, summary: 'task deleted', ok: true }])
    } catch {
      setTasks(backup)
    } finally {
      setDeleting(null)
    }
  }

  async function clearAll() {
    if (!window.confirm('Delete ALL tasks on the board? This cannot be undone.')) return
    setTasks([])
    try {
      await fetch(`/api/tasks?brand=${encodeURIComponent(brandSlug)}&all=1`, { method: 'DELETE' })
    } catch {
      /* optimistic */
    }
  }

  const openTasksCount = tasks.filter((t) => t.status === 'QUEUED' || t.status === 'RUNNING').length

  if (variant === 'compact') {
    return (
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Agent task board {openTasksCount > 0 && <span className="text-emerald-600 dark:text-emerald-400">({openTasksCount} open)</span>}
          </p>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={loadTasks} aria-label="Refresh tasks">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
        {tasks.length === 0 && !loading && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No tasks yet — ask Sprout in the Chat tab to create some.
          </p>
        )}
        <div className="space-y-2">
          {tasks.map((t) => (
            <div key={t.id} className={cn('rounded-xl border bg-card px-3 py-2.5 transition-opacity', deleting === t.id && 'opacity-40')}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-snug">{t.title}</p>
                  {t.description && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{t.description}</p>
                  )}
                </div>
                <Badge variant="outline" className={cn('h-5 shrink-0 px-1.5 text-[9px]', STATUS_BADGE[t.status] || '')}>
                  {t.status}
                </Badge>
              </div>
              {t.result && (
                <p className="mt-1.5 rounded-lg bg-emerald-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-300">
                  {t.result}
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[9px] font-medium uppercase text-muted-foreground">{t.type} · {t.priority} · {t.source}</span>
                <span className="flex-1" />
                <button
                  onClick={() => deleteTask(t.id)}
                  className="flex h-6 w-6 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                  aria-label="Delete task"
                  title="Delete task"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                {(t.status === 'QUEUED' || t.status === 'RUNNING') && (
                  <>
                    <button
                      onClick={() => updateTask(t.id, 'DONE')}
                      className="flex h-6 w-6 items-center justify-center rounded-md border text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
                      aria-label="Mark task done"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => updateTask(t.id, 'FAILED')}
                      className="flex h-6 w-6 items-center justify-center rounded-md border text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
                      aria-label="Mark task failed"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ---- full variant (Growth Agent page) ----
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Agent task board</p>
          <p className="text-xs text-muted-foreground">
            {tasks.length} total · {openTasksCount} open — executed by Sprout, editable by you
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {tasks.length > 0 && (
            <Button variant="outline" size="sm" className="h-8 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400" onClick={clearAll}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear all
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadTasks} disabled={loading}>
            {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />} Refresh
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tasks.length === 0 && !loading && (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="text-sm font-medium">No tasks yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ask Sprout to create work — e.g. &quot;research keywords around vitamin b12 and add the best ones&quot;.
            </p>
          </div>
        )}
        <div className="space-y-2.5">
          {tasks.map((t) => (
            <div key={t.id} className={cn('rounded-xl border bg-card p-3.5 transition-opacity', deleting === t.id && 'opacity-40')}>
              <div className="flex items-start gap-3">
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', PRIORITY_DOT[t.priority] || 'bg-muted')} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{t.title}</p>
                  {t.description && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.description}</p>
                  )}
                  {t.result && (
                    <p className="mt-2 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs leading-relaxed text-emerald-700 dark:text-emerald-300">
                      {t.result}
                    </p>
                  )}
                  <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t.type} · {t.priority} · {t.source}
                  </p>
                </div>
                <Badge variant="outline" className={cn('h-5 shrink-0 px-1.5 text-[9px]', STATUS_BADGE[t.status] || '')}>
                  {t.status}
                </Badge>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => deleteTask(t.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                    aria-label="Delete task"
                    title="Delete task"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  {(t.status === 'QUEUED' || t.status === 'RUNNING') && (
                    <>
                      <button
                        onClick={() => updateTask(t.id, 'DONE')}
                        className="flex h-7 w-7 items-center justify-center rounded-md border text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
                        aria-label="Mark done"
                        title="Mark done"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => updateTask(t.id, 'FAILED')}
                        className="flex h-7 w-7 items-center justify-center rounded-md border text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
                        aria-label="Mark failed"
                        title="Mark failed"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
