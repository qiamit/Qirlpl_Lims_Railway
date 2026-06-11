import { Input } from '@/components/ui/input'
import type { TestReportCoverDetails } from './fetchTestReportCoverDetails'
import {
  formatTestReportNumber,
  fromScopedReportNumberInput,
  reportNumberLastCharForScope,
  TEST_REPORT_TOTAL_LENGTH,
  toReportNumberForScope,
} from './formattedTestReportNumber'
import {
  NABL_ULR_CHAR_LENGTH,
  nablUlrPlaceholder,
  sanitizeNablUlrInput,
  ULR_PREFIX_SETTING_NAMES,
} from './nablUlrNumber'
import type { ReportScopeKind } from './reportScope'
import {
  REPORT_PART_INNER_CLASS,
  REPORT_PART_INNER_DIVIDE,
  REPORT_PART_OUTER_CLASS,
  REPORT_PART_ROW_BORDER,
} from './reportPartUiClasses'

const display = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

/** Label and value on one line; long values wrap after the hyphen */
const PART_A_INLINE_CELL =
  'min-w-0 px-4 py-2.5 text-sm leading-snug break-words sm:py-3'

function PartAInlineLine({
  label,
  value,
  valueOnly,
}: {
  label: string
  value: string | null | undefined
  valueOnly?: boolean
}) {
  return (
    <div className={PART_A_INLINE_CELL}>
      {valueOnly ? (
        <span className="font-medium">{display(value)}</span>
      ) : (
        <>
          <span className="text-muted-foreground">{label}</span>
          <span className="text-muted-foreground"> - </span>
          <span className="font-medium">{display(value)}</span>
        </>
      )}
    </div>
  )
}

const PART_A_INLINE_INPUT =
  'inline h-auto min-h-0 w-auto min-w-[10ch] max-w-full border-0 bg-transparent p-0 shadow-none font-medium font-mono tracking-wide align-baseline focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0 rounded-sm'

function PartAInlineEditableCell({
  id,
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  disabled,
  title,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  disabled?: boolean
  title?: string
}) {
  return (
    <div className={PART_A_INLINE_CELL}>
      <label htmlFor={id} className="inline cursor-text">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground"> - </span>
        <Input
          id={id}
          className={PART_A_INLINE_INPUT}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          title={title}
          aria-label={label}
        />
      </label>
    </div>
  )
}

function PartAReportIdentifiersRow({
  dateOfReporting,
  activeScope,
  reportNumber,
  onReportNumberChange,
  testReportPrefix,
  reportNumberLoading,
  nablUlrNumber,
  onNablUlrNumberChange,
  ulrPrefix,
  ulrPrefixLoading,
  disabled,
}: {
  dateOfReporting: string | null
  activeScope: ReportScopeKind
  reportNumber: string
  onReportNumberChange: (value: string) => void
  testReportPrefix: string
  reportNumberLoading: boolean
  nablUlrNumber: string
  onNablUlrNumberChange: (value: string) => void
  ulrPrefix: string
  ulrPrefixLoading: boolean
  disabled?: boolean
}) {
  const showUlr = activeScope === 'nabl'
  const reportPlaceholder = testReportPrefix
    ? toReportNumberForScope(formatTestReportNumber(testReportPrefix, 1), activeScope)
    : '0'.repeat(Math.max(1, TEST_REPORT_TOTAL_LENGTH - 1)) + reportNumberLastCharForScope(activeScope)
  const ulrPlaceholder = nablUlrPlaceholder(ulrPrefix)

  return (
    <div className={`md:col-span-2 border-b ${REPORT_PART_ROW_BORDER}`}>
      <div
        className={`grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x ${REPORT_PART_INNER_DIVIDE} ${
          showUlr ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
        }`}
      >
        <PartAInlineLine label="Date of Reporting" value={dateOfReporting} />
        <PartAInlineEditableCell
          id="part-a-report-number"
          label="Report Number"
          value={toReportNumberForScope(reportNumber, activeScope)}
          onChange={(v) => onReportNumberChange(fromScopedReportNumberInput(v, activeScope))}
          placeholder={reportPlaceholder}
          maxLength={TEST_REPORT_TOTAL_LENGTH}
          disabled={disabled || reportNumberLoading}
          title={`Same as Part C ${activeScope === 'nabl' ? 'NABL' : 'Non-NABL'} tab · ends with ${reportNumberLastCharForScope(activeScope)}`}
        />
        {showUlr ? (
          <PartAInlineEditableCell
            id="part-a-ulr-number"
            label="ULR Number"
            value={nablUlrNumber}
            onChange={(v) => onNablUlrNumberChange(sanitizeNablUlrInput(v))}
            placeholder={ulrPlaceholder}
            maxLength={NABL_ULR_CHAR_LENGTH}
            disabled={disabled || ulrPrefixLoading}
            title={`NABL 18-position ULR (19 chars) · Same as Part C NABL toolbar · ${ULR_PREFIX_SETTING_NAMES.join(' / ')}`}
          />
        ) : null}
      </div>
    </div>
  )
}

type FieldRow = {
  kind: 'field'
  key: keyof TestReportCoverDetails
  label: string
  fullWidth?: boolean
  inlineLine?: boolean
  valueOnly?: boolean
}

type ThreeColumnRow = {
  kind: 'threeColumn'
  id: string
  columns: Array<{ key: keyof TestReportCoverDetails; label: string }>
}

const SAMPLE_ID_COLUMNS: ThreeColumnRow['columns'] = [
  { key: 'sampleCode', label: 'Sample Code' },
  { key: 'sampleQrCode', label: 'QR Code / Bar Code' },
  { key: 'natureOfSample', label: 'Nature of Sample' },
]

const BATCH_PARTY_COLUMNS: ThreeColumnRow['columns'] = [
  { key: 'batchNumber', label: 'Batch Number' },
  { key: 'dateOfManufacturing', label: 'Date of Manufacturing' },
  { key: 'partyReferenceNo', label: 'Party Reference No' },
]

const TESTING_DATES_COLUMNS: ThreeColumnRow['columns'] = [
  { key: 'dateOfSampleReceipt', label: 'Date of Sample Receipt' },
  { key: 'dateOfTestingStarted', label: 'Date of Testing Started' },
  { key: 'dateOfTestingCompleted', label: 'Date of Testing Completed' },
]

const SECTION_REPORT_COLUMNS: ThreeColumnRow['columns'] = [
  { key: 'sectionCodes', label: 'Section Code' },
  { key: 'sectionReportNo', label: 'Section Report No' },
  { key: 'reportType', label: 'Report Type' },
]

const SAMPLE_QTY_BIS_IO_COLUMNS: ThreeColumnRow['columns'] = [
  { key: 'sampleQuantity', label: 'Sample Quantity' },
  { key: 'bisSeal', label: 'BIS Seal' },
  { key: 'ioSignature', label: "IO's Signature" },
]

const REPORTING_REFERENCE_OTHER_COLUMNS: ThreeColumnRow['columns'] = [
  { key: 'referenceReportNo', label: 'Reference Report No' },
  { key: 'anyOtherInformation', label: 'Any Other Information' },
]

const COVER_ITEMS: Array<FieldRow | ThreeColumnRow> = [
  { kind: 'field', key: 'customerDetails', label: 'Customer Details', fullWidth: true, inlineLine: true },
  { kind: 'field', key: 'isDetails', label: 'IS Details', fullWidth: true, inlineLine: true },
  { kind: 'threeColumn', columns: SAMPLE_ID_COLUMNS, id: 'sample-id' },
  { kind: 'threeColumn', columns: BATCH_PARTY_COLUMNS, id: 'batch-party' },
  { kind: 'threeColumn', columns: SAMPLE_QTY_BIS_IO_COLUMNS, id: 'sample-qty-bis-io' },
  { kind: 'threeColumn', columns: SECTION_REPORT_COLUMNS, id: 'section-report' },
  { kind: 'threeColumn', columns: TESTING_DATES_COLUMNS, id: 'testing-dates' },
  { kind: 'threeColumn', columns: REPORTING_REFERENCE_OTHER_COLUMNS, id: 'reporting-reference-other' },
  { kind: 'field', key: 'sampleDescription', label: 'Sample Description', fullWidth: true, inlineLine: true },
  { kind: 'field', key: 'declaredValue', label: 'Declared Value', fullWidth: true, inlineLine: true },
]

function ThreeColumnBlock({
  columns,
  details,
}: {
  columns: ThreeColumnRow['columns']
  details: TestReportCoverDetails
}) {
  const gridCols =
    columns.length === 2
      ? 'grid grid-cols-1 sm:grid-cols-2'
      : 'grid grid-cols-1 sm:grid-cols-3'

  return (
    <div className={`md:col-span-2 border-b ${REPORT_PART_ROW_BORDER}`}>
      <div className={`${gridCols} divide-y sm:divide-y-0 sm:divide-x ${REPORT_PART_INNER_DIVIDE}`}>
        {columns.map(({ key, label }) => (
          <PartAInlineLine key={key} label={label} value={details[key]} />
        ))}
      </div>
    </div>
  )
}

function FieldBlock({
  item,
  details,
}: {
  item: FieldRow
  details: TestReportCoverDetails
}) {
  const { key, label, fullWidth, inlineLine, valueOnly } = item
  return (
    <div
      className={
        inlineLine
          ? `border-b ${REPORT_PART_ROW_BORDER} md:col-span-2 text-sm`
          : `grid grid-cols-[minmax(0,11rem)_1fr] gap-x-2 gap-y-0.5 px-4 py-2 border-b ${REPORT_PART_ROW_BORDER} last:border-0 md:[&:nth-last-child(-n+2)]:border-0${fullWidth ? ' md:col-span-2' : ''}`
      }
    >
      {inlineLine ? (
        <PartAInlineLine label={label} value={details[key]} valueOnly={valueOnly} />
      ) : (
        <>
          <span className="text-muted-foreground shrink-0">{label}</span>
          <span className="font-medium break-words">{display(details[key])}</span>
        </>
      )}
    </div>
  )
}

export function TestReportCoverDetailsGrid({
  details,
  reportNumber,
  onReportNumberChange,
  testReportPrefix,
  reportNumberLoading,
  nablUlrNumber,
  onNablUlrNumberChange,
  ulrPrefix,
  ulrPrefixLoading,
  activeScope,
  sampleReceivingEditUnlocked,
  onSampleReceivingEditUnlockedChange,
  sampleReceivingEditUnlockLoading,
  disabled,
}: {
  details: TestReportCoverDetails
  reportNumber: string
  onReportNumberChange: (value: string) => void
  testReportPrefix: string
  reportNumberLoading: boolean
  nablUlrNumber: string
  onNablUlrNumberChange: (value: string) => void
  ulrPrefix: string
  ulrPrefixLoading: boolean
  activeScope: ReportScopeKind
  sampleReceivingEditUnlocked: boolean
  onSampleReceivingEditUnlockedChange: (unlocked: boolean) => void
  sampleReceivingEditUnlockLoading?: boolean
  disabled?: boolean
}) {
  const receivingEditToggleDisabled = Boolean(disabled || sampleReceivingEditUnlockLoading)

  return (
    <div className={REPORT_PART_OUTER_CLASS}>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
          Part A — Particulars of Sample Submitted
        </h3>
        <label
          htmlFor="part-a-receiving-edit-unlock"
          className={`flex max-w-md items-start gap-2 rounded-md border border-primary/25 bg-background/90 px-3 py-2 text-sm shadow-sm ${
            receivingEditToggleDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <input
            id="part-a-receiving-edit-unlock"
            type="checkbox"
            className="rounded border-border mt-0.5"
            checked={sampleReceivingEditUnlocked}
            disabled={receivingEditToggleDisabled}
            onChange={(e) => onSampleReceivingEditUnlockedChange(e.target.checked)}
          />
          <span className="font-medium">Allow Sample Receiving edit</span>
        </label>
      </div>
      <div className={`${REPORT_PART_INNER_CLASS} grid grid-cols-1 text-sm`}>
        {COVER_ITEMS.map((item) => (
          <div key={item.kind === 'threeColumn' ? item.id : item.key} className="contents">
            {item.kind === 'threeColumn' ? (
              <ThreeColumnBlock columns={item.columns} details={details} />
            ) : (
              <FieldBlock item={item} details={details} />
            )}
            {item.kind === 'field' && item.key === 'isDetails' ? (
              <PartAReportIdentifiersRow
                dateOfReporting={details.dateOfReporting}
                activeScope={activeScope}
                reportNumber={reportNumber}
                onReportNumberChange={onReportNumberChange}
                testReportPrefix={testReportPrefix}
                reportNumberLoading={reportNumberLoading}
                nablUlrNumber={nablUlrNumber}
                onNablUlrNumberChange={onNablUlrNumberChange}
                ulrPrefix={ulrPrefix}
                ulrPrefixLoading={ulrPrefixLoading}
                disabled={disabled}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
