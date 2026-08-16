import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { limsDialogClass, limsPageShellClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { CrmListFooterBar } from './CrmListFooterBar'
import { CrmListForm } from './CrmListForm'
import { CrmListHeaderBar } from './CrmListHeaderBar'
import { CrmListTable } from './CrmListTable'
import { CrmUncertaintyViewDialog } from './CrmUncertaintyViewDialog'
import {
  emptyCrmForm,
  formToPayload,
  formatDateDisplay,
  formatTraceabilityValidity,
  isValidIntegerOrEmpty,
  parseUncertaintyRowsFromDb,
  rowToForm,
  type CrmForm,
  type CrmRow,
  type CrmUncertaintyItem,
} from './types'

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function nextSNo(list: CrmRow[]) {
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

function buildPrintHtml(rows: CrmRow[]) {
  const body = rows
    .map(
      (r) =>
        `<tr>
          <td>${r.s_no}</td>
          <td>${r.id_no || ''}</td>
          <td>${r.crm_type || ''}</td>
          <td>${r.make || ''}</td>
          <td>${formatDateDisplay(r.date_of_purchase)}</td>
          <td>${formatTraceabilityValidity(r.traceability_from, r.valid_upto)}</td>
          <td>${r.traceability_as_per || ''}</td>
          <td>${r.uncertainty || ''}</td>
        </tr>`,
    )
    .join('')
  return `<!doctype html><html><head><title>List of CRMs</title>
<style>
  body{font-family:sans-serif;font-size:11px;color:#1c1917}
  h1{font-size:16px;margin:0 0 12px}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #444;padding:4px;vertical-align:top}
  th{background:#292524;color:#fde68a;text-transform:uppercase;font-size:10px}
</style></head><body>
<h1>List of CRMs</h1>
<table>
<thead><tr>
  <th>Sr. No.</th><th>ID No</th><th>CRM Type</th><th>Make</th><th>Date of Purchase</th>
  <th>Traceability Duration</th><th>Traceability As Per</th><th>Uncertainty</th>
</tr></thead>
<tbody>${body}</tbody>
</table>
</body></html>`
}

export default function CrmListMasterPage() {
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<CrmRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [form, setForm] = useState<CrmForm>(() => emptyCrmForm())
  const [viewUncertaintyOpen, setViewUncertaintyOpen] = useState(false)
  const handleViewUncertaintyOpenChange = useFormDialogOpenChange(setViewUncertaintyOpen)
  const [viewUncertaintyRows, setViewUncertaintyRows] = useState<CrmUncertaintyItem[]>([])
  const [viewUncertaintySubtitle, setViewUncertaintySubtitle] = useState('')

  const canSave =
    !saveLoading &&
    form.sNo.trim().length > 0 &&
    form.idNo.trim().length > 0 &&
    form.crmType.trim().length > 0 &&
    isValidIntegerOrEmpty(form.sNo)

  const loadItems = async () => {
    setListError(null)
    setListLoading(true)
    try {
      const { data, error } = await supabase
        .from('equipment_crms')
        .select('*')
        .order('s_no', { ascending: true })
      if (error) throw error
      setRows(Array.isArray(data) ? (data as CrmRow[]) : [])
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
        r.id_no,
        r.crm_type,
        r.make,
        r.date_of_purchase,
        r.traceability_from,
        r.traceability_as_per,
        r.uncertainty,
        r.valid_upto,
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
    setForm({ ...emptyCrmForm(), sNo: String(nextSNo(rows)) })
    setShowForm(true)
  }

  const handleEdit = (row: CrmRow) => {
    setSaveMessage(null)
    setEditingId(row.id)
    setForm(rowToForm(row))
    setShowForm(true)
  }

  const handleCopy = (row: CrmRow) => {
    setSaveMessage(null)
    setEditingId(null)
    setForm({
      ...rowToForm(row),
      sNo: String(nextSNo(rows)),
      idNo: '',
    })
    setShowForm(true)
  }

  const handleViewUncertainty = (row: CrmRow) => {
    setViewUncertaintyRows(parseUncertaintyRowsFromDb(row.uncertainty_rows, row.uncertainty))
    setViewUncertaintySubtitle(
      [row.id_no, row.crm_type, row.make].map((p) => String(p ?? '').trim()).filter(Boolean).join(' · '),
    )
    setViewUncertaintyOpen(true)
  }

  const handleSave = () => {
    void (async () => {
      if (!canSave) return
      setSaveLoading(true)
      setSaveMessage(null)
      try {
        const payload = formToPayload(form)
        if (editingId) {
          const { error } = await supabase.from('equipment_crms').update(payload).eq('id', editingId)
          if (error) throw error
        } else {
          const { error } = await supabase.from('equipment_crms').insert(payload)
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
      if (!window.confirm(`Delete ${ids.length} selected CRM${ids.length === 1 ? '' : 's'}?`)) {
        return
      }
      setSaveLoading(true)
      setSaveMessage(null)
      try {
        const { error } = await supabase.from('equipment_crms').delete().in('id', ids)
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
    printViaIframe(buildPrintHtml(list))
  }

  const handleExport = () => {
    const list = selectedRows.length > 0 ? selectedRows : filteredRows
    const headers = [
      'Sr. No.',
      'ID No',
      'CRM Type',
      'Make',
      'Date of Purchase',
      'Traceability Duration',
      'Traceability As Per',
      'Uncertainty',
    ]
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      headers.map(esc).join(','),
      ...list.map((r) =>
        [
          String(r.s_no),
          r.id_no,
          r.crm_type,
          r.make,
          r.date_of_purchase ? String(r.date_of_purchase).slice(0, 10) : '',
          formatTraceabilityValidity(r.traceability_from, r.valid_upto),
          r.traceability_as_per,
          r.uncertainty,
        ]
          .map(esc)
          .join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'list_of_crms.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const assistantContext = useMemo(() => {
    const lines = filteredRows.slice(0, 40).map(
      (r) =>
        `${r.s_no}. ${r.id_no} | ${r.crm_type} | ${r.make} | valid ${formatDateDisplay(r.valid_upto)}`,
    )
    return [
      `List of CRMs (${filteredRows.length} rows${search.trim() ? `, filter: "${search.trim()}"` : ''}).`,
      ...lines,
    ].join('\n')
  }, [filteredRows, search])

  return (
    <div className={cn(limsPageShellClass, 'space-y-4 sm:space-y-5')}>
      <CrmListHeaderBar
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
          overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
          portalClassName="md:pl-[268px]"
          className={cn(
            limsDialogClass,
            'flex w-[min(100%-1.5rem,64rem)] max-w-none max-h-[min(92dvh,52rem)] flex-col',
            '[&>button]:!text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {editingId ? 'Edit CRM' : 'Add CRM'}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5 sm:py-5">
            {saveMessage && showForm ? (
              <p
                className={cn(
                  'mb-3 text-sm',
                  saveMessage.toLowerCase().includes('saved')
                    ? 'text-emerald-700'
                    : 'text-destructive',
                )}
              >
                {saveMessage}
              </p>
            ) : null}
            <CrmListForm
              form={form}
              onChange={setForm}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={handleSave}
            />
          </div>
        </DialogContent>
      </Dialog>

      <CrmListTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        searchActive={search.trim().length > 0}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onEdit={handleEdit}
        onCopy={handleCopy}
        onViewUncertainty={handleViewUncertainty}
      />

      <CrmUncertaintyViewDialog
        open={viewUncertaintyOpen}
        onOpenChange={handleViewUncertaintyOpenChange}
        rows={viewUncertaintyRows}
        subtitle={viewUncertaintySubtitle}
      />

      <CrmListFooterBar
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
