import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useShowAiAssistant } from '@/hooks/useShowAiAssistant'
import { QiAssistantChatPanel } from '@/components/qi-assistant/QiAssistantChatPanel'
import { limsAiTriggerClass, limsDarkBarGlowStyle, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(limsAiTriggerClass, 'h-8 gap-2 shrink-0')}
          aria-label="Open QI Assistant"
        >
          <Sparkles size={16} />
          QI Assistant
        </Button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        portalClassName="lg:left-[268px]"
        className={cn(
          limsDialogClass,
          'flex max-h-[88vh] flex-col p-0 sm:max-w-xl',
          'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-white">
              <Bot size={20} className="text-amber-200" />
              Sample Under Testing Assistant
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-[#f7f3eb] px-4 pb-4 pt-3 sm:px-5">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="mb-3 grid h-auto w-full grid-cols-2 gap-1 rounded-none border border-stone-500 bg-stone-200/80 p-1">
              <TabsTrigger
                value="general"
                className="rounded-none py-2 text-xs text-stone-600 sm:text-sm data-[state=active]:bg-stone-800 data-[state=active]:text-amber-100"
              >
                General Q&amp;A
              </TabsTrigger>
              <TabsTrigger
                value="review"
                className="rounded-none py-2 text-xs text-stone-600 sm:text-sm data-[state=active]:bg-stone-800 data-[state=active]:text-amber-100"
              >
                Section Review
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              <QiAssistantChatPanel
                page="samples/under-testing"
                contextSummary={listContext}
                resetKey={dialogSession * 10 + 1}
                placeholder="Ask a general question about Sample Under Testing…"
              />
            </TabsContent>

            <TabsContent value="review" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              <p className="mb-2 text-xs text-stone-600">
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
