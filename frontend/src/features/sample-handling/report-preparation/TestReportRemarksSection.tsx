import { useMemo } from 'react'
import { Textarea } from '@/components/ui/textarea'
import {
  formatPartDRemarksLine1,
  joinPartDRemarks,
  splitPartDRemarks,
} from './testReportPartDRemarks'
import {
  REPORT_PART_INNER_CLASS,
  REPORT_PART_OUTER_CLASS,
  REPORT_PART_ROW_BORDER,
} from './reportPartUiClasses'

export const PART_D_HEADING = 'PART D. REMARKS'

export { formatPartDRemarksLine1, joinPartDRemarks, splitPartDRemarks } from './testReportPartDRemarks'

export function TestReportRemarksSection({
  remarks,
  onRemarksChange,
  isCodeLabel,
  disabled,
}: {
  remarks: string
  onRemarksChange: (value: string) => void
  isCodeLabel?: string | null
  disabled?: boolean
}) {
  const line1 = formatPartDRemarksLine1(isCodeLabel)
  const line2 = useMemo(() => splitPartDRemarks(remarks, isCodeLabel).line2, [remarks, isCodeLabel])

  const handleLine2Change = (value: string) => {
    onRemarksChange(joinPartDRemarks(line1, value))
  }

  return (
    <div className={REPORT_PART_OUTER_CLASS}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">
        Part D — Remarks
      </h3>
      <div className={`${REPORT_PART_INNER_CLASS} text-sm`}>
        <div className={`border-b ${REPORT_PART_ROW_BORDER} bg-primary/10 px-4 py-2.5`}>
          <p className="text-xs font-bold uppercase tracking-wide text-foreground">{PART_D_HEADING}</p>
        </div>
        <p className={`border-b ${REPORT_PART_ROW_BORDER} bg-sky-50/50 px-4 py-2.5 text-sm leading-relaxed text-foreground`}>
          {line1}
        </p>
        <Textarea
          id="tr-remarks-line2"
          value={line2}
          onChange={(e) => handleLine2Change(e.target.value)}
          rows={2}
          disabled={disabled}
          className="min-h-[2.75rem] resize-y border-0 rounded-none bg-transparent px-4 py-2.5 text-sm leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
          placeholder="2. Additional remarks (optional)"
          aria-label="Part D remarks line 2"
        />
      </div>
    </div>
  )
}
