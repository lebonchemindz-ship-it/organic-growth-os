'use client'

// ============================================================
// GROWTH AGENT — full-page Sprout section
// The dedicated bot page: persistent chat on the left, the
// task board (with delete / clear) on the right. Everything
// the floating panel does, with room to breathe:
//   • full conversation history (saved server-side)
//   • per-message delete + clear-all
//   • executed-tool receipts under each reply
//   • live task board with delete/clear
//   • provider badge + English-only replies
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Markdown from 'react-markdown'
import {
  Bot, Send, Sparkles, Loader2, Wrench, Trash2, Eraser,
  RefreshCw, ListTodo, MessageSquare,
} from 'lucide-react'
import { useApiData, SectionHeader, fmtDate } from './shared'
import { useAgentChat } from './use-agent-chat'
import { TaskBoard } from './task-board'

interface DataStatus {
  brain: { provider: string; keyConfigured: boolean }
  porter: { connected: boolean; message: string }
  dataforseo: { configured: boolean; verified: boolean; message: string }
  keywords: { total: number; live: number; demo: number; agent: number }
  flags: { realTraffic: boolean; realVolumes: boolean; anyReal: boolean }
}

const SUGGESTIONS = [
  { label: 'Real GSC stats', text: 'Show me the real Google Search Console stats for the last 28 days.' },
  { label: 'Import real keywords', text: 'Import my real Search Console keywords into the Keywords tab and verify them.' },
  { label: 'Research keywords', text: 'Research keywords around "vitamin b12 strips" and add the best ones.' },
  { label: 'Top opportunities', text: 'Show me the top opportunities by VALUE score and what to execute first.' },
  { label: 'Run a site audit', text: 'Run a site audit and tell me what needs fixing.' },
]

const PROVIDER_BADGE: Record<string, { label: string; cls: string }> = {
  anthropic: { label: 'Claude', cls: 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300' },
  openai: { label: 'GPT', cls: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300' },
  zai: { label: 'AI', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
  offline: { label: 'Offline', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300' },
}

export function AgentView({ brandSlug }: { brandSlug: string }) {
  const { messages, input, setInput, sending, provider, historyLoaded, send, deleteMessage, clearAll, reload } = useAgentChat(brandSlug)
  const { data: status } = useApiData<DataStatus>('/api/data-status')
  const [tab, setTab] = useState<'chat' | 'tasks'>('chat')

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, sending])

  const pb = provider ? PROVIDER_BADGE[provider] : null
  const brainLabel = status?.brain?.provider
  const hasHistory = messages.length > 0

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Growth Agent — Sprout"
        description="Your AI operator. It executes every command for real — keywords, tasks, content briefs, audits — then verifies and reports the result. The conversation and tasks are saved permanently; you can delete any message or task. It always replies in English."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {pb && (
              <Badge variant="outline" className={cn('gap-1.5 text-[11px]', pb.cls)}>
                <Bot className="h-3 w-3" /> {pb.label}
              </Badge>
            )}
            {status?.flags?.realTraffic ? (
              <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-600 dark:text-emerald-400">
                <Sparkles className="h-3 w-3" /> Real traffic connected
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1.5 border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-600 dark:text-amber-400">
                Connect Porter for real stats
              </Badge>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ---------- Chat column ---------- */}
        <div className="flex h-[min(70vh,680px)] flex-col overflow-hidden rounded-2xl border bg-card lg:col-span-3">
          {/* header */}
          <div className="flex items-center gap-2.5 border-b bg-gradient-to-r from-emerald-500/10 to-transparent px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <Bot className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight">Sprout · persistent chat</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {brainLabel ? `brain: ${brainLabel}` : '…'} · replies in English · {messages.length} saved messages
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={reload} aria-label="Reload history" title="Reload history from server">
              <RefreshCw className={cn('h-4 w-4', !historyLoaded && 'animate-spin')} />
            </Button>
            {hasHistory && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                onClick={() => { if (window.confirm('Clear the whole conversation history?')) clearAll() }}
              >
                <Eraser className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>

          {/* mobile tabs */}
          <div className="flex items-center gap-1 border-b px-2 py-1.5 lg:hidden">
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
              <ListTodo className="h-3.5 w-3.5" /> Task board
            </button>
          </div>

          {/* messages */}
          <div ref={scrollRef} className={cn('flex-1 space-y-4 overflow-y-auto px-4 py-4', tab === 'tasks' && 'hidden lg:block')}>
            {!historyLoaded && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
              </div>
            )}
            {historyLoaded && messages.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-xl border bg-muted/40 px-4 py-3.5 text-[13px] leading-relaxed text-muted-foreground">
                  I&apos;m <b className="text-foreground">Sprout</b>, your growth operator. Ask me anything or give me work —
                  I execute commands for real and show you the receipts (tool runs + verification).
                  Everything we say is saved; delete any message with the trash button.
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
                <div className={cn('relative max-w-[85%]', m.role === 'user' && 'text-right')}>
                  <button
                    onClick={() => deleteMessage(m.id)}
                    className="absolute -right-1.5 -top-1.5 z-10 hidden h-5 w-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-red-500/10 hover:text-red-600 group-hover:flex dark:hover:text-red-400"
                    aria-label="Delete message"
                    title="Delete this message"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                  <p className={cn('mb-0.5 text-[10px] text-muted-foreground', m.role === 'user' ? 'pr-1 text-right' : 'pl-1')}>
                    {m.role === 'user' ? 'You' : 'Sprout'}{m.createdAt ? ` · ${fmtDate(m.createdAt)}` : ''}
                  </p>
                  {m.role === 'assistant' && m.tools && m.tools.length > 0 && (
                    <div className="mb-1.5 space-y-1">
                      {m.tools.map((t, j) => (
                        <div key={j} className="flex items-start gap-1.5 rounded-lg border bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                          <Wrench className={cn('mt-0.5 h-3 w-3 shrink-0', t.ok ? 'text-emerald-500' : 'text-red-500')} />
                          <span>
                            <b className="text-foreground">{t.name}</b> — {t.summary}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div
                    className={cn(
                      'inline-block rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed',
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
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border bg-muted/40 px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                  <span className="text-xs text-muted-foreground">Sprout is executing…</span>
                </div>
              </div>
            )}
          </div>

          {/* input */}
          <div className={cn('border-t p-3', tab === 'tasks' && 'hidden lg:block')}>
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
                rows={Math.min(1 + input.split('\n').length - 1, 5)}
                placeholder="Give me a command — e.g. “add keywords: vitamin b12 energy, b12 sublingual” …"
                className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border bg-background px-3.5 py-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus:border-emerald-500/50"
              />
              <Button
                size="icon"
                className="h-10 w-10 shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-700"
                disabled={sending || !input.trim()}
                onClick={() => send()}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* ---------- Task board column ---------- */}
        <div className={cn(
          'flex h-[min(70vh,680px)] flex-col overflow-hidden rounded-2xl border bg-card lg:col-span-2',
          tab === 'tasks' ? 'flex' : 'hidden lg:flex',
        )}>
          <TaskBoard brandSlug={brandSlug} variant="full" />
        </div>
      </div>
    </div>
  )
}
