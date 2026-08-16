import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  formatOrgTriple,
  formatTeamAuditee,
  formatTeamAuditor,
  formatTeamCriteria,
} from '@/features/audit-mrm/audit-plan/types'
import { limsDarkBarGlowStyle, limsDialogClass, limsFieldClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import {
  auditTypeLabel,
  computeSummaryStats,
  conformityLabel,
  formatProposedRange,
  mapChecklistItem,
  summaryStatus,
  summaryStatusLabel,
  type AuditChecklistItemRow,
  type AuditPlanRow,
  type AuditSummaryStats,
  type SummaryFindingsTab,
} from './types'

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="border border-stone-500 bg-[#f7f3eb] px-3 py-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className={cn('mt-0.5 text-lg font-semibold tabular-nums text-stone-900', tone)}>{value}</p>
    </div>
  )
}

export function AuditSummaryDialog({
  open,
  onOpenChange,
  plan,
  listStats,
  initialTab = 'nc',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: AuditPlanRow | null
  listStats?: AuditSummaryStats | null
  initialTab?: SummaryFindingsTab
}) {
  const [items, setItems] = useState<AuditChecklistItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState<SummaryFindingsTab>(initialTab)

  useEffect(() => {
    if (!open || !plan) {
      setItems([])
      setError(null)
      setFilter('')
      setTab(initialTab)
      return
    }

    setTab(initialTab)
    setFilter('')

    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: qErr } = await supabase
          .from('audit_checklist_items')
          .select('*')
          .eq('audit_plan_id', plan.id)
          .order('sort_order', { ascending: true })
        if (qErr) throw qErr
        if (cancelled) return
        const list = (Array.isArray(data) ? data : []).map((raw) =>
          mapChecklistItem(raw as Record<string, unknown>),
        )
        setItems(list)
      } catch (err) {
        if (!cancelled) {
          setError(formatSupabaseError(err))
          setItems([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, plan, initialTab])

  const stats = useMemo(() => {
    if (items.length > 0) return computeSummaryStats(items)
    return listStats ?? computeSummaryStats([])
  }, [items, listStats])

  const status = summaryStatus(stats)
  const teamRows = plan && Array.isArray(plan.team_rows) ? plan.team_rows : []

  const filteredItems = useMemo(() => {
    let list = items
    if (tab === 'yes') list = list.filter((i) => i.conformity === 'yes')
    if (tab === 'nc') list = list.filter((i) => i.conformity === 'no')
    if (tab === 'na') list = list.filter((i) => i.conformity === 'na')
    if (tab === 'observations') list = list.filter((i) => i.remark.trim().length > 0)

    const q = filter.trim().toLowerCase()
    if (!q) return list
    return list.filter((i) => {
      const hay = [i.clause_no, i.clause_matter, i.remark, i.non_conformity, i.conformity]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [items, filter, tab])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        portalClassName="!items-stretch !justify-start md:pl-0"
        className={cn(
          limsDialogClass,
          '!flex h-[100dvh] max-h-[100dvh] w-full !max-w-none !translate-x-0 !translate-y-0 flex-col',
          'left-0 top-0',
          'md:!left-[268px] md:!right-0 md:!w-[calc(100vw-268px)] md:!max-w-[calc(100vw-268px)]',
          '[&>button]:!text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {plan ? `Audit Summary — ${plan.audit_id}` : 'Audit Summary'}
              </DialogTitle>
              {plan ? (
                <p className="text-sm text-stone-300">
                  {auditTypeLabel(plan.audit_type)} ·{' '}
                  {formatProposedRange(plan.proposed_from, plan.proposed_to)} ·{' '}
                  {summaryStatusLabel(status)}
                </p>
              ) : null}
            </div>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-5 sm:py-4">
          {error ? (
            <p className="shrink-0 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Progress" value={`${stats.answered}/${stats.total}`} />
            <StatCard label="Yes" value={stats.yes} tone="text-emerald-800" />
            <StatCard
              label="NC"
              value={stats.nonConformities}
              tone={stats.nonConformities > 0 ? 'text-rose-700' : undefined}
            />
            <StatCard label="N/A" value={stats.na} />
            <StatCard label="Observations" value={stats.observations} />
          </div>

          {teamRows.length > 0 ? (
            <div className="shrink-0 overflow-x-auto border border-stone-500 bg-white">
              <table className="min-w-[720px] w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-stone-800">
                    <th className="border border-stone-700 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Auditee
                    </th>
                    <th className="border border-stone-700 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Auditor
                    </th>
                    <th className="border border-stone-700 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Criteria
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {teamRows.map((row, index) => (
                    <tr key={`team-${index}`} className="bg-[#f7f3eb]">
                      <td className="border border-[#e7e0d4] px-2 py-1.5 align-top text-xs text-stone-800">
                        {formatTeamAuditee(row) ||
                          formatOrgTriple(
                            row.auditeeDivision,
                            row.auditeeDepartment,
                            row.auditeeDesignation,
                          ) ||
                          '—'}
                      </td>
                      <td className="border border-[#e7e0d4] px-2 py-1.5 align-top text-center text-xs text-stone-800">
                        {formatTeamAuditor(row) ||
                          formatOrgTriple(
                            row.auditorDivision,
                            row.auditorDepartment,
                            row.auditorDesignation,
                          ) ||
                          '—'}
                      </td>
                      <td className="border border-[#e7e0d4] px-2 py-1.5 align-top text-center text-xs text-stone-800">
                        {(row.criteriaClauseNos ?? []).length > 0 ? (
                          <div className="flex flex-wrap justify-center gap-1">
                            {(row.criteriaClauseNos ?? []).map((no) => (
                              <Badge
                                key={no}
                                variant="secondary"
                                className="rounded-none border border-stone-400 bg-stone-50 font-mono text-[10px] font-normal text-stone-800"
                              >
                                {no}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          formatTeamCriteria(row) || '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['all', 'All Findings'],
                  ['yes', 'Yes Clause'],
                  ['nc', 'Non Conformities'],
                  ['na', 'Not Applicable Clause'],
                  ['observations', 'Observations'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    'h-8 rounded-none border px-3 text-xs font-medium transition-colors',
                    tab === key
                      ? 'border-amber-700 bg-amber-700 text-white'
                      : 'border-stone-500 bg-stone-50 text-stone-800 hover:bg-stone-100',
                  )}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <Label
                htmlFor="summary-findings-filter"
                className="shrink-0 text-xs font-semibold uppercase tracking-wide text-stone-600"
              >
                Filter Clause / Findings
              </Label>
              <input
                id="summary-findings-filter"
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search clause no, description, observation, NC…"
                className={cn(limsFieldClass, 'h-9 w-full px-3 text-sm sm:max-w-xs')}
                aria-label="Filter clause / findings"
              />
            </div>
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading findings…</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
              <Table className="min-w-[960px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4]">
                <TableHeader>
                  <TableRow className="bg-stone-800 hover:bg-stone-800">
                    <TableHead className="sticky top-0 z-10 w-[88px] bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Clause
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 min-w-[200px] bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Description
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 w-[90px] bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Conformity
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 min-w-[200px] bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Observation
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 min-w-[200px] bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Non Conformity
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id} className="bg-[#f7f3eb]">
                      <TableCell className="align-top font-mono text-sm font-medium">
                        {item.clause_no}
                      </TableCell>
                      <TableCell className="align-top text-sm leading-snug text-foreground">
                        {item.clause_matter}
                      </TableCell>
                      <TableCell className="align-top text-center text-sm">
                        {conformityLabel(item.conformity)}
                      </TableCell>
                      <TableCell className="align-top whitespace-pre-wrap text-sm text-foreground">
                        {item.remark.trim() || '—'}
                      </TableCell>
                      <TableCell className="align-top whitespace-pre-wrap text-sm text-foreground">
                        {item.non_conformity.trim() || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredItems.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {items.length === 0
                    ? 'No checklist answers yet for this audit.'
                    : 'No findings match the current filter.'}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
