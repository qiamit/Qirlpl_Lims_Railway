import { useEffect, useMemo, useState } from 'react'
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
import { QiAssistantChatPanel } from '@/components/qi-assistant/QiAssistantChatPanel'
import type { TestReportCoverDetails } from './fetchTestReportCoverDetails'
import {
  buildTestReportPrepareDialogAssistantContext,
  type ReportPreparationListRow,
} from './buildTestReportPreparationAssistantContext'
import type { ReportResultRow } from './reportResultRows'
import type { TestReportPartBDetails } from './testReportPartB'

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
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(0)

  useEffect(() => {
    if (open) setSession((n) => n + 1)
  }, [open])

  useEffect(() => {
    if (!prepareDialogOpen) setOpen(false)
  }, [prepareDialogOpen])

  const contextSummary = useMemo(() => {
    if (!row) return 'No SRF selected.'
    return buildTestReportPrepareDialogAssistantContext({
      row,
      coverDetails,
      partBDetails,
      resultRows,
      reportNumber,
      nablUlrNumber,
      draftNotes,
    })
  }, [row, coverDetails, partBDetails, resultRows, reportNumber, nablUlrNumber, draftNotes])

  const isCodeId = row?.isCodeId?.trim() || undefined
  const srfLabel = row?.srfNumber?.trim() || 'this SRF'

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
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot size={20} className="text-primary" />
            Test Report AI Assistant
          </DialogTitle>
          <DialogDescription>
            Reviews IS standards (PDF), customer &amp; sample data, and the full draft report — then
            advises <strong>OK</strong> or <strong>NOT OK</strong> before issue. Suggestions only.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col px-5 pb-4 pt-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Context: <strong>{srfLabel}</strong>
            {isCodeId ? ' · IS standard PDFs loaded when available' : ' · No IS code linked — PDF review limited'}
          </p>
          <QiAssistantChatPanel
            page="samples/report-preparation"
            contextSummary={contextSummary}
            staticIsCodeId={isCodeId}
            resetKey={session}
            welcomeMessage={`I review the **draft test report** on screen for **${srfLabel}**.\n\nI can:\n1. Cross-check **IS codes & test methods** against uploaded standard PDFs\n2. Review **customer & sample information** (Part A)\n3. Review the **complete report** (Parts B–D and results)\n4. Give a **Final Verdict: OK or NOT OK**\n\nTry **“Full pre-issue review”** or ask about a specific part.`}
            suggestedQuestions={[
              'Full pre-issue review with Final Verdict',
              'Review Part A customer and sample information',
              'Check Part C results vs IS standard PDF',
              'Is this test report OK to issue?',
            ]}
            placeholder="Ask for full review or a specific section…"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
