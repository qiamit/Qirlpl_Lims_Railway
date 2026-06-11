import { useEffect, useMemo, useState } from 'react'
import { LayoutTemplate, PenLine, Printer, Save, Settings2, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { type ReportScopeKind, REPORT_SCOPE_SUFFIX } from './reportScope'
import { getApplicableReportScopes, filterReportRowsByScope, type ReportResultRow } from './reportResultRows'
import { TestReportResultsSection } from './TestReportResultsSection'
import { TestReportCoverDetailsGrid } from './TestReportCoverDetailsGrid'
import { TestReportSupplementaryGrid } from './TestReportSupplementaryGrid'
import { TestReportRemarksSection } from './TestReportRemarksSection'
import { formatSectionReportLine, type TestReportCoverDetails } from './fetchTestReportCoverDetails'
import type { TestReportPartBDetails } from './testReportPartB'
import type { LetterheadTemplateOptions, ReportPrepLetterheadsByScope } from './reportPrepLetterhead'
import type { ReportPreparationListRow } from './buildTestReportPreparationAssistantContext'
import { TestReportPrepareDialogAssistant } from './TestReportPrepareDialogAssistant'
import {
  TestReportPageSettingDialog,
  TestReportPrintSettingDialog,
  TestReportSignatureSettingDialog,
  useTestReportPrintSettingsForPrepare,
} from './TestReportPreparePrintDialogs'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

export function TestReportPrepareDialog({
  open,
  onOpenChange,
  active,
  reportNumber,
  onReportNumberChange,
  testReportPrefix,
  reportNumberLoading,
  draftNotes,
  onDraftNotesChange,
  nablUlrNumber,
  onNablUlrNumberChange,
  ulrPrefix,
  ulrPrefixLoading,
  letterheadOptions,
  letterheadsByScope,
  onLetterheadChange,
  coverDetails,
  partBDetails,
  onPartBDetailsChange,
  coverLoading,
  resultRows,
  resultsLoading,
  saveMessage,
  saveLoading,
  issueLoading,
  onSaveDraft,
  onIssueReports,
  onPrintScope,
  onRemarkChange,
  sampleReceivingEditUnlocked,
  onSampleReceivingEditUnlockedChange,
  sampleReceivingEditUnlockLoading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  active: ReportPreparationListRow | null
  reportNumber: string
  onReportNumberChange: (value: string) => void
  testReportPrefix: string
  reportNumberLoading: boolean
  draftNotes: string
  onDraftNotesChange: (value: string) => void
  nablUlrNumber: string
  onNablUlrNumberChange: (value: string) => void
  ulrPrefix: string
  ulrPrefixLoading: boolean
  letterheadOptions: LetterheadTemplateOptions
  letterheadsByScope: ReportPrepLetterheadsByScope
  onLetterheadChange: (
    scope: ReportScopeKind,
    field: 'headerName' | 'footerName' | 'watermarkName',
    value: string,
  ) => void
  coverDetails: TestReportCoverDetails | null
  partBDetails: TestReportPartBDetails | null
  onPartBDetailsChange: (next: TestReportPartBDetails) => void
  coverLoading: boolean
  resultRows: ReportResultRow[]
  resultsLoading: boolean
  saveMessage: string | null
  saveLoading: boolean
  issueLoading: boolean
  onSaveDraft: () => void
  onIssueReports: () => void
  onPrintScope: (scope: ReportScopeKind) => void
  onRemarkChange?: (rowKey: string, remark: string) => void
  sampleReceivingEditUnlocked: boolean
  onSampleReceivingEditUnlockedChange: (unlocked: boolean) => void
  sampleReceivingEditUnlockLoading?: boolean
}) {
  const applicableScopes = getApplicableReportScopes(resultRows)
  const [activeReportScope, setActiveReportScope] = useState<ReportScopeKind>('nabl')
  const [printSettingOpen, setPrintSettingOpen] = useState(false)
  const [pageSettingOpen, setPageSettingOpen] = useState(false)
  const [signatureSettingOpen, setSignatureSettingOpen] = useState(false)
  const printSettingsControls = useTestReportPrintSettingsForPrepare(open)

  useEffect(() => {
    if (!open || applicableScopes.length === 0) return
    setActiveReportScope((prev) =>
      applicableScopes.includes(prev) ? prev : applicableScopes[0],
    )
  }, [open, applicableScopes])

  const liveCoverDetails = useMemo((): TestReportCoverDetails | null => {
    if (!coverDetails) return null
    const partB = partBDetails ?? coverDetails.partB
    return {
      ...coverDetails,
      partB,
      sectionReportLine: formatSectionReportLine(
        coverDetails.sectionCodes,
        coverDetails.sectionReportNo,
        coverDetails.reportType,
      ),
    }
  }, [coverDetails, partBDetails])

  const activeScopeRowCount = filterReportRowsByScope(resultRows, activeReportScope).length
  const printDraftDisabled =
    !active ||
    coverLoading ||
    saveLoading ||
    issueLoading ||
    applicableScopes.length === 0 ||
    activeScopeRowCount === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Test Report for SRF Number
            {active?.srfNumber?.trim() ? ` — ${fmt(active.srfNumber)}` : ''}
          </DialogTitle>
        </DialogHeader>

        {active && (
          <div className="space-y-4">
            {saveMessage && <p className="text-sm text-muted-foreground">{saveMessage}</p>}

            {coverLoading ? (
              <p className="text-sm text-muted-foreground">Loading report cover details…</p>
            ) : liveCoverDetails ? (
              <div className="space-y-4">
                <TestReportCoverDetailsGrid
                  details={liveCoverDetails}
                  reportNumber={reportNumber}
                  onReportNumberChange={onReportNumberChange}
                  testReportPrefix={testReportPrefix}
                  reportNumberLoading={reportNumberLoading}
                  nablUlrNumber={nablUlrNumber}
                  onNablUlrNumberChange={onNablUlrNumberChange}
                  ulrPrefix={ulrPrefix}
                  ulrPrefixLoading={ulrPrefixLoading}
                  activeScope={activeReportScope}
                  sampleReceivingEditUnlocked={sampleReceivingEditUnlocked}
                  onSampleReceivingEditUnlockedChange={onSampleReceivingEditUnlockedChange}
                  sampleReceivingEditUnlockLoading={sampleReceivingEditUnlockLoading}
                  disabled={coverLoading || saveLoading || issueLoading}
                />
                {liveCoverDetails.partB && (
                  <TestReportSupplementaryGrid
                    details={liveCoverDetails.partB}
                    onChange={onPartBDetailsChange}
                    disabled={coverLoading || saveLoading || issueLoading}
                  />
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Unable to load report cover details.</p>
            )}

            <TestReportResultsSection
              resultsLoading={resultsLoading}
              applicableScopes={applicableScopes}
              activeScope={activeReportScope}
              onActiveScopeChange={setActiveReportScope}
              resultRows={resultRows}
              reportNumber={reportNumber}
              onReportNumberChange={onReportNumberChange}
              testReportPrefix={testReportPrefix}
              reportNumberLoading={reportNumberLoading}
              nablUlrNumber={nablUlrNumber}
              onNablUlrNumberChange={onNablUlrNumberChange}
              ulrPrefix={ulrPrefix}
              ulrPrefixLoading={ulrPrefixLoading}
              letterheadOptions={letterheadOptions}
              letterheadsByScope={letterheadsByScope}
              onLetterheadChange={onLetterheadChange}
              onRemarkChange={onRemarkChange}
              disabled={saveLoading || issueLoading}
            />

            <TestReportRemarksSection
              remarks={draftNotes}
              onRemarksChange={onDraftNotesChange}
              isCodeLabel={active?.isCodeLabel ?? liveCoverDetails?.isDetails ?? null}
              disabled={saveLoading || issueLoading}
            />
          </div>
        )}

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <TestReportPrepareDialogAssistant
            row={active}
            coverDetails={liveCoverDetails}
            partBDetails={partBDetails}
            resultRows={resultRows}
            reportNumber={reportNumber}
            nablUlrNumber={nablUlrNumber}
            draftNotes={draftNotes}
            disabled={coverLoading || saveLoading || issueLoading}
            prepareDialogOpen={open}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPrintSettingOpen(true)}
              disabled={coverLoading || saveLoading || issueLoading}
              className="gap-2"
            >
              <Settings2 size={16} />
              Print Setting
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPageSettingOpen(true)}
              disabled={coverLoading || saveLoading || issueLoading}
              className="gap-2"
            >
              <LayoutTemplate size={16} />
              Page Setting
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSignatureSettingOpen(true)}
              disabled={coverLoading || saveLoading || issueLoading}
              className="gap-2"
            >
              <PenLine size={16} />
              Signatures
            </Button>
            <Button
              type="button"
              variant="outline"
              id={`print-${activeReportScope}`}
              onClick={() => onPrintScope(activeReportScope)}
              disabled={printDraftDisabled}
              className="gap-2 border-primary/30 hover:bg-primary/5"
            >
              <Printer size={16} />
              Print {REPORT_SCOPE_SUFFIX[activeReportScope]} Draft
            </Button>
            <Button type="button" variant="secondary" onClick={onSaveDraft} disabled={!active || saveLoading}>
              <Save size={16} className="mr-2" />
              {saveLoading ? 'Saving…' : 'Save Draft'}
            </Button>
            <Button
              type="button"
              onClick={onIssueReports}
              disabled={!active || issueLoading || applicableScopes.length === 0}
            >
              <CheckCircle size={16} className="mr-2" />
              {issueLoading ? 'Issuing…' : 'Issue Test Report'}
            </Button>
          </div>
        </DialogFooter>

        <TestReportPrintSettingDialog
          open={printSettingOpen}
          onOpenChange={setPrintSettingOpen}
          controls={printSettingsControls}
        />
        <TestReportPageSettingDialog
          open={pageSettingOpen}
          onOpenChange={setPageSettingOpen}
          controls={printSettingsControls}
        />
        <TestReportSignatureSettingDialog
          open={signatureSettingOpen}
          onOpenChange={setSignatureSettingOpen}
          controls={printSettingsControls}
        />
      </DialogContent>
    </Dialog>
  )
}
