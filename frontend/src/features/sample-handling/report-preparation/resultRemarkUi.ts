import { cn } from '@/lib/utils'
import { canonicalConformityRemark, type ConformityRemark } from './evaluateResultConformity'

export function normalizeResultRemark(value: string | null | undefined): ConformityRemark {
  const t = (value ?? '').trim()
  const remark = canonicalConformityRemark(t)
  if (remark) return remark
  if (t === '—' || t === '-' || t.toLowerCase() === 'n/a' || t.toLowerCase() === 'na') {
    return 'Not Applicable'
  }
  return 'Not Applicable'
}

export function resultRemarkCellClass(remark: string): string {
  const normalized = normalizeResultRemark(remark)
  return cn(
    (normalized === 'Conforms' || normalized === 'Pass') && 'text-emerald-700 dark:text-emerald-400',
    (normalized === 'Conditional Pass' || normalized === 'Conditional Fail') &&
      'text-amber-700 dark:text-amber-400',
    (normalized === 'Does Not Conform' || normalized === 'Fail') && 'text-destructive',
    normalized === 'Not Applicable' && 'text-muted-foreground',
  )
}
