import type { ReportScopeKind } from '@/features/settings/lab-settings/reportScopeTemplateTypes'

export type { ReportScopeKind }

export const REPORT_SCOPE_SUFFIX: Record<ReportScopeKind, string> = {
  nabl: 'A',
  non_nabl: 'B',
}

export const REPORT_SCOPE_TITLE: Record<ReportScopeKind, string> = {
  nabl: 'NABL Report',
  non_nabl: 'Non-NABL Report',
}

export function isNablScopeLabel(scope: string): boolean {
  const s = scope.trim().toLowerCase()
  if (!s || s.includes('non')) return false
  return s === 'nabl'
}

export function scopeKindFromLabel(scope: string): ReportScopeKind {
  return isNablScopeLabel(scope) ? 'nabl' : 'non_nabl'
}

/** Accreditation body name counts as NABL (excludes Non-NABL / Not Accredited). */
export function isNablAccreditationBodyName(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!n) return false
  if (/non[\s-]*nabl/.test(n)) return false
  if (n.includes('not accredited')) return false
  if (n === 'nabl') return true
  return /\bnabl\b/.test(n) && !/non[\s-]*nabl/.test(n)
}

export type ReportScopeLabel = 'NABL' | 'Non NABL'

export function resolveReportScopeFromAccreditationIds(
  underAccreditationIds: string[] | null | undefined,
  accreditationById: Map<string, string>,
): ReportScopeLabel {
  if (!Array.isArray(underAccreditationIds) || underAccreditationIds.length === 0) {
    return 'Non NABL'
  }
  const hasNabl = underAccreditationIds.some((id) => {
    const name = accreditationById.get(id) ?? ''
    return isNablAccreditationBodyName(name)
  })
  return hasNabl ? 'NABL' : 'Non NABL'
}

/**
 * Remove trailing A/B scope suffix for re-scoping (print / display).
 * Do not use on canonical values loaded from DB — stored numbers already end with A.
 */
export function stripReportScopeSuffix(value: string): string {
  const v = value.trim()
  if (/[AB]$/.test(v)) return v.slice(0, -1)
  return v
}

export function appendReportScopeSuffix(baseNumber: string, scope: ReportScopeKind): string {
  const base = stripReportScopeSuffix(baseNumber.trim())
  if (!base) return ''
  return `${base}${REPORT_SCOPE_SUFFIX[scope]}`
}
