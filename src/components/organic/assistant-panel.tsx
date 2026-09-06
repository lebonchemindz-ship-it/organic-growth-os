'use client'

// ============================================================
// SPROUT — the Growth Agent
// Floating AI chat panel with executable tools + a task board.
// Chat in any language (the agent mirrors the user's language),
// UI chrome stays English per site requirements.
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Markdown from 'react-markdown'
import {
  Bot, X, Send, ListTodo, MessageSquare, Sparkles, RefreshCw,
  CheckCircle2, XCircle, Loader2, Wrench, ChevronDown,
} from 'lucide-react'

interface ExecutedTool { name: string; args: Record<string, unknown>; summary: string; ok: boolean }

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  tools?: ExecutedTool[]
  provider?: string
}

interface TaskItem {
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

const SUGGESTIONS = [
  { label: 'How is Holy Strips doing?', text: 'How is Holy Strips doing right now? Give me the overview and your top recommendation.' },
  { label: 'Top opportunities?', text: 'Show me the top opportunities by VALUE score and what you recommend executing first.' },
  { label: 'Plan next content', text: 'Plan our next 3 content pieces: create briefs for the best keyword opportunities.' },
  { label: 'Run a site audit', text: 'Run a site audit and tell me what needs fixing.' },
  { label: 'اكتب لي ملخصاً', text: 'اكتب لي ملخصاً عن وضع الموقع وأهم 3 مهام يجب عملها هذا الأسبوع' },
]

const PROVIDER_BADGE: Record<string, { label: string; cls: string }> = {
  anthropic: { label: 'Claude', cls: 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300' },
  openai: { label: 'GPT', cls: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300' },
  zai: { label: 'AI', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
  offline: { label: 'Offline', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300' },
}

const STATUS_BADGE: Record<string, string> = {
  QUEUED: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300',
  RUNNING: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300',
  DONE: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  FAILED: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300',
}

export function AssistantPanel({ brandSlug }: { brandSlug: string }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'chat' | 'tasks'>('chat')
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [provider, setProvider] = useState<string | null>(null)
  const [teaser, setTeaser] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => setTeaser(false), 6000)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, sending])

  const loadTasks = useCallback(async () => {
    setTasksLoading(true)
    try {
      const res = await fetch(`/api/tasks?brand=${brandSlug}`, { cache: 'no-store' })
      if (res.ok) {
        const json = await res.json()
        setTasks(json.tasks || [])
      }
    } catch { /* ignore */ } finally {
      setTasksLoading(false)
    }
  }, [brandSlug])

  useEffect(() => {
    if (open && tab === 'tasks') loadTasks()
  }, [open, tab, loadTasks])

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || sending) return
    setInput('')
    setSending(true)
    const history = [...messages, { role: 'user' as const, content }]
    setMessages(history)
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brandSlug,
          messages: history.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const json = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: json.reply || 'No response.',
        tools: json.tools || [],
        provider: json.provider,
      }])
      if (json.provider) setProvider(json.provider)
      if (json.tools?.length) loadTasks()
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error — please try again.' }])
    } finally {
      setSending(false)
    }
  }

  async function updateTask(id: string, status: 'DONE' | 'FAILED') {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, status } : t)))
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
    } catch { /* optimistic */ }
  }

  const openTasksCount = tasks.filter(t => t.status === 'QUEUED' || t.status === 'RUNNING').length
  const pb = provider ? PROVIDER_BADGE[provider] : null

  return (
    <>
      {/* Floating action button */}
      <button
        onClick={() => { setOpen(o => !o); setTeaser(false) }}
        aria-label={open ? 'Close growth agent' : 'Open Sprout — the AI growth agent'}
        className={cn(
          'fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-2xl',
          'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-xl shadow-emerald-500/30',
          'transition-transform hover:scale-105 active:scale-95'
        )}
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-7 w-7" />}
        {!open && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-bold text-emerald-600 ring-2 ring-emerald-500">
            AI
          </span>
        )}
      </button>

      {/* Teaser bubble */}
      {!open && !teaser && messages.length === 0 && (
        <button
          onClick={() => { setOpen(true); setTeaser(true) }}
          className="fixed bottom-[86px] right-5 z-50 hidden max-w-[220px] items-center gap-2 rounded-2xl rounded-br-md border bg-background px-3.5 py-2.5 text-left text-xs shadow-lg sm:flex"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <span className="text-muted-foreground">
            <b className="text-foreground">Sprout</b> is ready — ask me anything or give me a growth task.
          </span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-[92px] right-5 z-50 flex h-[min(72vh,640px)] w-[min(400px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-2.5 border-b bg-gradient-to-r from-emerald-500/10 to-transparent px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <Bot className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight">Sprout · Growth Agent</p>
              <p className="truncate text-[10px] text-muted-foreground">
                {pb ? `powered by ${pb.label}` : 'give me tasks — I execute them'}
              </p>
            </div>
            {pb && (
              <Badge variant="outline" className={cn('h-5 shrink-0 px-1.5 text-[9px]', pb.cls)}>
                {pb.label}
              </Badge>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setOpen(false)} aria-label="Close panel">
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b px-2 py-1.5">
            <button
              onClick={() => setTab('chat')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                tab === 'chat' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" /> Chat
            </button>
            <button
              onClick={() => setTab('tasks')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                tab === 'tasks' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <ListTodo className="h-3.5 w-3.5" /> Task Board
              {openTasksCount > 0 && (
                <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-white">
                  {openTasksCount}
                </span>
              )}
            </button>
          </div>

          {/* Chat tab */}
          {tab === 'chat' && (
            <>
              <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                {messages.length === 0 && (
                  <div className="space-y-3">
                    <div className="rounded-xl border bg-muted/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
                      I'm <b className="text-foreground">Sprout</b>, the growth agent operating this OS.
                      I can read live system state, run site audits, queue tasks, create content briefs,
                      add keywords and execute approvals — in any language you write.
                      <span className="mt-1.5 block text-[10px] text-amber-600 dark:text-amber-400">
                        Note: dashboard metrics are demo data until the real APIs are connected.
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTIONS.map(s => (
                        <button
                          key={s.label}
                          onClick={() => send(s.text)}
                          className="rounded-full border bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-emerald-500/40 hover:text-foreground"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m, i) => (
                  <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[88%]', m.role === 'user' && 'text-right')}>
                      {m.role === 'assistant' && m.tools && m.tools.length > 0 && (
                        <div className="mb-1.5 space-y-1">
                          {m.tools.map((t, j) => (
                            <div key={j} className="flex items-center gap-1.5 rounded-lg border bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground">
                              <Wrench className="h-3 w-3 shrink-0 text-emerald-500" />
                              <span className="truncate">
                                <b className="text-foreground">{t.name}</b> — {t.summary}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div
                        className={cn(
                          'inline-block rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                          m.role === 'user'
                            ? 'rounded-br-md bg-emerald-600 text-white'
                            : 'rounded-bl-md border bg-muted/40 text-foreground'
                        )}
                      >
                        {m.role === 'assistant' ? (
                          <div className="space-y-1.5 [&_b]:font-bold [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_code]:text-[11px] dark:[&_code]:bg-white/10 [&_li]:ml-4 [&_li]:list-disc [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
                            <Markdown>{m.content}</Markdown>
                          </div>
                        ) : (
                          <span className="whitespace-pre-wrap">{m.content}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {sending && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border bg-muted/40 px-3.5 py-2.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
                      <span className="text-xs text-muted-foreground">Sprout is working…</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="border-t p-2.5">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        send()
                      }
                    }}
                    rows={Math.min(1 + input.split('\n').length - 1, 4)}
                    placeholder="Ask anything or give me a task… (Enter to send)"
                    className="max-h-28 min-h-9 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground focus:border-emerald-500/50"
                  />
                  <Button
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-700"
                    disabled={sending || !input.trim()}
                    onClick={() => send()}
                    aria-label="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Tasks tab */}
          {tab === 'tasks' && (
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Agent task board</p>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={loadTasks} aria-label="Refresh tasks">
                  <RefreshCw className={cn('h-3.5 w-3.5', tasksLoading && 'animate-spin')} />
                </Button>
              </div>
              {tasks.length === 0 && !tasksLoading && (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  No tasks yet — ask Sprout in the Chat tab to create some.
                </p>
              )}
              <div className="space-y-2">
                {tasks.map(t => (
                  <div key={t.id} className="rounded-xl border bg-card px-3 py-2.5">
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
          )}
        </div>
      )}
    </>
  )
}
