import { supabase } from '@/lib/supabaseClient'
import { ISO_17025_AUDIT_PLAN_CLAUSES } from '@/features/audit-mrm/audit-checklist/iso17025Clauses'

function uniqSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).map((v) => v.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  )
}

/** Disciplines of the NABL scope (testing discipline / group and calibration discipline). */
export async function fetchScopeDisciplines(): Promise<string[]> {
  const [testing, calibration] = await Promise.all([
    supabase.from('nabl_scope').select('discipline_group').limit(5000),
    supabase.from('calibration_nabl_scope').select('discipline_name').limit(5000),
  ])
  const out: string[] = []
  if (!testing.error) {
    for (const r of Array.isArray(testing.data) ? testing.data : []) {
      out.push(String((r as { discipline_group?: unknown }).discipline_group ?? ''))
    }
  }
  if (!calibration.error) {
    for (const r of Array.isArray(calibration.data) ? calibration.data : []) {
      out.push(String((r as { discipline_name?: unknown }).discipline_name ?? ''))
    }
  }
  return uniqSorted(out)
}

const PLAN_CLAUSE_NOS = ISO_17025_AUDIT_PLAN_CLAUSES.map((c) => c.clauseNo)

/**
 * Audit-plan level clause (4.1, 6.4, 7.10, 8.8 …) for any clause number,
 * e.g. 7.7.1 -> 7.7, 6.4.13 -> 6.4, 5.3 -> 5.3. '' when it is not an
 * ISO/IEC 17025 clause of the plan list.
 */
export function planClauseOf(clauseNo: string): string {
  const parts = clauseNo.trim().replace(/\.$/, '').split('.').filter(Boolean)
  for (let n = Math.min(parts.length, 2); n >= 1; n -= 1) {
    const candidate = parts.slice(0, n).join('.')
    if (PLAN_CLAUSE_NOS.includes(candidate)) return candidate
  }
  return ''
}
