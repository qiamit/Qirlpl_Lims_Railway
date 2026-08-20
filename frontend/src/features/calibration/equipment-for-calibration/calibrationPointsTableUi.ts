import { limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

/** Client Master ledger look for Calibration Points grids. */
export const calPointsPanelClass = cn(limsPanelClass, 'bg-[#f7f3eb]')

export const calPointsTableClass =
  'min-w-[720px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm]'

export const calPointsThClass =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

export const calPointsCheckboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

export const calPointsRowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
export const calPointsRowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
export const calPointsRowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

export const calPointsCellInputClass =
  'h-8 w-full min-w-[6.5rem] rounded-none border border-stone-500 bg-[#fffcf7] px-2 text-center text-[12.5px] font-semibold tracking-tight text-[#292524] shadow-none placeholder:text-[#a8a29e] focus-visible:border-amber-600 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-amber-500/20'

export const calPointsCellReadonlyClass =
  'h-8 w-full min-w-[6.5rem] rounded-none border border-stone-500 bg-stone-100 px-2 text-center text-[12.5px] font-medium tracking-tight text-[#57534e] shadow-none'

export function calPointsRowToneClass(index: number, selected: boolean): string {
  if (selected) return calPointsRowSelectedClass
  return index % 2 === 0 ? calPointsRowEvenClass : calPointsRowOddClass
}
