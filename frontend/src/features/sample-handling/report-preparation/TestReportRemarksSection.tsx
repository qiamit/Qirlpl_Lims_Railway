import { useMemo } from 'react'
import { Textarea } from '@/components/ui/textarea'
import {
  formatPartDRemarksLine1,
  joinPartDRemarks,
  splitPartDRemarks,
} from './testReportPartDRemarks'

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
    <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 shadow-sm ring-1 ring-primary/15">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">
        Part D — Remarks
      </h3>
      <div className="rounded-md border border-primary/20 bg-background/80 shadow-inner overflow-hidden text-sm">
        <div className="border-b border-border/40 bg-muted/30 px-4 py-2.5">
          <p className="text-xs font-bold uppercase tracking-wide text-foreground">{PART_D_HEADING}</p>
        </div>
        <p className="border-b border-border/40 bg-muted/20 px-4 py-2.5 text-sm leading-relaxed text-foreground">
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
