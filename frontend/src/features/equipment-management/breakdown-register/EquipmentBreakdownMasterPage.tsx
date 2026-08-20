import { useCallback, useEffect, useMemo, useState } from 'react'
import { limsDialogClass, limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/hooks/useAuth'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EquipmentBreakdownForm } from './EquipmentBreakdownForm'
import { EquipmentBreakdownHeaderBar } from './EquipmentBreakdownHeaderBar'
import { EquipmentBreakdownTable } from './EquipmentBreakdownTable'
import { EquipmentBreakdownFooterBar } from './EquipmentBreakdownFooterBar'
import {
  emptyBreakdownForm,
  formToPayload,
  formatDateDisplay,
  formatDateTimeDisplay,
  rowToForm,
  type BreakdownRegisterForm,
  type BreakdownRegisterRow,
  type EquipmentPickOption,
  type EquipmentSource,
} from './types'
import { EQUIPMENT_KIND_TESTING } from '@/lib/equipmentKind'

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function printViaIframe(html: string) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
  })
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

function nextRegisterNo(existing: BreakdownRegisterRow[]): string {
  const year = new Date().getFullYear()
  const prefix = `EBR-${year}-`
  let max = 0
  for (const r of existing) {
    const no = r.register_no ?? ''
    if (!no.startsWith(prefix)) continue
    const n = Number(no.slice(prefix.length))
    if (Number.isFinite(n)) max = Math.max(max, n)
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

async function syncEquipmentStatus(opts: {
  source: EquipmentSource
  equipmentId: string | null
  status: string
}) {
  if (!opts.equipmentId) return
  const nextStatus =
    opts.status === 'Closed'
      ? 'Active'
      : opts.status === 'Scrapped'
        ? 'Idle'
        : opts.status === 'Open' || opts.status === 'Under Repair'
          ? 'In Repair'
          : null
  if (!nextStatus) return
  const table =
    opts.source === 'calibration' || opts.source === 'calibration_iqc'
      ? 'equipment_for_calibration'
      : opts.source === 'testing_iqc'
        ? 'iqc_masters'
        : 'equipment_master'
  await supabase.from(table).update({ equipment_status: nextStatus }).eq('id', opts.equipmentId)
}

export default function EquipmentBreakdownMasterPage() {
  const { user } = useAuth()
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<BreakdownRegisterRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [form, setForm] = useState<BreakdownRegisterForm>(() => emptyBreakdownForm())
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentPickOption[]>([])
  const [employees, setEmployees] = useState<Array<{ id: string; full_name: string }>>([])

  const canSave =
    !saveLoading &&
    form.registerNo.trim().length > 0 &&
    form.assetCode.trim().length > 0 &&
    form.equipmentName.trim().length > 0 &&
    form.breakdownDate.trim().length > 0 &&
    form.natureOfBreakdown.trim().length > 0

  const loadLookups = useCallback(async () => {
    const [testingRes, calibRes, iqcRes, empRes] = await Promise.all([
      supabase
        .from('equipment_master')
        .select(
          'id, asset_code, equipment_name, manufacturer, model_number, serial_number, current_location, equipment_status',
        )
        .eq('equipment_kind', EQUIPMENT_KIND_TESTING)
        .order('equipment_name'),
      supabase
        .from('equipment_for_calibration')
        .select(
          'id, asset_code, equipment_name, manufacturer, model_number, serial_number, current_location, equipment_status, is_iqc_master',
        )
        .order('equipment_name'),
      supabase
        .from('iqc_masters')
        .select(
          'id, asset_code, equipment_name, manufacturer, model_number, serial_number, current_location, equipment_status',
        )
        .order('equipment_name'),
      supabase.from('user_profiles').select('id, full_name').order('full_name'),
    ])

    const mapRow = (
      r: {
        id: string
        asset_code?: string | null
        equipment_name?: string | null
        manufacturer?: string | null
        model_number?: string | null
        serial_number?: string | null
        current_location?: string | null
        equipment_status?: string | null
      },
      source: EquipmentSource,
    ): EquipmentPickOption => ({
      id: r.id,
      source,
      asset_code: r.asset_code ?? '',
      equipment_name: r.equipment_name ?? '',
      manufacturer: r.manufacturer ?? '',
      model_number: r.model_number ?? '',
      serial_number: r.serial_number ?? '',
      current_location: r.current_location ?? '',
      equipment_status: r.equipment_status ?? '',
    })

    const testing = (testingRes.data ?? []).map((r) => mapRow(r, 'testing'))
    const calibAll = calibRes.data ?? []
    const calib = calibAll
      .filter((r) => !r.is_iqc_master)
      .map((r) => mapRow(r, 'calibration'))
    const calibIqc = calibAll
      .filter((r) => Boolean(r.is_iqc_master))
      .map((r) => mapRow(r, 'calibration_iqc'))
    const testingIqc = (iqcRes.data ?? []).map((r) => mapRow(r, 'testing_iqc'))

    setEquipmentOptions([...testing, ...calib, ...testingIqc, ...calibIqc])
    setEmployees(
      (empRes.data ?? []).map((e) => ({
        id: e.id,
        full_name: e.full_name ?? '',
      })),
    )
  }, [])

  const loadRows = useCallback(async () => {
    setListError(null)
    setListLoading(true)
    try {
      const { data, error } = await supabase
        .from('equipment_breakdown_register')
        .select('*')
        .order('breakdown_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      setRows(Array.isArray(data) ? (data as BreakdownRegisterRow[]) : [])
    } catch (err) {
      setListError(formatSupabaseError(err))
      setRows([])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLookups()
    void loadRows()
  }, [loadLookups, loadRows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [
        r.register_no,
        r.asset_code,
        r.equipment_name,
        r.nature_of_breakdown,
        r.status,
        r.reported_by_name,
        r.current_location,
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
    setForm(emptyBreakdownForm(nextRegisterNo(rows)))
    setShowForm(true)
  }

  const handleEdit = (row: BreakdownRegisterRow) => {
    setSaveMessage(null)
    setEditingId(row.id)
    setForm(rowToForm(row))
    setShowForm(true)
  }

  const handleCopy = (row: BreakdownRegisterRow) => {
    setSaveMessage(null)
    setEditingId(null)
    setForm({
      ...rowToForm(row),
      registerNo: nextRegisterNo(rows),
      status: 'Open',
      returnToServiceDate: '',
      postRepairCheckDone: false,
    })
    setShowForm(true)
  }

  const handleSave = () => {
    void (async () => {
      if (!canSave) return
      setSaveLoading(true)
      setSaveMessage(null)
      try {
        if (editingId) {
          const payload = formToPayload(form)
          const { error } = await supabase
            .from('equipment_breakdown_register')
            .update(payload)
            .eq('id', editingId)
          if (error) throw error
        } else {
          const payload = {
            ...formToPayload(form),
            created_by: user?.id ?? null,
          }
          const { error } = await supabase.from('equipment_breakdown_register').insert(payload)
          if (error) throw error
        }
        await syncEquipmentStatus({
          source: form.equipmentSource,
          equipmentId: form.equipmentId || null,
          status: form.status,
        })
        setSaveMessage('Saved successfully.')
        setShowForm(false)
        setEditingId(null)
        await loadRows()
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
      if (!window.confirm(`Delete ${ids.length} selected record(s)?`)) return
      setSaveLoading(true)
      setSaveMessage(null)
      try {
        const { error } = await supabase.from('equipment_breakdown_register').delete().in('id', ids)
        if (error) throw error
        setSelectedIds(new Set())
        setSaveMessage('Deleted successfully.')
        await loadRows()
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

  const handleExport = () => {
    const list = selectedRows.length > 0 ? selectedRows : filteredRows
    const headers = [
      'Breakdown ID',
      'Source',
      'Asset Code',
      'Equipment Name',
      'Breakdown Date',
      'Nature',
      'Status',
      'Reported By',
      'Return to Service',
      'Authorized By',
    ]
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      headers.map(esc).join(','),
      ...list.map((r) =>
        [
          r.register_no,
          r.equipment_source,
          r.asset_code,
          r.equipment_name,
          r.breakdown_date,
          r.nature_of_breakdown,
          r.status,
          r.reported_by_name ?? '',
          formatDateTimeDisplay(r.return_to_service_date),
          r.authorized_by_name ?? '',
        ]
          .map(esc)
          .join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'equipment_breakdown_register.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrintSelected = () => {
    const list = selectedRows.length > 0 ? selectedRows : filteredRows
    const rowsHtml = list
      .map(
        (r) => `<tr>
<td>${r.register_no}</td>
<td>${r.asset_code}<br/>${r.equipment_name}</td>
<td>${formatDateDisplay(r.breakdown_date)}</td>
<td>${r.nature_of_breakdown}</td>
<td>${r.status}</td>
<td>${r.reported_by_name ?? '—'}</td>
<td>${formatDateTimeDisplay(r.return_to_service_date)}</td>
</tr>`,
      )
      .join('')
    printViaIframe(`<!doctype html><html><head><title>Equipment Breakdown Register</title>
<style>
@page{size:A4 landscape;margin:10mm}
body{font-family:Segoe UI,sans-serif;font-size:9pt}
h1{font-size:14pt;margin:0 0 8px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #444;padding:4px;vertical-align:top}
th{background:#1c1917;color:#fde68a}
</style></head><body>
<h1>Equipment Breakdown Register</h1>
<table><thead><tr>
<th>Breakdown ID</th><th>Equipment</th><th>Date</th><th>Nature</th><th>Status</th><th>Reported By</th><th>RTS</th>
</tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`)
  }

  const assistantContext = useMemo(() => {
    const open = rows.filter((r) => r.status === 'Open' || r.status === 'Under Repair').length
    const lines = filteredRows.slice(0, 30).map(
      (r) =>
        `${r.register_no} | ${r.asset_code} | ${r.equipment_name} | ${r.status} | ${r.nature_of_breakdown}`,
    )
    return [
      'Table: equipment_breakdown_register',
      `Total: ${rows.length}, Open/Under Repair: ${open}`,
      `Search: ${search.trim() || '(none)'}`,
      ...lines,
    ].join('\n')
  }, [rows, filteredRows, search])

  return (
    <div className={cn(limsPageShellClass, 'space-y-4 sm:space-y-5')}>
      <EquipmentBreakdownHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onNew={handleNew}
        assistantContext={assistantContext}
        onAssistantDataChanged={() => void loadRows()}
      />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          portalClassName="!items-stretch !justify-start md:pl-0"
          className={cn(
            limsDialogClass,
            '[&>button]:!text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
            '!flex h-[100dvh] max-h-[100dvh] w-full !max-w-none !translate-x-0 !translate-y-0 flex-col',
            'left-0 top-0',
            'lg:!left-[268px] lg:!right-0 lg:!w-[calc(100vw-268px)] lg:!max-w-[calc(100vw-268px)]',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {editingId ? 'Edit Breakdown Record' : 'Add Breakdown Record'}
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
            <EquipmentBreakdownForm
              form={form}
              onChange={setForm}
              equipmentOptions={equipmentOptions}
              employees={employees}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={handleSave}
            />
          </div>
        </DialogContent>
      </Dialog>

      <EquipmentBreakdownTable
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

      <EquipmentBreakdownFooterBar
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
