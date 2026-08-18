import { Eye, FileDown, Mail, Printer, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { IssuedTestReportListRow } from './types'

const iconBtnClass = cn(
  limsOutlineBtnClass,
  'h-8 w-8 shrink-0 p-0 shadow-none',
)

export function IssuedTestReportRowActions({
  row,
  busy,
  onViewSrf,
  onPrintNabl,
  onPrintNonNabl,
  onDownloadPdfs,
  onEmailToClient,
  onReferbackToPreparation,
  onReferbackToResultsReview,
  canReferbackToResultsReview,
}: {
  row: IssuedTestReportListRow
  busy?: boolean
  onViewSrf: (row: IssuedTestReportListRow) => void
  onPrintNabl: (row: IssuedTestReportListRow) => void
  onPrintNonNabl: (row: IssuedTestReportListRow) => void
  onDownloadPdfs: (row: IssuedTestReportListRow) => void
  onEmailToClient: (row: IssuedTestReportListRow) => void
  onReferbackToPreparation: (row: IssuedTestReportListRow) => void
  onReferbackToResultsReview: (row: IssuedTestReportListRow) => void
  /** Logged-in user required to assign review queue */
  canReferbackToResultsReview: boolean
}) {
  const canNabl = Boolean(row.nablIssuedAt && row.reportNumberBase)
  const canNonNabl = Boolean(row.nonNablIssuedAt && row.reportNumberBase)
  const canPrint = canNabl || canNonNabl
  const canEmail = canPrint && Boolean(row.clientEmail?.trim())

  return (
    <div className="inline-flex flex-nowrap items-center justify-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={iconBtnClass}
        disabled={busy}
        aria-label={`View SRF details for ${row.srfNumber ?? 'SRF'}`}
        title="View SRF details"
        onClick={() => onViewSrf(row)}
      >
        <Eye size={15} />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={iconBtnClass}
            disabled={busy || !canPrint}
            aria-label={`Print report for ${row.srfNumber ?? 'SRF'}`}
            title="Print report"
          >
            <Printer size={15} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48 rounded-none border-2 border-stone-500 bg-[#fffcf7]"
        >
          <DropdownMenuItem disabled={!canNabl || busy} onClick={() => onPrintNabl(row)}>
            <Printer size={14} className="mr-2" />
            Accredited
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canNonNabl || busy} onClick={() => onPrintNonNabl(row)}>
            <Printer size={14} className="mr-2" />
            Non Accredited
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className={iconBtnClass}
        disabled={busy || !canPrint}
        aria-label={`Download PDF reports for ${row.srfNumber ?? 'SRF'}`}
        title="Download PDF (Accredited & Non Accredited)"
        onClick={() => onDownloadPdfs(row)}
      >
        <FileDown size={15} />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={iconBtnClass}
        disabled={busy || !canEmail}
        aria-label={`Email reports to client for ${row.srfNumber ?? 'SRF'}`}
        title={
          canEmail
            ? `Email to Client (${row.clientEmail})`
            : canPrint
              ? 'Client email is not set'
              : 'Email to Client'
        }
        onClick={() => onEmailToClient(row)}
      >
        <Mail size={15} />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={iconBtnClass}
            disabled={busy}
            aria-label={`Referback for ${row.srfNumber ?? 'SRF'}`}
            title="Referback"
          >
            <Undo2 size={15} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-64 rounded-none border-2 border-stone-500 bg-[#fffcf7]"
        >
          <DropdownMenuItem
            disabled={busy}
            className="text-destructive focus:text-destructive"
            onClick={() => onReferbackToPreparation(row)}
          >
            <Undo2 size={14} className="mr-2" />
            Test Report Preparation
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busy || !canReferbackToResultsReview}
            className="text-destructive focus:text-destructive"
            onClick={() => onReferbackToResultsReview(row)}
          >
            <Undo2 size={14} className="mr-2" />
            Results Under Review
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
