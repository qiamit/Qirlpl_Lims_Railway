import { useEffect, useMemo, useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MeasurementUnitSelect } from '@/features/masters/measurement-units/MeasurementUnitSelect'
import { useMeasurementUnits } from '@/features/masters/measurement-units/useMeasurementUnits'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  newCrmUncertaintyItem,
  resolveDefaultCrmUncertaintyUnit,
  toProperTitleCase,
  type CrmUncertaintyItem,
  type UncertaintySign,
} from './types'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

export function CrmUncertaintyDialog({
  open,
  onOpenChange,
  rows,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: CrmUncertaintyItem[]
  onChange: (rows: CrmUncertaintyItem[]) => void
}) {
  const { units } = useMeasurementUnits()
  const defaultUnit = useMemo(
    () => resolveDefaultCrmUncertaintyUnit(units.map((u) => u.name)),
    [units],
  )
  const rowsRef = useRef(rows)
  const onChangeRef = useRef(onChange)
  rowsRef.current = rows
  onChangeRef.current = onChange

  const list =
    rows.length > 0
      ? rows
      : [
          newCrmUncertaintyItem({
            uncertaintyUnit: defaultUnit,
            rangeMinUnit: defaultUnit,
            rangeMaxUnit: defaultUnit,
          }),
        ]

  useEffect(() => {
    if (!open || !defaultUnit) return
    const source =
      rowsRef.current.length > 0
        ? rowsRef.current
        : [
            newCrmUncertaintyItem({
              uncertaintyUnit: defaultUnit,
              rangeMinUnit: defaultUnit,
              rangeMaxUnit: defaultUnit,
            }),
          ]
    let changed = false
    const next = source.map((r) => {
      const patch: Partial<CrmUncertaintyItem> = {}
      if (!r.uncertaintyUnit.trim()) patch.uncertaintyUnit = defaultUnit
      if (!r.rangeMinUnit.trim()) patch.rangeMinUnit = defaultUnit
      if (!r.rangeMaxUnit.trim()) patch.rangeMaxUnit = defaultUnit
      if (Object.keys(patch).length === 0) return r
      changed = true
      return { ...r, ...patch }
    })
    if (changed) onChangeRef.current(next)
  }, [open, defaultUnit])

  const updateRow = (id: string, patch: Partial<CrmUncertaintyItem>) => {
    onChange(list.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const addRow = () => {
    onChange([
      ...list,
      newCrmUncertaintyItem({
        uncertaintyUnit: defaultUnit,
        rangeMinUnit: defaultUnit,
        rangeMaxUnit: defaultUnit,
      }),
    ])
  }

  const removeRow = (id: string) => {
    if (list.length <= 1) {
      onChange([
        newCrmUncertaintyItem({
          uncertaintyUnit: defaultUnit,
          rangeMinUnit: defaultUnit,
          rangeMaxUnit: defaultUnit,
        }),
      ])
      return
    }
    onChange(list.filter((r) => r.id !== id))
  }

  const allSelected = list.length > 0 && list.every((r) => r.selected)
  const someSelected = list.some((r) => r.selected)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        portalClassName="!items-stretch !justify-start md:pl-0"
        className={cn(
          limsDialogClass,
          '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
          'left-0 top-0',
          'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
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
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              CRM Uncertainty
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-4">
          <div className="overflow-x-auto rounded-none border-2 border-stone-500 bg-white shadow-sm">
            <table className="table-fixed w-full border-collapse text-sm">
              <colgroup>
                <col className="w-[5%]" />
                <col className="w-[29%]" />
                <col className="w-[29%]" />
                <col className="w-[29%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="bg-stone-800 text-amber-200">
                  <th className="border border-stone-700 px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label="Select all rows"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = !allSelected && someSelected
                      }}
                      onChange={(e) => {
                        const checked = e.target.checked
                        onChange(list.map((r) => ({ ...r, selected: checked })))
                      }}
                    />
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
                  <th className="border border-stone-700 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-[0.14em]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[#f7f3eb]">
                {list.map((row, index) => {
                  const isLastRow = index === list.length - 1
                  const crmValue = row.rangeMax.trim() ? row.rangeMax : row.rangeMin
                  const crmValueUnit = row.rangeMaxUnit.trim()
                    ? row.rangeMaxUnit
                    : row.rangeMinUnit
                  return (
                    <tr key={row.id} className="hover:bg-amber-50/40">
                      <td className="border border-stone-300 px-2 py-1 text-center align-middle">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          aria-label={`Select row ${index + 1}`}
                          checked={row.selected}
                          onChange={(e) => updateRow(row.id, { selected: e.target.checked })}
                        />
                      </td>
                      <td className="border border-stone-300 px-1 py-0.5 align-middle">
                        <Input
                          value={row.elementName}
                          onChange={(e) => updateRow(row.id, { elementName: e.target.value })}
                          onBlur={() => {
                            const next = toProperTitleCase(row.elementName)
                            if (next !== row.elementName) {
                              updateRow(row.id, { elementName: next })
                            }
                          }}
                          aria-label={`Element name row ${index + 1}`}
                          className="!h-7 min-h-0 px-2 py-0.5 text-xs"
                        />
                      </td>
                      <td className="min-w-0 border border-stone-300 px-1 py-0.5 align-middle">
                        <div className="grid h-8 w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(4.5rem,1fr)] overflow-hidden rounded-none border border-stone-500 bg-stone-50 focus-within:border-amber-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-500/20">
                          <Input
                            inputMode="decimal"
                            value={crmValue}
                            onChange={(e) =>
                              updateRow(row.id, {
                                rangeMax: e.target.value.replace(/[^0-9.\-]/g, ''),
                                rangeMin: '',
                                rangeMinUnit: '',
                              })
                            }
                            aria-label={`CRM value row ${index + 1}`}
                            className="h-8 min-w-0 rounded-none border-0 border-r border-stone-500 bg-transparent px-1.5 text-center text-xs shadow-none focus-visible:ring-0"
                          />
                          <MeasurementUnitSelect
                            id={`crm-value-unit-${row.id}`}
                            value={crmValueUnit}
                            onChange={(rangeMaxUnit) =>
                              updateRow(row.id, {
                                rangeMaxUnit,
                                rangeMinUnit: '',
                              })
                            }
                            showLabel={false}
                            showManageButton
                            placeholder=""
                            className="h-8 min-w-0"
                            shellClassName="!h-8 border-0 bg-transparent shadow-none focus-within:border-transparent focus-within:bg-transparent focus-within:ring-0"
                            inputClassName="px-1.5 text-center text-xs"
                          />
                        </div>
                      </td>
                      <td className="min-w-0 border border-stone-300 px-1 py-0.5 align-middle">
                        <div className="grid h-8 w-full min-w-0 grid-cols-[3.25rem_minmax(0,1fr)_minmax(5.5rem,1.2fr)] overflow-hidden rounded-none border border-stone-500 bg-stone-50 focus-within:border-amber-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-500/20">
                          <Select
                            value={row.uncertaintySign}
                            onValueChange={(v) =>
                              updateRow(row.id, {
                                uncertaintySign: v as UncertaintySign,
                              })
                            }
                          >
                            <SelectTrigger
                              aria-label={`Uncertainty sign row ${index + 1}`}
                              className="h-8 w-full rounded-none border-0 border-r border-stone-500 bg-transparent px-1 shadow-none focus:ring-0 focus:ring-offset-0"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="±">±</SelectItem>
                              <SelectItem value="+">+</SelectItem>
                              <SelectItem value="-">−</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            inputMode="decimal"
                            aria-label={`Uncertainty value row ${index + 1}`}
                            value={row.uncertaintyValue}
                            onChange={(e) =>
                              updateRow(row.id, {
                                uncertaintyValue: e.target.value.replace(/[^0-9.]/g, ''),
                              })
                            }
                            className="h-8 min-w-0 rounded-none border-0 border-r border-stone-500 bg-transparent px-1.5 text-center text-xs shadow-none focus-visible:ring-0"
                          />
                          <MeasurementUnitSelect
                            id={`crm-unc-unit-${row.id}`}
                            value={row.uncertaintyUnit}
                            onChange={(uncertaintyUnit) =>
                              updateRow(row.id, { uncertaintyUnit })
                            }
                            showLabel={false}
                            showManageButton
                            placeholder=""
                            className="h-8 min-w-0"
                            shellClassName="!h-8 border-0 bg-transparent shadow-none focus-within:border-transparent focus-within:bg-transparent focus-within:ring-0"
                            inputClassName="px-1.5 text-center text-xs"
                          />
                        </div>
                      </td>
                      <td className="border border-stone-300 py-0.5 text-center align-middle">
                        <div className="flex items-center justify-center">
                          {isLastRow ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-amber-800 hover:bg-amber-500/15"
                              aria-label="Add row"
                              title="Add row"
                              onClick={addRow}
                            >
                              <Plus size={14} />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:bg-rose-50"
                              aria-label={`Delete row ${index + 1}`}
                              title="Delete row"
                              onClick={() => removeRow(row.id)}
                            >
                              <Trash2 size={12} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-stone-50 px-4 py-3 sm:px-5">
          <Button
            type="button"
            variant="outline"
            className={cn(limsOutlineBtnClass, 'min-w-[5.5rem]')}
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            className={cn(limsPrimaryBtnClass, 'min-w-[7rem]')}
            onClick={() => onOpenChange(false)}
          >
            Save & Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
