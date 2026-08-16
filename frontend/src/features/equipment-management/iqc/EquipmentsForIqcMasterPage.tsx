import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { limsDarkBarGlowStyle, limsPageShellClass } from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { useAuth } from '@/hooks/useAuth'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AddClientDialog } from '@/features/masters/equipment-master/AddClientDialog'
import { IqcMasterForm } from '@/features/masters/iqc-master/IqcMasterForm'
import {
  emptyIqcForm,
  sanitizeDateStr,
  type EquipmentStatus,
  type Frequency,
  type IqcForm,
  type IqcRow,
} from '@/features/masters/iqc-master/types'
import {
  joinValueAndUnit,
  splitValueAndUnit,
} from '@/features/masters/equipment-master/types'
import { parseMaintenanceChecklistFromDb } from '@/features/masters/equipment-master/maintenanceChecklist'
import { parseMaintenanceHistoryFromDb } from '@/features/masters/equipment-master/maintenanceHistory'
import {
  parseCalibrationPointsTable,
  serializeCalibrationPointsTable,
} from '@/features/calibration/equipment-for-calibration/types'
import { computeCalibrationPointRowValuesFromMaster } from '@/features/calibration/equipment-for-calibration/calibrationPointsFormula'
import { EquipmentForCalibrationForm } from '@/features/calibration/equipment-for-calibration/EquipmentForCalibrationForm'
import {
  emptyEquipmentForCalibrationForm,
  formToPayload,
  nextAssetCode,
  normalizeText,
  rowToForm,
  type EquipmentForCalibrationForm as CalFormState,
  type EquipmentForCalibrationRow,
  type EquipmentScheduleSection,
} from '@/features/calibration/equipment-for-calibration/types'
import { withComputedCalibrationPointFormulas } from '@/features/calibration/equipment-for-calibration/calibrationPointsFormula'
import type { FilterComboboxOption } from '@/features/sample-handling/receiving/FilterCombobox'
import { fetchCalibrationDivisionEmployees } from '@/features/calibration/calibrationEmployees'
import {
  LAB_NAME_CHANGED_EVENT,
  LAB_NAME_STORAGE_KEY,
} from '@/features/settings/lab-settings/brandMark'
import { LAB_SETTINGS_SINGLETON_ID } from '@/features/settings/lab-settings/labSettingsDb'
import { EquipmentsForIqcFooterBar } from './EquipmentsForIqcFooterBar'
import { EquipmentsForIqcHeaderBar } from './EquipmentsForIqcHeaderBar'
import { EquipmentsForIqcTable } from './EquipmentsForIqcTable'
import {
  IQC_SOURCE_LABELS,
  mapCalibrationIqcToListRow,
  mapTestingIqcToListRow,
  type EquipmentsForIqcListRow,
  type IqcListSource,
} from './types'

const BUCKET = 'equipment-files'

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  return (
    [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean).join(' | ') ||
    'Unknown error'
  )
}

function rowToIqcForm(row: IqcRow, nameOverride?: string): IqcForm {
  const range = splitValueAndUnit(row.range_capacity)
  const resolution = splitValueAndUnit(row.resolution_least_count)
  const accuracy = splitValueAndUnit(row.accuracy_acceptance_criteria)
  const pointsTable = parseCalibrationPointsTable(row.calibration_points)
  return {
    assetCode: nameOverride !== undefined ? '' : (row.asset_code ?? ''),
    equipmentName: nameOverride ?? (row.equipment_name ?? ''),
    manufacturer: row.manufacturer ?? '',
    modelNumber: row.model_number ?? '',
    serialNumber: row.serial_number ?? '',
    dateOfPurchase: row.date_of_purchase ?? '',
    purchasedFrom: row.purchased_from ?? '',
    datePlacedInService: row.date_placed_in_service ?? '',
    currentLocation: row.current_location ?? '',
    equipmentStatus: (row.equipment_status ?? 'Active') as IqcForm['equipmentStatus'],
    rangeCapacity: range.value,
    rangeCapacityUnit: range.unit,
    resolutionLeastCount: resolution.value,
    resolutionLeastCountUnit: resolution.unit,
    accuracyAcceptanceCriteria: accuracy.value,
    accuracyAcceptanceCriteriaUnit: accuracy.unit,
    calibrationFrequency: (row.calibration_frequency ?? '') as Frequency,
    lastCalibrationDate: row.last_calibration_date ?? '',
    nextCalibrationDue: row.next_calibration_due ?? '',
    calibrationCertificateNumber: row.calibration_certificate_number ?? '',
    calibrationTemperature: row.calibration_temperature ?? '',
    calibrationHumidity: row.calibration_humidity ?? '',
    externalCalibrationAgency: row.external_calibration_agency ?? '',
    intermediateCheckFrequency: (row.intermediate_check_frequency ?? '') as Frequency,
    lastIntermediateCheckDate: row.last_intermediate_check_date ?? '',
    nextIntermediateCheckDate: row.next_intermediate_check_date ?? '',
    intermediateCheckResult: row.intermediate_check_result ?? '',
    maintenanceScheduleFrequency: (row.maintenance_schedule_frequency ?? '') as Frequency,
    lastMaintenanceDate: row.last_maintenance_date ?? '',
    nextMaintenanceDate: row.next_maintenance_date ?? '',
    maintenanceDoneBy: row.maintenance_done_by ?? '',
    maintenanceChecklist: parseMaintenanceChecklistFromDb(row.maintenance_checklist),
    maintenanceHistory: parseMaintenanceHistoryFromDb(row.maintenance_history),
    historyOfDamage: row.history_of_damage ?? '',
    uploadCertificatePath: row.upload_certificate_path ?? '',
    uploadManualSopPath: row.upload_manual_sop_path ?? '',
    custodianEmployeeId: row.custodian_employee_id ?? '',
    certificateFile: null,
    manualSopFile: null,
    calibrationPointsColumns: pointsTable.columns,
    calibrationPoints: pointsTable.rows,
  }
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

export default function EquipmentsForIqcMasterPage() {
  const { session, loading: authLoading } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [testingRows, setTestingRows] = useState<IqcRow[]>([])
  const [calibrationRows, setCalibrationRows] = useState<EquipmentForCalibrationRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | IqcListSource>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [formSource, setFormSource] = useState<IqcListSource>('testing')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formReadOnly, setFormReadOnly] = useState(false)
  const [activeFormSection, setActiveFormSection] = useState<
    'calibration' | 'intermediate' | 'maintenance' | null
  >(null)
  const [hideScheduleSections, setHideScheduleSections] = useState(false)
  const [initialCalSection, setInitialCalSection] = useState<EquipmentScheduleSection | null>(null)
  const [sectionOpenKey, setSectionOpenKey] = useState(0)

  const [testingForm, setTestingForm] = useState<IqcForm>(() => emptyIqcForm())
  const [calForm, setCalForm] = useState<CalFormState>(() => emptyEquipmentForCalibrationForm())
  const calFormRef = useRef(calForm)

  const [clients, setClients] = useState<Array<{ id: string; company_name: string }>>([])
  const [employees, setEmployees] = useState<
    Array<{
      id: string
      full_name: string
      department_name: string | null
      designation: string | null
    }>
  >([])
  const [locations, setLocations] = useState<string[]>([
    'Mechanical',
    'Chemical',
    'NDT',
    'Calibration',
    'Electrical',
  ])
  const [clientOptions, setClientOptions] = useState<FilterComboboxOption[]>([])
  const [employeeOptions, setEmployeeOptions] = useState<FilterComboboxOption[]>([])
  const [showAddClientModal, setShowAddClientModal] = useState(false)
  const [targetClientField, setTargetClientField] = useState<
    'purchasedFrom' | 'externalCalibrationAgency' | null
  >(null)
  const [labName, setLabName] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(LAB_NAME_STORAGE_KEY)?.trim() ?? ''
  })

  const handleFormOpenChange = useFormDialogOpenChange((open) => {
    setShowForm(open)
    if (!open) {
      setActiveFormSection(null)
      setHideScheduleSections(false)
      setFormReadOnly(false)
      setInitialCalSection(null)
    }
  })

  const loadDropdowns = useCallback(async () => {
    try {
      const [clientsRes, employeesRes] = await Promise.all([
        supabase.from('clients').select('id, company_name').order('company_name'),
        supabase
          .from('user_profiles')
          .select('id, full_name, department_name, designation')
          .order('full_name'),
      ])
      if (clientsRes.error) throw clientsRes.error
      if (employeesRes.error) throw employeesRes.error
      setClients(clientsRes.data ?? [])
      setEmployees(employeesRes.data ?? [])
      setClientOptions(
        (clientsRes.data ?? [])
          .map((r) => ({ id: r.id, label: (r.company_name ?? '').trim() }))
          .filter((o) => o.label.length > 0),
      )
      const fromEmployees = (employeesRes.data ?? [])
        .map((e) => String(e.department_name ?? '').trim())
        .filter(Boolean)
      if (fromEmployees.length > 0) {
        setLocations((prev) =>
          Array.from(new Set([...fromEmployees, ...prev])).sort((a, b) => a.localeCompare(b)),
        )
      }
    } catch {
      // keep previous
    }
  }, [])

  const loadCalEmployees = useCallback(async () => {
    try {
      setEmployeeOptions(await fetchCalibrationDivisionEmployees())
    } catch {
      setEmployeeOptions([])
    }
  }, [])

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
      // keep cached
    }
  }, [])

  const loadAll = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession()
      if (!activeSession?.access_token) {
        setTestingRows([])
        setCalibrationRows([])
        setListError('Please sign in to view Equipments for IQC.')
        return
      }

      const [testingRes, calRes] = await Promise.all([
        supabase.from('iqc_masters').select('*').order('equipment_name', { ascending: true }),
        supabase
          .from('equipment_for_calibration')
          .select('*')
          .eq('is_iqc_master', true)
          .order('asset_code', { ascending: true }),
      ])
      if (testingRes.error) throw testingRes.error
      if (calRes.error) throw calRes.error
      setTestingRows((testingRes.data as IqcRow[]) ?? [])
      setCalibrationRows((calRes.data as EquipmentForCalibrationRow[]) ?? [])
      setSelectedKeys(new Set())
    } catch (err) {
      setListError(formatSupabaseError(err))
      setTestingRows([])
      setCalibrationRows([])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    void loadDropdowns()
    void loadCalEmployees()
    void loadLabName()
    void loadAll()
  }, [authLoading, session?.access_token, loadDropdowns, loadCalEmployees, loadLabName, loadAll])

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

  const listRows = useMemo(() => {
    const testing = testingRows.map(mapTestingIqcToListRow)
    const calibration = calibrationRows.map(mapCalibrationIqcToListRow)
    return [...testing, ...calibration].sort((a, b) =>
      a.equipmentName.localeCompare(b.equipmentName),
    )
  }, [testingRows, calibrationRows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return listRows.filter((r) => {
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false
      if (!q) return true
      return [r.assetCode, r.equipmentName, r.location, r.status, r.leastCount, r.range, IQC_SOURCE_LABELS[r.source]]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [listRows, search, sourceFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize) || 1)
  const safePage = Math.min(page, pageCount)
  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, safePage, pageSize])

  useEffect(() => {
    setPage(1)
  }, [search, sourceFilter, pageSize])

  const assistantContext = useMemo(() => {
    return [
      'Module: Equipment Management / Equipments for IQC',
      `Testing IQC: ${testingRows.length}`,
      `Calibration IQC: ${calibrationRows.length}`,
      `Total: ${listRows.length}`,
    ].join('\n')
  }, [testingRows.length, calibrationRows.length, listRows.length])

  const makeNextTestingCode = async (): Promise<string> => {
    let prefix = 'QI/IQC-'
    try {
      const { data } = await supabase
        .from('lab_prefixes')
        .select('prefix')
        .eq('name', 'IQC Master ID')
        .maybeSingle()
      if (data?.prefix) prefix = String(data.prefix).trim()
    } catch {
      // default
    }
    let maxSerial = 0
    testingRows.forEach((r) => {
      const code = r.asset_code || ''
      if (code.startsWith(prefix)) {
        const trailing = code.slice(prefix.length).replace(/\D/g, '')
        const num = parseInt(trailing, 10)
        if (!Number.isNaN(num) && num > maxSerial) maxSerial = num
      }
    })
    return `${prefix}${String(maxSerial + 1).padStart(4, '0')}`
  }

  const makeNextCalCode = () =>
    nextAssetCode(
      labName,
      calibrationRows.map((r) => r.asset_code),
      'iqc',
    )

  const updateCalForm = (next: CalFormState) => {
    calFormRef.current = next
    setCalForm(next)
  }

  const openNew = async () => {
    setSaveMessage(null)
    setEditingId(null)
    setFormReadOnly(false)
    setActiveFormSection(null)
    setHideScheduleSections(false)
    setInitialCalSection(null)
    setFormSource('testing')
    const code = await makeNextTestingCode()
    setTestingForm({ ...emptyIqcForm(), assetCode: code })
    updateCalForm({ ...emptyEquipmentForCalibrationForm(), assetCode: makeNextCalCode() })
    setShowForm(true)
  }

  const openEdit = (
    row: EquipmentsForIqcListRow,
    section?: 'calibration' | 'intermediate' | 'maintenance' | 'details',
  ) => {
    setSaveMessage(null)
    setFormSource(row.source)
    setEditingId(row.id)
    const isDetails = section === 'details'
    setFormReadOnly(isDetails)
    setHideScheduleSections(isDetails)
    if (row.source === 'testing') {
      const raw = testingRows.find((r) => r.id === row.id)
      if (!raw) return
      setActiveFormSection(section && section !== 'details' ? section : null)
      setInitialCalSection(null)
      setTestingForm(rowToIqcForm(raw))
    } else {
      const raw = calibrationRows.find((r) => r.id === row.id)
      if (!raw) return
      setActiveFormSection(null)
      const calSection =
        section && section !== 'details' ? (section as EquipmentScheduleSection) : null
      setInitialCalSection(calSection)
      if (calSection) setSectionOpenKey((k) => k + 1)
      updateCalForm(rowToForm(raw))
    }
    setShowForm(true)
  }

  useEffect(() => {
    const viewId = searchParams.get('view')?.trim()
    if (!viewId || listLoading || listRows.length === 0) return
    const kind = searchParams.get('kind')?.trim()
    const row = listRows.find((r) => {
      if (r.id !== viewId) return false
      if (kind === 'testing') return r.source === 'testing'
      if (kind === 'calibration') return r.source === 'calibration'
      return true
    })
    if (!row) return
    openEdit(row, 'details')
    const next = new URLSearchParams(searchParams)
    next.delete('view')
    next.delete('kind')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once when list ready
  }, [searchParams, listLoading, listRows])

  const openCopy = (row: EquipmentsForIqcListRow) => {
    setSaveMessage(null)
    setFormSource(row.source)
    setEditingId(null)
    setFormReadOnly(false)
    setHideScheduleSections(false)
    setActiveFormSection(null)
    setInitialCalSection(null)
    if (row.source === 'testing') {
      const raw = testingRows.find((r) => r.id === row.id)
      if (!raw) return
      void (async () => {
        const code = await makeNextTestingCode()
        setTestingForm({ ...rowToIqcForm(raw, `${raw.equipment_name} - Copy`), assetCode: code })
        setShowForm(true)
      })()
    } else {
      const raw = calibrationRows.find((r) => r.id === row.id)
      if (!raw) return
      updateCalForm(rowToForm(raw, true, makeNextCalCode()))
      setShowForm(true)
    }
  }

  const handleFormSourceChange = async (next: IqcListSource) => {
    if (editingId) return
    setFormSource(next)
    setSaveMessage(null)
    if (next === 'testing') {
      const code = await makeNextTestingCode()
      setTestingForm({ ...emptyIqcForm(), assetCode: code })
    } else {
      updateCalForm({ ...emptyEquipmentForCalibrationForm(), assetCode: makeNextCalCode() })
    }
  }

  const uploadAttachment = async (
    equipmentId: string,
    type: 'certificate' | 'manual',
    file: File,
  ): Promise<string> => {
    try {
      await supabase.storage.createBucket(BUCKET, { public: false })
    } catch {
      // ignore
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `iqc-masters/${equipmentId}/${type}_${crypto.randomUUID()}_${safeName}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
    if (error) throw error
    return path
  }

  const handleViewFile = async (storagePath: string) => {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10)
      if (error) throw error
      if (data?.signedUrl) window.open(data.signedUrl, '_blank')
      else alert('Could not generate download link.')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unable to load file')
    }
  }

  const canSaveTesting =
    !saveLoading &&
    testingForm.equipmentName.trim().length > 0 &&
    testingForm.assetCode.trim().length > 0

  const canSaveCal =
    !saveLoading &&
    normalizeText(calForm.assetCode).length > 0 &&
    normalizeText(calForm.equipmentName).length > 0

  const handleSaveTesting = () => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const code = testingForm.assetCode.trim().toUpperCase()
        if (!code) {
          setSaveMessage('IQC Standard ID / Asset Code is required.')
          return
        }
        const duplicate = testingRows.some(
          (r) =>
            r.asset_code.trim().toUpperCase() === code && (!editingId || r.id !== editingId),
        )
        if (duplicate) {
          setSaveMessage(`Asset Code "${code}" already exists. Please use a unique code.`)
          return
        }
        const eqId = editingId || crypto.randomUUID()
        let certPath = testingForm.uploadCertificatePath
        let manualPath = testingForm.uploadManualSopPath
        if (testingForm.certificateFile) {
          certPath = await uploadAttachment(eqId, 'certificate', testingForm.certificateFile)
        }
        if (testingForm.manualSopFile) {
          manualPath = await uploadAttachment(eqId, 'manual', testingForm.manualSopFile)
        }
        const payload = {
          id: eqId,
          asset_code: code,
          equipment_name: testingForm.equipmentName.trim(),
          manufacturer: testingForm.manufacturer.trim() || null,
          model_number: testingForm.modelNumber.trim() || null,
          serial_number: testingForm.serialNumber.trim() || null,
          date_of_purchase: sanitizeDateStr(testingForm.dateOfPurchase) || null,
          purchased_from: testingForm.purchasedFrom || null,
          date_placed_in_service: sanitizeDateStr(testingForm.datePlacedInService) || null,
          current_location: testingForm.currentLocation || null,
          equipment_status: testingForm.equipmentStatus as EquipmentStatus,
          range_capacity:
            joinValueAndUnit(testingForm.rangeCapacity, testingForm.rangeCapacityUnit) || null,
          resolution_least_count:
            joinValueAndUnit(
              testingForm.resolutionLeastCount,
              testingForm.resolutionLeastCountUnit,
            ) || null,
          accuracy_acceptance_criteria:
            joinValueAndUnit(
              testingForm.accuracyAcceptanceCriteria,
              testingForm.accuracyAcceptanceCriteriaUnit,
            ) || null,
          calibration_frequency: testingForm.calibrationFrequency || null,
          last_calibration_date: sanitizeDateStr(testingForm.lastCalibrationDate) || null,
          next_calibration_due: sanitizeDateStr(testingForm.nextCalibrationDue) || null,
          calibration_certificate_number:
            testingForm.calibrationCertificateNumber.trim() || null,
          calibration_temperature: testingForm.calibrationTemperature.trim() || null,
          calibration_humidity: testingForm.calibrationHumidity.trim() || null,
          external_calibration_agency: testingForm.externalCalibrationAgency || null,
          intermediate_check_frequency: testingForm.intermediateCheckFrequency || null,
          last_intermediate_check_date:
            sanitizeDateStr(testingForm.lastIntermediateCheckDate) || null,
          next_intermediate_check_date:
            sanitizeDateStr(testingForm.nextIntermediateCheckDate) || null,
          intermediate_check_result: testingForm.intermediateCheckResult.trim() || null,
          maintenance_schedule_frequency: testingForm.maintenanceScheduleFrequency || null,
          last_maintenance_date: sanitizeDateStr(testingForm.lastMaintenanceDate) || null,
          next_maintenance_date: sanitizeDateStr(testingForm.nextMaintenanceDate) || null,
          maintenance_done_by: testingForm.maintenanceDoneBy || null,
          maintenance_checklist:
            testingForm.maintenanceChecklist.length > 0 ? testingForm.maintenanceChecklist : null,
          maintenance_history:
            testingForm.maintenanceHistory.length > 0 ? testingForm.maintenanceHistory : null,
          history_of_damage: testingForm.historyOfDamage.trim() || null,
          upload_certificate_path: certPath || null,
          upload_manual_sop_path: manualPath || null,
          custodian_employee_id: testingForm.custodianEmployeeId || null,
          calibration_points: (() => {
            const formulaMaster = {
              asset_code: testingForm.assetCode,
              equipment_name: testingForm.equipmentName,
              manufacturer: testingForm.manufacturer,
              model_number: testingForm.modelNumber,
              serial_number: testingForm.serialNumber,
              current_location: testingForm.currentLocation,
              range_capacity: joinValueAndUnit(
                testingForm.rangeCapacity,
                testingForm.rangeCapacityUnit,
              ),
              resolution_least_count: joinValueAndUnit(
                testingForm.resolutionLeastCount,
                testingForm.resolutionLeastCountUnit,
              ),
              accuracy_acceptance_criteria: joinValueAndUnit(
                testingForm.accuracyAcceptanceCriteria,
                testingForm.accuracyAcceptanceCriteriaUnit,
              ),
              calibration_temperature: testingForm.calibrationTemperature,
              calibration_humidity: testingForm.calibrationHumidity,
              calibration_certificate_number: testingForm.calibrationCertificateNumber,
            }
            const bakedRows = testingForm.calibrationPoints.map((row) => ({
              ...row,
              values: {
                ...row.values,
                ...computeCalibrationPointRowValuesFromMaster(
                  testingForm.calibrationPointsColumns,
                  row.values,
                  formulaMaster,
                ),
              },
            }))
            return serializeCalibrationPointsTable(
              testingForm.calibrationPointsColumns,
              bakedRows,
            )
          })(),
        }
        const { error } = await supabase.from('iqc_masters').upsert(payload)
        if (error) throw error
        setSaveMessage('Saved successfully.')
        setShowForm(false)
        setEditingId(null)
        await loadAll()
      } catch (err) {
        const msg = formatSupabaseError(err)
        setSaveMessage(
          /duplicate|unique|asset_code/i.test(msg)
            ? 'Asset Code must be unique. This code is already in use.'
            : msg,
        )
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleSaveCal = async (latest?: CalFormState) => {
    if (formReadOnly) return
    const snapshot = { ...(latest ?? calFormRef.current) }
    calFormRef.current = snapshot
    if (
      saveLoading ||
      !normalizeText(snapshot.assetCode) ||
      !normalizeText(snapshot.equipmentName)
    ) {
      return
    }
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const payload = {
        ...formToPayload(withComputedCalibrationPointFormulas(snapshot)),
        is_iqc_master: true,
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
      await loadAll()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    } finally {
      setSaveLoading(false)
    }
  }

  const toggleRow = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAllOnPage = (checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      for (const r of paged) {
        if (checked) next.add(r.key)
        else next.delete(r.key)
      }
      return next
    })
  }

  const exportRows = useMemo(() => {
    if (selectedKeys.size === 0) return filtered
    return filtered.filter((r) => selectedKeys.has(r.key))
  }, [filtered, selectedKeys])

  const handleExport = () => {
    const headers = [
      'Source',
      'Asset Code',
      'Equipment Name',
      'Least Count',
      'Range',
      'Location',
      'Status',
      'Next Calibration',
      'Next Intermediate Check',
      'Next Maintenance',
    ]
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      headers.map(esc).join(','),
      ...exportRows.map((r) =>
        [
          IQC_SOURCE_LABELS[r.source],
          r.assetCode,
          r.equipmentName,
          r.leastCount,
          r.range,
          r.location,
          r.status,
          r.nextCalibrationDue ?? '',
          r.nextIntermediateCheckDate ?? '',
          r.nextMaintenanceDate ?? '',
        ]
          .map(esc)
          .join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'equipments_for_iqc.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    const rowsHtml = exportRows
      .map(
        (r) => `<tr>
<td>${IQC_SOURCE_LABELS[r.source]}</td>
<td>${r.equipmentName}<br/>${r.assetCode}</td>
<td>${r.leastCount || '—'}</td>
<td>${r.range || '—'}</td>
<td>${r.nextCalibrationDue ? formatDate(r.nextCalibrationDue) : '—'}</td>
<td>${r.nextMaintenanceDate ? formatDate(r.nextMaintenanceDate) : '—'}</td>
</tr>`,
      )
      .join('')
    printViaIframe(`<!doctype html><html><head><title>Equipments for IQC</title>
<style>
@page{size:A4 landscape;margin:10mm}
body{font-family:Segoe UI,sans-serif;font-size:9pt}
h1{font-size:14pt;margin:0 0 8px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #444;padding:4px;vertical-align:top}
th{background:#1c1917;color:#fde68a}
</style></head><body>
<h1>Equipments for IQC</h1>
<p>${exportRows.length} row(s)</p>
<table><thead><tr>
<th>Source</th><th>Equipment</th><th>Least Count</th><th>Range</th><th>Next Cal</th><th>Next Maint</th>
</tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`)
  }

  const handleDeleteSelected = () => {
    void (async () => {
      const selected = filtered.filter((r) => selectedKeys.has(r.key))
      if (selected.length === 0) return
      if (!window.confirm(`Delete ${selected.length} selected IQC equipment?`)) return
      setSaveLoading(true)
      setSaveMessage(null)
      try {
        const testingIds = selected.filter((r) => r.source === 'testing').map((r) => r.id)
        const calIds = selected.filter((r) => r.source === 'calibration').map((r) => r.id)

        if (testingIds.length > 0) {
          const testingSelected = testingRows.filter((r) => testingIds.includes(r.id))
          const filePaths: string[] = []
          testingSelected.forEach((r) => {
            if (r.upload_certificate_path) filePaths.push(r.upload_certificate_path)
            if (r.upload_manual_sop_path) filePaths.push(r.upload_manual_sop_path)
          })
          if (filePaths.length > 0) {
            try {
              await supabase.storage.from(BUCKET).remove(filePaths)
            } catch {
              // ignore storage cleanup failures
            }
          }
          const { error } = await supabase.from('iqc_masters').delete().in('id', testingIds)
          if (error) throw error
        }
        if (calIds.length > 0) {
          const { error } = await supabase
            .from('equipment_for_calibration')
            .delete()
            .in('id', calIds)
          if (error) throw error
        }
        setSelectedKeys(new Set())
        setSaveMessage(`Deleted ${selected.length} record(s).`)
        await loadAll()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const masterEquipmentOptions = useMemo(() => {
    const notSelf = (r: EquipmentForCalibrationRow) => r.id !== editingId
    return calibrationRows.filter(notSelf)
  }, [calibrationRows, editingId])

  const dialogTitle = formReadOnly
    ? 'IQC Equipment Details'
    : editingId
      ? 'Edit IQC Equipment'
      : 'Add New IQC Equipment'

  return (
    <div className={cn(limsPageShellClass, 'space-y-4 sm:space-y-5')}>
      <EquipmentsForIqcHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
        onNew={() => void openNew()}
        assistantContext={assistantContext}
        onAssistantDataChanged={() => void loadAll()}
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
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {dialogTitle}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
            {!editingId && !formReadOnly ? (
              <div className="mb-4 max-w-xs space-y-1.5">
                <Label htmlFor="iqc-type" className="text-xs font-semibold text-stone-700">
                  IQC Type
                </Label>
                <Select
                  value={formSource}
                  onValueChange={(v) => void handleFormSourceChange(v as IqcListSource)}
                >
                  <SelectTrigger id="iqc-type" aria-label="IQC Type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="testing">Testing</SelectItem>
                    <SelectItem value="calibration">Calibration</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {saveMessage && showForm ? (
              <p className="mb-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {saveMessage}
              </p>
            ) : null}

            {formSource === 'testing' ? (
              <IqcMasterForm
                key={`testing-${editingId ?? 'new'}-${activeFormSection ?? 'full'}-${formReadOnly ? 'view' : 'edit'}`}
                form={testingForm}
                onChange={setTestingForm}
                canSave={canSaveTesting}
                saveLoading={saveLoading}
                onSave={handleSaveTesting}
                clients={clients}
                employees={employees}
                locations={locations}
                onViewFile={(path) => void handleViewFile(path)}
                activeSection={activeFormSection}
                hideScheduleSections={hideScheduleSections}
                readOnly={formReadOnly}
                onClose={() => handleFormOpenChange(false)}
                onAddNewClientClick={(field) => {
                  setTargetClientField(field)
                  setShowAddClientModal(true)
                }}
                iqcMasters={testingRows.map((r) => rowToIqcForm(r))}
              />
            ) : (
              <EquipmentForCalibrationForm
                key={`cal-${editingId ?? 'new'}-${initialCalSection ?? 'full'}-${sectionOpenKey}-${formReadOnly ? 'view' : 'edit'}`}
                form={calForm}
                onChange={updateCalForm}
                clientOptions={clientOptions}
                employeeOptions={employeeOptions}
                masterEquipmentOptions={masterEquipmentOptions}
                canSave={canSaveCal}
                saveLoading={saveLoading}
                onSave={(latest) => void handleSaveCal(latest)}
                onClose={() => handleFormOpenChange(false)}
                assetCodeLocked={formReadOnly}
                initialSection={initialCalSection}
                moduleVariant="iqc"
                readOnly={formReadOnly}
                onClientsReload={() => void loadDropdowns()}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AddClientDialog
        open={showAddClientModal}
        onOpenChange={setShowAddClientModal}
        onClientSaved={async (newClientId) => {
          await loadDropdowns()
          if (targetClientField) {
            setTestingForm((prev) => ({
              ...prev,
              [targetClientField]: newClientId,
            }))
          }
          setTargetClientField(null)
        }}
      />

      <EquipmentsForIqcTable
        rows={paged}
        loading={listLoading}
        error={listError}
        searchActive={search.trim().length > 0 || sourceFilter !== 'all'}
        selectedKeys={selectedKeys}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onEdit={openEdit}
        onCopy={openCopy}
      />

      <EquipmentsForIqcFooterBar
        message={showForm ? null : saveMessage}
        loading={listLoading || saveLoading}
        selectedCount={selectedKeys.size}
        page={safePage}
        pageCount={pageCount}
        onExport={handleExport}
        onPrintSelected={handlePrint}
        onDeleteSelected={() => void handleDeleteSelected()}
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
