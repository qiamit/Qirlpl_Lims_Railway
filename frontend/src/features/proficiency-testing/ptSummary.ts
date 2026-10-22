/**
 * PT results summary for the management review (ISO/IEC 17025 8.9.2 (h) /
 * 7.7.2): satisfactory / questionable / unsatisfactory counts in a period.
 *
 *   const s = await loadPtSummary('2026-04-01', '2027-03-31')
 *   s.satisfactory, s.questionable, s.unsatisfactory, s.pending, s.total
 *
 * A participation counts in the period by its reported date, else its
 * received date, else the date it was entered. Missing tables (migration
 * 20261027100000_proficiency_testing.sql not applied) give an all-zero
 * summary with `available: false` instead of an error.
 */
import { supabase } from '@/lib/supabaseClient'
import { isPtMissingError, participationDate, type PtParticipation, type PtPerformance } from './ptShared'

export type PtSummary = {
  from: string | null
  to: string | null
  total: number
  satisfactory: number
  questionable: number
  unsatisfactory: number
  /** Results not evaluated yet (no performance). */
  pending: number
  /** Unsatisfactory results without a linked nonconforming work record. */
  unsatisfactoryWithoutNc: number
  /** Participations still open. */
  open: number
  /** Distinct sub-disciplines covered in the period. */
  subDisciplines: number
  available: boolean
}

type SummaryRow = Pick<
  PtParticipation,
  'reported_on' | 'received_on' | 'created_at' | 'performance' | 'nc_record_id' | 'status' | 'scope_kind' | 'discipline' | 'sub_discipline'
>

/** Pure: summary of rows already loaded (dates as yyyy-mm-dd, inclusive; null = open-ended). */
export function summarizePt(rows: SummaryRow[], from: string | null = null, to: string | null = null): PtSummary {
  const s: PtSummary = {
    from,
    to,
    total: 0,
    satisfactory: 0,
    questionable: 0,
    unsatisfactory: 0,
    pending: 0,
    unsatisfactoryWithoutNc: 0,
    open: 0,
    subDisciplines: 0,
    available: true,
  }
  const subs = new Set<string>()
  for (const r of rows) {
    const d = participationDate(r)
    if (from && d < from) continue
    if (to && d > to) continue
    s.total += 1
    const p = r.performance as PtPerformance | null
    if (p === 'satisfactory') s.satisfactory += 1
    else if (p === 'questionable') s.questionable += 1
    else if (p === 'unsatisfactory') {
      s.unsatisfactory += 1
      if (!r.nc_record_id) s.unsatisfactoryWithoutNc += 1
    } else s.pending += 1
    if (r.status !== 'closed') s.open += 1
    if (r.discipline) subs.add(`${r.scope_kind}|${r.discipline.trim().toLowerCase()}|${(r.sub_discipline ?? '').trim().toLowerCase()}`)
  }
  s.subDisciplines = subs.size
  return s
}

/** Loads participations and summarises them for [from, to] (yyyy-mm-dd, inclusive). */
export async function loadPtSummary(from: string | null, to: string | null): Promise<PtSummary> {
  const { data, error } = await supabase
    .from('pt_participations')
    .select('reported_on, received_on, created_at, performance, nc_record_id, status, scope_kind, discipline, sub_discipline')
    .limit(5000)
  if (error) {
    if (isPtMissingError(error)) return { ...summarizePt([], from, to), available: false }
    throw error
  }
  return summarizePt((data ?? []) as SummaryRow[], from, to)
}
