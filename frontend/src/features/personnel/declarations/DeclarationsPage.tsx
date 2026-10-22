import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, Download, Eye, Printer, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmLoginPasswordDialog } from '@/features/sample-handling/shared/ConfirmLoginPasswordDialog'
import { formatSupabaseError, printViaIframe } from '@/features/general-requirements/shared'
import { useAuth } from '@/hooks/useAuth'
import { csvCell } from '@/lib/csv'
import { fetchTeamUsers, type TeamUserRecord } from '@/lib/fetchTeamUsers'
import { escapeHtml } from '@/lib/htmlText'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsDialogClass,
  limsPageShellClass,
  limsPanelClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import {
  DECLARATION_STATEMENTS,
  declarationDueDate,
  declarationStatus,
  type DeclarationStatement,
  type DeclarationStatus,
  type DeclarationType,
} from './declarationStatements'

type DeclarationRow = {
  id: string
  user_id: string
  declaration_type: DeclarationType
  period_year: number
  statement_version: string
  statement_text: string
  conflicts_declared: string | null
  accepted: boolean
  signed_at: string
  signed_name: string
}

type Draft = { accepted: boolean; conflicts: string }

type StaffStatusRow = {
  userId: string
  name: string
  email: string
  designation: string
  department: string
  inactive: boolean
  byType: Partial<Record<DeclarationType, DeclarationRow>>
}

const TABLE = 'personnel_declarations'

const statusBadgeClass: Record<DeclarationStatus, string> = {
  Signed: 'border-emerald-700/40 bg-emerald-100 text-emerald-800',
  Pending: 'border-amber-700/40 bg-amber-100 text-amber-900',
  Overdue: 'border-red-700/40 bg-red-100 text-red-800',
}

function StatusBadge({ status }: { status: DeclarationStatus }) {
  return (
    <span
      className={cn(
        'inline-block whitespace-nowrap border px-1.5 py-0.5 text-[11px] font-bold tracking-wide',
        statusBadgeClass[status],
      )}
    >
      {status}
    </span>
  )
}

function statementFor(type: DeclarationType): DeclarationStatement {
  const found = DECLARATION_STATEMENTS.find((s) => s.type === type)
  if (!found) throw new Error(`Unknown declaration type ${type}`)
  return found
}

function DarkBar({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
      <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
      <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
      <div className="relative">{children}</div>
    </div>
  )
}

function printDeclaration(row: DeclarationRow) {
  const statement = statementFor(row.declaration_type)
  const conflicts = statement.asksForConflicts
    ? `<h3>Interests declared</h3><p class="pre">${escapeHtml(row.conflicts_declared || 'None')}</p>`
    : ''
  printViaIframe(`<!doctype html><html><head><title>${escapeHtml(statement.title)} ${row.period_year}</title>
<style>body{font-family:sans-serif;font-size:12px;max-width:720px;margin:24px auto}h1{font-size:16px}.pre{white-space:pre-wrap;line-height:1.5}.meta{margin-top:24px;border-top:1px solid #333;padding-top:8px}</style>
</head><body><h1>${escapeHtml(statement.title)} — ${row.period_year}</h1>
<p>${escapeHtml(statement.clause)} · ${escapeHtml(row.statement_version)}</p>
<p class="pre">${escapeHtml(row.statement_text)}</p>${conflicts}
<div class="meta"><p>Signed electronically by <b>${escapeHtml(row.signed_name)}</b> on ${escapeHtml(formatDateTime(row.signed_at))} after password confirmation.</p><p>Record ID: ${escapeHtml(row.id)}</p></div>
</body></html>`)
}

function ViewDeclarationDialog({
  row,
  onOpenChange,
}: {
  row: DeclarationRow | null
  onOpenChange: (open: boolean) => void
}) {
  const statement = row ? statementFor(row.declaration_type) : null
  return (
    <Dialog open={Boolean(row)} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className={cn(limsDialogClass, 'flex w-[calc(100vw-1.5rem)] max-w-2xl flex-col')}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white">
              {statement?.title} — {row?.period_year}
            </DialogTitle>
          </DialogHeader>
        </div>
        {row && statement ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] px-4 py-4 text-sm text-stone-800">
            <p className="text-xs text-stone-600">
              {statement.clause} · {row.statement_version}
            </p>
            <p className="whitespace-pre-line leading-relaxed">{row.statement_text}</p>
            {statement.asksForConflicts ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                  Interests declared
                </p>
                <p className="whitespace-pre-line">{row.conflicts_declared || 'None'}</p>
              </div>
            ) : null}
            <p className="border-t border-stone-300 pt-2 text-xs text-stone-600">
              Signed by <b>{row.signed_name}</b> on {formatDateTime(row.signed_at)}
            </p>
            <div className="flex justify-end">
              <Button type="button" className={cn(limsPrimaryBtnClass, 'gap-1.5')} onClick={() => printDeclaration(row)}>
                <Printer size={14} /> Print
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export default function DeclarationsPage() {
  const { user, designation, departmentName, profileName, profileReady } = useAuth()
  const currentYear = new Date().getFullYear()
  const isReviewer =
    isLaboratoryDirector(designation) ||
    (designation.trim().toLowerCase() === 'quality manager' &&
      departmentName.trim().toLowerCase() === 'quality assurance')

  // ---- My declarations -------------------------------------------------------
  const [myRows, setMyRows] = useState<DeclarationRow[]>([])
  const [myLoading, setMyLoading] = useState(false)
  const [myError, setMyError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<DeclarationType, Draft>>({
    impartiality_coi: { accepted: false, conflicts: '' },
    confidentiality: { accepted: false, conflicts: '' },
  })
  const [pendingType, setPendingType] = useState<DeclarationType | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [signing, setSigning] = useState(false)
  const [viewRow, setViewRow] = useState<DeclarationRow | null>(null)

  const loadMine = useCallback(async () => {
    if (!user?.id) return
    setMyLoading(true)
    setMyError(null)
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('user_id', user.id)
        .order('period_year', { ascending: false })
      if (error) throw error
      setMyRows((data ?? []) as DeclarationRow[])
    } catch (err) {
      setMyError(formatSupabaseError(err))
      setMyRows([])
    } finally {
      setMyLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void loadMine()
  }, [loadMine])

  const mySignedThisYear = useMemo(() => {
    const map: Partial<Record<DeclarationType, DeclarationRow>> = {}
    for (const r of myRows) if (r.period_year === currentYear) map[r.declaration_type] = r
    return map
  }, [myRows, currentYear])

  const myHistory = useMemo(() => myRows.filter((r) => r.period_year !== currentYear), [myRows, currentYear])

  const startSign = (type: DeclarationType) => {
    const statement = statementFor(type)
    const draft = drafts[type]
    setMessage(null)
    if (!draft.accepted) {
      setMessage('Tick the box to confirm you have read and accept the statement.')
      return
    }
    if (statement.asksForConflicts && !draft.conflicts.trim()) {
      setMessage('List any conflicts of interest, or write "None".')
      return
    }
    setPendingType(type)
    setConfirmOpen(true)
  }

  const sign = async (type: DeclarationType) => {
    if (!user?.id) return
    const statement = statementFor(type)
    const draft = drafts[type]
    setSigning(true)
    setMessage(null)
    try {
      const { error } = await supabase.from(TABLE).insert({
        user_id: user.id,
        declaration_type: type,
        period_year: currentYear,
        statement_version: statement.version,
        statement_text: statement.text(currentYear),
        conflicts_declared: statement.asksForConflicts ? draft.conflicts.trim() : null,
        accepted: true,
        signed_name: profileName || user.email || '',
      })
      if (error) {
        if (error.code === '23505') throw new Error(`You have already signed the ${statement.shortTitle} declaration for ${currentYear}.`)
        throw error
      }
      setMessage(`${statement.title} signed for ${currentYear}.`)
      setDrafts((d) => ({ ...d, [type]: { accepted: false, conflicts: '' } }))
      await loadMine()
      if (isReviewer) await loadAll()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : formatSupabaseError(err))
    } finally {
      setSigning(false)
      setPendingType(null)
    }
  }

  // ---- Reviewer view (Laboratory Director / Quality Manager) ----------------
  const [year, setYear] = useState(currentYear)
  const [team, setTeam] = useState<TeamUserRecord[]>([])
  const [yearRows, setYearRows] = useState<DeclarationRow[]>([])
  const [allLoading, setAllLoading] = useState(false)
  const [allError, setAllError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'outstanding' | 'complete'>('all')

  const loadAll = useCallback(async () => {
    if (!isReviewer) return
    setAllLoading(true)
    setAllError(null)
    try {
      const [users, decl] = await Promise.all([
        fetchTeamUsers(),
        supabase.from(TABLE).select('*').eq('period_year', year),
      ])
      if (decl.error) throw decl.error
      setTeam(users)
      setYearRows((decl.data ?? []) as DeclarationRow[])
    } catch (err) {
      setAllError(formatSupabaseError(err))
      setYearRows([])
    } finally {
      setAllLoading(false)
    }
  }, [isReviewer, year])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const staffRows = useMemo<StaffStatusRow[]>(() => {
    const byUser = new Map<string, StaffStatusRow>()
    for (const u of team) {
      const inactive = u.status.trim().toLowerCase() === 'inactive'
      byUser.set(u.id, {
        userId: u.id,
        name: u.full_name || u.email || u.id,
        email: u.email,
        designation: u.designation,
        department: u.department_name,
        inactive,
        byType: {},
      })
    }
    for (const r of yearRows) {
      let row = byUser.get(r.user_id)
      if (!row) {
        row = {
          userId: r.user_id,
          name: r.signed_name || r.user_id,
          email: '',
          designation: '',
          department: '',
          inactive: true,
          byType: {},
        }
        byUser.set(r.user_id, row)
      }
      row.byType[r.declaration_type] = r
    }
    // Active staff, plus anyone inactive who signed for the year.
    return Array.from(byUser.values())
      .filter((r) => !r.inactive || Object.keys(r.byType).length > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [team, yearRows])

  const now = useMemo(() => new Date(), [])
  const statusOf = useCallback(
    (row: StaffStatusRow, type: DeclarationType) => declarationStatus(Boolean(row.byType[type]), year, now),
    [year, now],
  )

  const visibleStaff = useMemo(() => {
    const q = search.trim().toLowerCase()
    return staffRows.filter((r) => {
      const complete = DECLARATION_STATEMENTS.every((s) => r.byType[s.type])
      if (statusFilter === 'outstanding' && complete) return false
      if (statusFilter === 'complete' && !complete) return false
      if (!q) return true
      return [r.name, r.email, r.designation, r.department].join(' ').toLowerCase().includes(q)
    })
  }, [staffRows, search, statusFilter])

  const summary = useMemo(() => {
    const active = staffRows.filter((r) => !r.inactive)
    const counts = DECLARATION_STATEMENTS.map((s) => ({
      type: s.type,
      label: s.shortTitle,
      signed: active.filter((r) => r.byType[s.type]).length,
      overdue: active.filter((r) => statusOf(r, s.type) === 'Overdue').length,
    }))
    return { total: active.length, counts }
  }, [staffRows, statusOf])

  const exportCsv = () => {
    const headers = [
      'Name',
      'Email',
      'Designation',
      'Department',
      'Year',
      'Impartiality/COI Status',
      'Impartiality/COI Signed At',
      'Interests Declared',
      'Confidentiality Status',
      'Confidentiality Signed At',
    ]
    const lines = [
      headers.map(csvCell).join(','),
      ...visibleStaff.map((r) => {
        const coi = r.byType.impartiality_coi
        const conf = r.byType.confidentiality
        return [
          r.name,
          r.email,
          r.designation,
          r.department,
          String(year),
          statusOf(r, 'impartiality_coi'),
          coi ? formatDateTime(coi.signed_at) : '',
          coi?.conflicts_declared ?? '',
          statusOf(r, 'confidentiality'),
          conf ? formatDateTime(conf.signed_at) : '',
        ]
          .map(csvCell)
          .join(',')
      }),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `personnel_declarations_${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const yearOptions = useMemo(() => {
    const list: number[] = []
    for (let y = currentYear; y >= currentYear - 6; y -= 1) list.push(y)
    return list
  }, [currentYear])

  const declarationCell = (row: StaffStatusRow, type: DeclarationType) => {
    const signed = row.byType[type]
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={statusOf(row, type)} />
        {signed ? (
          <>
            <span className="text-[11px] text-stone-600">{formatDate(signed.signed_at)}</span>
            <button
              type="button"
              className="inline-flex items-center text-amber-800 hover:text-amber-950"
              aria-label={`View ${statementFor(type).shortTitle} declaration of ${row.name}`}
              onClick={() => setViewRow(signed)}
            >
              <Eye size={14} />
            </button>
          </>
        ) : null}
      </div>
    )
  }

  const dueText = formatDate(declarationDueDate(currentYear).toISOString())

  return (
    <div className={cn(limsPageShellClass, 'flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4')}>
      <div className={limsPanelClass}>
        <DarkBar>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck size={18} className="text-amber-300" aria-hidden />
            <h1 className="text-base font-semibold tracking-tight sm:text-lg">Annual Declarations</h1>
            <span className="text-xs text-stone-300">
              Impartiality / conflict of interest (cl. 4.1) and confidentiality (cl. 4.2) — due by {dueText}
            </span>
          </div>
        </DarkBar>
      </div>

      {/* My declarations ------------------------------------------------------ */}
      <section className={cn(limsPanelClass, 'bg-[#f7f3eb]')} aria-labelledby="my-declarations-title">
        <div className="border-b border-stone-300 px-3 py-2 sm:px-4">
          <h2 id="my-declarations-title" className="text-sm font-bold uppercase tracking-wide text-stone-800">
            My declarations — {currentYear}
          </h2>
          <p className="text-xs text-stone-600">
            Read each statement, tick to accept, then sign with your login password. A signed declaration cannot be
            changed; if your situation changes, tell the Quality Manager.
          </p>
        </div>
        {message ? (
          <p
            className={cn(
              'px-3 pt-2 text-sm sm:px-4',
              message.includes('signed for') ? 'text-emerald-700' : 'text-red-700',
            )}
            role="status"
          >
            {message}
          </p>
        ) : null}
        {myError ? <p className="px-3 pt-2 text-sm text-red-700 sm:px-4">{myError}</p> : null}
        {!user || !profileReady || myLoading ? (
          <p className="px-4 py-6 text-center text-sm text-stone-500">Loading…</p>
        ) : (
          <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-2">
            {DECLARATION_STATEMENTS.map((statement) => {
              const signed = mySignedThisYear[statement.type]
              const draft = drafts[statement.type]
              const status = declarationStatus(Boolean(signed), currentYear)
              return (
                <article key={statement.type} className="flex min-w-0 flex-col border border-stone-400 bg-[#fffcf7]">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-300 px-3 py-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-stone-900">{statement.title}</h3>
                      <p className="text-[11px] text-stone-500">
                        {statement.clause} · {signed ? signed.statement_version : statement.version}
                      </p>
                    </div>
                    <StatusBadge status={status} />
                  </header>
                  <div className="max-h-72 overflow-y-auto whitespace-pre-line px-3 py-2 text-[13px] leading-relaxed text-stone-800">
                    {signed ? signed.statement_text : statement.text(currentYear)}
                  </div>
                  <div className="mt-auto space-y-2 border-t border-stone-300 px-3 py-3">
                    {signed ? (
                      <>
                        {statement.asksForConflicts ? (
                          <p className="text-sm text-stone-800">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                              Interests declared:{' '}
                            </span>
                            <span className="whitespace-pre-line">{signed.conflicts_declared || 'None'}</span>
                          </p>
                        ) : null}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="inline-flex items-center gap-1.5 text-sm text-emerald-800">
                            <CheckCircle2 size={16} aria-hidden />
                            Signed by {signed.signed_name} on {formatDateTime(signed.signed_at)}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 gap-1.5 rounded-none border-stone-500"
                            onClick={() => printDeclaration(signed)}
                          >
                            <Printer size={14} /> Print
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        {statement.asksForConflicts ? (
                          <div className="space-y-1">
                            <Label
                              htmlFor={`conflicts-${statement.type}`}
                              className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                            >
                              Interests / possible conflicts (write “None” if none)
                            </Label>
                            <Textarea
                              id={`conflicts-${statement.type}`}
                              rows={3}
                              value={draft.conflicts}
                              placeholder="e.g. My brother works for a customer, ABC Cements, as a plant engineer."
                              onChange={(e) =>
                                setDrafts((d) => ({
                                  ...d,
                                  [statement.type]: { ...d[statement.type], conflicts: e.target.value },
                                }))
                              }
                              className="rounded-none border-stone-500 bg-stone-50"
                            />
                          </div>
                        ) : null}
                        <label className="flex items-start gap-2 text-sm text-stone-800">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 shrink-0 rounded-none border-stone-500 text-amber-700"
                            checked={draft.accepted}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [statement.type]: { ...d[statement.type], accepted: e.target.checked },
                              }))
                            }
                          />
                          I, {profileName || user.email}, have read and accept this {statement.shortTitle.toLowerCase()}{' '}
                          statement for {currentYear}.
                        </label>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            className={cn(limsPrimaryBtnClass, 'w-full sm:w-auto')}
                            disabled={signing}
                            onClick={() => startSign(statement.type)}
                          >
                            {signing && pendingType === statement.type ? 'Signing…' : 'Sign with password'}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {myHistory.length ? (
          <div className="border-t border-stone-300 px-3 py-3 sm:px-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-600">Earlier years</h3>
            <ul className="divide-y divide-stone-200 border border-stone-300 bg-[#fffcf7]">
              {myHistory.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <b>{r.period_year}</b> · {statementFor(r.declaration_type).shortTitle}
                    <span className="ml-2 text-xs text-stone-500">signed {formatDate(r.signed_at)}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 gap-1 rounded-none px-2 text-amber-800"
                    onClick={() => setViewRow(r)}
                  >
                    <Eye size={14} /> View
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* Reviewer view -------------------------------------------------------- */}
      {isReviewer ? (
        <section className={cn(limsPanelClass, 'flex min-h-0 flex-1 flex-col')} aria-labelledby="staff-declarations-title">
          <DarkBar>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="staff-declarations-title" className="text-sm font-semibold sm:text-base">
                Staff declarations
              </h2>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className={cn(limsDarkBarFieldClass, 'w-[6.5rem]')} aria-label="Year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className={cn(limsDarkBarFieldClass, 'w-[9.5rem]')} aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All staff</SelectItem>
                  <SelectItem value="outstanding">Outstanding</SelectItem>
                  <SelectItem value="complete">Both signed</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative order-last w-full sm:order-none sm:w-64">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, designation…"
                  className={cn(limsDarkBarSearchClass, 'pl-9')}
                  aria-label="Search staff"
                />
              </div>
              <div className="ml-auto flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(limsDarkBarBtnClass, 'gap-1.5')}
                  onClick={() => void loadAll()}
                  disabled={allLoading}
                  aria-label="Refresh"
                >
                  <RefreshCw size={14} />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(limsDarkBarBtnClass, 'gap-1.5')}
                  onClick={exportCsv}
                  disabled={!visibleStaff.length}
                >
                  <Download size={14} /> CSV
                </Button>
              </div>
            </div>
          </DarkBar>

          <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-stone-300 bg-[#fffcf7] px-3 py-2 text-xs text-stone-700 sm:px-4">
            <span>
              Active staff: <b>{summary.total}</b>
            </span>
            {summary.counts.map((c) => (
              <span key={c.type}>
                {c.label}: <b>{c.signed}</b>/{summary.total} signed
                {c.overdue ? <span className="text-red-700"> · {c.overdue} overdue</span> : null}
              </span>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[#f7f3eb]">
            {allError ? <p className="px-3 pt-3 text-sm text-red-700">{allError}</p> : null}
            {allLoading ? (
              <p className="px-5 py-8 text-center text-sm text-stone-500">Loading…</p>
            ) : visibleStaff.length === 0 ? (
              <p className="m-4 border border-dashed border-stone-300 bg-[#fffcf7] p-6 text-center text-sm text-stone-600">
                No staff match.
              </p>
            ) : (
              <>
                {/* Phone: cards */}
                <ul className="divide-y divide-stone-300 md:hidden">
                  {visibleStaff.map((r) => (
                    <li key={r.userId} className="space-y-1.5 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-semibold text-stone-900">
                          {r.name}
                          {r.inactive ? <span className="ml-1 text-xs font-normal text-stone-500">(inactive)</span> : null}
                        </p>
                        <p className="text-xs text-stone-600">
                          {[r.designation, r.department].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                      {DECLARATION_STATEMENTS.map((s) => (
                        <div key={s.type} className="flex items-center justify-between gap-2">
                          <span className="text-xs text-stone-700">{s.shortTitle}</span>
                          {declarationCell(r, s.type)}
                        </div>
                      ))}
                      {r.byType.impartiality_coi?.conflicts_declared ? (
                        <p className="text-xs text-stone-700">
                          <span className="font-semibold">Interests: </span>
                          {r.byType.impartiality_coi.conflicts_declared}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>

                {/* Tablet / desktop: table */}
                <table className="hidden w-full border-collapse text-sm md:table [&_td]:border [&_td]:border-[#e7e0d4] [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-stone-700 [&_th]:px-2 [&_th]:py-1.5">
                  <thead>
                    <tr className="bg-stone-800 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      <th className="text-left">Name</th>
                      <th className="text-left">Designation / Department</th>
                      <th className="text-left">Impartiality / COI</th>
                      <th className="text-left">Interests declared</th>
                      <th className="text-left">Confidentiality</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleStaff.map((r, i) => (
                      <tr key={r.userId} className={i % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                        <td>
                          <p className="font-semibold text-stone-900">
                            {r.name}
                            {r.inactive ? (
                              <span className="ml-1 text-xs font-normal text-stone-500">(inactive)</span>
                            ) : null}
                          </p>
                          {r.email ? <p className="text-[11px] text-stone-500">{r.email}</p> : null}
                        </td>
                        <td className="text-[12px] text-stone-700">
                          {[r.designation, r.department].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td>{declarationCell(r, 'impartiality_coi')}</td>
                        <td className="max-w-[18rem] whitespace-pre-line break-words text-[12px] text-stone-700">
                          {r.byType.impartiality_coi?.conflicts_declared || '—'}
                        </td>
                        <td>{declarationCell(r, 'confidentiality')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </section>
      ) : null}

      <ConfirmLoginPasswordDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm password to sign"
        confirmLabel="Sign declaration"
        onConfirmed={() => {
          if (pendingType) void sign(pendingType)
        }}
      />
      <ViewDeclarationDialog row={viewRow} onOpenChange={(open) => !open && setViewRow(null)} />
    </div>
  )
}
