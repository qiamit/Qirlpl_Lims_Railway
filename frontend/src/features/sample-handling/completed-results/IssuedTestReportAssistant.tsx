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
import { limsAiTriggerClass, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  buildIssuedSrfReportAssistantContext,
  buildIssuedTestReportListContext,
  findIssuedRowBySrf,
  parseSrfFromMessage,
} from './buildIssuedTestReportAssistantContext'
import type { IssuedTestReportListRow } from './types'

export function IssuedTestReportAssistant({
  rows,
  search,
}: {
  rows: IssuedTestReportListRow[]
  search: string
}) {
  const showAssistant = useShowAiAssistant()
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('srf')
  const [dialogSession, setDialogSession] = useState(0)

  useEffect(() => {
    if (open) setDialogSession((n) => n + 1)
  }, [open])

  const listContext = useMemo(
    () => buildIssuedTestReportListContext(rows, search),
    [rows, search],
  )

  const srfNumbers = useMemo(
    () => [...new Set(rows.map((r) => (r.srfNumber ?? '').trim()).filter(Boolean))].sort(),
    [rows],
  )

  const resolveSrfContext = useCallback(
    async (message: string) => {
      const srf = parseSrfFromMessage(message, srfNumbers)
      if (!srf) {
        return {
          context: listContext,
          error: 'Enter an SRF number from the table (SRF column).',
        }
      }
      const row = findIssuedRowBySrf(rows, srf)
      if (!row) {
        return {
          context: listContext,
          error: `SRF "${srf}" is not in your issued reports list. Check spelling or clear the search filter.`,
        }
      }
      const { context, isCodeId } = await buildIssuedSrfReportAssistantContext(row)
      return {
        context,
        isCodeId,
        activeRecordId: row.id,
        activeRecordTable: 'samples',
        displayMessage: `SRF **${row.srfNumber ?? srf}** — issued report review.`,
      }
    },
    [listContext, rows, srfNumbers],
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
      <DialogContent className={cn(limsDialogClass, 'flex max-h-[88vh] flex-col sm:max-w-xl')}>
        <DialogHeader className="border-b border-stone-200 bg-[#f7f3eb] px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base text-[#1c1917]">
            <Bot size={20} className="text-amber-700" />
            Issued Test Report Assistant
          </DialogTitle>
          <DialogDescription>
            Review issued reports using IS standard PDFs, sample data, and stored results — suggestions only.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col px-5 pb-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="srf">SRF Analysis</TabsTrigger>
            <TabsTrigger value="general">General Q&amp;A</TabsTrigger>
          </TabsList>

          <TabsContent value="srf" className="mt-3 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            <p className="mb-2 text-xs text-muted-foreground">
              Type an <strong>SRF number</strong>, then your question. I load the full issued report (Parts A–D,
              results, NABL/Non-NABL numbers) and IS PDFs when available — <strong>advisory only</strong>.
            </p>
            <QiAssistantChatPanel
              page="samples/issued-test-report"
              contextSummary={listContext}
              resetKey={dialogSession * 10 + 1}
              resolveContextOnSend={resolveSrfContext}
              welcomeMessage={`**SRF Analysis** — enter SRF \`${srfNumbers[0] ?? 'YOUR-SRF'}\`, then ask (e.g. "Full issued report review" or "Check results vs IS standard").\n\nI answer **only for that issued SRF**.`}
              suggestedQuestions={
                srfNumbers.length > 0
                  ? srfNumbers.slice(0, 2).flatMap((srf) => [
                      `${srf}`,
                      `${srf} — full issued report review`,
                    ])
                  : ['Enter SRF from the table']
              }
              placeholder="SRF number, then your question…"
            />
          </TabsContent>

          <TabsContent value="general" className="mt-3 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            <QiAssistantChatPanel
              page="samples/issued-test-report"
              contextSummary={listContext}
              resetKey={dialogSession * 10 + 2}
              welcomeMessage="Ask about issued test reports, NABL vs Non-NABL numbers, ULR, or when an amendment/supplementary report may be needed."
              suggestedQuestions={[
                'What is stored in Issued Test Report?',
                'Difference between NABL and Non-NABL report numbers?',
                'When is an amendment or supplementary report needed?',
              ]}
              placeholder="General question about issued reports…"
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
