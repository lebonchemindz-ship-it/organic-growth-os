'use client'

// ============================================================
// USE AGENT CHAT — shared Sprout chat engine
// Used by BOTH the floating AssistantPanel and the full-page
// Growth Agent view. Gives them one implementation of:
//   • persisted history (loaded from /api/assistant/messages)
//   • send() → POST /api/assistant (executes tools server-side)
//   • per-message delete + clear-all (DELETE endpoints)
//   • window event 'og:data-changed' so every open dashboard
//     view refetches the moment the agent changes data
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'

export interface ExecutedTool {
  name: string
  args: Record<string, unknown>
  summary: string
  ok: boolean
}

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  tools?: ExecutedTool[]
  provider?: string
  createdAt?: string
  pending?: boolean
}

/** Tools that mutate dashboard data — their success triggers a UI refresh. */
const DATA_MUTATING_TOOLS = new Set([
  'add_keywords', 'research_keywords', 'sync_gsc_keywords', 'delete_keyword',
  'create_task', 'update_task', 'delete_task',
  'create_content_brief', 'decide_approval', 'run_site_audit',
])

export function notifyDataChanged(tools: ExecutedTool[]) {
  if (typeof window === 'undefined') return
  const changed = tools.filter((t) => t.ok && DATA_MUTATING_TOOLS.has(t.name)).map((t) => t.name)
  if (changed.length > 0) {
    window.dispatchEvent(new CustomEvent('og:data-changed', { detail: { tools: changed, at: Date.now() } }))
  }
}

export function useAgentChat(brandSlug: string) {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [provider, setProvider] = useState<string | null>(null)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const sendingRef = useRef(false)

  // ---------- load persisted history ----------
  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/assistant/messages?brand=${encodeURIComponent(brandSlug)}`, { cache: 'no-store' })
      if (res.ok) {
        const json = (await res.json()) as { messages?: AgentMessage[] }
        setMessages((json.messages || []).map((m) => ({ ...m, tools: m.tools || [] })))
      }
    } catch {
      /* history is best-effort */
    } finally {
      setHistoryLoaded(true)
    }
  }, [brandSlug])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // ---------- send a message ----------
  const send = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim()
      if (!content || sendingRef.current) return
      sendingRef.current = true
      setSending(true)
      setInput('')
      const tempId = `tmp-${Date.now()}`
      const history = [...messages, { id: tempId, role: 'user' as const, content }]
      setMessages(history)
      try {
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            brandSlug,
            messages: history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
          }),
        })
        const json = await res.json()
        const reply = String(json.reply || 'No response.')
        const tools: ExecutedTool[] = Array.isArray(json.tools) ? json.tools : []
        setProvider(json.provider || null)
        // replace pending tail with the persisted truth from the server
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempId),
          { id: `srv-${Date.now()}`, role: 'user', content },
          { id: `srv-${Date.now() + 1}`, role: 'assistant', content: reply, tools, provider: json.provider },
        ])
        notifyDataChanged(tools)
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, role: 'assistant', content: 'Connection error — please try again.' },
        ])
      } finally {
        sendingRef.current = false
        setSending(false)
      }
    },
    [input, brandSlug, messages],
  )

  // ---------- delete one message / clear all ----------
  const deleteMessage = useCallback(
    async (id: string) => {
      setMessages((prev) => prev.filter((m) => m.id !== id))
      try {
        await fetch(`/api/assistant/messages?brand=${encodeURIComponent(brandSlug)}&id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      } catch {
        /* optimistic delete */
      }
    },
    [brandSlug],
  )

  const clearAll = useCallback(async () => {
    setMessages([])
    try {
      await fetch(`/api/assistant/messages?brand=${encodeURIComponent(brandSlug)}&all=1`, { method: 'DELETE' })
    } catch {
      /* optimistic */
    }
  }, [brandSlug])

  return {
    messages,
    input,
    setInput,
    sending,
    provider,
    historyLoaded,
    send,
    deleteMessage,
    clearAll,
    reload: loadHistory,
  }
}
