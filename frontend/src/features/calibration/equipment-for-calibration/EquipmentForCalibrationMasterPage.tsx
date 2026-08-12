import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { limsDarkBarGlowStyle, limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
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
  type EquipmentMasterVariant,
  type EquipmentScheduleSection,
} from './types'
import { withComputedCalibrationPointFormulas } from './calibrationPointsFormula'
import {
  LAB_NAME_CHANGED_EVENT,
  LAB_NAME_STORAGE_KEY,
} from '@/features/settings/lab-settings/brandMark'
import { LAB_SETTINGS_SINGLETON_ID } from '@/features/settings/lab-settings/labSettingsDb'

function formatSearchDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const iso = dateStr.slice(0, 10)
  const parts = iso.split('-')
  if (parts.length === 3 && parts[0]!.length === 4) {
    const [year, month, day] = parts
    return `${iso} ${day}-${month}-${year} ${day}/${month}/${year}`
  }
  return dateStr
}

function equipmentSearchBlob(r: EquipmentForCalibrationRow): string {
  return [
    r.asset_code,
    r.equipment_name,
    r.manufacturer,
    r.model_number,
    r.serial_number,
    r.current_location,
    r.equipment_status,
    r.range_capacity,
    r.resolution_least_count,
    r.accuracy_acceptance_criteria,
    r.calibration_certificate_number,
    r.calibration_frequency,
    r.intermediate_check_frequency,
    r.maintenance_schedule_frequency,
    r.maintenance_done_by,
    r.external_calibration_agency_name,
    r.mode_of_calibration,
    r.class_of_instrument,
    r.remarks,
    formatSearchDate(r.last_calibration_date),
    formatSearchDate(r.next_calibration_due),
    formatSearchDate(r.last_intermediate_check_date),
    formatSearchDate(r.next_intermediate_check_date),
    formatSearchDate(r.last_maintenance_date),
    formatSearchDate(r.next_maintenance_date),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function matchesEquipmentSearch(r: EquipmentForCalibrationRow, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const blob = equipmentSearchBlob(r)
  return tokens.every((token) => blob.includes(token))
}

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  return [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean).join(' | ') || 'Unknown error'
}

const SELECT_COLS = '*'

export default function EquipmentForCalibrationMasterPage({
  variant = 'master',
}: {
  variant?: EquipmentMasterVariant
}) {
  const isIqc = variant === 'iqc'
  const moduleTitle = isIqc ? 'Masters for IQC' : 'Master Equipments'
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

  const [iqcMasterRows, setIqcMasterRows] = useState<EquipmentForCalibrationRow[]>([])

  /** IQC standards first; if none exist yet, Master Equipments remain searchable. */
  const masterEquipmentOptions = useMemo(() => {
    const notSelf = (r: EquipmentForCalibrationRow) => r.id !== editingId
    const iqcSource = isIqc ? rows : iqcMasterRows
    const iqc = iqcSource.filter(notSelf)
    if (iqc.length > 0) return iqc
    if (isIqc) return []
    return rows.filter(notSelf)
  }, [isIqc, rows, iqcMasterRows, editingId])

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
        setListError(
          isIqc
            ? 'Please sign in to view Masters for IQC.'
            : 'Please sign in to view equipment for calibration.',
        )
        return
      }
      const { data, error } = await supabase
        .from('equipment_for_calibration')
        .select(SELECT_COLS)
        .eq('is_iqc_master', isIqc)
        .order('asset_code', { ascending: true })
      if (error) throw error
      setRows((data ?? []) as EquipmentForCalibrationRow[])
    } catch (err) {
      setListError(formatSupabaseError(err))
      setRows([])
    } finally {
      setListLoading(false)
    }
  }, [isIqc])

  const loadIqcMasterRows = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('equipment_for_calibration')
        .select(SELECT_COLS)
        .eq('is_iqc_master', true)
        .order('asset_code', { ascending: true })
      if (error) throw error
      setIqcMasterRows((data ?? []) as EquipmentForCalibrationRow[])
    } catch {
      setIqcMasterRows([])
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    void loadLabName()
    void loadClients()
    void loadEmployees()
    void loadRows()
    void loadIqcMasterRows()
  }, [
    authLoading,
    session?.access_token,
    loadLabName,
    loadClients,
    loadEmployees,
    loadRows,
    loadIqcMasterRows,
  ])

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
    () => nextAssetCode(labName, rows.map((r) => r.asset_code), variant),
    [labName, rows, variant],
  )

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    return rows.filter((r) => matchesEquipmentSearch(r, search))
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
      isIqc
        ? 'Module: Calibration LIMS / Masters for IQC (standards used for intermediate checks)'
        : 'Module: Calibration LIMS / Master Equipments (standards used TO calibrate)',
      `Total: ${rows.length}`,
      '',
    ]
    for (const r of rows.slice(0, 20)) {
      lines.push(`- ${r.asset_code} | ${r.equipment_name} | next cal ${r.next_calibration_due ?? '-'}`)
    }
    return lines.join('\n')
  }, [isIqc, rows])

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
      const payload = {
        ...formToPayload(withComputedCalibrationPointFormulas(snapshot)),
        is_iqc_master: isIqc,
      }
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
      await loadIqcMasterRows()
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

  return (
    <div className={limsPageShellClass}>
      <EquipmentForCalibrationHeaderBar
        title={moduleTitle}
        searchPlaceholder={isIqc ? 'Search IQC masters…' : 'Search master equipments…'}
        searchAriaLabel={isIqc ? 'Search IQC masters' : 'Search master equipments'}
        assistantPage={isIqc ? 'masters-for-iqc' : 'equipment-for-calibration'}
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onNew={openNew}
        assistantContext={assistantContext}
        onAssistantDataChanged={() => {
          void loadRows()
          void loadIqcMasterRows()
        }}
      />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
          className={cn(
            '!flex z-50 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none sm:rounded-none',
            'left-0 top-0',
            'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
            'border-stone-600 ring-1 ring-amber-700/20',
            '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {editingId
                  ? isIqc
                    ? 'Edit IQC Master'
                    : 'Edit Equipment'
                  : isIqc
                    ? 'Add New IQC Master'
                    : 'Add New Equipment'}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
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
              moduleVariant={variant}
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
        page={safePage}
        pageCount={pageCount}
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
    </div>
  )
}
