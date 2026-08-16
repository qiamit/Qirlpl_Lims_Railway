import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  joinUncertainty,
  type CrmUncertaintyItem,
} from './types'

export function CrmUncertaintyViewDialog({
  open,
  onOpenChange,
  rows,
  subtitle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: CrmUncertaintyItem[]
  subtitle?: string
}) {
  const list = rows.filter(
    (r) =>
      r.elementName.trim() ||
      r.rangeMin.trim() ||
      r.rangeMax.trim() ||
      r.rangeMinUnit.trim() ||
      r.rangeMaxUnit.trim() ||
      r.uncertaintyValue.trim() ||
      r.uncertaintyUnit.trim(),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        portalClassName="!items-stretch !justify-start md:pl-0"
        className={cn(
          limsDialogClass,
          '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
          'left-0 top-0',
          'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
          '[&>button]:!text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative flex-row items-center justify-between gap-3 space-y-0 pr-10 text-left">
            <DialogTitle className="shrink-0 text-base font-semibold tracking-tight text-white">
              View CRM Uncertainty
            </DialogTitle>
            {subtitle ? (
              <p className="min-w-0 truncate text-right text-xs font-medium text-amber-100/80">
                {subtitle}
              </p>
            ) : null}
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-4">
          <div className="overflow-x-auto rounded-none border-2 border-stone-500 bg-white shadow-sm">
            <table className="table-fixed w-full border-collapse text-sm">
              <colgroup>
                <col className="w-[8%]" />
                <col className="w-[34%]" />
                <col className="w-[28%]" />
                <col className="w-[30%]" />
              </colgroup>
              <thead>
                <tr className="bg-stone-800 text-amber-200">
                  <th className="border border-stone-700 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-[0.14em]">
                    Sr.
                  </th>
                  <th className="border border-stone-700 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-[0.14em]">
                    Element Name
                  </th>
                  <th className="border border-stone-700 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-[0.14em]">
                    CRM Value
                  </th>
                  <th className="border border-stone-700 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-[0.14em]">
                    Uncertainty
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[#f7f3eb]">
                {list.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="border border-stone-300 px-3 py-8 text-center text-sm text-stone-500"
                    >
                      No uncertainty elements added for this CRM.
                    </td>
                  </tr>
                ) : (
                  list.map((row, index) => {
                    const unc = joinUncertainty(
                      row.uncertaintySign,
                      row.uncertaintyValue,
                      row.uncertaintyUnit,
                    )
                    const valueRaw = row.rangeMax.trim() || row.rangeMin.trim()
                    const unitRaw = row.rangeMaxUnit.trim() || row.rangeMinUnit.trim()
                    const valueLabel = valueRaw
                      ? unitRaw
                        ? `${valueRaw} ${unitRaw}`
                        : valueRaw
                      : '—'
                    return (
                      <tr key={row.id} className="hover:bg-amber-50/40">
                        <td className="border border-stone-300 px-2 py-2 text-center align-middle font-mono text-xs font-semibold text-stone-800">
                          {index + 1}
                        </td>
                        <td className="border border-stone-300 px-2 py-2 text-left align-middle text-sm font-medium text-stone-800">
                          {row.elementName.trim() || '—'}
                        </td>
                        <td className="border border-stone-300 px-2 py-2 text-center align-middle font-mono text-xs text-stone-800">
                          {valueLabel}
                        </td>
                        <td
                          className="border border-stone-300 px-2 py-2 text-center align-middle font-mono text-xs font-semibold text-stone-800"
                          title={
                            valueLabel !== '—'
                              ? `${valueLabel} | ${unc || '—'}`
                              : unc || undefined
                          }
                        >
                          {unc || '—'}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-stone-300 bg-stone-50 px-4 py-3 sm:px-5">
          <Button
            type="button"
            variant="outline"
            className={cn(limsOutlineBtnClass, 'min-w-[5.5rem]')}
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
