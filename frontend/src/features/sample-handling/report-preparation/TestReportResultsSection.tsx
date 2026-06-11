import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { REPORT_SCOPE_SUFFIX, REPORT_SCOPE_TITLE, type ReportScopeKind } from './reportScope'
import { filterReportRowsByScope, type ReportResultRow } from './reportResultRows'
import { DEFAULT_LETTERHEAD_TEMPLATE_NAMES } from '@/features/settings/lab-settings/reportScopeTemplateTypes'
import {
  formatTestReportNumber,
  fromScopedReportNumberInput,
  reportNumberLastCharForScope,
  toReportNumberForScope,
  TEST_REPORT_TOTAL_LENGTH,
} from './formattedTestReportNumber'
import {
  NABL_ULR_CHAR_LENGTH,
  nablUlrPlaceholder,
  sanitizeNablUlrInput,
  ULR_PREFIX_SETTING_NAMES,
} from './nablUlrNumber'
import type { LetterheadTemplateOptions, ReportPrepLetterheadsByScope } from './reportPrepLetterhead'
import {
  isLetterheadNotApplicable,
  LETTERHEAD_NOT_APPLICABLE,
} from './reportPrepLetterhead'
import { TEST_REPORT_PREFIX_SETTING_NAMES } from './testReportNumberPrefix'
import { ReportResultsTable } from './ReportResultsTable'
import { formatTestReportEndNotesText, TEST_REPORT_END_MARKER } from './testReportEndNotes'

const NONE = '__none__'
const NA = LETTERHEAD_NOT_APPLICABLE

function letterheadSelectValue(value: string): string {
  const v = value.trim()
  if (isLetterheadNotApplicable(v)) return NA
  if (!v) return NONE
  return v
}

function TestReportEndNotesBlock() {
  return (
    <div
      className="border-t-2 border-t-primary/30 border-x border-b border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground leading-relaxed"
      role="note"
      aria-label="End of report notes"
    >
      <p className="text-center font-medium text-foreground/80 tracking-wide mb-2">
        {TEST_REPORT_END_MARKER}
      </p>
      <p className="text-justify">{formatTestReportEndNotesText()}</p>
    </div>
  )
}

function LetterheadSelect({
  id,
  label,
  value,
  options,
  defaultTemplateName,
  onChange,
  disabled,
}: {
  id: string
  label: string
  value: string
  options: string[]
  defaultTemplateName: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select
        value={letterheadSelectValue(value)}
        onValueChange={(v) => {
          if (v === NONE) onChange('')
          else if (v === NA) onChange(LETTERHEAD_NOT_APPLICABLE)
          else onChange(v)
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="h-9 text-sm">
          <SelectValue placeholder="From Lab Settings" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— Default: {defaultTemplateName} —</SelectItem>
          <SelectItem value={NA}>N/A</SelectItem>
          {options.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ScopePrepToolbar({
  scope,
  reportNumber,
  onReportNumberChange,
  testReportPrefix,
  reportNumberLoading,
  nablUlrNumber,
  onNablUlrNumberChange,
  ulrPrefix,
  ulrPrefixLoading,
  letterheadOptions,
  headerName,
  footerName,
  watermarkName,
  onHeaderChange,
  onFooterChange,
  onWatermarkChange,
  disabled,
}: {
  scope: ReportScopeKind
  reportNumber: string
  onReportNumberChange: (value: string) => void
  testReportPrefix: string
  reportNumberLoading: boolean
  nablUlrNumber: string
  onNablUlrNumberChange: (value: string) => void
  ulrPrefix: string
  ulrPrefixLoading: boolean
  letterheadOptions: LetterheadTemplateOptions
  headerName: string
  footerName: string
  watermarkName: string
  onHeaderChange: (value: string) => void
  onFooterChange: (value: string) => void
  onWatermarkChange: (value: string) => void
  disabled?: boolean
}) {
  const gridCols =
    scope === 'nabl'
      ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-5'
      : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'

  return (
    <div
      className={`grid ${gridCols} gap-3 rounded-md border border-border/40 bg-background/60 px-3 py-2.5`}
    >
      <div className="space-y-1.5 min-w-0 md:col-span-2 xl:col-span-1">
        <Label htmlFor={`tr-num-${scope}`} className="text-xs">
          Report Number
        </Label>
        <Input
          id={`tr-num-${scope}`}
          className="h-9 text-sm font-mono tracking-wide"
          value={toReportNumberForScope(reportNumber, scope)}
          onChange={(e) =>
            onReportNumberChange(fromScopedReportNumberInput(e.target.value, scope))
          }
          placeholder={
            testReportPrefix
              ? toReportNumberForScope(formatTestReportNumber(testReportPrefix, 1), scope)
              : '0'.repeat(Math.max(1, TEST_REPORT_TOTAL_LENGTH - 1)) +
                reportNumberLastCharForScope(scope)
          }
          maxLength={TEST_REPORT_TOTAL_LENGTH}
          disabled={disabled || reportNumberLoading}
          title={`Lab Settings → Prefix (${TEST_REPORT_PREFIX_SETTING_NAMES.join(' / ')}): ${testReportPrefix || '—'} · ends with ${reportNumberLastCharForScope(scope)}`}
        />
      </div>

      {scope === 'nabl' && (
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="tr-ulr" className="text-xs">
            ULR Number
          </Label>
          <Input
            id="tr-ulr"
            className="h-9 text-sm font-mono tracking-wide"
            value={nablUlrNumber}
            onChange={(e) => onNablUlrNumberChange(sanitizeNablUlrInput(e.target.value))}
            placeholder={nablUlrPlaceholder(ulrPrefix)}
            maxLength={NABL_ULR_CHAR_LENGTH}
            disabled={disabled || ulrPrefixLoading}
            title={`NABL 18-position ULR (19 chars; TC = position 1) · Lab Settings → Prefix (${ULR_PREFIX_SETTING_NAMES.join(' / ')}): ${ulrPrefix || '—'}`}
          />
        </div>
      )}

      <LetterheadSelect
        id={`lh-upper-${scope}`}
        label="Letter Head Upper"
        value={headerName}
        options={letterheadOptions.headers}
        defaultTemplateName={
          scope === 'nabl'
            ? DEFAULT_LETTERHEAD_TEMPLATE_NAMES.nablHeader
            : DEFAULT_LETTERHEAD_TEMPLATE_NAMES.nonNablHeader
        }
        onChange={onHeaderChange}
        disabled={disabled}
      />

      <LetterheadSelect
        id={`lh-lower-${scope}`}
        label="Letter Head Lower"
        value={footerName}
        options={letterheadOptions.footers}
        defaultTemplateName={DEFAULT_LETTERHEAD_TEMPLATE_NAMES.footer}
        onChange={onFooterChange}
        disabled={disabled}
      />

      <LetterheadSelect
        id={`wm-${scope}`}
        label="Water Mark"
        value={watermarkName}
        options={letterheadOptions.watermarks}
        defaultTemplateName="None"
        onChange={onWatermarkChange}
        disabled={disabled}
      />
    </div>
  )
}

export function TestReportResultsSection({
  resultsLoading,
  applicableScopes,
  activeScope,
  onActiveScopeChange,
  resultRows,
  reportNumber,
  onReportNumberChange,
  testReportPrefix,
  reportNumberLoading,
  nablUlrNumber,
  onNablUlrNumberChange,
  ulrPrefix,
  ulrPrefixLoading,
  letterheadOptions,
  letterheadsByScope,
  onLetterheadChange,
  onRemarkChange,
  disabled,
}: {
  resultsLoading: boolean
  applicableScopes: ReportScopeKind[]
  activeScope: ReportScopeKind
  onActiveScopeChange: (scope: ReportScopeKind) => void
  resultRows: ReportResultRow[]
  reportNumber: string
  onReportNumberChange: (value: string) => void
  testReportPrefix: string
  reportNumberLoading: boolean
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
  onRemarkChange?: (rowKey: string, remark: string) => void
  disabled?: boolean
}) {
  return (
    <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 shadow-sm ring-1 ring-primary/15">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">
        Part C — Test Results
      </h3>
      <div className="rounded-md border border-primary/20 bg-background/80 p-3 shadow-inner">
        {resultsLoading ? (
          <p className="text-sm text-muted-foreground py-2">Loading test results…</p>
        ) : applicableScopes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No completed test results for this SRF.
          </p>
        ) : (
          <Tabs
            value={activeScope}
            onValueChange={(v) => onActiveScopeChange(v as ReportScopeKind)}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 h-auto gap-1 bg-primary/10 p-1 border border-primary/20">
              {applicableScopes.map((scope) => (
                <TabsTrigger
                  key={scope}
                  value={scope}
                  className="text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
                >
                  {REPORT_SCOPE_TITLE[scope]} ({REPORT_SCOPE_SUFFIX[scope]})
                </TabsTrigger>
              ))}
            </TabsList>
            {applicableScopes.map((scope) => {
              const scopedRows = filterReportRowsByScope(resultRows, scope)
              const lh = letterheadsByScope[scope]
              return (
                <TabsContent
                  key={scope}
                  value={scope}
                  className="space-y-3 mt-3 focus-visible:outline-none"
                >
                  <ScopePrepToolbar
                    scope={scope}
                    reportNumber={reportNumber}
                    onReportNumberChange={onReportNumberChange}
                    testReportPrefix={testReportPrefix}
                    reportNumberLoading={reportNumberLoading}
                    nablUlrNumber={nablUlrNumber}
                    onNablUlrNumberChange={onNablUlrNumberChange}
                    ulrPrefix={ulrPrefix}
                    ulrPrefixLoading={ulrPrefixLoading}
                    letterheadOptions={letterheadOptions}
                    headerName={lh.headerName}
                    footerName={lh.footerName}
                    watermarkName={lh.watermarkName}
                    onHeaderChange={(v) => onLetterheadChange(scope, 'headerName', v)}
                    onFooterChange={(v) => onLetterheadChange(scope, 'footerName', v)}
                    onWatermarkChange={(v) => onLetterheadChange(scope, 'watermarkName', v)}
                    disabled={disabled}
                  />
                  <div className="overflow-hidden rounded-md border-2 border-primary/25">
                    <ReportResultsTable
                      rows={scopedRows}
                      showScope={false}
                      embedded
                      groupBySectionCode
                      editable
                      onRemarkChange={onRemarkChange}
                      disabled={disabled}
                    />
                    {scopedRows.length > 0 && <TestReportEndNotesBlock />}
                  </div>
                </TabsContent>
              )
            })}
          </Tabs>
        )}
      </div>
    </div>
  )
}
