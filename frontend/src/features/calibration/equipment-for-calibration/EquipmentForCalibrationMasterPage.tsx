import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { useAuth } from '@/hooks/useAuth'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EquipmentForCalibrationHeaderBar } from './EquipmentForCalibrationHeaderBar'
import { EquipmentForCalibrationTable } from './EquipmentForCalibrationTable'
import { EquipmentForCalibrationFooterBar } from './EquipmentForCalibrationFooterBar'
import { EquipmentForCalibrationForm } from './EquipmentForCalibrationForm'
import type { FilterComboboxOption } from '@/features/sample-handling/receiving/FilterCombobox'
import { fetchCalibrationDivisionEmployees } from '@/features/calibration/calibrationEmployees'
import {
  emptyEquipmentForCalibrationForm,
  formToPayload,
  nextAssetCode,
  normalizeText,
  rowToForm,
  type EquipmentForCalibrationForm as FormState,
  type EquipmentForCalibrationRow,
  type EquipmentScheduleSection,
} from './types'
import { withComputedCalibrationPointFormulas } from './calibrationPointsFormula'
import {
  LAB_NAME_CHANGED_EVENT,
  LAB_NAME_STORAGE_KEY,
} from '@/features/settings/lab-settings/brandMark'
import { LAB_SETTINGS_SINGLETON_ID } from '@/features/settings/lab-settings/labSettingsDb'

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  return [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean).join(' | ') || 'Unknown error'
}

const SELECT_COLS = '*'

export default function EquipmentForCalibrationMasterPage() {
  const { session, loading: authLoading } = useAuth()
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [initialSection, setInitialSection] = useState<EquipmentScheduleSection | null>(null)
  const [sectionOpenKey, setSectionOpenKey] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange((open) => {
    setShowForm(open)
    if (!open) {
      setInitialSection(null)
    }
  })
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<EquipmentForCalibrationRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [form, setForm] = useState<FormState>(() => emptyEquipmentForCalibrationForm())
  const formRef = useRef(form)
  const [clientOptions, setClientOptions] = useState<FilterComboboxOption[]>([])
  const [employeeOptions, setEmployeeOptions] = useState<FilterComboboxOption[]>([])
  const [labName, setLabName] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(LAB_NAME_STORAGE_KEY)?.trim() ?? ''
  })

  const canSave =
    !saveLoading &&
    normalizeText(form.assetCode).length > 0 &&
    normalizeText(form.equipmentName).length > 0

  /** Peer standards offered as reference during an intermediate check (never the row itself). */
  const masterEquipmentOptions = useMemo(
    () => rows.filter((r) => r.id !== editingId),
    [rows, editingId],
  )

  const loadLabName = useCallback(async () => {
    try {
      const cached =
        typeof window !== 'undefined'
          ? (window.localStorage.getItem(LAB_NAME_STORAGE_KEY)?.trim() ?? '')
          : ''
      if (cached) setLabName(cached)

      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession()
      if (!activeSession?.access_token) return

      const { data, error } = await supabase
        .from('lab_settings')
        .select('lab_name')
        .eq('id', LAB_SETTINGS_SINGLETON_ID)
        .maybeSingle()
      if (error) return
      const name = String(data?.lab_name ?? '').trim()
      if (name) setLabName(name)
    } catch {
      // keep cached / empty
    }
  }, [])

  const loadClients = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, company_name')
        .order('company_name', { ascending: true })
      if (error) throw error
      const list = Array.isArray(data)
        ? (data as Array<{ id: string; company_name: string | null }>)
        : []
      setClientOptions(
        list
          .map((r) => ({
            id: r.id,
            label: (r.company_name ?? '').trim(),
          }))
          .filter((o) => o.label.length > 0),
      )
    } catch {
      setClientOptions([])
    }
  }, [])

  const loadEmployees = useCallback(async () => {
    try {
      setEmployeeOptions(await fetchCalibrationDivisionEmployees())
    } catch {
      setEmployeeOptions([])
    }
  }, [])

  const loadRows = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession()
      if (!activeSession?.access_token) {
        setRows([])
        setListError('Please sign in to view equipment for calibration.')
        return
      }
      const { data, error } = await supabase
        .from('equipment_for_calibration')
        .select(SELECT_COLS)
        .order('asset_code', { ascending: true })
      if (error) throw error
      setRows((data ?? []) as EquipmentForCalibrationRow[])
    } catch (err) {
      setListError(formatSupabaseError(err))
      setRows([])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    void loadLabName()
    void loadClients()
    void loadEmployees()
    void loadRows()
  }, [authLoading, session?.access_token, loadLabName, loadClients, loadEmployees, loadRows])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LAB_NAME_STORAGE_KEY) return
      setLabName(typeof e.newValue === 'string' ? e.newValue.trim() : '')
    }
    const onLabNameChanged = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (typeof detail === 'string') setLabName(detail.trim())
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(LAB_NAME_CHANGED_EVENT, onLabNameChanged)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(LAB_NAME_CHANGED_EVENT, onLabNameChanged)
    }
  }, [])

  const makeNextCode = useCallback(
    () => nextAssetCode(labName, rows.map((r) => r.asset_code)),
    [labName, rows],
  )

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [
        r.asset_code,
        r.equipment_name,
        r.manufacturer,
        r.model_number,
        r.serial_number,
        r.current_location,
        r.equipment_status,
        r.calibration_certificate_number,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, safePage, pageSize])

  useEffect(() => {
    setPage(1)
  }, [search, pageSize])

  const assistantContext = useMemo(() => {
    const lines = [
      'Module: Calibration LIMS / Equipment for Calibration (standards used TO calibrate)',
      `Total: ${rows.length}`,
      '',
    ]
    for (const r of rows.slice(0, 20)) {
      lines.push(`- ${r.asset_code} | ${r.equipment_name} | next cal ${r.next_calibration_due ?? '-'}`)
    }
    return lines.join('\n')
  }, [rows])

  const updateForm = (next: FormState) => {
    formRef.current = next
    setForm(next)
  }

  const openNew = () => {
    setEditingId(null)
    setInitialSection(null)
    updateForm({ ...emptyEquipmentForCalibrationForm(), assetCode: makeNextCode() })
    setSaveMessage(null)
    setShowForm(true)
  }

  const openEdit = (row: EquipmentForCalibrationRow, section?: EquipmentScheduleSection) => {
    setEditingId(row.id)
    setInitialSection(section ?? null)
    if (section) setSectionOpenKey((k) => k + 1)
    updateForm(rowToForm(row))
    setSaveMessage(null)
    setShowForm(true)
  }

  const openCopy = (row: EquipmentForCalibrationRow) => {
    setEditingId(null)
    setInitialSection(null)
    updateForm(rowToForm(row, true, makeNextCode()))
    setSaveMessage(null)
    setShowForm(true)
  }

  const handleSave = async (latest?: FormState) => {
    const snapshot = { ...(latest ?? formRef.current) }
    formRef.current = snapshot
    const canSaveNow =
      !saveLoading &&
      normalizeText(snapshot.assetCode).length > 0 &&
      normalizeText(snapshot.equipmentName).length > 0
    if (!canSaveNow) return
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const payload = formToPayload(withComputedCalibrationPointFormulas(snapshot))
      if (editingId) {
        const { error } = await supabase
          .from('equipment_for_calibration')
          .update(payload)
          .eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('equipment_for_calibration').insert(payload)
        if (error) throw error
      }
      setSaveMessage(`Saved ${payload.asset_code}.`)
      setShowForm(false)
      setEditingId(null)
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    } finally {
      setSaveLoading(false)
    }
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
      if (!checked) pagedRows.forEach((r) => next.delete(r.id))
      else pagedRows.forEach((r) => next.add(r.id))
      return next
    })
  }

  const handleDeleteSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} selected record(s)?`)) return
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const { error } = await supabase.from('equipment_for_calibration').delete().in('id', ids)
      if (error) throw error
      setSelectedIds(new Set())
      setSaveMessage(`Deleted ${ids.length} record(s).`)
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    } finally {
      setSaveLoading(false)
    }
  }

  const handleExport = () => {
    const source =
      selectedIds.size > 0 ? filteredRows.filter((r) => selectedIds.has(r.id)) : filteredRows
    const headers = [
      'asset_code',
      'equipment_name',
      'manufacturer',
      'model_number',
      'serial_number',
      'location',
      'status',
      'next_calibration_due',
      'next_ic_due',
      'next_maint_due',
      'certificate_number',
    ]
    const lines = [
      headers.join(','),
      ...source.map((r) =>
        [
          r.asset_code,
          r.equipment_name,
          r.manufacturer ?? '',
          r.model_number ?? '',
          r.serial_number ?? '',
          r.current_location ?? '',
          r.equipment_status ?? '',
          r.next_calibration_due ?? '',
          r.next_intermediate_check_date ?? '',
          r.next_maintenance_date ?? '',
          r.calibration_certificate_number ?? '',
        ]
          .map((v) => {
            const s = String(v)
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
          })
          .join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'equipment_for_calibration.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={limsPageShellClass}>
      <EquipmentForCalibrationHeaderBar
        search={search}
        onSearchChange={setSearch}
        onNew={openNew}
        assistantContext={assistantContext}
        onAssistantDataChanged={() => void loadRows()}
      />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          className="!flex fixed inset-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/10 [&>button]:hover:opacity-100"
          aria-describedby={undefined}
        >
          <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-6 sm:py-5">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.12]"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(45,212,191,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.35) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
            <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-8 text-left">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                {editingId
                  ? 'Equipment for Calibration · Edit Entry'
                  : 'Equipment for Calibration · New Entry'}
              </p>
              <DialogTitle className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {editingId ? 'Edit Equipment' : 'Add Equipment for Calibration'}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#fafbfc] px-4 py-4 sm:px-6 sm:py-5">
            {saveMessage && showForm ? (
              <p className="mb-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {saveMessage}
              </p>
            ) : null}
            <EquipmentForCalibrationForm
              key={`${editingId ?? 'new'}-${initialSection ?? 'full'}-${sectionOpenKey}`}
              form={form}
              onChange={updateForm}
              clientOptions={clientOptions}
              employeeOptions={employeeOptions}
              masterEquipmentOptions={masterEquipmentOptions}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={(latest) => void handleSave(latest)}
              assetCodeLocked={!editingId}
              initialSection={initialSection}
            />
          </div>
        </DialogContent>
      </Dialog>

      <EquipmentForCalibrationTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        searchActive={search.trim().length > 0}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onEdit={openEdit}
        onCopy={openCopy}
      />

      <EquipmentForCalibrationFooterBar
        message={showForm ? null : saveMessage}
        loading={listLoading || saveLoading}
        selectedCount={selectedIds.size}
        totalCount={filteredRows.length}
        page={safePage}
        pageCount={pageCount}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onImport={() => importInputRef.current?.click()}
        onExport={handleExport}
        onPrintSelected={() => setSaveMessage('Use browser print from the table view for now.')}
        onDeleteSelected={() => void handleDeleteSelected()}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number.parseInt(jumpTo, 10)
          if (!Number.isFinite(n)) return
          setPage(Math.min(pageCount, Math.max(1, n)))
        }}
      />

      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={() => {
          setSaveMessage('CSV import for this module will be enabled in a follow-up.')
          if (importInputRef.current) importInputRef.current.value = ''
        }}
      />
    </div>
  )
}
