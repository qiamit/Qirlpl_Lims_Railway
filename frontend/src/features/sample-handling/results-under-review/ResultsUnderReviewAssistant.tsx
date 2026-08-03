import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useShowAiAssistant } from '@/hooks/useShowAiAssistant'
import { QiAssistantChatPanel } from '@/components/qi-assistant/QiAssistantChatPanel'
import type { TestAllocationRow } from '../types'
import {
  buildResultsUnderReviewListAssistantContext,
  buildResultsUnderReviewSectionContext,
  findRowBySectionCode,
  parseSectionCodeFromMessage,
} from './buildResultsUnderReviewAssistantContext'

export function ResultsUnderReviewAssistant({
  rows,
  search,
}: {
  rows: TestAllocationRow[]
  search: string
}) {
  const showAssistant = useShowAiAssistant()
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('section')
  const [dialogSession, setDialogSession] = useState(0)

  useEffect(() => {
    if (open) setDialogSession((n) => n + 1)
  }, [open])

  const listContext = useMemo(
    () => buildResultsUnderReviewListAssistantContext(rows, search),
    [rows, search],
  )

  const sectionCodes = useMemo(
    () => [...new Set(rows.map((r) => (r.sectionCode ?? '').trim()).filter(Boolean))].sort(),
    [rows],
  )

  const resolveSectionContext = useCallback(
    async (message: string) => {
      const code = parseSectionCodeFromMessage(message, sectionCodes)
      if (!code) {
        return {
          context: listContext,
          error: 'Enter a section code from your review table (Section Code column).',
        }
      }
      const row = findRowBySectionCode(rows, code)
      if (!row) {
        return {
          context: listContext,
          error: `Section "${code}" is not in your review list. Check spelling or clear the search filter.`,
        }
      }
      const context = await buildResultsUnderReviewSectionContext(row)
      return {
        context,
        isCodeId: row.isCodeId ?? undefined,
        displayMessage: `Section **${row.sectionCode}** (${row.srfNumber ?? 'SRF'}) — ask your review question.`,
      }
    },
    [listContext, rows, sectionCodes],
  )

  if (!showAssistant) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="gap-2 shrink-0" aria-label="Open QI Assistant">
          <Sparkles size={16} className="text-primary" />
          QI Assistant
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot size={20} className="text-primary" />
            Results Under Review Assistant
          </DialogTitle>
          <DialogDescription>
            Enter a section code for analysis limited to that section — requirements, results, and review guidance.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col px-5 pb-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="section">Section Analysis</TabsTrigger>
            <TabsTrigger value="general">General Q&amp;A</TabsTrigger>
          </TabsList>

          <TabsContent value="section" className="mt-3 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            <p className="mb-2 text-xs text-muted-foreground">
              Type a <strong>section code</strong>, then your question. Answers use only that section&apos;s sample
              description, declared value, IS PDFs, requirements, and reported results —{' '}
              <strong>suggestions only</strong>.
            </p>
            <QiAssistantChatPanel
              page="samples/results-review"
              contextSummary={listContext}
              resetKey={dialogSession * 10 + 1}
              resolveContextOnSend={resolveSectionContext}
              welcomeMessage={`**Section Analysis** — enter section code \`${sectionCodes[0] ?? 'YOUR-SECTION-CODE'}\`, then ask (e.g. "Do results meet requirements?" or "Refer back or approve?").\n\nI answer **only for that section**.`}
              suggestedQuestions={
                sectionCodes.length > 0
                  ? sectionCodes.slice(0, 4).flatMap((code) => [
                      `${code}`,
                      `Review ${code} — confirm results vs requirements`,
                    ]).slice(0, 4)
                  : ['Enter section code from the table']
              }
              placeholder="Section code, then question…"
            />
          </TabsContent>

          <TabsContent value="general" className="mt-3 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            <QiAssistantChatPanel
              page="samples/results-review"
              contextSummary={listContext}
              resetKey={dialogSession * 10 + 2}
              welcomeMessage={`Hello! I'm **QI Assistant** for **Results Under Review**. Ask about Refer back vs Approved workflow.${sectionCodes.length > 0 ? `\n\nYour review sections: ${sectionCodes.slice(0, 10).join(', ')}${sectionCodes.length > 10 ? '…' : ''}` : ''}\n\nFor deep analysis of one section, use the **Section Analysis** tab.`}
              suggestedQuestions={[
                'When should I use Refer back vs Approved?',
                'What should I check before approving results?',
                'Explain ISO 17025 Clause 7.8 review step',
              ]}
              placeholder="General question about results review…"
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
