import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPanelClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import {
  fetchDeletedCounts,
  fetchDeletedRows,
  isSoftDeleteMissingError,
  restoreDeletedRow,
  type DeletedRow,
  type DeletedTableCount,
} from '@/lib/softDelete'
import { cn } from '@/lib/utils'
import { fieldLabel, formatAuditTimestamp, formatAuditValue } from '@/features/audit-trail/auditTrailDiff'

const PAGE_SIZE = 20
const thClass =
  'bg-stone-800 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'
const tdClass = 'px-2 py-1.5 align-top text-[12.5px] text-[#292524]'
const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'

type Access = 'checking' | 'allowed' | 'denied' | 'missing'
type PageResult = { key: string; rows: DeletedRow[]; total: number; error: string | null }

function formatError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const e = err as { message?: string; details?: string; hint?: string }
  return [e.message, e.details, e.hint].filter(Boolean).join(' | ') || 'Unknown error'
}

function isAccessDenied(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  return e?.code === '42501' || /only the laboratory director/i.test(e?.message ?? '')
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

function summaryEntries(row: DeletedRow): Array<[string, string]> {
  return Object.entries(row.summary)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => {
      const text = formatAuditValue(v)
      return [k, text.length > 120 ? `${text.slice(0, 117)}…` : text]
    })
}

/** Headline of a deleted record: its first summary value (number / name). */
function recordTitle(row: DeletedRow): string {
  const first = summaryEntries(row)[0]
  return first ? first[1] : row.row_id
}

function SummaryList({ row, skipFirst = false }: { row: DeletedRow; skipFirst?: boolean }) {
  const entries = summaryEntries(row).slice(skipFirst ? 1 : 0)
  if (entries.length === 0) return null
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[12px]">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="whitespace-nowrap font-semibold text-stone-500">{fieldLabel(k)}</dt>
          <dd className="min-w-0 break-words text-stone-800">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function WithParentBadge({ label }: { label: string }) {
  return (
    <span className="inline-block border border-stone-400 bg-stone-100 px-1.5 py-0.5 text-[11px] font-semibold text-stone-700">
      Deleted with {label}
    </span>
  )
}

function RestoreDialog({
  row,
  tableLabel,
  onClose,
  onRestored,
}: {
  row: DeletedRow | null
  tableLabel: string
  onClose: () => void
  onRestored: (count: number) => void
}) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    if (!row || saving) return
    setSaving(true)
    setError(null)
    try {
      const n = await restoreDeletedRow(row.table_name, row.row_id, reason)
      onRestored(n)
    } catch (err) {
      setError(formatError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => (!open && !saving ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Restore this record?</DialogTitle>
          <DialogDescription>
            {tableLabel}: <span className="font-semibold text-stone-800">{row ? recordTitle(row) : ''}</span> will be
            visible again in its register, together with the rows that were deleted with it. The restore is recorded
            in the audit trail.
          </DialogDescription>
        </DialogHeader>
        {row ? (
          <div className="border border-stone-300 bg-[#fffcf7] p-2">
            <SummaryList row={row} />
            <p className="mt-1 text-[11px] text-stone-500">
              Deleted {formatAuditTimestamp(row.deleted_at)} by {row.deleted_by_name || 'unknown user'}
              {row.delete_reason ? ` — ${row.delete_reason}` : ''}
            </p>
          </div>
        ) : null}
        <div className={cn('space-y-1', limsRegistryFormClass)}>
          <Label htmlFor="restore-reason">Reason for restoring (optional)</Label>
          <Textarea
            id="restore-reason"
            rows={2}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Restored from the Recycle Bin"
            className="resize-y"
          />
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" className={limsOutlineBtnClass} onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" className={cn(limsPrimaryBtnClass, 'gap-1.5')} onClick={() => void confirm()} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Restore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function RecycleBinPage() {
  const { designation } = useAuth()
  const canRestore = isLaboratoryDirector(designation)
  const [access, setAccess] = useState<Access>('checking')
  const [accessError, setAccessError] = useState<string | null>(null)
  const [tables, setTables] = useState<DeletedTableCount[]>([])
  const [table, setTable] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<PageResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<DeletedRow | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchDeletedCounts()
      .then((list) => {
        if (cancelled) return
        setTables(list)
        setAccess('allowed')
        setTable((current) => {
          if (current && list.some((t) => t.table_name === current)) return current
          const firstWithRows = list.find((t) => t.mode === 'soft' && t.direct_count > 0)
          return (firstWithRows ?? list.find((t) => t.table_name === 'samples') ?? list[0])?.table_name ?? ''
        })
      })
      .catch((err) => {
        if (cancelled) return
        if (isSoftDeleteMissingError(err)) {
          setAccess('missing')
          return
        }
        setAccess('denied')
        if (!isAccessDenied(err)) setAccessError(formatError(err))
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // The page currently wanted; `result` belongs to the last request that finished.
  const requestKey = `${table}|${page}|${reloadKey}`
  useEffect(() => {
    if (access !== 'allowed' || !table) return
    let cancelled = false
    fetchDeletedRows(table, PAGE_SIZE, (page - 1) * PAGE_SIZE)
      .then(({ rows: data, total: count }) => {
        if (!cancelled) setResult({ key: requestKey, rows: data, total: count, error: null })
      })
      .catch((err) => {
        if (!cancelled) setResult({ key: requestKey, rows: [], total: 0, error: formatError(err) })
      })
    return () => {
      cancelled = true
    }
  }, [access, table, page, requestKey])

  const loading = access === 'allowed' && Boolean(table) && result?.key !== requestKey
  const rows = result?.rows ?? []
  const total = result?.total ?? 0
  const error = result?.error ?? null

  const current = useMemo(() => tables.find((t) => t.table_name === table), [tables, table])
  const tableLabel = current?.label ?? table
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const sortedTables = useMemo(
    () =>
      [...tables].sort(
        (a, b) => Number(b.deleted_count > 0) - Number(a.deleted_count > 0) || a.label.localeCompare(b.label),
      ),
    [tables],
  )

  const restoreAction = (row: DeletedRow, compact = false) => {
    if (row.deleted_with) return <WithParentBadge label={row.deleted_with} />
    if (!canRestore) return <span className="text-[11px] text-stone-500">Director restores</span>
    return (
      <Button
        type="button"
        variant="outline"
        className={cn(limsOutlineBtnClass, 'h-7 gap-1 px-2 text-[12px]', compact && 'w-full justify-center')}
        onClick={() => {
          setMessage(null)
          setRestoring(row)
        }}
      >
        <RotateCcw size={13} />
        Restore
      </Button>
    )
  }

  const header = (
    <DarkBar>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:flex-nowrap">
        <div className="min-w-0 shrink-0">
          <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight text-white sm:text-lg">
            <Trash2 size={18} className="text-amber-300" aria-hidden />
            Recycle Bin
          </h1>
          <p className="text-[11px] text-stone-300">
            ISO/IEC 17025 · 7.5.2 · 8.4 — deleted records are kept and can be restored by the Laboratory Director
          </p>
        </div>
        {access === 'allowed' ? (
          <div className="order-3 flex w-full min-w-0 items-center gap-2 sm:order-none sm:ml-auto sm:w-auto">
            <Select
              value={table}
              onValueChange={(v) => {
                setPage(1)
                setMessage(null)
                setTable(v)
              }}
            >
              <SelectTrigger
                className={cn(limsDarkBarFieldClass, 'min-w-0 flex-1 sm:w-[19rem] sm:flex-none')}
                aria-label="Register"
              >
                <SelectValue placeholder="Choose a register" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {sortedTables.map((t) => (
                  <SelectItem key={t.table_name} value={t.table_name}>
                    {t.label}
                    {t.deleted_count > 0 ? ` (${t.direct_count}${t.deleted_count > t.direct_count ? ` + ${t.deleted_count - t.direct_count} with parent` : ''})` : ' (0)'}
                  </SelectItem>
                ))}
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
              {access === 'missing' ? (
                <>
                  <p className="text-sm font-semibold text-stone-800">Recycle Bin not set up yet</p>
                  <p className="max-w-md text-sm text-[#57534e]">
                    The soft-delete database update (20261025100000) has not been applied. Until then, deletes are
                    permanent.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-stone-800">No access to the Recycle Bin</p>
                  <p className="max-w-md text-sm text-[#57534e]">
                    Deleted records can be viewed by the Laboratory Director and Quality Managers, and restored by the
                    Laboratory Director.
                  </p>
                </>
              )}
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

      {message ? (
        <p className="border border-emerald-700/30 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
          {message}
        </p>
      ) : null}

      <div className={cn(limsPanelClass, 'min-h-0 flex-1 overflow-auto bg-[#f7f3eb]')}>
        {error ? <p className="px-3 pt-3 text-sm text-red-600">{error}</p> : null}
        {loading && rows.length === 0 ? (
          <p className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-[#78716c]">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </p>
        ) : rows.length === 0 ? (
          <div className="m-4 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-6 text-center text-sm text-[#57534e]">
            {table ? `No deleted records in ${tableLabel}.` : 'Choose a register.'}
          </div>
        ) : (
          <>
            {/* Phone: one card per deleted record */}
            <ul className={cn('space-y-2 p-2 md:hidden', loading && 'opacity-60')}>
              {rows.map((row) => (
                <li key={row.row_id} className="border border-stone-300 bg-[#fffcf7] p-2.5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-semibold text-stone-900">{recordTitle(row)}</p>
                    <span className="shrink-0 font-mono text-[11px] text-stone-500">
                      {formatAuditTimestamp(row.deleted_at)}
                    </span>
                  </div>
                  <div className="mt-1">
                    <SummaryList row={row} skipFirst />
                  </div>
                  <p className="mt-1.5 text-[12px] text-stone-600">
                    <span className="font-semibold">Deleted by</span> {row.deleted_by_name || '—'}
                  </p>
                  <p className="text-[12px] text-stone-600">
                    <span className="font-semibold">Reason</span> {row.delete_reason || '—'}
                  </p>
                  <div className="mt-2">{restoreAction(row, true)}</div>
                </li>
              ))}
            </ul>

            {/* Tablet / desktop: table */}
            <div className={cn('hidden overflow-x-auto md:block', loading && 'opacity-60')}>
              <Table className="w-full min-w-[820px] table-fixed border-collapse font-jakarta [&_td]:border [&_td]:border-[#e7e0d4] [&_th]:border [&_th]:border-stone-700">
                <TableHeader>
                  <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                    <TableHead className={cn('w-[11.5rem]', thClass)}>Deleted on</TableHead>
                    <TableHead className={cn('w-[10rem]', thClass)}>Deleted by</TableHead>
                    <TableHead className={thClass}>Record</TableHead>
                    <TableHead className={cn('w-[14rem]', thClass)}>Reason</TableHead>
                    <TableHead className={cn('w-[10.5rem]', thClass)}>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={row.row_id} className={index % 2 === 0 ? rowEvenClass : rowOddClass}>
                      <TableCell className={cn(tdClass, 'whitespace-nowrap font-mono text-[11.5px]')}>
                        {formatAuditTimestamp(row.deleted_at)}
                      </TableCell>
                      <TableCell className={cn(tdClass, 'break-words font-semibold')}>
                        {row.deleted_by_name || '—'}
                      </TableCell>
                      <TableCell className={tdClass}>
                        <p className="break-words font-semibold text-stone-900">{recordTitle(row)}</p>
                        <SummaryList row={row} skipFirst />
                      </TableCell>
                      <TableCell className={cn(tdClass, 'whitespace-pre-wrap break-words text-[12px]')}>
                        {row.delete_reason ? row.delete_reason : <span className="text-stone-400">—</span>}
                      </TableCell>
                      <TableCell className={cn(tdClass, 'text-center')}>{restoreAction(row)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      <DarkBar bottomAccent={false}>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5 sm:gap-2">
          <p className="min-w-0 text-[11px] text-stone-300">
            {canRestore
              ? 'Records deleted together with a parent come back when the parent is restored.'
              : 'Only the Laboratory Director can restore records.'}
          </p>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="whitespace-nowrap text-xs text-stone-300">
              {total.toLocaleString('en-IN')} deleted
            </span>
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

      <RestoreDialog
        key={restoring?.row_id ?? 'closed'}
        row={restoring}
        tableLabel={tableLabel}
        onClose={() => setRestoring(null)}
        onRestored={(n) => {
          setRestoring(null)
          setMessage(n > 1 ? `Restored the record and ${n - 1} related row(s).` : 'Record restored.')
          if (rows.length === 1 && page > 1) setPage((p) => p - 1)
          setReloadKey((k) => k + 1)
        }}
      />
    </div>
  )
}
