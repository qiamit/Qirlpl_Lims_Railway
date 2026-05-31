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
    <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:grid-cols-[3.25rem_minmax(0,1fr)_minmax(9.5rem,max-content)] divide-x divide-border/40 border-b border-border/40 last:border-b-0">
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
    <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 shadow-sm ring-1 ring-primary/15">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">
        Part B — Supplementary Information
      </h3>
      <div className="rounded-md border border-primary/20 bg-background/80 p-0 shadow-inner overflow-hidden text-sm">
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
