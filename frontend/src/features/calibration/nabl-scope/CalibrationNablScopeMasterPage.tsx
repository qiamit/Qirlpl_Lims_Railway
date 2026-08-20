import { useEffect, useMemo, useState } from 'react'
import { limsDarkBarGlowStyle, limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CalibrationNablScopeFormView } from './CalibrationNablScopeForm'
import { CalibrationNablScopeHeaderBar } from './CalibrationNablScopeHeaderBar'
import { CalibrationNablScopeTable } from './CalibrationNablScopeTable'
import { CalibrationNablScopeFooterBar } from './CalibrationNablScopeFooterBar'
import {
  buildCalibrationNablScopeAssistantContext,
  buildCalibrationNablScopePrintHtml,
} from './buildCalibrationNablScopePrintHtml'
import {
  emptyCalibrationNablScopeForm,
  formToPayload,
  isValidIntegerOrEmpty,
  rowToForm,
  type CalibrationNablScopeForm,
  type CalibrationNablScopeRow,
} from './types'

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function nextSNo(list: CalibrationNablScopeRow[]) {
  return list.map((r) => r.s_no).reduce((a, b) => Math.max(a, b), 0) + 1
}

function printViaIframe(html: string) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  if (!doc) {
    document.body.removeChild(iframe)
    return
  }
  doc.open()
  doc.write(html)
  doc.close()
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe)
      }, 1000)
    }
  }
}

export default function CalibrationNablScopeMasterPage() {
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<CalibrationNablScopeRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [form, setForm] = useState<CalibrationNablScopeForm>(() => emptyCalibrationNablScopeForm())

  const canSave =
    !saveLoading &&
    form.sNo.trim().length > 0 &&
    form.disciplineName.trim().length > 0 &&
    form.groupName.trim().length > 0 &&
    form.measurand.trim().length > 0 &&
    form.calibrationMethod.trim().length > 0 &&
    form.measurementRange.trim().length > 0 &&
    form.cmc.trim().length > 0 &&
    form.facilityType.trim().length > 0 &&
    isValidIntegerOrEmpty(form.sNo)

  const loadItems = async () => {
    setListError(null)
    setListLoading(true)
    try {
      const { data, error } = await supabase
        .from('calibration_nabl_scope')
        .select('*')
        .order('s_no', { ascending: true })
      if (error) throw error
      setRows(Array.isArray(data) ? (data as CalibrationNablScopeRow[]) : [])
    } catch (err) {
      setListError(formatSupabaseError(err))
      setRows([])
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    void loadItems()
  }, [])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [
        r.s_no,
        r.discipline_name,
        r.group_name,
        r.measurand,
        r.calibration_method,
        r.measurement_range,
        r.cmc,
        r.facility_type,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize) || 1)
  const safePage = Math.min(page, pageCount)
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, safePage, pageSize])

  useEffect(() => {
    setPage(1)
  }, [search, pageSize])

  const handleNew = () => {
    setSaveMessage(null)
    setEditingId(null)
    setForm({ ...emptyCalibrationNablScopeForm(), sNo: String(nextSNo(rows)) })
    setShowForm(true)
  }

  const handleEdit = (row: CalibrationNablScopeRow) => {
    setSaveMessage(null)
    setEditingId(row.id)
    setForm(rowToForm(row))
    setShowForm(true)
  }

  const handleCopy = (row: CalibrationNablScopeRow) => {
    setSaveMessage(null)
    setEditingId(null)
    setForm({ ...rowToForm(row), sNo: String(nextSNo(rows)) })
    setShowForm(true)
  }

  const handleSave = () => {
    void (async () => {
      if (!canSave) return
      setSaveLoading(true)
      setSaveMessage(null)
      try {
        const payload = formToPayload(form)
        if (editingId) {
          const { error } = await supabase
            .from('calibration_nabl_scope')
            .update(payload)
            .eq('id', editingId)
          if (error) throw error
        } else {
          const { error } = await supabase.from('calibration_nabl_scope').insert(payload)
          if (error) throw error
        }
        setSaveMessage('Saved successfully.')
        setShowForm(false)
        setEditingId(null)
        await loadItems()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllOnPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of pagedRows) {
        if (checked) next.add(r.id)
        else next.delete(r.id)
      }
      return next
    })
  }

  const handleDeleteSelected = () => {
    void (async () => {
      const ids = Array.from(selectedIds)
      if (ids.length === 0) return
      if (!window.confirm(`Delete ${ids.length} selected scope entr${ids.length === 1 ? 'y' : 'ies'}?`)) {
        return
      }
      setSaveLoading(true)
      setSaveMessage(null)
      try {
        const { error } = await supabase.from('calibration_nabl_scope').delete().in('id', ids)
        if (error) throw error
        setSelectedIds(new Set())
        setSaveMessage('Deleted successfully.')
        await loadItems()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const selectedRows = useMemo(
    () => filteredRows.filter((r) => selectedIds.has(r.id)),
    [filteredRows, selectedIds],
  )

  const handlePrintSelected = () => {
    const list = selectedRows.length > 0 ? selectedRows : filteredRows
    printViaIframe(
      buildCalibrationNablScopePrintHtml({
        rows: list,
        filterNote: search.trim() || undefined,
      }),
    )
  }

  const handleExport = () => {
    const list = selectedRows.length > 0 ? selectedRows : filteredRows
    const headers = [
      'S. No.',
      'Discipline Name',
      'Group',
      'Measurand / Instrument / Quantity',
      'Calibration Method',
      'Measurement Range',
      'CMC',
      'Facility Type',
    ]
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      headers.map(esc).join(','),
      ...list.map((r) =>
        [
          String(r.s_no),
          r.discipline_name,
          r.group_name,
          r.measurand,
          r.calibration_method,
          r.measurement_range,
          r.cmc,
          r.facility_type,
        ]
          .map(esc)
          .join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'calibration_nabl_scope.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const assistantContext = useMemo(
    () => buildCalibrationNablScopeAssistantContext(filteredRows, search),
    [filteredRows, search],
  )

  return (
    <div className={cn(limsPageShellClass, 'space-y-4 sm:space-y-5')}>
      <CalibrationNablScopeHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onNew={handleNew}
        assistantContext={assistantContext}
        onAssistantDataChanged={() => void loadItems()}
      />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          className={cn(
            'max-h-[92vh] w-[calc(100vw-1rem)] max-w-4xl gap-0 overflow-hidden rounded-none border-4 border-stone-700 bg-white p-0 shadow-2xl ring-2 ring-amber-700/40 sm:w-full sm:rounded-none',
            '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
            'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 lg:w-[min(56rem,calc(100vw-268px-2rem))] lg:max-w-[min(56rem,calc(100vw-268px-2rem))] md:!-translate-x-1/2 md:!-translate-y-1/2',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {editingId ? 'Edit Scope Entry' : 'Add Scope Entry'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="max-h-[min(72vh,720px)] overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
            {saveMessage && showForm ? (
              <p
                className={cn(
                  'mb-4 text-sm',
                  saveMessage.toLowerCase().includes('saved')
                    ? 'border-l-2 border-emerald-600 bg-emerald-50/80 px-3 py-2 text-emerald-800'
                    : 'border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-destructive',
                )}
              >
                {saveMessage}
              </p>
            ) : null}
            <CalibrationNablScopeFormView
              form={form}
              onChange={setForm}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={handleSave}
            />
          </div>
        </DialogContent>
      </Dialog>

      <CalibrationNablScopeTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        searchActive={search.trim().length > 0}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onEdit={handleEdit}
        onCopy={handleCopy}
      />

      <CalibrationNablScopeFooterBar
        message={showForm ? null : saveMessage}
        loading={saveLoading}
        selectedCount={selectedIds.size}
        page={safePage}
        pageCount={pageCount}
        onExport={handleExport}
        onPrintSelected={handlePrintSelected}
        onDeleteSelected={handleDeleteSelected}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number(jumpTo)
          if (Number.isInteger(n) && n >= 1 && n <= pageCount) setPage(n)
        }}
      />
    </div>
  )
}
