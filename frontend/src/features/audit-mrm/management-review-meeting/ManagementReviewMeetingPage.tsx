import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ClipboardList, Plus, Search, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LAB_NAME_STORAGE_KEY } from '@/features/settings/lab-settings/brandMark'
import { useAuth } from '@/hooks/useAuth'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPanelClass,
  limsPrimaryBtnClass,
  limsTableBodyToneClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import type { MrmPlanRow } from '../mrm-agenda/types'
import { MrmActionFollowUpDialog } from './MrmActionFollowUpDialog'
import { MrmMeetingDialog } from './MrmMeetingDialog'
import { MrmNewMeetingDialog } from './MrmNewMeetingDialog'
import {
  errorText,
  isMrmTableMissing,
  loadAllActions,
  loadLabName,
  loadMeetings,
  loadPlans,
  loadUsers,
} from './mrmMeetingDb'
import {
  actionStatusClass,
  actionStatusLabel,
  effectiveActionStatus,
  firmInitialsFromLabName,
  formatPeriod,
  meetingStatusClass,
  meetingStatusLabel,
  nextMeetingNo,
  type MrmActionListRow,
  type MrmActionStatus,
  type MrmMeetingRow,
  type MrmUser,
} from './types'

type Tab = 'meetings' | 'actions'
type ActionFilter = 'pending' | MrmActionStatus | 'all'

const headCell = 'text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

function readStoredLabName(): string {
  try {
    return localStorage.getItem(LAB_NAME_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export default function ManagementReviewMeetingPage() {
  const { user, designation, departmentName } = useAuth()
  const isDirector = isLaboratoryDirector(designation)
  const isQm =
    designation.trim().toLowerCase() === 'quality manager' &&
    departmentName.trim().toLowerCase() === 'quality assurance'
  const canWrite = isDirector || isQm
  const currentUserId = user?.id ?? ''

  const [tab, setTab] = useState<Tab>('meetings')
  const [plans, setPlans] = useState<MrmPlanRow[]>([])
  const [meetings, setMeetings] = useState<MrmMeetingRow[]>([])
  const [actions, setActions] = useState<MrmActionListRow[]>([])
  const [users, setUsers] = useState<MrmUser[]>([])
  const [labName, setLabName] = useState(readStoredLabName)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState<ActionFilter>('pending')
  const [showNew, setShowNew] = useState(false)
  const [openMeetingId, setOpenMeetingId] = useState<string | null>(null)
  const [followUp, setFollowUp] = useState<MrmActionListRow | null>(null)

  const loadAll = useCallback(async () => {
    try {
      const planList = await loadPlans().catch(() => [] as MrmPlanRow[])
      const codeById = new Map(planList.map((p) => [p.id, p.planCode]))
      const meetingList = await loadMeetings(codeById)
      const actionList = await loadAllActions(meetingList)
      setPlans(planList)
      setMeetings(meetingList)
      setActions(actionList)
      setMissing(false)
      setError(null)
    } catch (err) {
      if (isMrmTableMissing(err)) {
        setMissing(true)
        setError(null)
      } else {
        setError(errorText(err))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
    void loadUsers().then(setUsers)
    void loadLabName().then((name) => {
      if (name) setLabName(name)
    })
  }, [loadAll])

  const actionStats = useMemo(() => {
    const byMeeting = new Map<string, { open: number; overdue: number; total: number }>()
    let overdue = 0
    for (const a of actions) {
      const st = effectiveActionStatus(a)
      const cur = byMeeting.get(a.meetingId) ?? { open: 0, overdue: 0, total: 0 }
      cur.total += 1
      if (st === 'open') cur.open += 1
      if (st === 'overdue') {
        cur.overdue += 1
        overdue += 1
      }
      byMeeting.set(a.meetingId, cur)
    }
    return { byMeeting, overdue }
  }, [actions])

  const filteredMeetings = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return meetings
    return meetings.filter((m) =>
      [m.meetingNo, m.planCode, m.venue, m.chairedBy, meetingStatusLabel(m.status)].join(' ').toLowerCase().includes(q),
    )
  }, [meetings, search])

  const filteredActions = useMemo(() => {
    const q = search.trim().toLowerCase()
    return actions.filter((a) => {
      const st = effectiveActionStatus(a)
      if (actionFilter === 'pending' && st === 'done') return false
      if (actionFilter !== 'pending' && actionFilter !== 'all' && st !== actionFilter) return false
      if (!q) return true
      return [a.action, a.ownerName, a.meetingNo, a.capaRef].join(' ').toLowerCase().includes(q)
    })
  }, [actions, actionFilter, search])

  const openMeeting = openMeetingId ? meetings.find((m) => m.id === openMeetingId) ?? null : null
  const suggestedNo = nextMeetingNo(firmInitialsFromLabName(labName), meetings.map((m) => m.meetingNo))

  const canFollowUp = (a: MrmActionListRow) => canWrite || (Boolean(currentUserId) && a.ownerUserId === currentUserId)

  return (
    <div className={limsPageShellClass}>
      {/* Header */}
      <div className={limsPanelClass}>
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="shrink-0 text-base font-semibold tracking-tight text-white sm:text-lg">Management Review Meeting</h1>
            <div className="order-3 flex w-full min-w-0 flex-wrap items-center gap-2 sm:order-none sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={tab === 'meetings' ? 'Search meetings…' : 'Search actions…'}
                  className={cn(limsDarkBarSearchClass, 'pl-9')}
                  aria-label="Search"
                />
              </div>
              {tab === 'actions' ? (
                <select
                  className={cn(limsDarkBarFieldClass, 'px-2 text-sm')}
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value as ActionFilter)}
                  aria-label="Action filter"
                >
                  <option value="pending">Not done</option>
                  <option value="overdue">Overdue</option>
                  <option value="open">Open</option>
                  <option value="done">Done</option>
                  <option value="all">All</option>
                </select>
              ) : null}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {canWrite ? (
                <Button type="button" className={cn('gap-2', limsPrimaryBtnClass)} onClick={() => setShowNew(true)} disabled={missing}>
                  <Plus size={16} /> New meeting
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex border-t border-stone-700 bg-stone-900" role="tablist" aria-label="View">
          {(
            [
              { value: 'meetings', label: 'Meetings', icon: Users, count: meetings.length },
              { value: 'actions', label: 'Action items', icon: ClipboardList, count: actionStats.overdue },
            ] as const
          ).map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide sm:flex-none sm:px-5',
                tab === t.value ? 'bg-amber-700 text-white' : 'text-amber-100 hover:bg-stone-800',
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              {t.value === 'actions' && t.count > 0 ? (
                <span className="bg-red-600 px-1.5 text-[10px] text-white" title="Overdue actions">
                  {t.count} overdue
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {missing ? (
        <p className="border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Management review tables are not installed yet. Apply migration 20261027100200_management_review_meetings.sql.
        </p>
      ) : null}
      {error ? (
        <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {tab === 'meetings' ? (
        <div className={limsPanelClass}>
          {/* Phone: cards */}
          <ul className="divide-y divide-stone-300 md:hidden">
            {filteredMeetings.map((m) => {
              const st = actionStats.byMeeting.get(m.id)
              return (
                <li key={m.id}>
                  <button type="button" className="w-full space-y-1 px-3 py-3 text-left hover:bg-amber-50" onClick={() => setOpenMeetingId(m.id)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-stone-900">{m.meetingNo}</span>
                      <span className={cn('border px-2 py-0.5 text-[11px] font-semibold', meetingStatusClass(m.status))}>
                        {meetingStatusLabel(m.status)}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600">
                      {formatDate(m.heldOn)} · {m.planCode || 'no plan'} · {m.venue || '—'}
                    </p>
                    <p className="text-xs text-stone-600">Period {formatPeriod(m.periodFrom, m.periodTo, formatDate)}</p>
                    {st ? (
                      <p className="text-xs">
                        {st.open} open action(s)
                        {st.overdue ? <span className="font-semibold text-red-700"> · {st.overdue} overdue</span> : null}
                      </p>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
          {/* Tablet / desktop: table */}
          <div className="hidden overflow-x-auto md:block">
            <Table className="min-w-[900px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4]">
              <TableHeader>
                <TableRow className={cn(limsTableHeadClass, 'hover:bg-stone-800')}>
                  <TableHead className={headCell}>Meeting No.</TableHead>
                  <TableHead className={headCell}>Held On</TableHead>
                  <TableHead className={headCell}>Plan</TableHead>
                  <TableHead className={headCell}>Review Period</TableHead>
                  <TableHead className={headCell}>Chaired By</TableHead>
                  <TableHead className={headCell}>Status</TableHead>
                  <TableHead className={headCell}>Actions</TableHead>
                  <TableHead className={headCell}>Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={limsTableBodyToneClass}>
                {filteredMeetings.map((m) => {
                  const st = actionStats.byMeeting.get(m.id)
                  return (
                    <TableRow key={m.id} className="cursor-pointer hover:bg-amber-50" onClick={() => setOpenMeetingId(m.id)}>
                      <TableCell className="text-center font-semibold">{m.meetingNo}</TableCell>
                      <TableCell className="text-center">{formatDate(m.heldOn)}</TableCell>
                      <TableCell className="text-center">{m.planCode || '—'}</TableCell>
                      <TableCell className="text-center">{formatPeriod(m.periodFrom, m.periodTo, formatDate)}</TableCell>
                      <TableCell className="text-center">{m.chairedBy || '—'}</TableCell>
                      <TableCell className="text-center">
                        <span className={cn('border px-2 py-0.5 text-[11px] font-semibold', meetingStatusClass(m.status))}>
                          {meetingStatusLabel(m.status)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {st ? (
                          <>
                            {st.total} total · {st.open} open
                            {st.overdue ? <span className="font-semibold text-red-700"> · {st.overdue} overdue</span> : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(limsOutlineBtnClass, 'h-7 text-xs')}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMeetingId(m.id)
                          }}
                        >
                          {canWrite && m.status !== 'closed' ? 'Edit' : 'View'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {!loading && filteredMeetings.length === 0 && !missing ? (
            <p className="px-3 py-6 text-center text-sm text-stone-500">
              {meetings.length === 0
                ? 'No management review meetings yet. Create one from an MRM plan.'
                : 'No meeting matches the search.'}
            </p>
          ) : null}
          {loading ? <p className="px-3 py-6 text-center text-sm text-stone-500">Loading…</p> : null}
        </div>
      ) : (
        <div className={cn(limsPanelClass, 'divide-y divide-stone-300')}>
          {filteredActions.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-stone-500">{loading ? 'Loading…' : 'No actions in this view.'}</p>
          ) : null}
          {filteredActions.map((a) => {
            const st = effectiveActionStatus(a)
            return (
              <div
                key={a.key}
                className={cn(
                  'grid gap-2 px-3 py-2.5 text-sm md:grid-cols-[8rem_1fr_10rem_7rem_7rem_auto] md:items-center',
                  st === 'overdue' ? 'bg-red-50/60' : 'bg-white',
                )}
              >
                <button
                  type="button"
                  className="text-left text-xs font-semibold text-amber-800 hover:underline"
                  onClick={() => setOpenMeetingId(a.meetingId)}
                >
                  {a.meetingNo || '—'}
                </button>
                <div className="min-w-0">
                  <p className="break-words font-medium text-stone-900">{a.action}</p>
                  {a.closureEvidence ? <p className="text-xs text-stone-600">Evidence: {a.closureEvidence}</p> : null}
                  {a.capaRef ? <p className="text-xs text-stone-600">CAPA {a.capaRef}</p> : null}
                </div>
                <p className="text-xs text-stone-700 md:text-sm">
                  <span className="md:hidden">Owner: </span>
                  {a.ownerName || '—'}
                </p>
                <p className={cn('text-xs md:text-sm', st === 'overdue' ? 'font-semibold text-red-700' : 'text-stone-700')}>
                  <span className="md:hidden">Due: </span>
                  {a.dueOn ? formatDate(a.dueOn) : '—'}
                </p>
                <span className={cn('w-fit border px-2 py-0.5 text-[11px] font-semibold', actionStatusClass(st))}>
                  {st === 'overdue' ? <AlertTriangle className="mr-1 inline h-3 w-3" /> : null}
                  {actionStatusLabel(st)}
                </span>
                {canFollowUp(a) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(limsOutlineBtnClass, 'h-7 w-fit text-xs')}
                    onClick={() => setFollowUp(a)}
                  >
                    Follow up
                  </Button>
                ) : (
                  <span />
                )}
              </div>
            )
          })}
        </div>
      )}

      {showNew ? (
        <MrmNewMeetingDialog
          plans={plans}
          meetings={meetings}
          suggestedNo={suggestedNo}
          onOpenChange={setShowNew}
          onCreated={(id) => {
            setShowNew(false)
            void loadAll().then(() => setOpenMeetingId(id))
          }}
        />
      ) : null}

      {openMeeting ? (
        <MrmMeetingDialog
          key={openMeeting.id}
          meeting={openMeeting}
          labName={labName}
          users={users}
          canWrite={canWrite}
          isDirector={isDirector}
          currentUserId={currentUserId}
          onOpenChange={(open) => {
            if (!open) setOpenMeetingId(null)
          }}
          onChanged={loadAll}
        />
      ) : null}

      {followUp ? (
        <MrmActionFollowUpDialog
          key={followUp.id}
          action={followUp}
          meetingNo={followUp.meetingNo}
          onOpenChange={(open) => {
            if (!open) setFollowUp(null)
          }}
          onSaved={() => void loadAll()}
        />
      ) : null}
    </div>
  )
}
