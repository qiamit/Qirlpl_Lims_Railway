import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/hooks/useAuth'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { supabase } from '@/lib/supabaseClient'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsPageShellClass,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { NcWorkFooterBar } from '../NcWorkFooterBar'
import { NcWorkHeaderBar } from '../NcWorkHeaderBar'
import {
  formatDateTimeDisplay,
  formatSupabaseError,
  printViaIframe,
  type EmployeeOption,
} from '../shared'
import { NcWorkRecordFormFields } from './NcWorkRecordFormFields'
import {
  acceptabilityLabel,
  emptyNcWorkForm,
  nextNcId,
  ncWorkFormToPayload,
  rowToNcWorkForm,
  statusTone,
  type NcWorkRecordForm,
  type NcWorkRecordRow,
} from './types'

const GRID_TABLE =
  'table-fixed min-w-[1100px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm]'
const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'
const primaryLineClass = 'break-words text-[12.5px] font-semibold tracking-tight text-[#292524]'
const metaLineClass = 'break-words font-mono text-[11px] font-medium text-[#b45309]'
const secondaryLineClass = 'break-words text-[11px] font-medium leading-snug text-[#78716c]'
const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'
const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

export default function NcWorkRecordsMasterPage({
  evaluationMode = false,
}: {
  evaluationMode?: boolean
}) {
  const { user } = useAuth()
  const [rows, setRows] = useState<NcWorkRecordRow[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [form, setForm] = useState<NcWorkRecordForm>(() => emptyNcWorkForm())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [recRes, empRes] = await Promise.all([
        supabase.from('nc_work_records').select('*').order('detected_at', { ascending: false }),
        supabase.from('user_profiles').select('id, full_name').order('full_name'),
      ])
      if (recRes.error) throw recRes.error
      setRows((recRes.data ?? []) as NcWorkRecordRow[])
      setEmployees(
        (empRes.data ?? []).map((e) => ({ id: e.id, full_name: e.full_name ?? '' })),
      )
    } catch (err) {
      setError(formatSupabaseError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    let list = rows
    if (evaluationMode) {
      list = list.filter((r) =>
        ['Open', 'Under Evaluation', 'Decision Pending', 'CAPA Required'].includes(r.status),
      )
    }
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((r) =>
      `${r.nc_id} ${r.description} ${r.equipment_or_activity} ${r.source_area} ${r.status} ${r.reported_by_name}`
        .toLowerCase()
        .includes(q),
    )
  }, [rows, search, evaluationMode])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const selectedRows = filtered.filter((r) => selectedIds.has(r.id))

  const canSave =
    !saveLoading &&
    form.ncId.trim().length > 0 &&
    form.detectedAt.trim().length > 0 &&
    form.description.trim().length > 0

  const handleSave = async () => {
    if (!canSave) return
    setSaveLoading(true)
    setMessage(null)
    try {
      const payload = {
        ...ncWorkFormToPayload(form),
        ...(editingId ? {} : { created_by: user?.id ?? null }),
      }
      if (editingId) {
        const { error: err } = await supabase
          .from('nc_work_records')
          .update(payload)
          .eq('id', editingId)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('nc_work_records').insert(payload)
        if (err) throw err
      }
      setMessage('Saved.')
      setShowForm(false)
      await load()
    } catch (err) {
      setMessage(formatSupabaseError(err))
    } finally {
      setSaveLoading(false)
    }
  }

  const handleDeleteSelected = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    if (!window.confirm(`Delete ${ids.length} selected record(s)?`)) return
    const { error: err } = await supabase.from('nc_work_records').delete().in('id', ids)
    if (err) {
      setMessage(formatSupabaseError(err))
      return
    }
    setSelectedIds(new Set())
    setMessage('Deleted.')
    await load()
  }

  const handleExport = () => {
    const list = selectedRows.length ? selectedRows : filtered
    const headers = [
      'NC ID',
      'Detected',
      'Source',
      'Description',
      'Risk',
      'Decision',
      'Status',
      'CAPA Required',
    ]
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      headers.map(esc).join(','),
      ...list.map((r) =>
        [
          r.nc_id,
          r.detected_at,
          r.source_area,
          r.description,
          r.risk_level,
          acceptabilityLabel(r.acceptability_decision),
          r.status,
          r.corrective_action_required ? 'Yes' : 'No',
        ]
          .map(esc)
          .join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = evaluationMode ? 'nc_work_evaluation.csv' : 'nc_work_records.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    const list = selectedRows.length ? selectedRows : filtered
    const rowsHtml = list
      .map(
        (r) =>
          `<tr><td>${r.nc_id}</td><td>${formatDateTimeDisplay(r.detected_at)}</td><td>${r.source_area}</td><td>${r.description}</td><td>${r.status}</td></tr>`,
      )
      .join('')
    printViaIframe(`<!doctype html><html><head><title>Nonconforming Work</title>
<style>body{font-family:sans-serif;font-size:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:4px;text-align:left}th{background:#444;color:#fff}</style>
</head><body><h1>${evaluationMode ? 'Evaluation, Actions & Decisions' : 'Nonconforming Work Records'}</h1>
<table><thead><tr><th>NC ID</th><th>Detected</th><th>Source</th><th>Description</th><th>Status</th></tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`)
  }

  return (
    <div className={cn(limsPageShellClass, 'flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4')}>
      <NcWorkHeaderBar
        title={
          evaluationMode
            ? 'Evaluation, Actions & Decisions'
            : 'Nonconforming Work Records'
        }
        search={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        searchPlaceholder="Search NC ID, description…"
        pageSize={pageSize}
        onPageSizeChange={(s) => {
          setPageSize(s)
          setPage(1)
        }}
        onNew={
          evaluationMode
            ? undefined
            : () => {
                setEditingId(null)
                setForm(emptyNcWorkForm(nextNcId(rows)))
                setMessage(null)
                setShowForm(true)
              }
        }
        newLabel="Add Record"
      />

      <div className={cn(limsPanelClass, 'min-h-0 flex-1 overflow-auto bg-[#f7f3eb]')}>
        {error ? <p className="px-3 pt-3 text-sm text-red-600">{error}</p> : null}
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-[#78716c]">Loading…</p>
        ) : pageRows.length === 0 ? (
          <div className="m-4 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-6 text-center text-sm text-[#57534e]">
            {search.trim()
              ? 'No records match your search.'
              : evaluationMode
                ? 'No records awaiting evaluation.'
                : 'No nonconforming work records yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className={GRID_TABLE}>
              <TableHeader>
                <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                  <TableHead className={cn('w-10', thBase)}>
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label="Select all"
                      checked={pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id))}
                      onChange={(e) => {
                        const next = new Set(selectedIds)
                        pageRows.forEach((r) =>
                          e.target.checked ? next.add(r.id) : next.delete(r.id),
                        )
                        setSelectedIds(next)
                      }}
                    />
                  </TableHead>
                  <TableHead className={thBase}>NC ID</TableHead>
                  <TableHead className={thBase}>Detected</TableHead>
                  <TableHead className={thBase}>Description</TableHead>
                  <TableHead className={thBase}>Risk / Decision</TableHead>
                  <TableHead className={thBase}>Status</TableHead>
                  <TableHead className={cn('w-16', thBase)}>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r, index) => {
                  const selected = selectedIds.has(r.id)
                  return (
                    <TableRow
                      key={r.id}
                      className={cn(
                        selected
                          ? rowSelectedClass
                          : index % 2 === 0
                            ? rowEvenClass
                            : rowOddClass,
                      )}
                    >
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          checked={selected}
                          onChange={() => {
                            const next = new Set(selectedIds)
                            if (next.has(r.id)) next.delete(r.id)
                            else next.add(r.id)
                            setSelectedIds(next)
                          }}
                          aria-label={`Select ${r.nc_id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <p className={metaLineClass}>{r.nc_id}</p>
                        <p className={secondaryLineClass}>{r.source_area}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <p className={primaryLineClass}>{formatDateTimeDisplay(r.detected_at)}</p>
                        <p className={secondaryLineClass}>{r.reported_by_name || '—'}</p>
                      </TableCell>
                      <TableCell>
                        <p className={primaryLineClass}>{r.description || '—'}</p>
                        <p className={secondaryLineClass}>{r.equipment_or_activity || '—'}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <p className={primaryLineClass}>{r.risk_level}</p>
                        <p className={secondaryLineClass}>
                          {acceptabilityLabel(r.acceptability_decision)}
                        </p>
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={cn(
                            'inline-block border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                            statusTone(r.status),
                          )}
                        >
                          {r.status}
                        </span>
                        {r.corrective_action_required ? (
                          <p className="mt-1 text-[10px] font-semibold text-rose-800">CAPA</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="rounded-none text-[#92400e]"
                          aria-label={`Edit ${r.nc_id}`}
                          onClick={() => {
                            setEditingId(r.id)
                            setForm(rowToNcWorkForm(r))
                            setShowForm(true)
                          }}
                        >
                          <Pencil size={16} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <NcWorkFooterBar
        message={message}
        loading={loading || saveLoading}
        selectedCount={selectedIds.size}
        page={page}
        pageCount={pageCount}
        onExport={handleExport}
        onPrintSelected={handlePrint}
        onDeleteSelected={evaluationMode ? undefined : handleDeleteSelected}
        hideDelete={evaluationMode}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number(jumpTo)
          if (Number.isFinite(n) && n >= 1 && n <= pageCount) setPage(n)
        }}
      />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
          portalClassName="!items-stretch !justify-start md:pl-0"
          className={cn(
            limsDialogClass,
            '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
            'left-0 top-0',
            'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
          )}
          aria-describedby={undefined}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white sm:text-lg">
                {evaluationMode
                  ? 'Evaluate Nonconforming Work'
                  : editingId
                    ? 'Edit Nonconforming Work'
                    : 'Add Nonconforming Work'}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5">
            <NcWorkRecordFormFields
              form={form}
              onChange={setForm}
              employees={employees}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={() => void handleSave()}
              evaluationFocus={evaluationMode}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
