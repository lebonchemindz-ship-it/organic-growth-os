'use client'

// ============================================================
// SPROUT — the Growth Agent (floating panel)
// Chat with executable tools + a task board with delete.
// The conversation is PERSISTED server-side (ChatMessage) and
// loaded on open — history survives reloads and restarts.
// Messages can be deleted individually; the whole conversation
// can be cleared. Replies are ALWAYS in English.
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Markdown from 'react-markdown'
import {
  Bot, X, Send, ListTodo, MessageSquare, Sparkles,
  Loader2, Wrench, ChevronDown, Trash2, Eraser,
} from 'lucide-react'
import { useAgentChat } from './use-agent-chat'
import { TaskBoard } from './task-board'

const SUGGESTIONS = [
  { label: 'Real stats now', text: 'Show me the real Google Search Console stats for the last 28 days.' },
  { label: 'Import real keywords', text: 'Import my real Search Console keywords into the Keywords tab and verify them.' },
  { label: 'Research keywords', text: 'Research keywords around "vitamin b12 strips" and add the best ones to my keyword universe.' },
  { label: 'How is the site doing?', text: 'How is Holy Strips doing right now? Give me the overview and your top recommendation.' },
  { label: 'Plan next content', text: 'Plan our next 3 content pieces: create briefs for the best keyword opportunities.' },
]

const PROVIDER_BADGE: Record<string, { label: string; cls: string }> = {
  anthropic: { label: 'Claude', cls: 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300' },
  openai: { label: 'GPT', cls: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300' },
  zai: { label: 'AI', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
  offline: { label: 'Offline', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300' },
}

export function AssistantPanel({ brandSlug }: { brandSlug: string }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'chat' | 'tasks'>('chat')
  const [teaser, setTeaser] = useState(false)

  const { messages, input, setInput, sending, provider, send, deleteMessage, clearAll } = useAgentChat(brandSlug)

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

  const pb = provider ? PROVIDER_BADGE[provider] : null
  const hasHistory = messages.length > 0

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
      {!open && !teaser && !hasHistory && (
        <button
          onClick={() => { setOpen(true); setTeaser(true) }}
          className="fixed bottom-[86px] right-5 z-50 hidden max-w-[220px] items-center gap-2 rounded-2xl rounded-br-md border bg-background px-3.5 py-2.5 text-left text-xs shadow-lg sm:flex"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <span className="text-muted-foreground">
            <b className="text-foreground">Sprout</b> is ready — I execute tasks and speak English.
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
                {pb ? `powered by ${pb.label}` : 'I execute tasks — replies in English'}
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
              <ListTodo className="h-3.5 w-3.5" /> Tasks
            </button>
            {tab === 'chat' && hasHistory && (
              <button
                onClick={() => { if (window.confirm('Clear the whole conversation history?')) clearAll() }}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                title="Clear conversation history"
              >
                <Eraser className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>

          {/* Chat tab */}
          {tab === 'chat' && (
            <>
              <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                {messages.length === 0 && (
                  <div className="space-y-3">
                    <div className="rounded-xl border bg-muted/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
                      I&apos;m <b className="text-foreground">Sprout</b>, the growth agent operating this OS.
                      I execute commands for real (keywords, tasks, briefs, audits) and verify every change.
                      Your messages are saved — this conversation persists. I always reply in English.
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

                {messages.map((m) => (
                  <div key={m.id} className={cn('group flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cn('relative max-w-[88%]', m.role === 'user' && 'text-right')}>
                      <button
                        onClick={() => deleteMessage(m.id)}
                        className="absolute -right-1.5 -top-1.5 z-10 hidden h-5 w-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-red-500/10 hover:text-red-600 group-hover:flex dark:hover:text-red-400"
                        aria-label="Delete message"
                        title="Delete this message"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                      {m.role === 'assistant' && m.tools && m.tools.length > 0 && (
                        <div className="mb-1.5 space-y-1">
                          {m.tools.map((t, j) => (
                            <div key={j} className="flex items-center gap-1.5 rounded-lg border bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground">
                              <Wrench className={cn('h-3 w-3 shrink-0', t.ok ? 'text-emerald-500' : 'text-red-500')} />
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
          {tab === 'tasks' && <TaskBoard brandSlug={brandSlug} variant="compact" />}
        </div>
      )}
    </>
  )
}
