import { useEffect, useMemo, useState } from 'react'
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
import type { TestReportCoverDetails } from './fetchTestReportCoverDetails'
import {
  buildTestReportPrepareDialogAssistantContext,
  expandFullReviewUserMessage,
  FULL_REVIEW_USER_COMMAND,
  type ReportPreparationListRow,
} from './buildTestReportPreparationAssistantContext'
import type { ReportResultRow } from './reportResultRows'
import type { TestReportPartBDetails } from './testReportPartB'

type AssistantTab = 'full_review' | 'general_ask'

export function TestReportPrepareDialogAssistant({
  row,
  coverDetails,
  partBDetails,
  resultRows,
  reportNumber,
  nablUlrNumber,
  draftNotes,
  disabled,
  prepareDialogOpen,
}: {
  row: ReportPreparationListRow | null
  coverDetails: TestReportCoverDetails | null
  partBDetails: TestReportPartBDetails | null
  resultRows: ReportResultRow[]
  reportNumber: string
  nablUlrNumber: string
  draftNotes: string
  disabled?: boolean
  /** Parent prepare dialog open — resets chat when reopened */
  prepareDialogOpen: boolean
}) {
  const showAssistant = useShowAiAssistant()
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<AssistantTab>('full_review')
  const [fullReviewSession, setFullReviewSession] = useState(0)
  const [generalAskSession, setGeneralAskSession] = useState(0)

  useEffect(() => {
    if (open) {
      setFullReviewSession((n) => n + 1)
      setGeneralAskSession((n) => n + 1)
    }
  }, [open])

  useEffect(() => {
    if (!prepareDialogOpen) setOpen(false)
  }, [prepareDialogOpen])

  const assistantInput = useMemo(
    () => ({
      row: row!,
      coverDetails,
      partBDetails,
      resultRows,
      reportNumber,
      nablUlrNumber,
      draftNotes,
    }),
    [row, coverDetails, partBDetails, resultRows, reportNumber, nablUlrNumber, draftNotes],
  )

  const fullReviewContext = useMemo(() => {
    if (!row) return 'No SRF selected.'
    return buildTestReportPrepareDialogAssistantContext(assistantInput, 'full_review')
  }, [row, assistantInput])

  const generalAskContext = useMemo(() => {
    if (!row) return 'No SRF selected.'
    return buildTestReportPrepareDialogAssistantContext(assistantInput, 'general_ask')
  }, [row, assistantInput])

  const isCodeId = row?.isCodeId?.trim() || undefined

  if (!showAssistant) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="gap-2 shrink-0"
          disabled={disabled || !row}
          aria-label="Open Test Report AI Assistant"
        >
          <Sparkles size={16} className="text-primary" />
          AI Assistant
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot size={20} className="text-primary" />
            Test Report AI Assistant
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col px-5 pb-4 pt-3">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as AssistantTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="mb-3 grid h-auto w-full grid-cols-2 gap-1 bg-muted/50 p-1">
              <TabsTrigger value="full_review" className="text-xs sm:text-sm py-2">
                Full Review of Report
              </TabsTrigger>
              <TabsTrigger value="general_ask" className="text-xs sm:text-sm py-2">
                General Ask
              </TabsTrigger>
            </TabsList>

            <TabsContent value="full_review" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              <QiAssistantChatPanel
                page="samples/report-preparation"
                contextSummary={fullReviewContext}
                staticIsCodeId={isCodeId}
                staticActiveRecordId={row?.id}
                staticActiveRecordTable="samples"
                resetKey={fullReviewSession}
                prepareMessage={expandFullReviewUserMessage}
                primaryAction={{
                  label: 'Full Review',
                  message: FULL_REVIEW_USER_COMMAND,
                }}
                placeholder='Type "Full Review" or ask about a specific part…'
              />
            </TabsContent>

            <TabsContent value="general_ask" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              <QiAssistantChatPanel
                page="samples/report-preparation"
                contextSummary={generalAskContext}
                staticIsCodeId={isCodeId}
                staticActiveRecordId={row?.id}
                staticActiveRecordTable="samples"
                resetKey={generalAskSession}
                placeholder="Ask about IS code, clauses, test methods, or report wording…"
              />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
