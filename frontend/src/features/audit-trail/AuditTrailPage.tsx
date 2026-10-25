import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsPageShellClass,
  limsPanelClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  AUDIT_EXPORT_LIMIT,
  EMPTY_AUDIT_FILTERS,
  annotateAuditReason,
  canReadAuditLog,
  fetchAuditPage,
  fetchAuditRowsForExport,
  fetchStaffOptions,
  type AuditFilters,
  type StaffOption,
} from './auditTrailApi'
import {
  AUDITED_TABLES,
  actionLabel,
  auditRowsToCsv,
  changeSummary,
  diffAuditRow,
  fieldLabel,
  formatAuditTimestamp,
  formatAuditValue,
  tableLabel,
  type AuditAction,
  type AuditRow,
} from './auditTrailDiff'

const ALL = '__all__'
const ANNOTATE_WINDOW_MS = 10 * 60 * 1000

const thClass =
  'bg-stone-800 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'
const tdClass = 'px-2 py-1.5 align-top text-[12.5px] text-[#292524]'
const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'

const actionBadgeClass: Record<AuditAction, string> = {
  INSERT: 'border-emerald-700/40 bg-emerald-50 text-emerald-800',
  UPDATE: 'border-amber-700/40 bg-amber-50 text-amber-900',
  DELETE: 'border-red-700/40 bg-red-50 text-red-800',
}

function formatError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const e = err as { message?: string; details?: string; hint?: string }
  return [e.message, e.details, e.hint].filter(Boolean).join(' | ') || 'Unknown error'
}

function DarkBar({ children, bottomAccent = true }: { children: ReactNode; bottomAccent?: boolean }) {
  return (
    <div className={limsPanelClass}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2 text-white sm:px-5 sm:py-2.5">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <div
          className={cn(
            'absolute left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent',
            bottomAccent ? 'bottom-0' : 'top-0',
          )}
        />
        <div className="relative">{children}</div>
      </div>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  allLabel: string
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <Label>{label}</Label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ReasonForm({ row, onSaved }: { row: AuditRow; onSaved: () => void }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    if (!reason.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const n = await annotateAuditReason(row.table_name, row.row_id ?? '', reason)
      if (n === 0) setError('The 10-minute window has passed or a reason is already recorded.')
      else onSaved()
    } catch (err) {
      setError(formatError(err))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className={cn('mt-3 space-y-1 border-t border-dashed border-stone-300 pt-3', limsRegistryFormClass)}>
      <Label htmlFor={`reason-${row.id}`}>Reason for this change</Label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Textarea
          id={`reason-${row.id}`}
          rows={2}
          value={reason}
          maxLength={2000}
          onChange={(e) => setReason(e.target.value)}
          className="min-w-0 flex-1 resize-y"
          placeholder="Why was this record changed?"
        />
        <Button
          type="button"
          className={cn(limsPrimaryBtnClass, 'shrink-0')}
          disabled={!reason.trim() || saving}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save reason'}
        </Button>
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  )
}

function ChangeDetail({ row, canAnnotate, onAnnotated }: { row: AuditRow; canAnnotate: boolean; onAnnotated: () => void }) {
  const changes = useMemo(() => diffAuditRow(row), [row])
  return (
    <div className="bg-white px-2 py-3 sm:px-4">
      {changes.length === 0 ? (
        <p className="text-sm text-[#57534e]">No field-level changes were recorded for this entry.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[12px]">
            <thead>
              <tr className="bg-stone-100 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                <th className="w-[22%] border border-stone-300 px-2 py-1">Field</th>
                {row.action !== 'INSERT' ? (
                  <th className="border border-stone-300 px-2 py-1">{row.action === 'DELETE' ? 'Value at deletion' : 'Old'}</th>
                ) : null}
                {row.action !== 'DELETE' ? (
                  <th className="border border-stone-300 px-2 py-1">{row.action === 'INSERT' ? 'Value' : 'New'}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.field} className="align-top">
                  <td className="border border-stone-200 px-2 py-1 font-semibold text-stone-700">
                    {fieldLabel(c.field)}
                    <span className="block font-mono text-[10px] font-normal text-stone-400">{c.field}</span>
                  </td>
                  {row.action !== 'INSERT' ? (
                    <td
                      className={cn(
                        'max-w-[28rem] whitespace-pre-wrap break-words border border-stone-200 px-2 py-1 font-mono text-[11.5px]',
                        row.action === 'UPDATE' ? 'bg-red-50/60 text-red-900' : 'text-stone-800',
                      )}
                    >
                      {formatAuditValue(c.oldValue, c.secret)}
                    </td>
                  ) : null}
                  {row.action !== 'DELETE' ? (
                    <td
                      className={cn(
                        'max-w-[28rem] whitespace-pre-wrap break-words border border-stone-200 px-2 py-1 font-mono text-[11.5px]',
                        row.action === 'UPDATE' ? 'bg-emerald-50/60 text-emerald-900' : 'text-stone-800',
                      )}
                    >
                      {formatAuditValue(c.newValue, c.secret)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canAnnotate ? <ReasonForm row={row} onSaved={onAnnotated} /> : null}
    </div>
  )
}

export default function AuditTrailPage() {
  const { user } = useAuth()
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied'>('checking')
  const [accessError, setAccessError] = useState<string | null>(null)
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS)
  const [recordSearch, setRecordSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [jumpTo, setJumpTo] = useState('')
  const [rows, setRows] = useState<AuditRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const ok = await canReadAuditLog()
        if (!cancelled) setAccess(ok ? 'allowed' : 'denied')
      } catch (err) {
        if (!cancelled) {
          setAccess('denied')
          setAccessError(formatError(err))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (access !== 'allowed') return
    let cancelled = false
    fetchStaffOptions()
      .then((list) => {
        if (!cancelled) setStaff(list)
      })
      .catch(() => {
        if (!cancelled) setStaff([])
      })
    return () => {
      cancelled = true
    }
  }, [access])

  // Debounce the record-id search box into the applied filters.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setFilters((f) => (f.recordId === recordSearch ? f : { ...f, recordId: recordSearch }))
    }, 350)
    return () => window.clearTimeout(t)
  }, [recordSearch])

  useEffect(() => {
    if (access !== 'allowed') return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAuditPage(filters, page, pageSize)
      .then(({ rows: data, total: count }) => {
        if (cancelled) return
        setRows(data)
        setTotal(count)
      })
      .catch((err) => {
        if (cancelled) return
        setRows([])
        setTotal(0)
        setError(formatError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [access, filters, page, pageSize, reloadKey])

  const staffNames = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff])
  const actorName = useCallback(
    (id: string | null) => {
      if (!id) return 'System'
      return staffNames.get(id) ?? `User ${id.slice(0, 8)}`
    },
    [staffNames],
  )

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const hasFilters =
    Boolean(filters.table || filters.actor || filters.action || filters.from || filters.to) ||
    recordSearch.trim() !== ''

  const setFilter = <K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) => {
    setPage(1)
    setFilters((f) => ({ ...f, [key]: value }))
  }

  const clearFilters = () => {
    setPage(1)
    setRecordSearch('')
    setFilters(EMPTY_AUDIT_FILTERS)
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    setMessage(null)
    try {
      const list = await fetchAuditRowsForExport({ ...filters, recordId: recordSearch })
      if (!list.length) {
        setMessage('Nothing to export for these filters.')
        return
      }
      const csv = auditRowsToCsv(list, actorName)
      const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setMessage(
        list.length >= AUDIT_EXPORT_LIMIT
          ? `Exported the newest ${AUDIT_EXPORT_LIMIT} rows. Narrow the filters for older entries.`
          : `Exported ${list.length} row(s).`,
      )
    } catch (err) {
      setMessage(formatError(err))
    } finally {
      setExporting(false)
    }
  }

  const canAnnotate = (row: AuditRow) =>
    Boolean(user?.id) &&
    row.actor === user?.id &&
    !row.reason &&
    Date.now() - new Date(row.at).getTime() < ANNOTATE_WINDOW_MS

  const header = (
    <DarkBar>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:flex-nowrap">
        <div className="min-w-0 shrink-0">
          <h1 className="text-base font-semibold tracking-tight text-white sm:text-lg">Audit Trail</h1>
          <p className="text-[11px] text-stone-300">ISO/IEC 17025 · 7.5.2 · 7.11 · 8.4 — who changed what, when and why</p>
        </div>
        {access === 'allowed' ? (
          <div className="order-3 flex w-full min-w-0 items-center gap-2 sm:order-none sm:ml-auto sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-[19.5rem] sm:flex-none">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                aria-hidden
              />
              <Input
                type="search"
                value={recordSearch}
                onChange={(e) => {
                  setPage(1)
                  setRecordSearch(e.target.value)
                }}
                placeholder="Search record ID…"
                className={cn(limsDarkBarSearchClass, 'pl-9')}
                aria-label="Search record ID"
              />
            </div>
            <Select value={String(pageSize)} onValueChange={(v) => {
                setPage(1)
                setPageSize(Number(v))
              }}>
              <SelectTrigger className={cn(limsDarkBarFieldClass, 'w-[7.5rem] shrink-0')} aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20 / Page</SelectItem>
                <SelectItem value="50">50 / Page</SelectItem>
                <SelectItem value="100">100 / Page</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className={cn(limsDarkBarBtnClass, 'shrink-0 px-2')}
              onClick={() => setReloadKey((k) => k + 1)}
              disabled={loading}
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
            </Button>
          </div>
        ) : null}
      </div>
    </DarkBar>
  )

  if (access !== 'allowed') {
    return (
      <div className={cn(limsPageShellClass, 'flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4')}>
        {header}
        <div className={cn(limsPanelClass, 'bg-[#f7f3eb]')}>
          {access === 'checking' ? (
            <p className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-[#78716c]">
              <Loader2 size={16} className="animate-spin" /> Checking access…
            </p>
          ) : (
            <div className="m-4 flex flex-col items-center gap-2 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-6 text-center">
              <ShieldAlert className="text-amber-700" size={28} aria-hidden />
              <p className="text-sm font-semibold text-stone-800">No access to the audit trail</p>
              <p className="max-w-md text-sm text-[#57534e]">
                The audit trail can be viewed by the Laboratory Director and Quality Managers only.
              </p>
              {accessError ? <p className="max-w-md text-xs text-red-700">{accessError}</p> : null}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn(limsPageShellClass, 'flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4')}>
      {header}

      <div className={cn(limsPanelClass, 'bg-[#fffcf7] px-3 py-3 sm:px-4', limsRegistryFormClass)}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] lg:items-end">
          <FilterSelect
            label="Table"
            value={filters.table}
            onChange={(v) => setFilter('table', v)}
            options={AUDITED_TABLES}
            allLabel="All tables"
          />
          <FilterSelect
            label="User"
            value={filters.actor}
            onChange={(v) => setFilter('actor', v)}
            options={staff.map((s) => ({ value: s.id, label: s.name }))}
            allLabel="All users"
          />
          <FilterSelect
            label="Action"
            value={filters.action}
            onChange={(v) => setFilter('action', v as AuditFilters['action'])}
            options={[
              { value: 'INSERT', label: 'Created' },
              { value: 'UPDATE', label: 'Updated' },
              { value: 'DELETE', label: 'Deleted' },
            ]}
            allLabel="All actions"
          />
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor="audit-from">From</Label>
            <Input
              id="audit-from"
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => setFilter('from', e.target.value)}
            />
          </div>
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor="audit-to">To</Label>
            <Input
              id="audit-to"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => setFilter('to', e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-8 gap-1 rounded-none border-stone-500 bg-stone-50 hover:bg-stone-100"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            <X size={14} />
            Clear
          </Button>
        </div>
      </div>

      <div className={cn(limsPanelClass, 'min-h-0 flex-1 overflow-auto bg-[#f7f3eb]')}>
        {error ? <p className="px-3 pt-3 text-sm text-red-600">{error}</p> : null}
        {loading && rows.length === 0 ? (
          <p className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-[#78716c]">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </p>
        ) : rows.length === 0 ? (
          <div className="m-4 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-6 text-center text-sm text-[#57534e]">
            {hasFilters ? 'No audit entries match these filters.' : 'No audit entries recorded yet.'}
          </div>
        ) : (
          <div className={cn('overflow-x-auto', loading && 'opacity-60')}>
            <Table className="w-full min-w-[960px] table-fixed border-collapse font-jakarta [&_td]:border [&_td]:border-[#e7e0d4] [&_th]:border [&_th]:border-stone-700">
              <TableHeader>
                <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                  <TableHead className={cn('w-10', thClass)}>
                    <span className="sr-only">Details</span>
                  </TableHead>
                  <TableHead className={cn('w-[11.5rem]', thClass)}>Date &amp; time</TableHead>
                  <TableHead className={cn('w-[10rem]', thClass)}>User</TableHead>
                  <TableHead className={cn('w-[11rem]', thClass)}>Table</TableHead>
                  <TableHead className={cn('w-[10rem]', thClass)}>Record ID</TableHead>
                  <TableHead className={cn('w-[6.5rem]', thClass)}>Action</TableHead>
                  <TableHead className={thClass}>Changes</TableHead>
                  <TableHead className={cn('w-[14rem]', thClass)}>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => {
                  const open = expanded.has(row.id)
                  const changes = diffAuditRow(row)
                  return (
                    <Fragment key={row.id}>
                      <TableRow
                        className={cn('cursor-pointer', index % 2 === 0 ? rowEvenClass : rowOddClass)}
                        onClick={() => toggle(row.id)}
                      >
                        <TableCell className={cn(tdClass, 'text-center')}>
                          <button
                            type="button"
                            className="inline-flex h-6 w-6 items-center justify-center text-[#92400e] hover:bg-[#f3e9d8]"
                            aria-expanded={open}
                            aria-label={open ? 'Hide changes' : 'Show changes'}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggle(row.id)
                            }}
                          >
                            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </TableCell>
                        <TableCell className={cn(tdClass, 'whitespace-nowrap font-mono text-[11.5px]')}>
                          {formatAuditTimestamp(row.at)}
                        </TableCell>
                        <TableCell className={cn(tdClass, 'break-words font-semibold')}>{actorName(row.actor)}</TableCell>
                        <TableCell className={cn(tdClass, 'break-words')}>
                          {tableLabel(row.table_name)}
                          <span className="block font-mono text-[10px] text-stone-400">{row.table_name}</span>
                        </TableCell>
                        <TableCell className={cn(tdClass, 'break-all font-mono text-[11px] text-[#b45309]')}>
                          {row.row_id || '—'}
                        </TableCell>
                        <TableCell className={cn(tdClass, 'text-center')}>
                          <span
                            className={cn(
                              'inline-block border px-1.5 py-0.5 text-[11px] font-semibold',
                              actionBadgeClass[row.action],
                            )}
                          >
                            {actionLabel(row.action)}
                          </span>
                        </TableCell>
                        <TableCell className={cn(tdClass, 'break-words text-[12px] text-[#57534e]')}>
                          {changeSummary(changes)}
                        </TableCell>
                        <TableCell className={cn(tdClass, 'whitespace-pre-wrap break-words text-[12px]')}>
                          {row.reason ? row.reason : <span className="text-stone-400">—</span>}
                        </TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={8} className="p-0">
                            <ChangeDetail
                              row={row}
                              canAnnotate={canAnnotate(row)}
                              onAnnotated={() => setReloadKey((k) => k + 1)}
                            />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <DarkBar bottomAccent={false}>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5 sm:gap-2 md:flex-nowrap">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              className={limsDarkBarBtnClass}
              onClick={() => void handleExport()}
              disabled={exporting || loading || total === 0}
            >
              {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Export CSV
            </Button>
            {message ? (
              <p
                className={cn(
                  'max-w-[22rem] truncate text-xs',
                  message.startsWith('Exported') ? 'text-emerald-300' : 'text-red-300',
                )}
                title={message}
              >
                {message}
              </p>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2 md:flex-nowrap">
            <span className="whitespace-nowrap text-xs text-stone-300">
              {total.toLocaleString('en-IN')} entr{total === 1 ? 'y' : 'ies'}
            </span>
            <Input
              aria-label="Jump to page"
              value={jumpTo}
              inputMode="numeric"
              onChange={(e) => setJumpTo(e.target.value)}
              className={cn(limsDarkBarFieldClass, 'w-12 px-1 text-center')}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                const n = Number(jumpTo)
                if (Number.isInteger(n) && n >= 1 && n <= pageCount) setPage(n)
              }}
            />
            <Button
              type="button"
              variant="outline"
              className={cn(limsDarkBarBtnClass, 'px-2')}
              onClick={() => {
                const n = Number(jumpTo)
                if (Number.isInteger(n) && n >= 1 && n <= pageCount) setPage(n)
              }}
            >
              Go
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn(limsDarkBarBtnClass, 'px-2')}
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </Button>
            <span className="whitespace-nowrap text-xs text-stone-300">
              {Math.min(page, pageCount)} / {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              className={cn(limsDarkBarBtnClass, 'px-2')}
              disabled={page >= pageCount || loading}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </DarkBar>
    </div>
  )
}
