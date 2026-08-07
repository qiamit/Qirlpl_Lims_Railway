import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { useAuth } from '@/hooks/useAuth'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CalibrationEquipmentsHeaderBar } from './CalibrationEquipmentsHeaderBar'
import { CalibrationEquipmentsTable } from './CalibrationEquipmentsTable'
import { CalibrationEquipmentsFooterBar } from './CalibrationEquipmentsFooterBar'
import { CalibrationEquipmentsForm } from './CalibrationEquipmentsForm'
import type { FilterComboboxOption } from '@/features/sample-handling/receiving/FilterCombobox'
import {
  emptyCalibrationEquipmentForm,
  equipmentTemplatesFromRanges,
  legacyRangeColumnsFromRanges,
  nextCalibrationAssetCode,
  normalizeText,
  parseMeasurementRanges,
  primaryMasterEquipmentIdFromRanges,
  rangesFromRow,
  rawDataSheetTemplateFromRow,
  muCalculationTemplateFromRow,
  generateReportConfigFromRow,
  certificateTemplateFromRow,
  resolveEquipmentModeOfCalibration,
  resolveEquipmentMethodUsed,
  serializeEquipmentRawDataSheetTemplate,
  serializeEquipmentMuCalculationTemplate,
  serializeEquipmentGenerateReportConfig,
  serializeEquipmentCertificateTemplate,
  serializeMeasurementRanges,
  type CalibrationEquipmentForm,
  type CalibrationEquipmentRow,
  type EquipmentStatus,
} from './types'
import {
  LAB_NAME_CHANGED_EVENT,
  LAB_NAME_STORAGE_KEY,
} from '@/features/settings/lab-settings/brandMark'
import { LAB_SETTINGS_SINGLETON_ID } from '@/features/settings/lab-settings/labSettingsDb'

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function toCsv(headers: string[], rows: Array<Record<string, string>>) {
  const esc = (v: string) => {
    const s = String(v ?? '')
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.map(esc).join(',')]
  for (const r of rows) {
    lines.push(headers.map((h) => esc(r[h] ?? '')).join(','))
  }
  return lines.join('\n')
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const flushCell = () => {
    row.push(cell)
    cell = ''
  }
  const flushRow = () => {
    flushCell()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      flushCell()
      continue
    }
    if (ch === '\n') {
      flushRow()
      continue
    }
    if (ch === '\r') continue
    cell += ch
  }
  if (cell.length > 0 || row.length > 0) flushRow()
  return rows.map((r) => r.map((c) => c.trim()))
}

function buildEquipmentsPrintHtml(rows: CalibrationEquipmentRow[]) {
  const esc = (v: string) =>
    v
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

  const cards = rows
    .map(
      (r) => `
        <section class="card">
          <div class="card-header">
            <div>
              <div class="title">${esc(r.equipment_name || '—')}</div>
              <div class="subtitle">Asset: ${esc(r.asset_code || '—')}</div>
            </div>
            <div class="badge">${esc(r.equipment_status || '—')}</div>
          </div>
          <div class="grid">
            <div class="field"><div class="k">Serial Number</div><div class="v">${esc(r.serial_number || '—')}</div></div>
            <div class="field"><div class="k">Calibration Method</div><div class="v">${esc(r.calibration_method_label || '—')}</div></div>
            <div class="field"><div class="k">Measurement Ranges</div><div class="v">${esc(
              (r.measurement_ranges && r.measurement_ranges.length > 0
                ? r.measurement_ranges
                    .map(
                      (x) =>
                        `${x.range_capacity || '—'} → LC ${x.resolution_least_count || '—'}${
                          x.unit ? ` ${x.unit}` : ''
                        }`,
                    )
                    .join('; ')
                : `${r.range_capacity || '—'} → LC ${r.resolution_least_count || '—'}`),
            )}</div></div>
          </div>
        </section>
      `,
    )
    .join('')

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Calibration Equipments Print Preview</title>
      <style>
        :root{--fg:#0b1220;--muted:#5b6473;--border:#e7eaf0}
        *{box-sizing:border-box}
        body{margin:24px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:var(--fg);background:linear-gradient(180deg,#ffffff 0%, #fbfcff 100%)}
        .wrap{display:flex;flex-direction:column;gap:16px}
        .card{border:1px solid var(--border);border-radius:14px;overflow:hidden;break-inside:avoid;page-break-inside:avoid;box-shadow:0 1px 0 rgba(15,23,42,.04)}
        .card-header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:14px 16px;background:linear-gradient(90deg,#0f172a 0%, #111827 60%, #0b1220 100%);color:#fff}
        .title{font-size:18px;font-weight:700;line-height:1.2}
        .subtitle{font-size:12px;opacity:.85;margin-top:2px}
        .badge{font-size:12px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);padding:6px 10px;border-radius:999px;white-space:nowrap}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:14px 16px}
        .field{border:1px solid var(--border);border-radius:12px;padding:10px 12px;background:#fff}
        .field .k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
        .field .v{font-size:13px;margin-top:4px}
        @media print{body{margin:0;background:#fff} .card{border-radius:0;box-shadow:none}}
      </style>
    </head>
    <body>
      <div class="wrap">${cards}</div>
      <script>
        window.addEventListener('load', function () {
          setTimeout(function () {
            try { window.focus(); window.print(); } catch (e) {}
          }, 250);
        });
      </script>
    </body>
  </html>`
}

function buildAssistantContext(rows: CalibrationEquipmentRow[], search: string): string {
  const lines = [
    'Module: Calibration LIMS / Calibration Equipments',
    `Total equipments loaded: ${rows.length}`,
    search.trim() ? `Active search filter: "${search.trim()}"` : 'No search filter applied',
    '',
    'Equipments (up to 30):',
  ]
  const slice = rows.slice(0, 30)
  if (slice.length === 0) {
    lines.push('(none)')
  } else {
    for (const r of slice) {
      lines.push(
        `- id=${r.id} | ${r.asset_code} | ${r.equipment_name} | ${r.equipment_status ?? '-'}`,
      )
    }
    if (rows.length > 30) lines.push(`… and ${rows.length - 30} more.`)
  }
  return lines.join('\n')
}

const CSV_HEADERS = [
  'asset_code',
  'equipment_name',
  'serial_number',
  'equipment_status',
  'range_capacity',
  'resolution_least_count',
] as const

export default function CalibrationEquipmentsMasterPage() {
  const { session, loading: authLoading } = useAuth()
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<CalibrationEquipmentRow[]>([])
  const [isCodeOptions, setIsCodeOptions] = useState<FilterComboboxOption[]>([])
  const [masterEquipmentOptions, setMasterEquipmentOptions] = useState<FilterComboboxOption[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [labName, setLabName] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(LAB_NAME_STORAGE_KEY)?.trim() ?? ''
  })
  const [form, setForm] = useState<CalibrationEquipmentForm>(() => emptyCalibrationEquipmentForm())

  const canSave =
    !saveLoading &&
    normalizeText(form.assetCode).length > 0 &&
    normalizeText(form.equipmentName).length > 0

  const loadLabName = useCallback(async () => {
    try {
      const cached =
        typeof window !== 'undefined'
          ? (window.localStorage.getItem(LAB_NAME_STORAGE_KEY)?.trim() ?? '')
          : ''
      if (cached) setLabName(cached)

      // lab_settings is RLS-protected (authenticated only) — skip when no session
      // to avoid noisy 401s (e.g. Cursor browser / expired JWT).
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

  const loadIsCodes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('is_codes')
        .select('id, is_number, revision_year')
        .order('is_number', { ascending: true })
      if (error) throw error
      const list = Array.isArray(data)
        ? (data as Array<{ id: string; is_number: string; revision_year: string | null }>)
        : []
      setIsCodeOptions(
        list.map((r) => ({
          id: r.id,
          label: r.revision_year
            ? `${r.is_number ?? ''} : ${r.revision_year}`
            : (r.is_number ?? r.id),
        })),
      )
    } catch {
      setIsCodeOptions([])
    }
  }, [])

  const loadMasterEquipmentOptions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('equipment_for_calibration')
        .select('id, asset_code, equipment_name')
        .order('equipment_name', { ascending: true })
      if (error) throw error
      const list = Array.isArray(data)
        ? (data as Array<{ id: string; asset_code: string | null; equipment_name: string | null }>)
        : []
      setMasterEquipmentOptions(
        list.map((r) => ({
          id: r.id,
          label: (r.equipment_name ?? '').trim() || '—',
        })),
      )
    } catch {
      setMasterEquipmentOptions([])
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
        setListError('Please sign in to view calibration equipments.')
        return
      }

      const { data, error } = await supabase
        .from('equipment_master')
        .select(
          'id, asset_code, equipment_name, serial_number, equipment_status, range_capacity, resolution_least_count, measurement_ranges, calibration_method_is_code_id, calibration_method_label, master_equipment_id, raw_data_sheet_template, mu_calculation_template, generate_report_config, certificate_template_config, created_at, updated_at',
        )
        .order('asset_code', { ascending: true })
      if (error) throw error
      setRows((data ?? []) as CalibrationEquipmentRow[])
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
    void loadIsCodes()
    void loadMasterEquipmentOptions()
    void loadRows()
  }, [
    authLoading,
    session?.access_token,
    loadLabName,
    loadIsCodes,
    loadMasterEquipmentOptions,
    loadRows,
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

  const makeNextAssetCode = useCallback(
    () => nextCalibrationAssetCode(labName, rows.map((r) => r.asset_code)),
    [labName, rows],
  )

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const rangeText = rangesFromRow(r)
        .flatMap((x) => [x.rangeCapacity, x.resolutionLeastCount, x.unit, x.accuracy])
        .join(' ')
      const hay = [
        r.asset_code,
        r.equipment_name,
        r.serial_number,
        r.equipment_status,
        r.range_capacity,
        r.resolution_least_count,
        r.calibration_method_label,
        rangeText,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
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

  const assistantContext = useMemo(
    () => buildAssistantContext(filteredRows, search),
    [filteredRows, search],
  )

  const rowToForm = (row: CalibrationEquipmentRow, asCopy = false): CalibrationEquipmentForm => ({
    assetCode: asCopy ? makeNextAssetCode() : (row.asset_code ?? ''),
    equipmentName: asCopy
      ? `${row.equipment_name || ''} - Copy`
      : (row.equipment_name ?? ''),
    manufacturer: '',
    modelNumber: '',
    serialNumber: row.serial_number ?? '',
    equipmentStatus: (row.equipment_status as EquipmentStatus) || 'Active',
    ranges: rangesFromRow(row),
    calibrationMethodIsCodeId: row.calibration_method_is_code_id ?? '',
    calibrationMethodLabel: row.calibration_method_label ?? '',
    rawDataSheetTemplate: rawDataSheetTemplateFromRow(row),
    muCalculationTemplate: muCalculationTemplateFromRow(row),
    generateReportConfig: generateReportConfigFromRow(row),
    certificateTemplate: certificateTemplateFromRow(row),
    modeOfCalibration: resolveEquipmentModeOfCalibration(rangesFromRow(row), ''),
    methodUsed: resolveEquipmentMethodUsed(rangesFromRow(row), ''),
  })

  const openNew = () => {
    setEditingId(null)
    setForm({
      ...emptyCalibrationEquipmentForm(),
      assetCode: makeNextAssetCode(),
    })
    setSaveMessage(null)
    setShowForm(true)
  }

  const openEdit = (row: CalibrationEquipmentRow) => {
    setEditingId(row.id)
    setForm(rowToForm(row))
    setSaveMessage(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openCopy = (row: CalibrationEquipmentRow) => {
    setEditingId(null)
    setForm(rowToForm(row, true))
    setSaveMessage(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const legacy = legacyRangeColumnsFromRanges(form.ranges)
      const syncedTemplates = equipmentTemplatesFromRanges(form.ranges, {
        rawDataSheetTemplate: form.rawDataSheetTemplate,
        muCalculationTemplate: form.muCalculationTemplate,
        generateReportConfig: form.generateReportConfig,
        certificateTemplate: form.certificateTemplate,
      })
      // Do not write manufacturer/model_number — Equipment Master still owns those columns
      // on the shared equipment_master table.
      const payload = {
        asset_code: normalizeText(form.assetCode),
        equipment_name: normalizeText(form.equipmentName),
        serial_number: normalizeText(form.serialNumber) || null,
        equipment_status: form.equipmentStatus,
        range_capacity: legacy.range_capacity,
        resolution_least_count: legacy.resolution_least_count,
        measurement_ranges: serializeMeasurementRanges(form.ranges),
        calibration_method_is_code_id: form.calibrationMethodIsCodeId.trim() || null,
        calibration_method_label: normalizeText(form.calibrationMethodLabel) || null,
        master_equipment_id: primaryMasterEquipmentIdFromRanges(form.ranges),
        raw_data_sheet_template: serializeEquipmentRawDataSheetTemplate(
          syncedTemplates.rawDataSheetTemplate,
        ),
        mu_calculation_template: serializeEquipmentMuCalculationTemplate(
          syncedTemplates.muCalculationTemplate,
        ),
        generate_report_config: serializeEquipmentGenerateReportConfig(
          syncedTemplates.generateReportConfig,
        ),
        certificate_template_config: serializeEquipmentCertificateTemplate(
          syncedTemplates.certificateTemplate,
        ),
      }

      if (editingId) {
        const { error } = await supabase
          .from('equipment_master')
          .update(payload)
          .eq('id', editingId)
        if (error) throw error
        setSaveMessage(`Saved ${payload.asset_code}.`)
      } else {
        const { error } = await supabase.from('equipment_master').insert(payload)
        if (error) throw error
        setSaveMessage(`Saved ${payload.asset_code}.`)
      }

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
    if (!checked) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        pagedRows.forEach((r) => next.delete(r.id))
        return next
      })
      return
    }
    setSelectedIds((prev) => {
      const next = new Set(prev)
      pagedRows.forEach((r) => next.add(r.id))
      return next
    })
  }

  const handleDeleteSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} selected equipment record(s)?`)) return
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const { error } = await supabase.from('equipment_master').delete().in('id', ids)
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
    const csvRows = source.map((r) => {
      const legacy = legacyRangeColumnsFromRanges(rangesFromRow(r))
      return {
        asset_code: r.asset_code ?? '',
        equipment_name: r.equipment_name ?? '',
        serial_number: r.serial_number ?? '',
        equipment_status: r.equipment_status ?? '',
        range_capacity: legacy.range_capacity ?? '',
        resolution_least_count: legacy.resolution_least_count ?? '',
      }
    })
    const blob = new Blob([toCsv([...CSV_HEADERS], csvRows)], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'calibration_equipments.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    importInputRef.current?.click()
  }

  const onImportFile = async (file: File) => {
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      if (parsed.length < 2) throw new Error('CSV has no data rows.')
      const header = parsed[0]!.map((h) => h.toLowerCase())
      const idx = (name: string) => header.indexOf(name)
      const payloads = parsed
        .slice(1)
        .map((cells) => {
          const get = (name: string) => {
            const i = idx(name)
            return i >= 0 ? (cells[i] ?? '').trim() : ''
          }
          const rangeCapacity = get('range_capacity')
          const resolutionLeastCount = get('resolution_least_count')
          const ranges = parseMeasurementRanges(null, rangeCapacity, resolutionLeastCount)
          const legacy = legacyRangeColumnsFromRanges(ranges)
          return {
            asset_code: get('asset_code'),
            equipment_name: get('equipment_name'),
            serial_number: get('serial_number') || null,
            equipment_status: get('equipment_status') || 'Active',
            range_capacity: legacy.range_capacity,
            resolution_least_count: legacy.resolution_least_count,
            measurement_ranges: serializeMeasurementRanges(ranges),
          }
        })
        .filter((p) => p.asset_code && p.equipment_name)

      if (payloads.length === 0) throw new Error('No valid equipment rows found in CSV.')

      const { error } = await supabase
        .from('equipment_master')
        .upsert(payloads, { onConflict: 'asset_code' })
      if (error) throw error
      setSaveMessage(`Imported ${payloads.length} equipment record(s).`)
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    } finally {
      setSaveLoading(false)
    }
  }

  const handlePrintSelected = () => {
    const source =
      selectedIds.size > 0 ? filteredRows.filter((r) => selectedIds.has(r.id)) : filteredRows
    if (source.length === 0) {
      setSaveMessage('Nothing to print.')
      return
    }
    const html = buildEquipmentsPrintHtml(source)
    const w = window.open('', '_blank')
    if (!w) {
      setSaveMessage('Popup blocked. Allow popups to print.')
      return
    }
    w.document.open()
    w.document.write(html)
    w.document.close()
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-3 sm:space-y-5 sm:p-4 md:p-6">
      <CalibrationEquipmentsHeaderBar
        search={search}
        onSearchChange={setSearch}
        onNew={openNew}
        assistantContext={assistantContext}
        onAssistantDataChanged={() => void loadRows()}
      />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:w-full sm:rounded-lg [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/10 [&>button]:hover:opacity-100"
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
            <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
            <DialogHeader className="relative pr-8 text-left">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                {editingId
                  ? 'Calibration Equipments · Edit Entry'
                  : 'Calibration Equipments · New Entry'}
              </p>
              <DialogTitle className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {editingId ? 'Edit Equipment' : 'Add New Equipment'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#fafbfc]">
            {saveMessage && showForm ? (
              <p className="shrink-0 border-l-2 border-destructive bg-destructive/5 px-4 py-2 text-sm text-destructive sm:px-6">
                {saveMessage}
              </p>
            ) : null}
            <CalibrationEquipmentsForm
              form={form}
              onChange={setForm}
              isCodeOptions={isCodeOptions}
              masterEquipmentOptions={masterEquipmentOptions}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={() => void handleSave()}
            />
          </div>
        </DialogContent>
      </Dialog>

      <CalibrationEquipmentsTable
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

      <CalibrationEquipmentsFooterBar
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
        onImport={handleImport}
        onExport={handleExport}
        onPrintSelected={handlePrintSelected}
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
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void onImportFile(file)
        }}
      />
    </div>
  )
}
