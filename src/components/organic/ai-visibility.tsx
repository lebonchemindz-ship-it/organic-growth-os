'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Bot, MessageSquare, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import {
  useApiData, LoadingGrid, ErrorBox, SectionHeader, KpiCard, fmtDate,
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
  engineStats: Array<{ label: string; mentioned: number; total: number; rate: number }>
  summary: {
    totalPrompts: number
    mentioned: number
    mentionRate: number
    improving: number
    declining: number
    commercial: number
    avgRankWhenMentioned: number
  }
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

export function AiVisibilityView({ brandSlug }: { brandSlug: string }) {
  const { data, loading, error } = useApiData<AiData>(`/api/ai-visibility?brand=${brandSlug}`)

  if (error) return <ErrorBox message={error} />
  if (loading || !data) return <LoadingGrid rows={6} />

  const s = data.summary

  return (
    <div className="space-y-5">
      <SectionHeader
        title="GEO Engine — AI Visibility"
        description="The system maintains a priority AI-query universe and measures brand mentions, recommendations and citations across ChatGPT, Gemini, Perplexity, Claude and Copilot. When the brand is missing, it diagnoses the gap: content, authority, entity clarity, evidence, reviews or citation sources."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Mention rate" value={`${s.mentionRate}%`} sub={`${s.mentioned}/${s.totalPrompts} priority prompts`} icon={<Bot className="h-4 w-4" />} accent={s.mentionRate >= 40 ? 'positive' : 'warning'} />
        <KpiCard label="Improving" value={s.improving} accent="positive" icon={<TrendingUp className="h-4 w-4" />} />
        <KpiCard label="Declining" value={s.declining} accent="danger" icon={<TrendingDown className="h-4 w-4" />} />
        <KpiCard label="Commercial prompts" value={s.commercial} sub="recommendation intent" />
        <KpiCard label="Avg rank when cited" value={s.avgRankWhenMentioned || '—'} sub="position in answer" />
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
                  <span className={`text-sm font-bold tabular-nums ${e.rate > 40 ? 'text-emerald-600 dark:text-emerald-400' : e.rate > 20 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                    {e.rate}%
                  </span>
                </div>
                <Progress value={e.rate} className="mt-2 h-1.5" />
                <p className="mt-1.5 text-[11px] text-muted-foreground">{e.mentioned} of {e.total} prompts cite the brand</p>
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
                          This tracker shows where your brand is actually mentioned by ChatGPT, Perplexity,
                          Gemini, Claude and Copilot. Ask the Growth Agent to build your priority
                          AI-query universe from your real keywords — prompt rows appear only once
                          they are genuinely tracked.
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
