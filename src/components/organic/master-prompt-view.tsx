'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Copy, Check, FileCode2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { useApiData, LoadingGrid, ErrorBox, SectionHeader } from './shared'

interface MasterPromptData {
  masterPrompt: string
  brandActivationPrompt: string
  meta: { masterPromptLines: number; masterPromptWords: number }
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success(`${label} copied to clipboard`)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy failed — select the text manually')
    }
  }

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="outline"
        className="absolute right-3 top-3 z-10 h-8 gap-1.5 bg-background/85 text-xs backdrop-blur"
        onClick={copy}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
      <pre className="max-h-[560px] overflow-auto rounded-lg border bg-muted/30 p-4 font-mono text-[11.5px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function MasterPromptView() {
  const { data, loading, error } = useApiData<MasterPromptData>('/api/master-prompt')

  if (error) return <ErrorBox message={error} />
  if (loading || !data) return <LoadingGrid rows={4} />

  return (
    <div className="space-y-5">
      <SectionHeader
        title="The OS — Master Prompt"
        description="Install this once at the root of your Organic Growth OS project as CLAUDE.md. It contains the identity, decision engine, autonomy rules, all growth engines, the daily loop and the weekly owner report. Layer 2 connects the software. Layer 3 activates each brand."
        actions={
          <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <FileCode2 className="h-3 w-3" /> {data.meta.masterPromptLines} lines · {data.meta.masterPromptWords} words
          </Badge>
        }
      />

      <Tabs defaultValue="master">
        <TabsList className="h-9">
          <TabsTrigger value="master" className="gap-1.5 text-xs">
            <FileCode2 className="h-3.5 w-3.5" /> CLAUDE.md — Organic Growth OS
          </TabsTrigger>
          <TabsTrigger value="activation" className="gap-1.5 text-xs">
            <Zap className="h-3.5 w-3.5" /> Brand Activation prompt
          </TabsTrigger>
        </TabsList>

        <TabsContent value="master" className="mt-4 space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Layer 1 — install once in Claude</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Save as <code className="rounded bg-muted px-1 py-0.5 font-mono">CLAUDE.md</code> in your project root. This is the decision-maker and
                growth organization — not an assistant waiting for prompts. It obeys the autonomy hierarchy: GREEN executes,
                YELLOW executes at 85%+ confidence, RED waits for you without stopping anything else.
              </p>
            </CardContent>
          </Card>
          <CodeBlock code={data.masterPrompt} label="Master prompt" />
        </TabsContent>

        <TabsContent value="activation" className="mt-4 space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Layer 3 — activate each brand</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs leading-relaxed text-muted-foreground">
                After Layer 2 (software) is connected, run this prompt once per brand. Replace BRAND / BRAND_ID / DOMAIN for
                each new brand (holy_strips, armoray, zero_trace, fully_nutrition…). The OS then builds the baseline,
                keyword universe, competitor set, audits, gap analyses and the prioritized opportunity queue — then enters
                autonomous daily operation.
              </p>
            </CardContent>
          </Card>
          <CodeBlock code={data.brandActivationPrompt} label="Activation prompt" />
        </TabsContent>
      </Tabs>
    </div>
  )
}
