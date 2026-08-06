import { useCallback, useEffect, useMemo, useState } from 'react'
import { Package, Plus, Settings2, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import {
  emptyMasterPointsTab,
  newMasterPointsTabId,
  parseMeasurementRanges,
  primaryCalibrationPointsTable,
  calibrationPointsTableForViewFactor,
  rangePointsFromTable,
  type CalibrationPointsStored,
  type EquipmentRangeEntry,
  type MasterPointsTab,
  type MeasurementRangeStored,
} from '@/features/calibration/equipments/types'
import {
  emptyCalibrationPointRow,
  newCalibrationPointId,
  parseCalibrationPointsTable,
  type CalibrationPointRow,
} from '@/features/calibration/equipment-for-calibration/types'
import { FREQUENCIES } from '@/features/calibration/equipment-for-calibration/types'
import { PHYSICAL_CONDITIONS, type PhysicalCondition } from './types'

export type SelectableCalibrationEquipment = {
  id: string
  asset_code: string
  equipment_name: string
  manufacturer: string | null
  model_number: string | null
  serial_number: string | null
  range_capacity: string | null
  resolution_least_count: string | null
  measurement_ranges: MeasurementRangeStored[] | null
  calibration_method_label: string | null
  calibration_frequency: string | null
}

type RangeOption = {
  index: number
  leastCount: string
  range: string
  accuracy: string
  calibrationPoints: string
  calibrationPointsTable: CalibrationPointsStored
  masterPointsTabs: MasterPointsTab[]
  masterEquipmentIds: string[]
}

const DUC_CONDITIONS = [
  'Good',
  'Satisfactory',
  'Fair',
  'Damaged',
  'Needs Repair',
  'Other',
] as const

/** One editable line in the equipment picker table. */
type EntryRow = {
  rowId: string
  equipmentId: string
  quantity: string
  leastCount: string
  range: string
  make: string
  modelNumber: string
  serialNumber: string
  customerId: string
  accuracy: string
  calibrationPoints: string
  /** Primary / active-tab snapshot (kept for summary text + legacy callers). */
  calibrationPointsTable: CalibrationPointsStored
  /** Per-master points — source of truth in Details UI. */
  masterPointsTabs: MasterPointsTab[]
  /** Active master tab id in Details. */
  activeMasterTabId: string
  calibrationFrequency: string
  conditionOfDuc: string
  physicalCondition: PhysicalCondition
  /** From Equipment Master `calibration_method_label` (IS code / method). */
  calibrationMethod: string
  /** Method / procedure notes (per equipment line). */
  methodProcedureNotes: string
}

function newRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function emptyEntryRow(): EntryRow {
  const tab = emptyMasterPointsTab()
  return {
    rowId: newRowId(),
    equipmentId: '',
    quantity: '1',
    leastCount: '',
    range: '',
    make: '',
    modelNumber: '',
    serialNumber: '',
    customerId: '',
    accuracy: '',
    calibrationPoints: '',
    calibrationPointsTable: { columns: [], rows: [] },
    masterPointsTabs: [tab],
    activeMasterTabId: tab.id,
    calibrationFrequency: 'Yearly',
    conditionOfDuc: 'Good',
    physicalCondition: 'Ok',
    calibrationMethod: '',
    methodProcedureNotes: '',
  }
}

function withUnit(value: string, unit: string): string {
  const v = value.trim()
  const u = unit.trim()
  if (!v) return ''
  return u ? `${v} ${u}` : v
}

function clonePointsTable(table: CalibrationPointsStored): CalibrationPointsStored {
  return {
    columns: table.columns.map((c) => ({ ...c })),
    rows: table.rows.map((row) => ({
      id: row.id || newCalibrationPointId(),
      values: { ...row.values },
    })),
  }
}

function cloneMasterPointsTabs(tabs: MasterPointsTab[]): MasterPointsTab[] {
  if (!tabs.length) {
    const tab = emptyMasterPointsTab()
    return [tab]
  }
  return tabs.map((tab) => ({
    id: tab.id || newMasterPointsTabId(),
    masterEquipmentId: tab.masterEquipmentId.trim(),
    calibrationPointsTable: clonePointsTable(tab.calibrationPointsTable),
  }))
}

function tableHasValues(table: CalibrationPointsStored): boolean {
  return table.rows.some((row) =>
    Object.values(row.values).some((v) => String(v ?? '').trim().length > 0),
  )
}

function countFilledPointRows(table: CalibrationPointsStored): number {
  return table.rows.filter((row) =>
    Object.values(row.values).some((v) => String(v ?? '').trim().length > 0),
  ).length
}

function pointsTextFromTabs(tabs: MasterPointsTab[]): string {
  const values: string[] = []
  for (const tab of tabs) {
    const firstColumn = tab.calibrationPointsTable.columns[0]
    if (!firstColumn) continue
    for (const row of tab.calibrationPointsTable.rows) {
      const v = String(row.values[firstColumn.id] ?? '').trim()
      if (v) values.push(v)
    }
  }
  return values.join(', ')
}

function tabsFromRange(r: EquipmentRangeEntry): MasterPointsTab[] {
  const tabs = cloneMasterPointsTabs(r.masterPointsTabs ?? [])
  // Ensure at least one tab; if all empty but primary table has structure/values, seed first tab.
  const primary = clonePointsTable(r.calibrationPointsTable)
  const anyTabHasData = tabs.some(
    (t) => t.calibrationPointsTable.columns.length > 0 || tableHasValues(t.calibrationPointsTable),
  )
  if (!anyTabHasData && (primary.columns.length > 0 || tableHasValues(primary))) {
    tabs[0] = {
      ...(tabs[0] ?? emptyMasterPointsTab()),
      calibrationPointsTable: primary,
    }
  }
  return tabs
}

function getRangeOptions(eq: SelectableCalibrationEquipment): RangeOption[] {
  const ranges = parseMeasurementRanges(
    eq.measurement_ranges,
    eq.range_capacity,
    eq.resolution_least_count,
  )
  const options: RangeOption[] = []
  ranges.forEach((r, index) => {
    const leastCount = withUnit(r.resolutionLeastCount, r.unit)
    const range = withUnit(r.rangeCapacity, r.unit)
    const masterPointsTabs = tabsFromRange(r)
    const calibrationPointsTable = primaryCalibrationPointsTable(
      masterPointsTabs,
      clonePointsTable(r.calibrationPointsTable),
    )
    const hasPoints =
      r.calibrationPoints.length > 0 ||
      tableHasValues(calibrationPointsTable) ||
      masterPointsTabs.some((t) => tableHasValues(t.calibrationPointsTable))
    if (!leastCount && !range && !r.accuracy && !hasPoints) return
    // Prefer richest table (View Factor source) over sparse legacy / first-tab list.
    const richest = calibrationPointsTableForViewFactor({
      ...r,
      calibrationPointsTable,
      masterPointsTabs,
    })
    const richestText = rangePointsFromTable(richest)
      .map((p) => p.pointValue)
      .filter(Boolean)
      .join(', ')
    options.push({
      index,
      leastCount: leastCount || '—',
      range: range || '—',
      accuracy: (r.accuracy || '').trim(),
      calibrationPoints:
        richestText ||
        r.calibrationPoints.map((p) => p.pointValue).join(', ') ||
        pointsTextFromTabs(masterPointsTabs),
      calibrationPointsTable: clonePointsTable(calibrationPointsTable),
      masterPointsTabs,
      masterEquipmentIds: [...(r.masterEquipmentIds ?? [])],
    })
  })
  return options
}

function matchRangeOption(
  options: RangeOption[],
  leastCount: string,
  range: string,
): RangeOption | undefined {
  const lc = leastCount.trim().toLowerCase()
  const rg = range.trim().toLowerCase()
  return (
    options.find(
      (o) =>
        o.leastCount.toLowerCase() === lc &&
        o.range.toLowerCase() === rg,
    ) ??
    options.find((o) => o.leastCount.toLowerCase() === lc) ??
    options.find((o) => o.range.toLowerCase() === rg) ??
    options[0]
  )
}

/** Load one master's check-point table from Equipment for Calibration. */
async function fetchSingleMasterPointsTable(
  masterId: string,
): Promise<CalibrationPointsStored | null> {
  const id = masterId.trim()
  if (!id) return null
  const { data, error } = await supabase
    .from('equipment_for_calibration')
    .select('id, calibration_points, equipment_name, asset_code')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  const table = parseCalibrationPointsTable(
    (data as { calibration_points: unknown }).calibration_points,
  )
  if (table.columns.length === 0) return null
  return clonePointsTable(table)
}

/** Fill empty master tabs from Equipment for Calibration when needed. */
async function hydrateMasterPointsTabs(
  tabs: MasterPointsTab[],
): Promise<MasterPointsTab[]> {
  const next = cloneMasterPointsTabs(tabs)
  await Promise.all(
    next.map(async (tab, index) => {
      if (tableHasValues(tab.calibrationPointsTable)) return
      if (!tab.masterEquipmentId.trim()) return
      const loaded = await fetchSingleMasterPointsTable(tab.masterEquipmentId)
      if (loaded) next[index] = { ...tab, calibrationPointsTable: loaded }
    }),
  )
  return next
}

function entryFromEquipment(eq: SelectableCalibrationEquipment): EntryRow {
  const options = getRangeOptions(eq)
  const first = options[0]
  const tabs = first ? cloneMasterPointsTabs(first.masterPointsTabs) : [emptyMasterPointsTab()]
  const primary = first
    ? clonePointsTable(first.calibrationPointsTable)
    : { columns: [], rows: [] }
  return {
    rowId: newRowId(),
    equipmentId: eq.id,
    quantity: '1',
    leastCount: first?.leastCount ?? '',
    range: first?.range ?? '',
    make: (eq.manufacturer ?? '').trim(),
    modelNumber: (eq.model_number ?? '').trim(),
    serialNumber: (eq.serial_number ?? '').trim(),
    customerId: '',
    accuracy: first?.accuracy ?? '',
    calibrationPoints: first?.calibrationPoints ?? pointsTextFromTabs(tabs),
    calibrationPointsTable: primary,
    masterPointsTabs: tabs,
    activeMasterTabId: tabs[0]?.id ?? '',
    calibrationFrequency: (eq.calibration_frequency ?? '').trim() || 'Yearly',
    conditionOfDuc: 'Good',
    physicalCondition: 'Ok',
    calibrationMethod: (eq.calibration_method_label ?? '').trim(),
    methodProcedureNotes: '',
  }
}

function formatEquipmentLabel(eq: SelectableCalibrationEquipment): string {
  return (eq.equipment_name || '').trim() || 'Unnamed'
}

function formatEntryLine(eq: SelectableCalibrationEquipment, row: EntryRow): string {
  const qty = Math.max(1, Number.parseInt(row.quantity, 10) || 1)
  const parts = [
    formatEquipmentLabel(eq),
    eq.id ? `EQID ${eq.id}` : null,
    row.leastCount.trim() ? `LC ${row.leastCount.trim()}` : null,
    row.range.trim() && row.range !== '—' ? `Range ${row.range.trim()}` : null,
    row.make.trim() ? `Make ${row.make.trim()}` : null,
    row.modelNumber.trim() ? `Model ${row.modelNumber.trim()}` : null,
    row.serialNumber.trim() ? `S/N ${row.serialNumber.trim()}` : null,
    row.customerId.trim() ? `Cust ID ${row.customerId.trim()}` : null,
    row.accuracy.trim() ? `Accuracy ${row.accuracy.trim()}` : null,
    row.calibrationPoints.trim() ? `Points ${row.calibrationPoints.trim()}` : null,
    row.calibrationFrequency.trim() ? `Freq ${row.calibrationFrequency.trim()}` : null,
    row.conditionOfDuc.trim() ? `Condition ${row.conditionOfDuc.trim()}` : null,
    row.physicalCondition.trim() ? `Physical ${row.physicalCondition.trim()}` : null,
    row.calibrationMethod.trim() ? `Cal Method ${row.calibrationMethod.trim()}` : null,
    row.methodProcedureNotes.trim()
      ? `Method Notes ${row.methodProcedureNotes.trim()}`
      : null,
    `Qty ${qty}`,
  ].filter(Boolean)
  return parts.join(' · ')
}

/** Restore entry rows from previously saved description text. */
function parseEntriesFromDescription(
  description: string,
  catalog: SelectableCalibrationEquipment[],
): EntryRow[] {
  const text = description.trim()
  if (!text || catalog.length === 0) return [emptyEntryRow()]

  const chunks = text.split(';').map((c) => c.trim()).filter(Boolean)
  const entries: EntryRow[] = []

  for (const chunk of chunks) {
    const lower = chunk.toLowerCase()
    const eqIdMatch = chunk.match(
      /\bEQID\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i,
    )
    const eqById = eqIdMatch?.[1]
      ? catalog.find((o) => o.id.toLowerCase() === eqIdMatch[1]!.toLowerCase())
      : undefined
    const eq =
      eqById ??
      catalog.find((o) => {
        const name = (o.equipment_name || '').trim().toLowerCase()
        const code = (o.asset_code || '').trim().toLowerCase()
        return (
          (name && (lower.includes(name) || lower.startsWith(name))) ||
          (code && lower.includes(`(${code})`))
        )
      })
    if (!eq) continue

    const base = entryFromEquipment(eq)
    const rangeOpts = getRangeOptions(eq)
    const qtyMatch = chunk.match(/qty\s*(\d+)/i)
    const lcMatch = chunk.match(/lc\s+([^·]+)/i)
    const rangeMatch = chunk.match(/range\s+([^·]+)/i)
    const matchedLc = lcMatch?.[1]?.trim() ?? ''
    const matchedRange = rangeMatch?.[1]?.trim() ?? ''
    const matchedOpt = matchRangeOption(
      rangeOpts,
      matchedLc || base.leastCount,
      matchedRange || base.range,
    )
    const snMatch = chunk.match(/s\/n\s+([^·]+)/i)
    const makeMatch = chunk.match(/make\s+([^·]+)/i)
    const modelMatch = chunk.match(/model\s+([^·]+)/i)
    const custIdMatch = chunk.match(/cust(?:omer)?\s*id\s+([^·]+)/i)
    const accuracyMatch = chunk.match(/accuracy\s+([^·]+)/i)
    const pointsMatch = chunk.match(/points\s+([^·]+)/i)
    const freqMatch = chunk.match(/freq\s+([^·]+)/i)
    const conditionMatch = chunk.match(/condition\s+([^·]+)/i)
    const physicalMatch = chunk.match(/physical\s+([^·]+)/i)
    const calMethodMatch = chunk.match(/cal\s*method\s+([^·]+)/i)
    const methodNotesMatch = chunk.match(/method\s*notes\s+([^·]+)/i)

    const physicalRaw = physicalMatch?.[1]?.trim() ?? ''
    const physicalCondition: PhysicalCondition =
      physicalRaw === 'Ok' || physicalRaw === 'Not Ok' ? physicalRaw : base.physicalCondition

    const tabs = matchedOpt
      ? cloneMasterPointsTabs(matchedOpt.masterPointsTabs)
      : cloneMasterPointsTabs(base.masterPointsTabs)
    const pointsTable = primaryCalibrationPointsTable(
      tabs,
      matchedOpt
        ? clonePointsTable(matchedOpt.calibrationPointsTable)
        : clonePointsTable(base.calibrationPointsTable),
    )

    entries.push({
      ...base,
      quantity: qtyMatch?.[1] ?? '1',
      leastCount: matchedOpt?.leastCount ?? base.leastCount,
      range: matchedOpt?.range ?? base.range,
      make: makeMatch?.[1]?.trim() ?? base.make,
      modelNumber: modelMatch?.[1]?.trim() ?? base.modelNumber,
      serialNumber: snMatch?.[1]?.trim() ?? base.serialNumber,
      customerId: custIdMatch?.[1]?.trim() ?? '',
      accuracy: accuracyMatch?.[1]?.trim() ?? matchedOpt?.accuracy ?? base.accuracy,
      calibrationPoints:
        pointsMatch?.[1]?.trim() ??
        matchedOpt?.calibrationPoints ??
        pointsTextFromTabs(tabs) ??
        base.calibrationPoints,
      calibrationPointsTable: pointsTable,
      masterPointsTabs: tabs,
      activeMasterTabId: tabs[0]?.id ?? base.activeMasterTabId,
      calibrationFrequency: freqMatch?.[1]?.trim() ?? base.calibrationFrequency,
      conditionOfDuc: conditionMatch?.[1]?.trim() ?? base.conditionOfDuc,
      physicalCondition,
      calibrationMethod: calMethodMatch?.[1]?.trim() || base.calibrationMethod,
      methodProcedureNotes: methodNotesMatch?.[1]?.trim() ?? '',
    })
  }

  return entries.length > 0 ? entries : [emptyEntryRow()]
}

const GRID_TABLE =
  'min-w-[980px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function EquipmentNameTypeahead({
  rowId,
  equipment,
  options,
  onPick,
}: {
  rowId: string
  equipment: SelectableCalibrationEquipment | null
  options: FilterComboboxOption[]
  onPick: (equipmentId: string) => void
}) {
  const displayName = (equipment?.equipment_name || '').trim()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(displayName)

  // Sync when equipment assignment changes (not while typing).
  useEffect(() => {
    setQuery(displayName)
  }, [equipment?.id, displayName])

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 80)
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 80)
  }, [options, query])

  return (
    <FilterCombobox
      value={query}
      onValueChange={(v) => {
        setQuery(v)
        setOpen(true)
      }}
      options={filteredOptions}
      onSelectOption={(opt) => {
        setQuery(opt.label)
        setOpen(false)
        onPick(opt.id)
      }}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // Only restore label when closing — never wipe typed text on open.
        if (!next) setQuery(displayName)
      }}
      placeholder="Type to search equipment…"
      listId={`srf-eq-name-${rowId}`}
      dropdownPlacement="bottom"
      inputClassName="h-9"
      className="min-w-[160px]"
    />
  )
}

export function SelectCalibrationEquipmentDialog({
  open,
  onOpenChange,
  selectedDescription,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedDescription: string
  onConfirm: (payload: {
    description: string
    quantity: number
    equipmentIds: string[]
    methodNotes: string
  }) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<SelectableCalibrationEquipment[]>([])
  const [entries, setEntries] = useState<EntryRow[]>(() => [emptyEntryRow()])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [detailsRowId, setDetailsRowId] = useState<string | null>(null)
  const [masterLabelById, setMasterLabelById] = useState<Record<string, string>>({})

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('equipment_master')
        .select(
          'id, asset_code, equipment_name, manufacturer, model_number, serial_number, range_capacity, resolution_least_count, measurement_ranges, calibration_method_label, calibration_frequency',
        )
        .order('equipment_name', { ascending: true })
      if (err) throw err
      setCatalog((data ?? []) as SelectableCalibrationEquipment[])
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message?: string }).message)
          : 'Failed to load equipment'
      setError(msg)
      setCatalog([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMasterLabels = useCallback(async (ids: string[]) => {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
    if (unique.length === 0) return
    const { data, error: err } = await supabase
      .from('equipment_for_calibration')
      .select('id, equipment_name, asset_code')
      .in('id', unique)
    if (err || !data) return
    setMasterLabelById((prev) => {
      const next = { ...prev }
      for (const row of data) {
        const name = String(row.equipment_name ?? '').trim()
        const code = String(row.asset_code ?? '').trim()
        next[row.id] = name || code || row.id
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (!open) return
    void loadCatalog()
  }, [open, loadCatalog])

  useEffect(() => {
    if (!open) return
    if (catalog.length === 0 && !selectedDescription.trim()) {
      setEntries([emptyEntryRow()])
      setSelectedIds(new Set())
      return
    }
    if (catalog.length === 0) return
    const next = parseEntriesFromDescription(selectedDescription, catalog)
    setEntries(next)
    setSelectedIds(
      new Set(next.filter((r) => r.equipmentId.trim()).map((r) => r.rowId)),
    )
  }, [open, catalog, selectedDescription])

  const equipmentNameOptions = useMemo<FilterComboboxOption[]>(
    () =>
      catalog.map((r) => ({
        id: r.id,
        label: (r.equipment_name || '').trim() || r.asset_code || r.id,
      })),
    [catalog],
  )

  const catalogById = useMemo(() => {
    const map = new Map<string, SelectableCalibrationEquipment>()
    for (const eq of catalog) map.set(eq.id, eq)
    return map
  }, [catalog])

  const patchEntry = (rowId: string, patch: Partial<EntryRow>) => {
    setEntries((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))
  }

  const updateActiveTabTable = (
    rowId: string,
    updater: (table: CalibrationPointsStored) => CalibrationPointsStored,
  ) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.rowId !== rowId) return entry
        const tabs = cloneMasterPointsTabs(entry.masterPointsTabs)
        const activeId = entry.activeMasterTabId || tabs[0]?.id
        const nextTabs = tabs.map((tab) =>
          tab.id === activeId
            ? { ...tab, calibrationPointsTable: updater(tab.calibrationPointsTable) }
            : tab,
        )
        const primary = primaryCalibrationPointsTable(
          nextTabs,
          entry.calibrationPointsTable,
        )
        return {
          ...entry,
          masterPointsTabs: nextTabs,
          activeMasterTabId: activeId || entry.activeMasterTabId,
          calibrationPointsTable: primary,
          calibrationPoints: pointsTextFromTabs(nextTabs),
        }
      }),
    )
  }

  const updateCalibrationPointCell = (
    rowId: string,
    pointRowId: string,
    columnId: string,
    value: string,
  ) => {
    updateActiveTabTable(rowId, (table) => ({
      ...table,
      rows: table.rows.map((pointRow) =>
        pointRow.id === pointRowId
          ? { ...pointRow, values: { ...pointRow.values, [columnId]: value } }
          : pointRow,
      ),
    }))
  }

  const addCalibrationPointRow = (rowId: string) => {
    updateActiveTabTable(rowId, (table) => {
      if (table.columns.length === 0) return table
      return {
        ...table,
        rows: [...table.rows, emptyCalibrationPointRow(table.columns)],
      }
    })
  }

  const removeCalibrationPointRow = (rowId: string, pointRowId: string) => {
    updateActiveTabTable(rowId, (table) => ({
      ...table,
      rows: table.rows.filter((pointRow) => pointRow.id !== pointRowId),
    }))
  }

  const applyRangeOptionToEntry = async (
    rowId: string,
    matched: RangeOption,
    preserve?: Partial<Pick<EntryRow, 'make' | 'modelNumber' | 'serialNumber' | 'quantity'>>,
  ) => {
    let tabs = cloneMasterPointsTabs(matched.masterPointsTabs)
    tabs = await hydrateMasterPointsTabs(tabs)
    const primary = primaryCalibrationPointsTable(
      tabs,
      clonePointsTable(matched.calibrationPointsTable),
    )
    void loadMasterLabels(tabs.map((t) => t.masterEquipmentId))
    patchEntry(rowId, {
      ...preserve,
      leastCount: matched.leastCount,
      range: matched.range,
      accuracy: matched.accuracy,
      calibrationPoints: matched.calibrationPoints || pointsTextFromTabs(tabs),
      calibrationPointsTable: primary,
      masterPointsTabs: tabs,
      activeMasterTabId: tabs[0]?.id ?? '',
    })
  }

  const assignEquipment = (rowId: string, equipmentId: string) => {
    const eq = catalogById.get(equipmentId)
    if (!eq) return
    const next = entryFromEquipment(eq)
    setEntries((prev) =>
      prev.map((r) =>
        r.rowId === rowId
          ? {
              ...next,
              rowId: r.rowId,
            }
          : r,
      ),
    )
    setSelectedIds((prev) => {
      const n = new Set(prev)
      n.add(rowId)
      return n
    })
    const first = getRangeOptions(eq)[0]
    if (first) {
      void applyRangeOptionToEntry(rowId, first, {
        make: next.make,
        modelNumber: next.modelNumber,
        serialNumber: next.serialNumber,
        quantity: next.quantity,
      })
    }
  }

  /** Refresh all master tabs from Calibration Equipment (and masters if needed). */
  const openDetailsWithSyncedPoints = async (rowId: string) => {
    const entry = entries.find((r) => r.rowId === rowId)
    if (!entry?.equipmentId) {
      setDetailsRowId(rowId)
      return
    }
    const eq = catalogById.get(entry.equipmentId)
    if (!eq) {
      setDetailsRowId(rowId)
      return
    }

    const options = getRangeOptions(eq)
    const matched = matchRangeOption(options, entry.leastCount, entry.range)
    let tabs = matched
      ? cloneMasterPointsTabs(matched.masterPointsTabs)
      : cloneMasterPointsTabs(entry.masterPointsTabs)
    tabs = await hydrateMasterPointsTabs(tabs)
    const primary = primaryCalibrationPointsTable(
      tabs,
      matched
        ? clonePointsTable(matched.calibrationPointsTable)
        : clonePointsTable(entry.calibrationPointsTable),
    )
    void loadMasterLabels(tabs.map((t) => t.masterEquipmentId))

    setEntries((prev) =>
      prev.map((r) =>
        r.rowId !== rowId
          ? r
          : {
              ...r,
              leastCount: matched?.leastCount ?? r.leastCount,
              range: matched?.range ?? r.range,
              accuracy: matched?.accuracy || r.accuracy,
              calibrationPoints:
                matched?.calibrationPoints ||
                pointsTextFromTabs(tabs) ||
                r.calibrationPoints,
              calibrationPointsTable: primary,
              masterPointsTabs: tabs,
              activeMasterTabId:
                tabs.find((t) => t.id === r.activeMasterTabId)?.id ?? tabs[0]?.id ?? '',
            },
      ),
    )
    setDetailsRowId(rowId)
  }

  const addRow = () => {
    setEntries((prev) => [...prev, emptyEntryRow()])
  }

  const removeRow = (rowId: string) => {
    setEntries((prev) => {
      const next = prev.filter((r) => r.rowId !== rowId)
      return next.length > 0 ? next : [emptyEntryRow()]
    })
    setSelectedIds((prev) => {
      const n = new Set(prev)
      n.delete(rowId)
      return n
    })
  }

  const toggleRow = (rowId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (checked) n.add(rowId)
      else n.delete(rowId)
      return n
    })
  }

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(entries.map((r) => r.rowId)) : new Set())
  }

  const filledEntries = entries.filter((r) => r.equipmentId.trim().length > 0)
  const selectedFilledEntries = filledEntries.filter((r) => selectedIds.has(r.rowId))
  const allChecked = entries.length > 0 && entries.every((r) => selectedIds.has(r.rowId))
  const someChecked = entries.some((r) => selectedIds.has(r.rowId))
  const detailsRow = detailsRowId
    ? (entries.find((r) => r.rowId === detailsRowId) ?? null)
    : null
  const detailsEquipment =
    detailsRow?.equipmentId ? (catalogById.get(detailsRow.equipmentId) ?? null) : null
  const detailsTabs = detailsRow?.masterPointsTabs ?? []
  const detailsActiveTab =
    detailsTabs.find((t) => t.id === detailsRow?.activeMasterTabId) ?? detailsTabs[0] ?? null
  const detailsActiveTable =
    detailsActiveTab?.calibrationPointsTable ?? { columns: [], rows: [] }
  const detailsTotalPoints = detailsTabs.reduce(
    (sum, tab) => sum + countFilledPointRows(tab.calibrationPointsTable),
    0,
  )

  const handleConfirm = () => {
    const toApply = selectedFilledEntries
    const description = toApply
      .map((row) => {
        const eq = catalogById.get(row.equipmentId)
        if (!eq) return null
        return formatEntryLine(eq, row)
      })
      .filter(Boolean)
      .join('; ')

    const totalQty = toApply.reduce((sum, row) => {
      const n = Number.parseInt(row.quantity, 10)
      return sum + (Number.isFinite(n) && n > 0 ? n : 1)
    }, 0)

    const methodNotes = [
      ...new Set(
        toApply
          .map((r) => r.methodProcedureNotes.trim())
          .filter(Boolean),
      ),
    ].join('; ')

    onConfirm({
      description,
      quantity: Math.max(totalQty, 1),
      equipmentIds: toApply.map((r) => r.equipmentId),
      methodNotes,
    })
    onOpenChange(false)
  }

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setDetailsRowId(null)
          setSelectedIds(new Set())
        }
        onOpenChange(next)
      }}
    >
      <DialogContent
        layer="nested"
        persistOnFocusLoss
        className="!flex fixed inset-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/10 [&>button]:hover:opacity-100"
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
          <DialogHeader className="relative pr-8 text-left">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
              Service Request · Equipment
            </p>
            <DialogTitle className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Select Calibration Equipment
            </DialogTitle>
            <p className="mt-1 text-xs text-slate-300">
              Add equipment rows and choose details for each item
            </p>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 bg-[#fafbfc] px-4 py-4 sm:px-6 sm:py-5">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200 bg-white">
            {loading ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : catalog.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No calibration equipments found. Add them under Calibration Equipments first.
              </p>
            ) : (
              <Table className={GRID_TABLE}>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-12 text-center text-xs sm:w-14">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label="Select all"
                        checked={allChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = !allChecked && someChecked
                        }}
                        onChange={(e) => toggleAll(e.target.checked)}
                      />
                    </TableHead>
                    <TableHead className="min-w-[180px] text-left text-xs">
                      Name of Equipment
                    </TableHead>
                    <TableHead className="min-w-[200px] text-center text-xs">
                      Range / Least Count
                    </TableHead>
                    <TableHead className="min-w-[110px] text-center text-xs">Make</TableHead>
                    <TableHead className="min-w-[110px] text-center text-xs">Model Number</TableHead>
                    <TableHead className="min-w-[110px] text-center text-xs">Serial Number</TableHead>
                    <TableHead className="min-w-[110px] text-center text-xs">Customer ID</TableHead>
                    <TableHead className="min-w-[90px] text-center text-xs">Quantity</TableHead>
                    <TableHead className="min-w-[100px] text-center text-xs">Details</TableHead>
                    <TableHead className="min-w-[72px] text-center text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((row, index) => {
                    const isLast = index === entries.length - 1
                    const eq = row.equipmentId ? catalogById.get(row.equipmentId) ?? null : null
                    const rangeOptions = eq ? getRangeOptions(eq) : []
                    const selectedOption =
                      rangeOptions.find(
                        (o) =>
                          o.leastCount === row.leastCount &&
                          (row.range ? o.range === row.range : true),
                      ) ??
                      rangeOptions.find((o) => o.leastCount === row.leastCount) ??
                      rangeOptions[0]
                    const selectValue =
                      selectedOption != null ? String(selectedOption.index) : undefined
                    const hasEquipment = Boolean(eq)
                    const selected = selectedIds.has(row.rowId)

                    return (
                      <TableRow key={row.rowId} data-state={selected ? 'selected' : undefined}>
                        <TableCell className="align-middle text-center">
                          <input
                            type="checkbox"
                            className={checkboxClass}
                            aria-label={`Select row ${index + 1}`}
                            checked={selected}
                            onChange={(e) => toggleRow(row.rowId, e.target.checked)}
                          />
                        </TableCell>
                        <TableCell className="align-middle text-left">
                          <EquipmentNameTypeahead
                            rowId={row.rowId}
                            equipment={eq}
                            options={equipmentNameOptions}
                            onPick={(equipmentId) => assignEquipment(row.rowId, equipmentId)}
                          />
                        </TableCell>
                        <TableCell className="align-middle text-center">
                          {!hasEquipment || rangeOptions.length === 0 ? (
                            <span className="text-sm text-muted-foreground">—</span>
                          ) : (
                            <Select
                              value={selectValue}
                              onValueChange={(indexStr) => {
                                const matched = rangeOptions.find(
                                  (o) => String(o.index) === indexStr,
                                )
                                if (!matched) return
                                void applyRangeOptionToEntry(row.rowId, matched)
                              }}
                            >
                              <SelectTrigger
                                className="mx-auto h-9 min-w-[180px] max-w-[280px]"
                                aria-label="Range / Least Count"
                              >
                                <SelectValue placeholder="Select range / LC" />
                              </SelectTrigger>
                              <SelectContent>
                                {rangeOptions.map((o) => {
                                  const label =
                                    o.range !== '—' && o.leastCount !== '—'
                                      ? `${o.range} · LC ${o.leastCount}`
                                      : o.range !== '—'
                                        ? o.range
                                        : o.leastCount
                                  return (
                                    <SelectItem
                                      key={`${row.rowId}-rng-lc-${o.index}`}
                                      value={String(o.index)}
                                    >
                                      {label}
                                    </SelectItem>
                                  )
                                })}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="align-middle text-center">
                          <Input
                            className="mx-auto h-9 w-[120px] text-center"
                            value={row.make}
                            disabled={!hasEquipment}
                            placeholder="Make"
                            onChange={(e) => patchEntry(row.rowId, { make: e.target.value })}
                            aria-label="Make"
                          />
                        </TableCell>
                        <TableCell className="align-middle text-center">
                          <Input
                            className="mx-auto h-9 w-[120px] text-center"
                            value={row.modelNumber}
                            disabled={!hasEquipment}
                            placeholder="Model"
                            onChange={(e) =>
                              patchEntry(row.rowId, { modelNumber: e.target.value })
                            }
                            aria-label="Model number"
                          />
                        </TableCell>
                        <TableCell className="align-middle text-center">
                          <Input
                            className="mx-auto h-9 w-[120px] text-center"
                            value={row.serialNumber}
                            disabled={!hasEquipment}
                            placeholder="Serial no."
                            onChange={(e) =>
                              patchEntry(row.rowId, { serialNumber: e.target.value })
                            }
                            aria-label="Serial number"
                          />
                        </TableCell>
                        <TableCell className="align-middle text-center">
                          <Input
                            className="mx-auto h-9 w-[110px] text-center"
                            value={row.customerId}
                            disabled={!hasEquipment}
                            placeholder="Cust. ID"
                            onChange={(e) =>
                              patchEntry(row.rowId, { customerId: e.target.value })
                            }
                            aria-label="Customer ID"
                          />
                        </TableCell>
                        <TableCell className="align-middle text-center">
                          <Input
                            className="mx-auto h-9 w-[80px] text-center"
                            type="number"
                            min={1}
                            inputMode="numeric"
                            value={row.quantity}
                            disabled={!hasEquipment}
                            placeholder="Qty"
                            onChange={(e) =>
                              patchEntry(row.rowId, { quantity: e.target.value })
                            }
                            aria-label="Quantity"
                          />
                        </TableCell>
                        <TableCell className="align-middle text-center">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 gap-1.5 border-slate-300 px-2.5 text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-800"
                            disabled={!hasEquipment}
                            onClick={() => {
                              void openDetailsWithSyncedPoints(row.rowId)
                            }}
                            aria-label="Open calibration details"
                          >
                            <Settings2 size={14} aria-hidden />
                            Details
                          </Button>
                        </TableCell>
                        <TableCell className="align-middle text-center">
                          {isLast ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 w-9 border-teal-600/40 px-0 text-teal-800 hover:bg-teal-50"
                              onClick={addRow}
                              aria-label="Add equipment row"
                            >
                              <Plus size={16} />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-9 w-9 px-0 text-destructive hover:bg-destructive/10"
                              onClick={() => removeRow(row.rowId)}
                              aria-label="Delete equipment row"
                            >
                              <Trash2 size={16} />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 pt-3">
            <p className="text-xs text-muted-foreground">
              {selectedFilledEntries.length} of {filledEntries.length} equipment row(s) selected
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-teal-600 text-white hover:bg-teal-500"
                onClick={handleConfirm}
                disabled={selectedFilledEntries.length === 0}
              >
                Apply Selection
                {selectedFilledEntries.length > 0
                  ? ` (${selectedFilledEntries.length})`
                  : ''}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

      <Dialog
        open={Boolean(detailsRow)}
        onOpenChange={(next) => {
          if (!next) setDetailsRowId(null)
        }}
      >
        <DialogContent
          layer="nested"
          persistOnFocusLoss
          className="max-h-[min(92vh,820px)] max-w-4xl gap-0 overflow-hidden p-0"
          aria-describedby={undefined}
        >
          <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-6">
            <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
            <DialogHeader className="relative pr-8 text-left">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                Equipment · Calibration Details
              </p>
              <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                {detailsEquipment
                  ? formatEquipmentLabel(detailsEquipment)
                  : 'Calibration Details'}
              </DialogTitle>
            </DialogHeader>
          </div>

          {detailsRow ? (
            <div className="lab-registry-form max-h-[calc(min(92vh,820px)-78px)] space-y-4 overflow-y-auto bg-[#fafbfc] px-4 py-4 sm:px-6 sm:py-5 [&_label]:text-[12px] [&_label]:font-medium [&_label]:text-slate-600">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor={`eq-acc-${detailsRow.rowId}`}>Accuracy</Label>
                  <Input
                    id={`eq-acc-${detailsRow.rowId}`}
                    value={detailsRow.accuracy}
                    placeholder="±"
                    onChange={(e) =>
                      patchEntry(detailsRow.rowId, { accuracy: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`eq-freq-${detailsRow.rowId}`}>Calibration Frequency</Label>
                  <Select
                    value={detailsRow.calibrationFrequency || undefined}
                    onValueChange={(v) =>
                      patchEntry(detailsRow.rowId, { calibrationFrequency: v })
                    }
                  >
                    <SelectTrigger id={`eq-freq-${detailsRow.rowId}`}>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((freq) => (
                        <SelectItem key={freq} value={freq}>
                          {freq}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Condition of DUC</Label>
                  <Select
                    value={detailsRow.conditionOfDuc || undefined}
                    onValueChange={(v) =>
                      patchEntry(detailsRow.rowId, { conditionOfDuc: v })
                    }
                  >
                    <SelectTrigger aria-label="Condition of DUC">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {DUC_CONDITIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Physical Conditions</Label>
                  <Select
                    value={detailsRow.physicalCondition || undefined}
                    onValueChange={(v) =>
                      patchEntry(detailsRow.rowId, {
                        physicalCondition: v as PhysicalCondition,
                      })
                    }
                  >
                    <SelectTrigger aria-label="Physical conditions">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {PHYSICAL_CONDITIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`eq-method-${detailsRow.rowId}`}>Calibration Method</Label>
                  <Input
                    id={`eq-method-${detailsRow.rowId}`}
                    value={detailsRow.calibrationMethod}
                    readOnly
                    placeholder="From Equipment Master"
                    title={detailsRow.calibrationMethod || 'Not set in Equipment Master'}
                    className="bg-slate-50"
                    aria-label="Calibration method from equipment master"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`eq-method-notes-${detailsRow.rowId}`}>
                    Method / Procedure Notes
                  </Label>
                  <Input
                    id={`eq-method-notes-${detailsRow.rowId}`}
                    value={detailsRow.methodProcedureNotes}
                    placeholder="Selected calibration method / procedure reference"
                    onChange={(e) =>
                      patchEntry(detailsRow.rowId, {
                        methodProcedureNotes: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div>
                  <Label>Calibration Points</Label>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Points are grouped by Master Equipment for this range
                    {detailsTotalPoints > 0 ? ` · ${detailsTotalPoints} point(s) total` : ''}.
                  </p>
                </div>

                {detailsTabs.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
                    {detailsTabs.map((tab, index) => {
                      const label =
                        masterLabelById[tab.masterEquipmentId] ||
                        (tab.masterEquipmentId
                          ? tab.masterEquipmentId
                          : `Master ${index + 1}`)
                      const active = tab.id === detailsActiveTab?.id
                      const pointCount = countFilledPointRows(tab.calibrationPointsTable)
                      return (
                        <Button
                          key={tab.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(
                            'h-8 max-w-[240px]',
                            active
                              ? 'border-teal-600/50 bg-teal-50 text-teal-900 hover:bg-teal-50 hover:text-teal-900'
                              : 'border-slate-300 text-slate-700 hover:bg-slate-50',
                          )}
                          onClick={() =>
                            patchEntry(detailsRow!.rowId, { activeMasterTabId: tab.id })
                          }
                          aria-pressed={active}
                          title={label}
                        >
                          <span className="truncate">{label}</span>
                          {pointCount > 0 ? (
                            <span className="ml-1.5 rounded-full bg-teal-600/15 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800">
                              {pointCount}
                            </span>
                          ) : null}
                        </Button>
                      )
                    })}
                  </div>
                ) : null}

                {detailsActiveTable.columns.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-xs text-muted-foreground">
                    No calibration points table is configured for this master on the selected
                    range. Open Calibration Equipments → Points, then reopen Details.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="w-12 px-3 py-2 text-center">#</th>
                            {detailsActiveTable.columns.map((column) => (
                              <th key={column.id} className="min-w-[150px] px-3 py-2">
                                {column.header}
                              </th>
                            ))}
                            <th className="w-14 px-2 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {detailsActiveTable.rows.map(
                            (pointRow: CalibrationPointRow, index) => {
                              const isLast = index === detailsActiveTable.rows.length - 1
                              return (
                              <tr key={pointRow.id} className="border-t border-slate-100">
                                <td className="px-3 py-2 text-center text-slate-500">
                                  {index + 1}
                                </td>
                                {detailsActiveTable.columns.map((column) => (
                                  <td key={column.id} className="px-3 py-2">
                                    <Label
                                      htmlFor={`srf-cal-point-${pointRow.id}-${column.id}`}
                                      className="sr-only"
                                    >
                                      {column.header} row {index + 1}
                                    </Label>
                                    <Input
                                      id={`srf-cal-point-${pointRow.id}-${column.id}`}
                                      className="h-9"
                                      value={pointRow.values[column.id] ?? ''}
                                      placeholder={column.header}
                                      onChange={(e) =>
                                        updateCalibrationPointCell(
                                          detailsRow!.rowId,
                                          pointRow.id,
                                          column.id,
                                          e.target.value,
                                        )
                                      }
                                    />
                                  </td>
                                ))}
                                <td className="px-2 py-2 text-right">
                                  {isLast ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-9 w-9 border-teal-600/40 px-0 text-teal-800 hover:bg-teal-50"
                                      onClick={() =>
                                        addCalibrationPointRow(detailsRow!.rowId)
                                      }
                                      aria-label="Add calibration point"
                                    >
                                      <Plus size={15} />
                                    </Button>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-9 w-9 px-0 text-destructive hover:bg-destructive/10"
                                      onClick={() =>
                                        removeCalibrationPointRow(
                                          detailsRow!.rowId,
                                          pointRow.id,
                                        )
                                      }
                                      aria-label={`Remove calibration point ${index + 1}`}
                                    >
                                      <Trash2 size={15} />
                                    </Button>
                                  )}
                                </td>
                              </tr>
                              )
                            },
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end border-t border-slate-200 pt-3">
                <Button
                  type="button"
                  className="bg-teal-600 text-white hover:bg-teal-500"
                  onClick={() => setDetailsRowId(null)}
                >
                  Save & Close
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

export function CalibrationEquipmentSelectButton({
  value,
  onApply,
}: {
  value: string
  onApply: (payload: { description: string; quantity: string; methodNotes: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const hasValue = value.trim().length > 0
  const itemCount = useMemo(
    () =>
      value
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean).length,
    [value],
  )
  const buttonLabel = hasValue
    ? itemCount > 1
      ? `${itemCount} equipment selected`
      : value.trim()
    : 'Select equipment…'

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="srf-equipment-select">Equipment / Item for Calibration</Label>
        <div className="flex h-10 items-stretch gap-1 border-b border-slate-300">
          <button
            id="srf-equipment-select"
            type="button"
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 bg-transparent px-2.5 text-left text-sm outline-none transition-colors',
              'hover:bg-teal-50/60 focus-visible:border-teal-600',
              hasValue ? 'text-slate-800' : 'text-muted-foreground',
            )}
            onClick={() => setOpen(true)}
            aria-label="Select calibration equipment"
          >
            <Package size={16} className="shrink-0 text-teal-700" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{buttonLabel}</span>
            {hasValue && itemCount > 1 ? (
              <span className="shrink-0 rounded-full bg-teal-600/15 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800">
                {itemCount}
              </span>
            ) : null}
          </button>
          {hasValue ? (
            <button
              type="button"
              className="shrink-0 px-2 text-xs font-medium text-slate-500 hover:text-destructive"
              onClick={() => onApply({ description: '', quantity: '1', methodNotes: '' })}
              aria-label="Clear equipment selection"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <SelectCalibrationEquipmentDialog
        open={open}
        onOpenChange={setOpen}
        selectedDescription={value}
        onConfirm={({ description, quantity, methodNotes }) => {
          onApply({ description, quantity: String(quantity), methodNotes })
        }}
      />
    </>
  )
}
