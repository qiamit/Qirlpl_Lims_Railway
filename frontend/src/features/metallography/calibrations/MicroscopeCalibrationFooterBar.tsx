import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LaboratoryDirectorOnly } from '@/components/lims/LaboratoryDirectorOnly'
import { limsDarkBarBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export function MicroscopeCalibrationFooterBar({
  message,
  messageTone = 'ok',
  shownCount,
  totalCount,
  awaitingVerification,
  expiringSoon,
  disabled,
  onExport,
  onPrint,
}: {
  message: string | null
  messageTone?: 'ok' | 'error'
  shownCount: number
  totalCount: number
  /** Drafts not yet verified. */
  awaitingVerification: number
  /** Verified, in date, due within CALIBRATION_EXPIRY_WARNING_DAYS. */
  expiringSoon: number
  disabled: boolean
  onExport: () => void
  onPrint: () => void
}) {
  return (
    <div className="relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-3 text-white shadow-sm ring-1 ring-amber-700/20 sm:px-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <LaboratoryDirectorOnly>
            <Button
              type="button"
              variant="outline"
              className={limsDarkBarBtnClass}
              onClick={onExport}
              disabled={disabled || shownCount === 0}
            >
              <Download size={16} /> Export CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              className={limsDarkBarBtnClass}
              onClick={onPrint}
              disabled={disabled || shownCount === 0}
            >
              <Printer size={16} /> Print
            </Button>
          </LaboratoryDirectorOnly>
        </div>

        <div className="flex flex-col gap-1 md:items-end">
          {message ? (
            <p role="status" className={cn('text-sm', messageTone === 'error' ? 'text-red-300' : 'text-emerald-300')}>
              {message}
            </p>
          ) : null}
          <p className="text-xs text-stone-300">
            Showing {shownCount} of {totalCount}
            {awaitingVerification > 0 ? ` · ${awaitingVerification} awaiting verification` : ''}
            {expiringSoon > 0 ? ` · ${expiringSoon} expiring soon` : ''}
          </p>
        </div>
      </div>
    </div>
  )
}
