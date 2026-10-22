import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ISO_17025_AUDIT_PLAN_CLAUSES } from '@/features/audit-mrm/audit-checklist/iso17025Clauses'
import {
  auditKindLabel,
  auditTypeLabel,
  describeIndependenceConflict,
  formatDate,
  normalizeAuditKind,
  normalizeIndependenceConflicts,
  normalizeTeamRows,
  teamIndependenceConflicts,
  type AuditKind,
  type AuditTeamRow,
  type IndependenceConflict,
} from '@/features/audit-mrm/audit-plan/types'
import { csvCell } from '@/lib/csv'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsPageShellClass,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { fetchScopeDisciplines, planClauseOf } from './coverageData'

type Plan = {
  id: string
  auditId: string
  auditType: string
  from: string
  to: string
  kind: AuditKind
  discipline: string
  witnessedUserId: string
  witnessedName: string
  sampleRef: string
  team: AuditTeamRow[]
  conflicts: IndependenceConflict[]
}

type CellState = '' | 'planned' | 'checked' | 'nc'

type Signatory = {
  key: string
  userId: string
  name: string
  disciplines: string[]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const STATE_RANK: Record<CellState, number> = { '': 0, planned: 1, checked: 2, nc: 3 }

const cellClass: Record<CellState, string> = {
  '': 'bg-white',
  planned: 'bg-amber-100 text-amber-900',
  checked: 'bg-emerald-200 text-emerald-950',
  nc: 'bg-red-300 text-red-950',
}

const cellText: Record<CellState, string> = { '': '', planned: 'P', checked: '✓', nc: 'NC' }

const TH = 'border border-stone-700 bg-stone-800 px-1.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-200'
const TD = 'border border-[#e7e0d4] px-1.5 py-1 text-xs'

function maxState(a: CellState, b: CellState): CellState {
  return STATE_RANK[a] >= STATE_RANK[b] ? a : b
}

function errText(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const e = err as { message?: string; code?: string }
  return [e.message, e.code].filter(Boolean).join(' | ') || 'Unknown error'
}

function shortMatter(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > 60 ? `${t.slice(0, 60)}…` : t
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className={cn(limsPanelClass, 'bg-[#fffcf7]')}>
      <div className="border-b border-stone-300 bg-stone-100 px-3 py-2">
        <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
        {note ? <p className="text-[11px] text-stone-600">{note}</p> : null}
      </div>
      <div className="p-3">{children}</div>
    </section>
  )
}

/**
 * Internal audit programme coverage (ISO/IEC 17025 8.8.1 / 8.8.2): which
 * clauses each audit of the year covered (planned criteria and checklist
 * answers), vertical / witness audits per NABL scope discipline and per
 * authorized signatory, and auditor independence conflicts.
 */
export default function AuditCoveragePage() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [view, setView] = useState<'audits' | 'months'>('audits')
  const [includeExternal, setIncludeExternal] = useState(false)
  const [plans, setPlans] = useState<Plan[]>([])
  const [hasKindColumn, setHasKindColumn] = useState(true)
  const [items, setItems] = useState<Array<{ planId: string; clause: string; conformity: string }>>([])
  const [disciplines, setDisciplines] = useState<string[]>([])
  const [signatories, setSignatories] = useState<Signatory[]>([])
  const [signatorySource, setSignatorySource] = useState<'authorizations' | 'issued' | 'none'>('none')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: planErr } = await supabase
        .from('audit_plans')
        .select('*')
        .order('proposed_from', { ascending: true })
      if (planErr) throw planErr
      const raw = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>
      setHasKindColumn(raw.length === 0 || raw.some((r) => 'audit_kind' in r))
      const list: Plan[] = raw.map((r) => {
        const team = normalizeTeamRows(r.team_rows)
        return {
          id: String(r.id),
          auditId: String(r.audit_id ?? ''),
          auditType: String(r.audit_type ?? 'internal'),
          from: String(r.proposed_from ?? '').slice(0, 10),
          to: String(r.proposed_to ?? '').slice(0, 10),
          kind: normalizeAuditKind(r.audit_kind),
          discipline: String(r.scope_discipline ?? '').trim(),
          witnessedUserId: String(r.witnessed_user_id ?? ''),
          witnessedName: String(r.witnessed_name ?? '').trim(),
          sampleRef: String(r.sample_ref ?? '').trim(),
          team,
          // Before 20261028100100 there is no stored result: same rule on the row departments.
          conflicts:
            'independence_conflicts' in r
              ? normalizeIndependenceConflicts(r.independence_conflicts)
              : teamIndependenceConflicts(
                  team.map((t) => ({
                    auditeeDepartment: t.auditeeDepartment,
                    auditorDepartment: t.auditorDepartment,
                    auditorDesignation: t.auditorDesignation,
                    auditorUserId: t.auditorUserId ?? '',
                    auditorName: t.auditorName ?? '',
                  })),
                  new Map(),
                ),
        }
      })
      setPlans(list)

      // Checklist answers, in chunks of plan ids.
      const ids = list.map((p) => p.id)
      const answers: Array<{ planId: string; clause: string; conformity: string }> = []
      for (let i = 0; i < ids.length; i += 100) {
        const { data: rows, error: itemErr } = await supabase
          .from('audit_checklist_items')
          .select('audit_plan_id, clause_no, conformity')
          .in('audit_plan_id', ids.slice(i, i + 100))
        if (itemErr) throw itemErr
        for (const it of Array.isArray(rows) ? rows : []) {
          const x = it as { audit_plan_id?: unknown; clause_no?: unknown; conformity?: unknown }
          answers.push({
            planId: String(x.audit_plan_id),
            clause: String(x.clause_no ?? ''),
            conformity: String(x.conformity ?? ''),
          })
        }
      }
      setItems(answers)

      setDisciplines(await fetchScopeDisciplines().catch(() => []))

      // Authorized signatories: personnel_authorizations when it exists,
      // else the people who issued reports.
      let sigs: Signatory[] = []
      let source: 'authorizations' | 'issued' | 'none' = 'none'
      const auth = await supabase
        .from('personnel_authorizations')
        .select('user_id, activity, discipline, status, valid_to')
        .in('activity', ['sign_report', 'sign_certificate'])
      if (!auth.error) {
        const today = new Date().toISOString().slice(0, 10)
        const byUser = new Map<string, Set<string>>()
        for (const a of Array.isArray(auth.data) ? auth.data : []) {
          const r = a as { user_id?: unknown; discipline?: unknown; status?: unknown; valid_to?: unknown }
          if (String(r.status ?? 'active') !== 'active') continue
          if (r.valid_to && String(r.valid_to).slice(0, 10) < today) continue
          const uid = String(r.user_id ?? '')
          if (!uid) continue
          const set = byUser.get(uid) ?? new Set<string>()
          if (r.discipline) set.add(String(r.discipline).trim())
          byUser.set(uid, set)
        }
        if (byUser.size) {
          const { data: profs } = await supabase
            .from('user_profiles')
            .select('id, full_name')
            .in('id', Array.from(byUser.keys()))
          const names = new Map<string, string>()
          for (const p of Array.isArray(profs) ? profs : []) {
            const x = p as { id?: unknown; full_name?: unknown }
            names.set(String(x.id), String(x.full_name ?? '').trim())
          }
          sigs = Array.from(byUser.entries()).map(([uid, ds]) => ({
            key: uid,
            userId: uid,
            name: names.get(uid) || uid,
            disciplines: Array.from(ds).filter(Boolean).sort(),
          }))
          source = 'authorizations'
        }
      }
      if (source === 'none') {
        const issued = await supabase
          .from('samples')
          .select('issued_by, issued_by_name')
          .not('issued_by_name', 'is', null)
          .limit(5000)
        if (!issued.error) {
          const byKey = new Map<string, Signatory>()
          for (const s of Array.isArray(issued.data) ? issued.data : []) {
            const x = s as { issued_by?: unknown; issued_by_name?: unknown }
            const name = String(x.issued_by_name ?? '').trim()
            if (!name) continue
            const uid = String(x.issued_by ?? '')
            const key = uid || norm(name)
            if (!byKey.has(key)) byKey.set(key, { key, userId: uid, name, disciplines: [] })
          }
          sigs = Array.from(byKey.values())
          if (sigs.length) source = 'issued'
        }
      }
      sigs.sort((a, b) => a.name.localeCompare(b.name))
      setSignatories(sigs)
      setSignatorySource(source)
    } catch (err) {
      setError(errText(err))
      setPlans([])
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const years = useMemo(() => {
    const set = new Set<number>([thisYear, year])
    for (const p of plans) {
      const y = Number(p.from.slice(0, 4))
      if (Number.isFinite(y) && y > 1900) set.add(y)
    }
    return Array.from(set).sort((a, b) => b - a)
  }, [plans, thisYear, year])

  const yearPlans = useMemo(
    () =>
      plans.filter(
        (p) => p.from.startsWith(String(year)) && (includeExternal || p.auditType !== 'external'),
      ),
    [plans, year, includeExternal],
  )

  /** plan id -> plan clause -> state */
  const planCells = useMemo(() => {
    const m = new Map<string, Map<string, CellState>>()
    const ids = new Set(yearPlans.map((p) => p.id))
    for (const p of yearPlans) {
      const cells = new Map<string, CellState>()
      for (const t of p.team) {
        for (const c of t.criteriaClauseNos) {
          const pc = planClauseOf(c)
          if (pc) cells.set(pc, maxState(cells.get(pc) ?? '', 'planned'))
        }
      }
      m.set(p.id, cells)
    }
    for (const it of items) {
      if (!ids.has(it.planId)) continue
      const pc = planClauseOf(it.clause)
      if (!pc) continue
      const state: CellState =
        it.conformity === 'no' ? 'nc' : it.conformity === 'yes' || it.conformity === 'na' ? 'checked' : ''
      if (!state) continue
      const cells = m.get(it.planId)
      if (cells) cells.set(pc, maxState(cells.get(pc) ?? '', state))
    }
    return m
  }, [yearPlans, items])

  const columns = useMemo(() => {
    if (view === 'audits') {
      return yearPlans.map((p) => ({
        key: p.id,
        label: p.auditId,
        sub: `${MONTHS[Number(p.from.slice(5, 7)) - 1] ?? ''} · ${auditKindLabel(p.kind)}`,
        planIds: [p.id],
      }))
    }
    return MONTHS.map((label, i) => ({
      key: label,
      label,
      sub: '',
      planIds: yearPlans.filter((p) => Number(p.from.slice(5, 7)) === i + 1).map((p) => p.id),
    }))
  }, [view, yearPlans])

  const matrix = useMemo(
    () =>
      ISO_17025_AUDIT_PLAN_CLAUSES.map((c) => {
        const cells = columns.map((col) =>
          col.planIds.reduce<CellState>(
            (acc, id) => maxState(acc, planCells.get(id)?.get(c.clauseNo) ?? ''),
            '',
          ),
        )
        const overall = yearPlans.reduce<CellState>(
          (acc, p) => maxState(acc, planCells.get(p.id)?.get(c.clauseNo) ?? ''),
          '',
        )
        return { clause: c, cells, overall }
      }),
    [columns, planCells, yearPlans],
  )

  const stats = useMemo(() => {
    let audited = 0
    let plannedOnly = 0
    let gaps = 0
    for (const r of matrix) {
      if (r.overall === 'checked' || r.overall === 'nc') audited += 1
      else if (r.overall === 'planned') plannedOnly += 1
      else gaps += 1
    }
    return { audited, plannedOnly, gaps, total: matrix.length }
  }, [matrix])

  // Vertical / witness audits of the year per discipline.
  const disciplineRows = useMemo(() => {
    const names = new Map<string, string>()
    for (const d of disciplines) names.set(norm(d), d)
    for (const p of yearPlans) if (p.discipline) names.set(norm(p.discipline), names.get(norm(p.discipline)) ?? p.discipline)
    return Array.from(names.entries())
      .map(([k, label]) => {
        const matching = yearPlans.filter((p) => p.kind !== 'system' && norm(p.discipline) === k)
        return {
          label,
          vertical: matching.filter((p) => p.kind === 'vertical'),
          witness: matching.filter((p) => p.kind === 'witness'),
          inScope: disciplines.some((d) => norm(d) === k),
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [disciplines, yearPlans])

  const signatoryRows = useMemo(
    () =>
      signatories.map((s) => {
        const hit = (p: Plan) =>
          p.kind !== 'system' &&
          ((s.userId && p.witnessedUserId === s.userId) ||
            (p.witnessedName && norm(p.witnessedName) === norm(s.name)))
        const thisYearPlans = yearPlans.filter(hit)
        const last = plans.filter(hit).reduce<string>((acc, p) => (p.from > acc ? p.from : acc), '')
        return { s, thisYearPlans, last }
      }),
    [signatories, yearPlans, plans],
  )

  const conflictPlans = yearPlans.filter((p) => p.conflicts.length > 0)

  const exportCsv = () => {
    const head = ['Clause', 'Matter', ...columns.map((c) => c.label), 'Year']
    const lines = [
      head.map(csvCell).join(','),
      ...matrix.map((r) =>
        [r.clause.clauseNo, shortMatter(r.clause.clauseMatter), ...r.cells.map((c) => cellText[c] || ''), cellText[r.overall] || 'GAP']
          .map(csvCell)
          .join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit_coverage_${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={cn(limsPageShellClass, 'flex min-h-0 flex-1 flex-col gap-3')}>
      <div className={limsPanelClass}>
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="mr-auto">
              <h1 className="text-base font-semibold tracking-tight text-white sm:text-lg">Audit Programme Coverage</h1>
              <p className="text-[11px] text-stone-300">
                ISO/IEC 17025:2017 cl. 8.8 — clauses covered by the year&apos;s internal audits, vertical / witness
                audits per discipline and signatory, auditor independence.
              </p>
            </div>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className={cn(limsDarkBarFieldClass, 'w-24')} aria-label="Year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={view} onValueChange={(v) => setView(v === 'months' ? 'months' : 'audits')}>
              <SelectTrigger className={cn(limsDarkBarFieldClass, 'w-32')} aria-label="Columns">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="audits">By audit</SelectItem>
                <SelectItem value="months">By month</SelectItem>
              </SelectContent>
            </Select>
            <label className="inline-flex items-center gap-1.5 text-xs text-amber-100">
              <input
                type="checkbox"
                className="h-4 w-4 rounded-none"
                checked={includeExternal}
                onChange={(e) => setIncludeExternal(e.target.checked)}
              />
              Include external audits
            </label>
            <Button type="button" size="sm" className={cn(limsDarkBarBtnClass, 'gap-1')} onClick={() => void load()} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} /> Refresh
            </Button>
            <Button type="button" size="sm" className={cn(limsDarkBarBtnClass, 'gap-1')} onClick={exportCsv}>
              <Download size={14} /> CSV
            </Button>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Section
        title={`Clause coverage ${year}`}
        note={`${yearPlans.length} audit(s). ${stats.audited} of ${stats.total} clauses audited (checklist answered), ${stats.plannedOnly} planned only, ${stats.gaps} not covered.`}
      >
        <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-stone-700">
          <span className={cn('border border-stone-300 px-1.5', cellClass.checked)}>✓ audited (checklist Yes / N/A)</span>
          <span className={cn('border border-stone-300 px-1.5', cellClass.nc)}>NC nonconformity found</span>
          <span className={cn('border border-stone-300 px-1.5', cellClass.planned)}>P in audit criteria, not answered yet</span>
          <span className="border border-red-400 bg-red-50 px-1.5 font-semibold text-red-800">Gap: not covered this year</span>
        </div>
        {loading ? (
          <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
        ) : (
          <div className="max-h-[70vh] overflow-auto border border-stone-400">
            <table className="w-full border-collapse font-jakarta">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className={cn(TH, 'sticky left-0 z-20 min-w-[220px] text-left')}>Clause</th>
                  {columns.map((c) => (
                    <th key={c.key} className={cn(TH, 'min-w-[64px] text-center')} title={c.sub}>
                      <span className="block font-mono normal-case">{c.label}</span>
                      {c.sub ? <span className="block text-[9px] font-medium normal-case text-amber-100/80">{c.sub}</span> : null}
                    </th>
                  ))}
                  <th className={cn(TH, 'min-w-[64px] text-center')}>Year</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((r) => {
                  const gap = r.overall === ''
                  return (
                    <tr key={r.clause.clauseNo} className={gap ? 'bg-red-50' : undefined}>
                      <td
                        className={cn(
                          TD,
                          'sticky left-0 z-[1] text-left',
                          gap ? 'bg-red-50 font-semibold text-red-800' : 'bg-[#fffcf7] text-stone-800',
                        )}
                        title={r.clause.clauseMatter}
                      >
                        <span className="font-mono font-semibold">{r.clause.clauseNo}</span>{' '}
                        <span className="text-[11px]">{shortMatter(r.clause.clauseMatter)}</span>
                      </td>
                      {r.cells.map((state, i) => (
                        <td key={columns[i].key} className={cn(TD, 'text-center font-bold', cellClass[state])}>
                          {cellText[state]}
                        </td>
                      ))}
                      <td
                        className={cn(
                          TD,
                          'text-center font-bold',
                          gap ? 'border-red-400 bg-red-200 text-red-900' : cellClass[r.overall],
                        )}
                      >
                        {gap ? 'GAP' : cellText[r.overall]}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {columns.length === 0 ? (
              <p className="p-4 text-center text-sm text-stone-500">No audits planned in {year}: every clause is a gap.</p>
            ) : null}
          </div>
        )}
      </Section>

      <Section
        title="Vertical and witness audits per NABL scope discipline"
        note={
          hasKindColumn
            ? 'Every discipline of the scope should have at least one vertical or witness audit in the year.'
            : 'Audit kind and discipline need migration 20261028100100_risk_scoring_audit_coverage.sql; until then every audit counts as a system audit.'
        }
      >
        {disciplineRows.length === 0 ? (
          <p className="text-sm text-stone-500">No NABL scope disciplines found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className={cn(TH, 'text-left')}>Discipline</th>
                  <th className={TH}>Vertical audits</th>
                  <th className={TH}>Witness audits</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {disciplineRows.map((d) => {
                  const gap = d.vertical.length + d.witness.length === 0
                  return (
                    <tr key={d.label} className={gap ? 'bg-red-50' : 'bg-[#fffcf7]'}>
                      <td className={cn(TD, 'font-semibold text-stone-800')}>
                        {d.label}
                        {!d.inScope ? <span className="ml-1 text-[10px] text-stone-500">(not in scope list)</span> : null}
                      </td>
                      <td className={cn(TD, 'font-mono')}>
                        {d.vertical.map((p) => `${p.auditId}${p.sampleRef ? ` (${p.sampleRef})` : ''}`).join(', ') || '—'}
                      </td>
                      <td className={cn(TD, 'font-mono')}>
                        {d.witness.map((p) => `${p.auditId}${p.witnessedName ? ` (${p.witnessedName})` : ''}`).join(', ') || '—'}
                      </td>
                      <td className={cn(TD, 'text-center font-bold', gap ? 'text-red-800' : 'text-emerald-800')}>
                        {gap ? 'GAP' : 'Covered'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Witness / vertical audits per authorized signatory"
        note={
          signatorySource === 'authorizations'
            ? 'Signatories from personnel authorizations (sign report / sign certificate, active).'
            : signatorySource === 'issued'
              ? 'Signatories taken from the people who issued test reports (personnel authorizations not available).'
              : 'No authorized signatories found (personnel authorizations or issued reports).'
        }
      >
        {signatoryRows.length === 0 ? (
          <p className="text-sm text-stone-500">Nothing to show.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className={cn(TH, 'text-left')}>Signatory</th>
                  <th className={cn(TH, 'text-left')}>Discipline(s)</th>
                  <th className={TH}>Audits {year}</th>
                  <th className={TH}>Last witnessed</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {signatoryRows.map(({ s, thisYearPlans, last }) => {
                  const gap = thisYearPlans.length === 0
                  return (
                    <tr key={s.key} className={gap ? 'bg-red-50' : 'bg-[#fffcf7]'}>
                      <td className={cn(TD, 'font-semibold text-stone-800')}>{s.name}</td>
                      <td className={TD}>{s.disciplines.join(', ') || '—'}</td>
                      <td className={cn(TD, 'font-mono')}>
                        {thisYearPlans.map((p) => `${p.auditId} (${auditKindLabel(p.kind)})`).join(', ') || '—'}
                      </td>
                      <td className={cn(TD, 'text-center')}>{last ? formatDate(last) : '—'}</td>
                      <td className={cn(TD, 'text-center font-bold', gap ? 'text-red-800' : 'text-emerald-800')}>
                        {gap ? 'GAP' : 'Covered'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Auditor independence"
        note="ISO/IEC 17025 8.8.2: auditors shall not audit their own work. Conflicts are recorded on the plan when it is saved."
      >
        {conflictPlans.length === 0 ? (
          <p className="text-sm text-emerald-800">No audit of {year} has an auditor from the audited department.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {conflictPlans.map((p) => (
              <li key={p.id} className="border-l-2 border-red-600 bg-red-50 px-2 py-1 text-red-900">
                <span className="font-mono font-semibold">{p.auditId}</span> ({auditTypeLabel(p.auditType)},{' '}
                {formatDate(p.from)}): {p.conflicts.map(describeIndependenceConflict).join('; ')}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
