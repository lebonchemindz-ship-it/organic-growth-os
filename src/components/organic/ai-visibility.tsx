'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Bot, MessageSquare, TrendingUp, TrendingDown, Minus, Play } from 'lucide-react'
import {
  useApiData, LoadingGrid, ErrorBox, SectionHeader, KpiCard, fmtDate, RealnessChip,
} from './shared'

interface AiPromptRow {
  id: string
  prompt: string
  category: string
  chatgptMentioned: boolean
  geminiMentioned: boolean
  perplexityMentioned: boolean
  claudeMentioned: boolean
  copilotMentioned: boolean
  rankWhenMentioned: number
  trend: string
  competitorMentioned: string
  lastCheckedAt: string
}

interface AiData {
  prompts: AiPromptRow[]
  engineStats: Array<{ label: string; mentioned: number; total: number; rate: number; status: 'measured' | 'ready' | 'no_key' | 'n/a' }>
  summary: {
    totalPrompts: number
    mentioned: number
    mentionRate: number
    real: boolean
    checkedPrompts: number
    lastCheckedAt: string | null
    improving: number
    declining: number
    commercial: number
    avgRankWhenMentioned: number
  }
  canCheck: boolean
}

const ENGINES: Array<{ key: keyof AiPromptRow; label: string }> = [
  { key: 'chatgptMentioned', label: 'ChatGPT' },
  { key: 'geminiMentioned', label: 'Gemini' },
  { key: 'perplexityMentioned', label: 'Perplexity' },
  { key: 'claudeMentioned', label: 'Claude' },
  { key: 'copilotMentioned', label: 'Copilot' },
]

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'IMPROVING') return <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
  if (trend === 'DECLINING') return <TrendingDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
}

const ENGINE_STATUS_TEXT: Record<string, string> = {
  measured: 'measured — live answers',
  ready: 'key saved — not checked yet',
  no_key: 'no API key saved',
  'n/a': 'engine not integrated yet',
}

export function AiVisibilityView({ brandSlug }: { brandSlug: string }) {
  const { data, loading, error, refetch } = useApiData<AiData>(`/api/ai-visibility?brand=${brandSlug}`)
  const [checking, setChecking] = useState(false)
  const [checkMsg, setCheckMsg] = useState<string | null>(null)

  // run a LIVE mention check: real prompts from the real GSC queries are
  // answered by the configured LLM and mentions are parsed from the answers
  const runCheck = async () => {
    setChecking(true)
    setCheckMsg(null)
    try {
      const res = await fetch('/api/ai-visibility', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandSlug }),
      })
      const json = await res.json()
      if (!res.ok) {
        setCheckMsg(json.message || 'The live check could not run.')
      } else {
        setCheckMsg(
          `Live check complete — ${json.promptsChecked} real prompts answered via ${json.provider === 'anthropic' ? 'Anthropic Claude' : json.provider === 'openai' ? 'OpenAI' : json.provider}. Your brand was mentioned in ${json.mentioned} (${json.mentionRate}%).`,
        )
        refetch()
        window.dispatchEvent(new Event('og:data-changed'))
      }
    } catch {
      setCheckMsg('The live check could not run — network error.')
    } finally {
      setChecking(false)
    }
  }

  if (error) return <ErrorBox message={error} />
  if (loading || !data) return <LoadingGrid rows={6} />

  const s = data.summary

  return (
    <div className="space-y-5">
      <SectionHeader
        title="GEO Engine — AI Visibility"
        description="The system measures brand mentions, recommendations and citations across the AI engines, using priority prompts built from your real Search Console queries. Each check asks a live LLM and records whether your brand is actually recommended — a low rate is a real measurement, not a bug: it is the gap this engine works on."
        actions={
          <Button size="sm" onClick={runCheck} disabled={checking || !data.canCheck} className="h-8 gap-1.5">
            <Play className={`h-3.5 w-3.5 ${checking ? 'animate-pulse' : ''}`} />
            {checking ? 'Asking the AI engines…' : 'Run live AI check'}
          </Button>
        }
      />

      {!data.canCheck ? (
        <p className="-mt-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          No LLM key detected — save an Anthropic (Claude) or OpenAI key on the API Keys page to run live mention checks.
        </p>
      ) : null}
      {checkMsg ? (
        <p className="-mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs leading-relaxed text-emerald-700 dark:text-emerald-400">
          {checkMsg}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Mention rate"
          value={`${s.mentionRate}%`}
          sub={s.real
            ? `${s.mentioned}/${s.checkedPrompts} prompts · measured live${s.lastCheckedAt ? ` · ${fmtDate(s.lastCheckedAt)}` : ''}`
            : 'run a live check — real LLM answers'}
          icon={<Bot className="h-4 w-4" />}
          accent={s.mentionRate >= 40 ? 'positive' : 'warning'}
          real={s.real}
        />
        <KpiCard label="Improving" value={s.improving} accent="positive" icon={<TrendingUp className="h-4 w-4" />} real={s.real} />
        <KpiCard label="Declining" value={s.declining} accent="danger" icon={<TrendingDown className="h-4 w-4" />} real={s.real} />
        <KpiCard label="Commercial prompts" value={s.commercial} sub="recommendation intent" real={s.real} />
        <KpiCard label="Avg rank when cited" value={s.avgRankWhenMentioned || '—'} sub="position in answer" real={s.real} />
      </div>

      {/* Engine coverage */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Engine coverage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {data.engineStats.map((e) => (
              <div key={e.label} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{e.label}</span>
                  {e.status === 'measured' ? (
                    <span className={`text-sm font-bold tabular-nums ${e.rate > 40 ? 'text-emerald-600 dark:text-emerald-400' : e.rate > 20 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                      {e.rate}%
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
                {e.status === 'measured' ? (
                  <Progress value={e.rate} className="mt-2 h-1.5" />
                ) : (
                  <div className="mt-2 h-1.5 rounded-full bg-muted" />
                )}
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {e.status === 'measured'
                    ? `${e.mentioned} of ${e.total} prompts cite the brand`
                    : ENGINE_STATUS_TEXT[e.status]}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Prompt table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            Priority AI-query universe
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Prompt</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  {ENGINES.map((e) => (
                    <th key={e.label} className="px-3 py-2.5 text-center font-medium">{e.label}</th>
                  ))}
                  <th className="px-4 py-2.5 font-medium">Trend</th>
                  <th className="px-4 py-2.5 font-medium">Cited competitor</th>
                  <th className="px-4 py-2.5 font-medium">Checked</th>
                </tr>
              </thead>
              <tbody>
                {data.prompts.length === 0 ? (
                  <tr className="border-b border-border/50">
                    <td colSpan={9} className="px-4 py-12">
                      <div className="flex flex-col items-center justify-center gap-2 text-center">
                        <Bot className="h-8 w-8 text-muted-foreground/40" />
                        <p className="text-sm font-semibold">No AI queries tracked yet</p>
                        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                          This tracker shows where your brand is actually mentioned by the AI engines.
                          Press “Run live AI check” — the system builds priority prompts from your
                          real Search Console queries, asks the configured LLM and records the honest
                          answer, rank and cited competitors. Rows appear only once genuinely measured.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                data.prompts.map((p) => {
                  const anyMention = ENGINES.some((e) => p[e.key])
                  return (
                    <tr key={p.id} className={`border-b border-border/50 ${anyMention ? '' : 'opacity-75'}`}>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${anyMention ? '' : 'text-muted-foreground'}`}>“{p.prompt}”</span>
                        {p.rankWhenMentioned > 0 ? (
                          <span className="ml-2 text-[11px] text-muted-foreground">#{p.rankWhenMentioned} when cited</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            ['COMMERCIAL', 'RECOMMENDATION'].includes(p.category)
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'border-border text-muted-foreground'
                          }`}
                        >
                          {p.category}
                        </Badge>
                      </td>
                      {ENGINES.map((e) => (
                        <td key={e.label} className="px-3 py-3 text-center">
                          <div className="flex justify-center">
                            <Switch checked={Boolean(p[e.key])} disabled className="scale-75 data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-muted-foreground/25" />
                          </div>
                        </td>
                      ))}
                      <td className="px-4 py-3"><TrendIcon trend={p.trend} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{p.competitorMentioned}</td>
                      <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">{fmtDate(p.lastCheckedAt)}</td>
                    </tr>
                  )
                })
              )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
