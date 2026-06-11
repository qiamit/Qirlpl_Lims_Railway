import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  normalizePartBFieldValue,
  PART_B_ROWS,
  type PartBFieldKey,
  type TestReportPartBDetails,
} from './testReportPartB'
import {
  REPORT_PART_INNER_CLASS,
  REPORT_PART_INNER_DIVIDE,
  REPORT_PART_OUTER_CLASS,
  REPORT_PART_ROW_BORDER,
} from './reportPartUiClasses'

function PartBRow({
  number,
  description,
  output,
  options,
  onOutputChange,
  disabled,
}: {
  number: number
  description: string
  output: string
  options: readonly string[]
  onOutputChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div className={`grid grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:grid-cols-[3.25rem_minmax(0,1fr)_minmax(9.5rem,max-content)] divide-x ${REPORT_PART_INNER_DIVIDE} border-b ${REPORT_PART_ROW_BORDER} last:border-b-0`}>
      <div className="flex items-center justify-center px-2 py-1.5 text-muted-foreground font-medium tabular-nums text-xs">
        {number}.
      </div>
      <div className="min-w-0 px-3 py-1.5 text-muted-foreground text-xs leading-tight whitespace-pre-wrap break-words">
        {description}
      </div>
      <div className="flex items-center px-2 py-1">
        <Select value={output} onValueChange={onOutputChange} disabled={disabled}>
          <SelectTrigger
            className="h-7 w-full min-w-[9rem] max-w-[11rem] text-xs font-medium"
            aria-label={`Part B row ${number} output`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export function TestReportSupplementaryGrid({
  details,
  onChange,
  disabled,
}: {
  details: TestReportPartBDetails
  onChange: (next: TestReportPartBDetails) => void
  disabled?: boolean
}) {
  const setField = (key: PartBFieldKey, value: string) => {
    onChange({ ...details, [key]: value })
  }

  return (
    <div className={REPORT_PART_OUTER_CLASS}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">
        Part B — Supplementary Information
      </h3>
      <div className={`${REPORT_PART_INNER_CLASS} text-sm`}>
        {PART_B_ROWS.map((row, index) => (
          <PartBRow
            key={row.key}
            number={index + 1}
            description={row.label}
            output={normalizePartBFieldValue(row.key, details[row.key])}
            options={row.options}
            onOutputChange={(value) => setField(row.key, value)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  )
}
