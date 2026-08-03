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
  buildSampleUnderTestingListAssistantContext,
  buildSectionReviewAssistantContext,
  findRowBySectionCode,
  parseSectionCodeFromMessage,
} from './buildSampleUnderTestingAssistantContext'

export function SampleUnderTestingAssistant({
  rows,
  search,
}: {
  rows: TestAllocationRow[]
  search: string
}) {
  const showAssistant = useShowAiAssistant()
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('general')
  const [dialogSession, setDialogSession] = useState(0)

  useEffect(() => {
    if (open) setDialogSession((n) => n + 1)
  }, [open])

  const listContext = useMemo(
    () => buildSampleUnderTestingListAssistantContext(rows, search),
    [rows, search],
  )

  const sectionCodes = useMemo(
    () => [...new Set(rows.map((r) => (r.sectionCode ?? '').trim()).filter(Boolean))].sort(),
    [rows],
  )

  const resolveSectionReview = useCallback(
    async (message: string) => {
      const code = parseSectionCodeFromMessage(message, sectionCodes)
      if (!code) {
        return {
          context: listContext,
          error: 'Enter a section code from your table (e.g. copy from the Section column).',
        }
      }
      const row = findRowBySectionCode(rows, code)
      if (!row) {
        return {
          context: listContext,
          error: `No row found for section code "${code}". Check spelling or clear the search filter.`,
        }
      }
      const context = await buildSectionReviewAssistantContext(row)
      return {
        context,
        isCodeId: row.isCodeId ?? undefined,
        displayMessage: `Review section: **${row.sectionCode}** (${row.srfNumber ?? 'SRF'})`,
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
            Sample Under Testing Assistant
          </DialogTitle>
          <DialogDescription>
            General Q&amp;A about your assignments, or section review with IS standard and results suggestions.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col px-5 pb-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="general">General Q&amp;A</TabsTrigger>
            <TabsTrigger value="review">Section Review</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-3 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            <QiAssistantChatPanel
              page="samples/under-testing"
              contextSummary={listContext}
              resetKey={dialogSession * 10 + 1}
              welcomeMessage={`Hello! I'm **QI Assistant** for **Sample Under Testing**. Ask about results entry, dates, send-for-review, or your assigned sections.${sectionCodes.length > 0 ? `\n\nSection codes on screen: ${sectionCodes.slice(0, 12).join(', ')}${sectionCodes.length > 12 ? '…' : ''}` : ''}`}
              suggestedQuestions={[
                'How do I enter results for multiple test parameters?',
                'What is required before Send for Review?',
                'Explain test start and end dates per parameter',
                'Which sections are assigned to me?',
              ]}
              placeholder="Ask a general question about Sample Under Testing…"
            />
          </TabsContent>

          <TabsContent value="review" className="mt-3 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            <p className="mb-2 text-xs text-muted-foreground">
              Type a <strong>section code</strong> in the box (from the table). The assistant will review sample
              description, declared value, IS standard PDFs, specific requirements, reported results, and testing
              duration — <strong>suggestions only</strong>, no data changes.
            </p>
            <QiAssistantChatPanel
              page="samples/under-testing"
              contextSummary={listContext}
              resetKey={dialogSession * 10 + 2}
              resolveContextOnSend={resolveSectionReview}
              welcomeMessage={`**Section Review** — enter a section code (e.g. \`${sectionCodes[0] ?? 'YOUR-SECTION-CODE'}\`) and press Send.\n\nI will analyze sample description, declared value, IS Code PDFs, requirements vs results, and test timing. I provide suggestions only.`}
              suggestedQuestions={
                sectionCodes.length > 0
                  ? sectionCodes.slice(0, 4).map((code) => `Review section ${code}`)
                  : ['Enter your section code from the table']
              }
              placeholder="Section code, e.g. MECH-01…"
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
