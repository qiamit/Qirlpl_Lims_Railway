import { Download, MoreHorizontal, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { IssuedTestReportListRow } from './types'

export function IssuedTestReportRowActions({
  row,
  busy,
  onDownloadNabl,
  onDownloadNonNabl,
  onReferbackToPreparation,
  onReferbackToResultsReview,
  canReferbackToResultsReview,
}: {
  row: IssuedTestReportListRow
  busy?: boolean
  onDownloadNabl: (row: IssuedTestReportListRow) => void
  onDownloadNonNabl: (row: IssuedTestReportListRow) => void
  onReferbackToPreparation: (row: IssuedTestReportListRow) => void
  onReferbackToResultsReview: (row: IssuedTestReportListRow) => void
  /** Logged-in user required to assign review queue */
  canReferbackToResultsReview: boolean
}) {
  const canNabl = Boolean(row.nablIssuedAt && row.reportNumberBase)
  const canNonNabl = Boolean(row.nonNablIssuedAt && row.reportNumberBase)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={busy}
          aria-label={`Actions for ${row.srfNumber ?? 'SRF'}`}
        >
          <MoreHorizontal size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem disabled={!canNabl || busy} onClick={() => onDownloadNabl(row)}>
          <Download size={14} className="mr-2" />
          Download NABL report (PDF)
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canNonNabl || busy} onClick={() => onDownloadNonNabl(row)}>
          <Download size={14} className="mr-2" />
          Download Non-NABL report (PDF)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy}
          className="text-destructive focus:text-destructive"
          onClick={() => onReferbackToPreparation(row)}
        >
          <Undo2 size={14} className="mr-2" />
          Referback to Test Report Preparation
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy || !canReferbackToResultsReview}
          className="text-destructive focus:text-destructive"
          onClick={() => onReferbackToResultsReview(row)}
        >
          <Undo2 size={14} className="mr-2" />
          Referback to Results Under Review
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
