import { Ban, FileDown, Loader2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { limsDarkBarBtnClass, limsDarkBarGlowStyle, limsDeleteBtnClass, limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

/**
 * S1 footer: Export CSV and Print act on the rows shown; Void acts on the
 * selected analysis (analyst or Laboratory Director; not while it is the
 * source of a result).
 */
export function MetallographyFooterBar({
  rowCount,
  selectedLabel,
  voidDisabledReason,
  voiding,
  onVoid,
  onExportCsv,
  onPrint,
}: {
  rowCount: number
  /** Analysis number of the selected row, or null. */
  selectedLabel: string | null
  /** null = Void allowed; otherwise why it is not (shown as the button title). */
  voidDisabledReason: string | null
  voiding: boolean
  onVoid: () => void
  onExportCsv: () => void
  onPrint: () => void
}) {
  return (
    <div className={limsPanelClass}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2 text-white sm:px-5 sm:py-2.5">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <div className="absolute left-0 top-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        <div className="relative flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              className={limsDeleteBtnClass}
              onClick={onVoid}
              disabled={voiding || voidDisabledReason !== null}
              title={voidDisabledReason ?? undefined}
            >
              {voiding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Void
            </Button>
            <span className="text-xs text-stone-300">
              {selectedLabel ? `Selected: ${selectedLabel}` : 'Select an analysis to void it'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-stone-300">{rowCount} shown</span>
            <Button
              type="button"
              variant="outline"
              className={cn(limsDarkBarBtnClass, 'gap-1.5')}
              onClick={onExportCsv}
              disabled={rowCount === 0}
            >
              <FileDown className="h-4 w-4" /> Export CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn(limsDarkBarBtnClass, 'gap-1.5')}
              onClick={onPrint}
              disabled={rowCount === 0}
            >
              <Printer className="h-4 w-4" /> Print
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
