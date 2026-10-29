import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { limsDarkBarBtnClass, limsDarkBarGlowStyle, limsDialogClass, limsFieldClass, limsPrimaryBtnClass, limsTableHeadClass } from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import { Eye, FileText, Plus, Wrench } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { TestAllocationRow } from '../types'
import { AddSectionTestDialog } from './AddSectionTestDialog'
import type { SectionTestSelectionChange } from './allocatedTestsForSection'
import { formatTestParamClauseLine } from '../shared/formatTestParamClauseLine'
import { toProperRequirementText } from '../shared/toProperRequirementText'
import { SectionSampleDescViewDialog } from '../shared/SectionSampleDescViewDialog'
import { TestResultsEntryCell } from './TestResultsEntryCell'
import { buildSectionCompareSources, paramKeyFromRow } from './sectionCompareSources'
import {
  getSectionParametersForEntry,
  mergeSectionDraftPreservingEdits,
  type SectionParameterEntry,
} from './sectionParameterRows'
import { formatTestResultDisplay, formatTestResultForTable } from './testResultValues'
import { resolveReportScopeFromAccreditationIds } from '../report-preparation/reportScope'
import { useAuth } from '@/hooks/useAuth'
import { useReasonForChange } from '@/hooks/useReasonForChange'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  equipmentSnapshotsOf,
  equipmentUsedIsRecorded,
  fetchEquipmentUsedByParamIds,
  formatEquipmentUsed,
  isNoEquipmentEntry,
  loadEquipmentOptions,
  readLastEquipmentSelection,
  snapshotFromOption,
  todayIso,
  writeLastEquipmentSelection,
  type EquipmentOption,
  type EquipmentUsedEntry,
} from '@/lib/equipmentTraceability'
import { EquipmentUsedPickerDialog } from './EquipmentUsedPickerDialog'
import { ResultObservationMeta } from './ResultObservationMeta'
import {
  fetchResultAttachments,
  fetchResultEntryStamps,
  type ResultAttachment,
  type ResultEntryStamp,
} from './resultObservationRecords'
import { fetchConditionsFor, type EnvironmentConditions } from '@/features/environment/environmentConditions'
import {
  fetchResultEnvironmentByParamIds,
  loadLabAreaOptions,
  readLastSectionArea,
  testPeriodOf,
  writeLastSectionArea,
  type LabAreaOption,
  type TestPeriod,
} from '@/features/environment/resultEnvironment'
import {
  formatEnvironmentSnapshotSummary,
  snapshotFromConditions,
  type ResultEnvironmentAcknowledgement,
  type ResultEnvironmentSnapshot,
} from '@/features/environment/resultEnvironmentSnapshot'

export type SectionResultsDraft = SectionParameterEntry

type BulkDateField = 'testStartDate' | 'testEndDate'

const RESULTS_GRID_COLS =
  'grid grid-cols-[2.5rem_minmax(9rem,1.2fr)_minmax(4.5rem,0.5fr)_minmax(10rem,1.5fr)_minmax(8rem,0.9fr)_minmax(8rem,0.9fr)_minmax(12rem,1.7fr)_7rem_minmax(8rem,0.9fr)]'

/** Date the equipment must be usable on: end date, else start date, else today. */
const testDateOf = (p: SectionParameterEntry): string =>
  toDateInput(p.testEndDate) || toDateInput(p.testStartDate) || todayIso()

const equipmentParamKey = (p: SectionParameterEntry) =>
  (p.testParameterId?.trim() || p.testLabel.trim().toLowerCase())

const ENV_ACK_QUICK_PICKS = [
  'Excursion brief; test not sensitive to temperature / humidity at this level',
  'Test done outside the excursion window; readings within limits during the test',
  'Impact assessed; results not affected',
] as const

/** Distinct test periods of a section, encoded as "start|end,start|end" (sorted). */
const periodsFromKey = (key: string): TestPeriod[] =>
  key
    .split(',')
    .filter(Boolean)
    .map((k) => {
      const [a, b] = k.split('|')
      return testPeriodOf(a, b)
    })

async function fetchPeriodConditions(
  areaId: string,
  periodsKey: string,
): Promise<Record<string, EnvironmentConditions | null>> {
  const entries = await Promise.all(
    periodsFromKey(periodsKey).map(async (t) => [t.key, await fetchConditionsFor(areaId, t.from, t.to)] as const),
  )
  return Object.fromEntries(entries)
}

/** Readings outside limits, per period, for the acknowledgement signature. */
const outOfLimitsSignature = (areaId: string, conditions: Record<string, EnvironmentConditions | null>) =>
  `${areaId}#${Object.entries(conditions)
    .filter(([, c]) => c?.anyOutOfLimits)
    .map(([k, c]) => `${k}:${c?.outOfLimitCount ?? 0}`)
    .sort()
    .join(',')}`

/** Acknowledgement saved earlier for the same area, period and readings (no need to ask again). */
const carriedAcknowledgement = (
  saved: ResultEnvironmentSnapshot | null | undefined,
  c: EnvironmentConditions,
  period: TestPeriod,
): ResultEnvironmentAcknowledgement | null => {
  if (!saved?.acknowledgement?.reason.trim()) return null
  if (saved.area_id !== c.areaId) return null
  if (saved.reading_count !== c.readingCount || saved.out_of_limit_count !== c.outOfLimitCount) return null
  if (Date.parse(saved.period_from) !== Date.parse(period.from) || Date.parse(saved.period_to) !== Date.parse(period.to)) {
    return null
  }
  return saved.acknowledgement
}

const localDayOf = (ts: string) => {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Keeps clicks inside the on-demand reason dialog (own React root) from closing this one. */
const insideReasonDialog = (e: Event) =>
  e.target instanceof Element && Boolean(e.target.closest('[data-reason-for-change-root]'))

const cellClass =
  'flex h-full min-h-[2.75rem] items-center border-b border-r border-[#e7e0d4] px-2 py-2 text-xs text-[#292524] last:border-r-0'
const headCellClass = cn(
  limsTableHeadClass,
  'flex h-full items-center justify-center border-b border-r border-stone-700 !p-2 last:border-r-0',
)
const rowEvenClass = 'bg-[#f7f3eb]'
const rowOddClass = 'bg-[#fffcf7]'
const eyeBtnClass =
  'h-7 w-7 shrink-0 rounded-none text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]'
const dateInputClass = cn(
  limsFieldClass,
  'h-9 w-full max-w-[140px] rounded-sm px-2.5 text-left text-xs tabular-nums shadow-sm [&::-webkit-calendar-picker-indicator]:ml-auto [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:hover:opacity-100',
)
const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 accent-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const dialogShellClass = cn(
  limsDialogClass,
  '!fixed !left-0 !top-0 !flex !h-[100dvh] !max-h-[100dvh] !w-full !max-w-none !translate-x-0 !translate-y-0 !flex-col !gap-0 !overflow-hidden !rounded-none !border-0 !bg-white !p-0 sm:!rounded-none',
  'lg:!left-[268px] lg:!w-[calc(100vw-268px)] lg:!max-w-[calc(100vw-268px)]',
)

const toDateInput = (v: string | null | undefined) => {
  if (!v?.trim()) return ''
  const s = v.trim()
  // Pass through ISO date so mid-typing years (e.g. 0002) are not timezone-shifted.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Chrome fires onChange while year is still being typed (e.g. 0002-01-10). */
const isCompleteIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  return year >= 1000
}

const formatDateDisplay = (v: string | null | undefined) => formatDate(toDateInput(v) || v)

export function SectionResultsEntryDialog({
  open,
  onOpenChange,
  row,
  readOnly,
  saving,
  onSave,
  onViewTestParameter,
  onAddTests,
  onUpdateSpecificRequirement,
  readOnlyTitle = 'Submitted Results',
  layer = 'default',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: TestAllocationRow | null
  readOnly: boolean
  saving?: boolean
  onSave: (draft: SectionResultsDraft[]) => void | Promise<void>
  onViewTestParameter?: (testLabel: string) => void
  onAddTests?: (change: SectionTestSelectionChange) => Promise<void>
  onUpdateSpecificRequirement?: (
    entry: SectionParameterEntry,
    nextValue: string,
  ) => Promise<{ sectionSpecOverride: string | null; specificRequirement: string | null }>
  readOnlyTitle?: string
  layer?: 'default' | 'nested' | 'stacked' | 'top'
}) {
  const [draft, setDraft] = useState<SectionResultsDraft[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const [bulkDatePrompt, setBulkDatePrompt] = useState<{
    field: BulkDateField
    value: string
  } | null>(null)
  const [addTestOpen, setAddTestOpen] = useState(false)
  const [sampleDetailsOpen, setSampleDetailsOpen] = useState(false)
  const [addingTests, setAddingTests] = useState(false)
  const [editSpecOpen, setEditSpecOpen] = useState(false)
  const [editSpecEntry, setEditSpecEntry] = useState<SectionParameterEntry | null>(null)
  const [editSpecValue, setEditSpecValue] = useState('')
  const [editSpecSaving, setEditSpecSaving] = useState(false)
  const [editSpecError, setEditSpecError] = useState<string | null>(null)
  const [nablScopeByParameterId, setNablScopeByParameterId] = useState<Record<string, string>>({})
  const [nablScopeLoading, setNablScopeLoading] = useState(false)
  const [nablScopeLoadError, setNablScopeLoadError] = useState(false)
  const openSectionKeyRef = useRef<string | null>(null)
  /** ISO 17025 6.4 / 7.5.1 equipment used: unknown until probed; missing = migration not applied. */
  const [traceability, setTraceability] = useState<'unknown' | 'available' | 'missing'>('unknown')
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentOption[]>([])
  const [equipmentLoading, setEquipmentLoading] = useState(false)
  const [equipmentLoadError, setEquipmentLoadError] = useState<string | null>(null)
  const [pickerIndex, setPickerIndex] = useState<number | null>(null)
  /** View = saved choice read-only (single click on View); edit = the form (Add, or double-click on View). */
  const [pickerMode, setPickerMode] = useState<'view' | 'edit'>('edit')
  const viewClickTimerRef = useRef<number | null>(null)
  const [equipmentError, setEquipmentError] = useState<string | null>(null)
  /** Rows whose equipment the user changed in this session (a late fetch must not overwrite them). */
  const equipmentTouchedRef = useRef<Set<string>>(new Set())
  /** ISO 17025 7.5.1 environmental conditions: unknown until probed; missing = migration 20261026100300 not applied. */
  const [envStatus, setEnvStatus] = useState<'unknown' | 'available' | 'missing'>('unknown')
  const [labAreas, setLabAreas] = useState<LabAreaOption[]>([])
  const [labAreasError, setLabAreasError] = useState<string | null>(null)
  /** Area chosen in this session; null = not chosen yet (the default applies). */
  const [envAreaChoice, setEnvAreaChoice] = useState<string | null>(null)
  const [envState, setEnvState] = useState<{
    key: string
    conditions: Record<string, EnvironmentConditions | null>
  } | null>(null)
  const [envFetchError, setEnvFetchError] = useState<{ key: string; message: string } | null>(null)
  const [envAck, setEnvAck] = useState<{ signature: string; ack: ResultEnvironmentAcknowledgement } | null>(null)
  const [envSaveError, setEnvSaveError] = useState<string | null>(null)
  const [envPreparing, setEnvPreparing] = useState(false)
  const { user, profileName, designation } = useAuth()
  const askReason = useReasonForChange()
  const isDirector = isLaboratoryDirector(designation)
  const nestedDialogOpen =
    addTestOpen ||
    sampleDetailsOpen ||
    editSpecOpen ||
    pickerIndex !== null ||
    bulkDatePrompt !== null

  useEffect(() => {
    if (!open) {
      openSectionKeyRef.current = null
      setDraft([])
      setSelectedKeys(new Set())
      setBulkDatePrompt(null)
      setAddTestOpen(false)
      setSampleDetailsOpen(false)
      setEditSpecOpen(false)
      setEditSpecEntry(null)
      setEditSpecValue('')
      setEditSpecError(null)
      setPickerIndex(null)
      setEquipmentError(null)
      equipmentTouchedRef.current = new Set()
      scopeTouchedRef.current = new Set()
      setEnvAreaChoice(null)
      setEnvState(null)
      setEnvFetchError(null)
      setEnvAck(null)
      setEnvSaveError(null)
      return
    }
    // Keep draft while open if row briefly null (parent race); do not clear section key.
    if (!row) return
    const sectionKey = row.testAllocationId?.trim() || row.sampleAllocationId?.trim() || ''
    const next = getSectionParametersForEntry(row)
    const sameSectionOpen = openSectionKeyRef.current === sectionKey
    openSectionKeyRef.current = sectionKey

    if (!sameSectionOpen) {
      setDraft(next)
      setSelectedKeys(new Set())
      return
    }
    setDraft((prev) => mergeSectionDraftPreservingEdits(prev, next))
  }, [open, row])

  const handleParentOpenChange = (next: boolean) => {
    if (!next && nestedDialogOpen) return
    onOpenChange(next)
  }

  const rowKeyAt = (p: SectionParameterEntry, index: number) =>
    paramKeyFromRow(p.paramRowId, p.testLabel) || `idx-${index}`

  const sectionCompareItems = useMemo(
    () =>
      draft.map((p) => ({
        paramKey: paramKeyFromRow(p.paramRowId, p.testLabel),
        testLabel: p.testLabel,
        results: p.results,
      })),
    [draft],
  )

  const draftKeys = useMemo(
    () => draft.map((p, i) => paramKeyFromRow(p.paramRowId, p.testLabel) || `idx-${i}`),
    [draft],
  )
  const allChecked = draftKeys.length > 0 && draftKeys.every((k) => selectedKeys.has(k))
  const someChecked = draftKeys.some((k) => selectedKeys.has(k))
  const selectedCount = draftKeys.filter((k) => selectedKeys.has(k)).length
  const parameterIdsKey = useMemo(
    () => [...new Set(draft.map((entry) => entry.testParameterId?.trim()).filter(Boolean))]
      .sort()
      .join('|'),
    [draft],
  )

  useEffect(() => {
    if (!open) {
      setNablScopeByParameterId({})
      setNablScopeLoading(false)
      setNablScopeLoadError(false)
      return
    }

    const parameterIds = parameterIdsKey.split('|').filter(Boolean)
    if (parameterIds.length === 0) {
      setNablScopeByParameterId({})
      setNablScopeLoading(false)
      setNablScopeLoadError(false)
      return
    }

    let cancelled = false
    setNablScopeLoading(true)
    setNablScopeLoadError(false)
    void (async () => {
      try {
        const [parameterResult, bodyResult] = await Promise.all([
          supabase
            .from('test_parameters')
            .select('id, under_accreditation_ids')
            .in('id', parameterIds),
          supabase.from('accreditation_bodies').select('id, name'),
        ])
        if (parameterResult.error) throw parameterResult.error
        if (bodyResult.error) throw bodyResult.error

        const parameterById = new Map<string, string[] | null>()
        for (const raw of Array.isArray(parameterResult.data) ? parameterResult.data : []) {
          const parameter = raw as { id: string; under_accreditation_ids?: string[] | null }
          parameterById.set(parameter.id, parameter.under_accreditation_ids ?? null)
        }
        const bodyNameById = new Map<string, string>()
        for (const raw of Array.isArray(bodyResult.data) ? bodyResult.data : []) {
          const body = raw as { id: string; name: string }
          bodyNameById.set(body.id, body.name)
        }

        const nextStatus: Record<string, string> = {}
        for (const id of parameterIds) {
          const accreditationIds = parameterById.get(id)
          nextStatus[id] = accreditationIds === undefined
            ? 'Master unavailable'
            : resolveReportScopeFromAccreditationIds(accreditationIds, bodyNameById)
        }
        if (!cancelled) setNablScopeByParameterId(nextStatus)
      } catch {
        if (!cancelled) {
          setNablScopeByParameterId({})
          setNablScopeLoadError(true)
        }
      } finally {
        if (!cancelled) setNablScopeLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, parameterIdsKey])

  const paramRowIdsKey = useMemo(
    () => [...new Set(draft.map((p) => p.paramRowId?.trim()).filter(Boolean))].sort().join('|'),
    [draft],
  )

  // Who entered each result and its raw data files (ISO 17025 7.5.1); null = migration not applied.
  const [entryStamps, setEntryStamps] = useState<Record<string, ResultEntryStamp> | null>(null)
  const [resultAttachments, setResultAttachments] = useState<Record<string, ResultAttachment[]> | null>(null)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const ids = paramRowIdsKey.split('|').filter(Boolean)
    void Promise.all([fetchResultEntryStamps(ids), fetchResultAttachments(ids)]).then(([stamps, files]) => {
      if (cancelled) return
      setEntryStamps(stamps)
      setResultAttachments(files)
    })
    return () => {
      cancelled = true
    }
  }, [open, paramRowIdsKey])

  // Equipment used already saved on these result rows (also probes the column).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void fetchEquipmentUsedByParamIds(paramRowIdsKey.split('|').filter(Boolean))
      .then(({ available, byId }) => {
        if (cancelled) return
        setTraceability(available ? 'available' : 'missing')
        if (!available) return
        setDraft((prev) =>
          prev.map((p) => {
            const touched = equipmentTouchedRef.current.has(p.paramRowId || p.testLabel)
            if (!touched && p.paramRowId && byId[p.paramRowId]) {
              return { ...p, equipmentUsed: byId[p.paramRowId] }
            }
            return p.equipmentUsed !== undefined ? p : { ...p, equipmentUsed: [] }
          }),
        )
      })
      .catch(() => {
        // Unknown failure: do not block saving on it.
        if (!cancelled) setTraceability('missing')
      })
    return () => {
      cancelled = true
    }
  }, [open, paramRowIdsKey])

  // NABL scope of each saved result (migration 20261102101600); missing = column not there yet.
  const [scopeOverrideStatus, setScopeOverrideStatus] = useState<'unknown' | 'available' | 'missing'>('unknown')
  /** Rows whose scope the user changed in this session (a late fetch must not overwrite them). */
  const scopeTouchedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const ids = paramRowIdsKey.split('|').filter(Boolean)
    void (async () => {
      const query = supabase.from('test_allocation_parameters').select('id, nabl_scope_override')
      const { data, error } = ids.length > 0 ? await query.in('id', ids) : await query.limit(1)
      if (cancelled) return
      if (error) {
        setScopeOverrideStatus('missing')
        return
      }
      setScopeOverrideStatus('available')
      const byId = new Map(
        ((data ?? []) as Array<{ id: string; nabl_scope_override: string | null }>).map((r) => [r.id, r.nabl_scope_override]),
      )
      setDraft((prev) =>
        prev.map((p) => {
          if (scopeTouchedRef.current.has(p.paramRowId || p.testLabel)) return p
          const saved = p.paramRowId ? byId.get(p.paramRowId) : undefined
          return { ...p, nablScopeOverride: saved === 'Non NABL' ? 'Non NABL' : null }
        }),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [open, paramRowIdsKey])

  // Equipment / CRM list for the picker (entry mode only).
  useEffect(() => {
    if (!open || readOnly || traceability !== 'available') return
    let cancelled = false
    void Promise.resolve()
      .then(() => {
        if (cancelled) return null
        setEquipmentLoading(true)
        setEquipmentLoadError(null)
        return loadEquipmentOptions()
      })
      .then((list) => {
        if (!cancelled && list) setEquipmentOptions(list)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setEquipmentOptions([])
          setEquipmentLoadError(err instanceof Error ? err.message : 'Could not load equipment')
        }
      })
      .finally(() => {
        if (!cancelled) setEquipmentLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, readOnly, traceability])

  const equipmentOptionById = useMemo(
    () => new Map(equipmentOptions.map((o) => [o.id, o])),
    [equipmentOptions],
  )

  /** Re-take each snapshot from the current masters for the entry's test date (keeps overrides). */
  const refreshSnapshots = (p: SectionParameterEntry, items: EquipmentUsedEntry[]): EquipmentUsedEntry[] =>
    items.map((s) => {
      if (isNoEquipmentEntry(s)) return s
      const opt = equipmentOptionById.get(s.equipment_id)
      if (!opt) return s
      return snapshotFromOption(
        opt,
        testDateOf(p),
        s.override_reason
          ? { reason: s.override_reason, byId: s.override_by ?? '', byName: s.override_by_name ?? '' }
          : undefined,
      )
    })

  const handlePickerConfirm = (items: EquipmentUsedEntry[], applyToOthers: boolean) => {
    const index = pickerIndex
    setPickerIndex(null)
    if (index === null) return
    setEquipmentError(null)
    setDraft((prev) =>
      prev.map((p, i) => {
        if (i === index) {
          equipmentTouchedRef.current.add(p.paramRowId || p.testLabel)
          return { ...p, equipmentUsed: items }
        }
        if (applyToOthers && (p.equipmentUsed ?? []).length === 0) {
          equipmentTouchedRef.current.add(p.paramRowId || p.testLabel)
          return { ...p, equipmentUsed: refreshSnapshots(p, items) }
        }
        return p
      }),
    )
  }

  // ---------------------------------------------------------------------
  // Environmental conditions during the test (ISO 17025 7.5.1)
  // ---------------------------------------------------------------------

  // Saved area + snapshot on these result rows (also probes the columns).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void fetchResultEnvironmentByParamIds(paramRowIdsKey.split('|').filter(Boolean))
      .then(({ available, byId }) => {
        if (cancelled) return
        setEnvStatus(available ? 'available' : 'missing')
        if (!available) return
        setDraft((prev) =>
          prev.map((p) => {
            const saved = p.paramRowId ? byId[p.paramRowId] : undefined
            return saved ? { ...p, environmentAreaId: saved.areaId, environmentSnapshot: saved.snapshot } : p
          }),
        )
      })
      .catch(() => {
        // Unknown failure: do not block saving on it.
        if (!cancelled) setEnvStatus('missing')
      })
    return () => {
      cancelled = true
    }
  }, [open, paramRowIdsKey])

  // Active lab areas for the picker (entry mode only).
  useEffect(() => {
    if (!open || readOnly || envStatus !== 'available') return
    let cancelled = false
    void loadLabAreaOptions()
      .then((list) => {
        if (cancelled) return
        setLabAreas(list)
        setLabAreasError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLabAreasError(err instanceof Error ? err.message : 'Could not load lab areas')
      })
    return () => {
      cancelled = true
    }
  }, [open, readOnly, envStatus])

  const sectionAreaKey = (row?.sectionCode?.trim() || row?.department?.trim() || '').toLowerCase()

  /** Area options: active areas, plus a saved area that is no longer active. */
  const areaOptions = useMemo(() => {
    const list = [...labAreas]
    for (const p of draft) {
      const s = p.environmentSnapshot
      if (p.environmentAreaId && s && !list.some((a) => a.id === p.environmentAreaId)) {
        list.push({ id: p.environmentAreaId, code: s.area_code, name: `${s.area_name} (inactive)`, department: null })
      }
    }
    return list
  }, [labAreas, draft])

  /** Saved area of this section, else the last area used for the section on this browser. */
  const defaultEnvAreaId = useMemo(() => {
    const saved = draft.find((p) => p.environmentAreaId)?.environmentAreaId ?? ''
    if (saved && areaOptions.some((a) => a.id === saved)) return saved
    const remembered = readLastSectionArea(sectionAreaKey)
    return remembered && labAreas.some((a) => a.id === remembered) ? remembered : ''
  }, [draft, areaOptions, labAreas, sectionAreaKey])
  const envAreaId = envAreaChoice ?? defaultEnvAreaId
  const envArea = areaOptions.find((a) => a.id === envAreaId) ?? null
  const envActive = !readOnly && envStatus === 'available'

  const periodsKey = useMemo(
    () => [...new Set(draft.map((p) => testPeriodOf(p.testStartDate, p.testEndDate).key))].sort().join(','),
    [draft],
  )
  const envKey = `${envAreaId}#${periodsKey}`

  // Conditions for each test period in the chosen area (debounced while dates are typed).
  useEffect(() => {
    if (!open || readOnly || envStatus !== 'available' || !envAreaId || !periodsKey) return
    let cancelled = false
    const key = `${envAreaId}#${periodsKey}`
    const timer = window.setTimeout(() => {
      void fetchPeriodConditions(envAreaId, periodsKey)
        .then((conditions) => {
          if (cancelled) return
          setEnvState({ key, conditions })
          setEnvFetchError(null)
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setEnvFetchError({ key, message: err instanceof Error ? err.message : 'Could not read conditions' })
          }
        })
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, readOnly, envStatus, envAreaId, periodsKey])

  const envConditions = envState?.key === envKey ? envState.conditions : null
  const envError = envFetchError?.key === envKey ? envFetchError.message : null
  const envSignature = envConditions ? outOfLimitsSignature(envAreaId, envConditions) : ''
  const envSessionAck = envAck && envAck.signature === envSignature ? envAck.ack : null
  const envOutPeriods = envConditions
    ? Object.values(envConditions).filter((c): c is EnvironmentConditions => Boolean(c?.anyOutOfLimits))
    : []
  /** Parameters with results tested while a reading was out of limits and not yet acknowledged. */
  const envUnacknowledged = (conditions: Record<string, EnvironmentConditions | null>) =>
    draft.filter((p) => {
      if (!p.results?.trim()) return false
      const t = testPeriodOf(p.testStartDate, p.testEndDate)
      const c = conditions[t.key]
      return Boolean(c?.anyOutOfLimits) && !carriedAcknowledgement(p.environmentSnapshot, c as EnvironmentConditions, t)
    })
  const envCarriedAck = envConditions
    ? draft
        .map((p) => {
          const t = testPeriodOf(p.testStartDate, p.testEndDate)
          const c = envConditions[t.key]
          return c?.anyOutOfLimits ? carriedAcknowledgement(p.environmentSnapshot, c, t) : null
        })
        .find(Boolean) ?? null
    : null
  const envNeedsAck = Boolean(envConditions) && !envSessionAck && envOutPeriods.length > 0 &&
    (envUnacknowledged(envConditions ?? {}).length > 0 || !envCarriedAck)

  const askEnvironmentAck = async (
    conditions: Record<string, EnvironmentConditions | null>,
  ): Promise<ResultEnvironmentAcknowledgement | null> => {
    const out = Object.values(conditions).filter((c): c is EnvironmentConditions => Boolean(c?.anyOutOfLimits))
    const count = out.reduce((n, c) => n + c.outOfLimitCount, 0)
    const reason = await askReason({
      title: 'Environmental conditions outside limits during testing',
      recordLabel: `${envArea ? `${envArea.code} ${envArea.name}` : 'Lab area'} · ${count} reading${count === 1 ? '' : 's'} outside limits · Section ${row?.sectionCode?.trim() || '—'}`,
      description: 'State why the results remain valid. Recorded with each result (ISO/IEC 17025 7.5.1).',
      confirmLabel: 'Acknowledge',
      quickPicks: ENV_ACK_QUICK_PICKS,
    })
    if (!reason) return null
    const ack: ResultEnvironmentAcknowledgement = {
      reason,
      by: user?.id ?? '',
      by_name: profileName.trim() || user?.email || '',
      at: new Date().toISOString(),
    }
    setEnvAck({ signature: outOfLimitsSignature(envAreaId, conditions), ack })
    return ack
  }

  /**
   * Adds lab area + conditions snapshot to each parameter with a result.
   * Null = stop the save (fetch failed or the acknowledgement was cancelled).
   * Before migration 20261026100300 the draft is returned unchanged.
   */
  const withEnvironment = async (entries: SectionResultsDraft[]): Promise<SectionResultsDraft[] | null> => {
    setEnvSaveError(null)
    if (readOnly || envStatus !== 'available') return entries
    if (!envAreaId) {
      return entries.map((p) =>
        p.results?.trim() ? { ...p, environmentAreaId: null, environmentSnapshot: null } : p,
      )
    }
    let conditions = envConditions
    if (!conditions) {
      setEnvPreparing(true)
      try {
        conditions = await fetchPeriodConditions(envAreaId, periodsKey)
        setEnvState({ key: envKey, conditions })
      } catch (err) {
        setEnvSaveError(
          `Could not read the environmental conditions: ${err instanceof Error ? err.message : 'unknown error'}`,
        )
        return null
      } finally {
        setEnvPreparing(false)
      }
    }
    let ack =
      envAck && envAck.signature === outOfLimitsSignature(envAreaId, conditions) ? envAck.ack : null
    if (!ack && envUnacknowledged(conditions).length > 0) {
      ack = await askEnvironmentAck(conditions)
      if (!ack) {
        setEnvSaveError('Acknowledge the readings outside limits to save the results.')
        return null
      }
    }
    const capturedAt = new Date().toISOString()
    writeLastSectionArea(sectionAreaKey, envAreaId)
    return entries.map((p) => {
      if (!p.results?.trim()) return p
      const t = testPeriodOf(p.testStartDate, p.testEndDate)
      const c = conditions?.[t.key] ?? null
      if (!c) return { ...p, environmentAreaId: envAreaId, environmentSnapshot: null }
      const pAck = c.anyOutOfLimits ? (ack ?? carriedAcknowledgement(p.environmentSnapshot, c, t)) : null
      return { ...p, environmentAreaId: envAreaId, environmentSnapshot: snapshotFromConditions(c, capturedAt, pAck) }
    })
  }

  /** Saved conditions (read-only view), one line per area and period. */
  const savedEnvironmentLines = useMemo(() => {
    const seen = new Map<string, ResultEnvironmentSnapshot>()
    for (const p of draft) {
      const s = p.environmentSnapshot
      if (!s) continue
      const key = `${s.area_id}|${localDayOf(s.period_from)}|${localDayOf(s.period_to)}`
      if (!seen.has(key)) seen.set(key, s)
    }
    return [...seen.values()]
  }, [draft])

  const handleSaveClick = async () => {
    if (traceability !== 'available') {
      const withEnv = await withEnvironment(draft)
      if (withEnv) void onSave(withEnv)
      return
    }
    // Equipment / CRMs used is optional for now (lab decision 26 Oct 2026, until
    // the equipment records are complete); equipment that is chosen must still
    // be usable on the test date.
    const blocked: string[] = []
    const checked = draft.map((p) => {
      const items = refreshSnapshots(p, p.equipmentUsed ?? [])
      if (p.results?.trim()) {
        for (const s of equipmentSnapshotsOf(items)) {
          if (s.usable === false && !s.override_reason) {
            blocked.push(`${p.testLabel}: ${s.asset_code} ${s.name} (${s.reason ?? 'not usable'})`)
          }
        }
      }
      return { ...p, equipmentUsed: items }
    })
    if (blocked.length > 0) {
      setEquipmentError(
        `Not usable on the test date: ${blocked.join('; ')}.${
          isDirector ? ' Re-select the item to override with a reason.' : ' Only the Laboratory Director can override.'
        }`,
      )
      return
    }
    setEquipmentError(null)
    const next = await withEnvironment(checked)
    if (!next) return
    for (const p of next) {
      const snapshots = equipmentSnapshotsOf(p.equipmentUsed)
      if (snapshots.length > 0) {
        writeLastEquipmentSelection(
          equipmentParamKey(p),
          snapshots.map((s) => s.equipment_id),
        )
      }
    }
    setDraft(next)
    void onSave(next)
  }

  const pickerEntry = pickerIndex !== null ? draft[pickerIndex] : undefined

  const toggleRow = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = (checked: boolean) => {
    setSelectedKeys(checked ? new Set(draftKeys) : new Set())
  }

  const updateDraft = (index: number, patch: Partial<SectionResultsDraft>) => {
    setDraft((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  const handleDateChange = (index: number, field: BulkDateField, value: string) => {
    const nextValue = value || null
    updateDraft(index, { [field]: nextValue })
    // Only ask to fill all rows after a full date — incomplete years must not steal focus.
    if (value && isCompleteIsoDate(value) && draft.length > 1) {
      setBulkDatePrompt({ field, value })
    }
  }

  const applyBulkDate = () => {
    if (!bulkDatePrompt) return
    const { field, value } = bulkDatePrompt
    setDraft((prev) =>
      prev.map((p, i) => {
        const key = rowKeyAt(p, i)
        if (selectedKeys.size > 0 && !selectedKeys.has(key)) return p
        return { ...p, [field]: value }
      }),
    )
    setBulkDatePrompt(null)
  }

  const bulkDateLabel =
    bulkDatePrompt?.field === 'testStartDate' ? 'Test Start Date' : 'Test End Date'
  const bulkDateTargetCount = selectedKeys.size > 0 ? selectedCount : draft.length
  const bulkDateTargetLabel =
    selectedKeys.size > 0
      ? `${bulkDateTargetCount} selected parameter${bulkDateTargetCount === 1 ? '' : 's'}`
      : `all ${draft.length} parameters`

  const sectionLabel = row?.sectionCode?.trim() || '—'

  const handleAddTestsConfirm = async (change: SectionTestSelectionChange) => {
    if (!onAddTests) return
    setAddingTests(true)
    try {
      await onAddTests(change)
    } finally {
      setAddingTests(false)
    }
  }

  const openEditSpec = (entry: SectionParameterEntry) => {
    setEditSpecEntry(entry)
    setEditSpecValue(
      toProperRequirementText(
        entry.specificRequirement?.trim() || entry.sectionSpecOverride?.trim() || '',
      ),
    )
    setEditSpecError(null)
    setEditSpecOpen(true)
  }

  const openParameterDetails = (entry: SectionParameterEntry) => {
    if (onViewTestParameter) {
      onViewTestParameter(entry.testLabel)
      return
    }
    if (!readOnly && onUpdateSpecificRequirement && entry.testParameterId) {
      openEditSpec(entry)
    }
  }

  const saveEditSpec = async () => {
    if (!editSpecEntry || !onUpdateSpecificRequirement) return
    setEditSpecSaving(true)
    setEditSpecError(null)
    try {
      const next = await onUpdateSpecificRequirement(
        editSpecEntry,
        toProperRequirementText(editSpecValue).trim(),
      )
      setDraft((prev) =>
        prev.map((p) =>
          p.testLabel === editSpecEntry.testLabel && p.paramRowId === editSpecEntry.paramRowId
            ? {
                ...p,
                sectionSpecOverride: next.sectionSpecOverride,
                specificRequirement: next.specificRequirement,
              }
            : p,
        ),
      )
      setEditSpecOpen(false)
      setEditSpecEntry(null)
      setEditSpecValue('')
    } catch (err) {
      setEditSpecError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setEditSpecSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleParentOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer={layer}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(dialogShellClass, layer !== 'default' && '!z-[60]')}
        showCloseButton={!nestedDialogOpen}
        onPointerDownOutside={(e) => {
          if (insideReasonDialog(e)) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          if (insideReasonDialog(e)) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (insideReasonDialog(e)) e.preventDefault()
        }}
      >
        <div className="relative shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-col gap-2 pr-10 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <DialogHeader className="shrink-0 space-y-0 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {readOnly ? readOnlyTitle : 'Enter Results'} — Section {sectionLabel}
              </DialogTitle>
            </DialogHeader>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {row ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn('gap-1.5', limsDarkBarBtnClass)}
                  onClick={() => setSampleDetailsOpen(true)}
                  disabled={saving}
                  aria-label="View sample description and declared value"
                  title="Sample Description & Customer Declaration"
                >
                  <FileText size={14} />
                  Sample Details
                </Button>
              ) : null}
              {!readOnly && onAddTests ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn('gap-1.5', limsDarkBarBtnClass)}
                  onClick={() => setAddTestOpen(true)}
                  disabled={saving || addingTests}
                >
                  <Plus size={14} />
                  Manage Tests
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {envStatus === 'available' && (envActive || readOnly) ? (
          <div className="shrink-0 border-b-2 border-stone-500 bg-[#fffaf0] px-4 py-2 text-xs text-[#292524] sm:px-5">
            {readOnly ? (
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                <span className="font-semibold uppercase tracking-wide text-[11px] text-stone-600">
                  Environmental conditions
                </span>
                {savedEnvironmentLines.length === 0 ? (
                  <span className="text-stone-500">Not recorded</span>
                ) : (
                  <ul className="min-w-0 flex-1 space-y-0.5">
                    {savedEnvironmentLines.map((s) => (
                      <li key={`${s.area_id}-${s.period_from}-${s.period_to}`} className="break-words">
                        <span className="font-medium">
                          {s.area_name || s.area_code}
                          {s.area_code && s.area_name ? ` (${s.area_code})` : ''}
                        </span>{' '}
                        · {formatDateDisplay(localDayOf(s.period_from))} – {formatDateDisplay(localDayOf(s.period_to))}:{' '}
                        <span
                          className={cn(
                            s.reading_count === 0 && 'text-amber-800',
                            s.any_out_of_limits && 'font-medium text-red-700',
                          )}
                        >
                          {formatEnvironmentSnapshotSummary(s)}
                        </span>
                        {s.acknowledgement?.reason ? (
                          <span className="block text-amber-800">
                            Acknowledged by {s.acknowledgement.by_name || '—'}: {s.acknowledgement.reason}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor="section-results-env-area"
                    className="font-semibold uppercase tracking-wide text-[11px] text-stone-600"
                  >
                    Lab area (environment)
                  </label>
                  <select
                    id="section-results-env-area"
                    className={cn(limsFieldClass, 'h-8 min-w-[14rem] rounded-sm px-2 text-xs')}
                    value={envAreaId}
                    onChange={(e) => {
                      setEnvAreaChoice(e.target.value)
                      setEnvSaveError(null)
                    }}
                    disabled={saving || envPreparing}
                  >
                    <option value="">— Select lab area —</option>
                    {areaOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </select>
                  {labAreasError ? <span className="text-red-700">{labAreasError}</span> : null}
                  {!labAreasError && labAreas.length === 0 ? (
                    <span className="text-stone-500">No lab areas defined yet (Environment → Areas).</span>
                  ) : null}
                  {!envAreaId && labAreas.length > 0 ? (
                    <span className="text-stone-500">Choose where the tests were done to record the conditions.</span>
                  ) : null}
                </div>
                {envAreaId ? (
                  envError ? (
                    <p className="text-red-700" role="alert">
                      Could not read the environmental conditions: {envError}
                    </p>
                  ) : !envConditions ? (
                    <p className="text-stone-500">Reading environmental conditions…</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {periodsFromKey(periodsKey).map((t) => {
                        const c = envConditions[t.key]
                        return (
                          <li key={t.key} className="break-words">
                            <span className="text-stone-600">
                              {formatDateDisplay(t.startDate)}
                              {t.endDate !== t.startDate ? ` – ${formatDateDisplay(t.endDate)}` : ''}:
                            </span>{' '}
                            {!c ? (
                              <span className="text-amber-800">Conditions not available for this area.</span>
                            ) : c.readingCount === 0 ? (
                              <span className="font-medium text-amber-800">
                                No environmental readings recorded for this period
                              </span>
                            ) : (
                              <span className={cn(c.anyOutOfLimits && 'font-medium text-red-700')}>
                                {formatEnvironmentSnapshotSummary(snapshotFromConditions(c, '', null))}
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )
                ) : null}
                {envOutPeriods.length > 0 ? (
                  envNeedsAck ? (
                    <div className="flex flex-wrap items-center gap-2 text-red-700" role="alert">
                      <span className="font-medium">
                        Readings outside the area limits during testing. Acknowledge them (with a reason) before saving.
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-none border-red-600 px-2 text-[11px] text-red-700"
                        onClick={() => {
                          if (envConditions) void askEnvironmentAck(envConditions)
                        }}
                        disabled={saving}
                      >
                        Acknowledge
                      </Button>
                    </div>
                  ) : (
                    <p className="text-amber-800">
                      Readings outside limits acknowledged: {(envSessionAck ?? envCarriedAck)?.reason}
                    </p>
                  )
                ) : null}
                {envSaveError ? (
                  <p className="font-medium text-red-700" role="alert">
                    {envSaveError}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto bg-[#f7f3eb] p-4 sm:p-5">
          <div className="min-h-full overflow-hidden border-2 border-stone-500 bg-[#f7f3eb] shadow-sm ring-1 ring-amber-700/20">
            <div className={cn(RESULTS_GRID_COLS, 'sticky top-0 z-10 bg-stone-800')}>
              <div className={cn(headCellClass, 'text-center')}>
                <input
                  type="checkbox"
                  className={checkboxClass}
                  aria-label="Select all parameters"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = !allChecked && someChecked
                  }}
                  onChange={(e) => toggleAll(e.target.checked)}
                  disabled={draft.length === 0}
                />
              </div>
              <div className={cn(headCellClass, 'justify-start text-left')}>Test Parameter</div>
              <div className={headCellClass}>Unit</div>
              <div className={headCellClass}>Specified Requirement</div>
              <div className={headCellClass}>Test Start Date</div>
              <div className={headCellClass}>Test End Date</div>
              <div className={headCellClass}>Results</div>
              <div className={headCellClass}>Equipment</div>
              <div className={headCellClass}>NABL Scope</div>
            </div>

            {draft.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#57534e]">
                No test parameters for this section.
              </p>
            ) : (
              draft.map((p, index) => {
                const resultsDisplay = formatTestResultForTable(p.results)
                const resultsTitle = formatTestResultDisplay(p.results)
                const key = rowKeyAt(p, index)
                const canViewDetails =
                  Boolean(onViewTestParameter) ||
                  (!readOnly && Boolean(onUpdateSpecificRequirement && p.testParameterId))
                const clauseLine = formatTestParamClauseLine(p, row?.isCodeLabel)

                return (
                  <div
                    key={`${p.paramRowId ?? 'new'}-${p.testLabel}-${index}`}
                    className={cn(RESULTS_GRID_COLS, index % 2 === 0 ? rowEvenClass : rowOddClass)}
                  >
                    <div className={cn(cellClass, 'justify-center')}>
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select ${p.testLabel}`}
                        checked={selectedKeys.has(key)}
                        onChange={() => toggleRow(key)}
                      />
                    </div>
                    <div className={cn(cellClass, 'items-start justify-start gap-1 text-left')}>
                      <div className="min-w-0 flex-1">
                        <span
                          className="block break-words text-[12.5px] font-semibold text-[#1c1917]"
                          title={p.testLabel}
                        >
                          {p.testLabel}
                        </span>
                        {clauseLine ? (
                          <span className="mt-0.5 block text-[11px] font-normal text-[#57534e]">
                            {clauseLine}
                          </span>
                        ) : null}
                      </div>
                      {canViewDetails ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className={cn(eyeBtnClass, 'mt-0.5')}
                          aria-label={`View parameter details for ${p.testLabel}`}
                          title="View full test parameter details"
                          onClick={() => openParameterDetails(p)}
                          disabled={saving || editSpecSaving}
                        >
                          <Eye size={14} strokeWidth={2.25} />
                        </Button>
                      ) : null}
                    </div>
                    <div className={cn(cellClass, 'justify-center text-center text-[#57534e]')}>
                      {p.unitValue?.trim() || '—'}
                    </div>
                    <div className={cn(cellClass, 'justify-center text-center')}>
                      <span
                        className="w-full break-words whitespace-pre-wrap text-center text-[#57534e]"
                        title={
                          p.specificRequirement?.trim()
                            ? toProperRequirementText(p.specificRequirement)
                            : undefined
                        }
                      >
                        {p.specificRequirement?.trim()
                          ? toProperRequirementText(p.specificRequirement)
                          : '—'}
                      </span>
                    </div>
                    <div className={cn(cellClass, 'justify-center text-center')}>
                      {readOnly ? (
                        <span className="break-words text-center">
                          {formatDateDisplay(p.testStartDate)}
                        </span>
                      ) : (
                        <Input
                          type="date"
                          className={dateInputClass}
                          value={toDateInput(p.testStartDate)}
                          onChange={(e) => handleDateChange(index, 'testStartDate', e.target.value)}
                          onDoubleClick={() => {
                            updateDraft(index, {
                              testStartDate: new Date().toISOString().slice(0, 10),
                            })
                          }}
                        />
                      )}
                    </div>
                    <div className={cn(cellClass, 'justify-center text-center')}>
                      {readOnly ? (
                        <span className="break-words text-center">
                          {formatDateDisplay(p.testEndDate)}
                        </span>
                      ) : (
                        <Input
                          type="date"
                          className={dateInputClass}
                          value={toDateInput(p.testEndDate)}
                          onChange={(e) => handleDateChange(index, 'testEndDate', e.target.value)}
                          onDoubleClick={() => {
                            updateDraft(index, {
                              testEndDate: new Date().toISOString().slice(0, 10),
                            })
                          }}
                        />
                      )}
                    </div>
                    <div className={cn(cellClass, 'min-w-0 flex-col items-stretch justify-center text-center')}>
                      {(() => {
                        const meta = (
                          <ResultObservationMeta
                            className={readOnly ? undefined : "mt-0 w-auto before:text-stone-400 before:content-['|']"}
                            sampleId={row?.sampleId ?? null}
                            paramRowId={p.paramRowId}
                            testLabel={p.testLabel}
                            stamp={p.paramRowId ? entryStamps?.[p.paramRowId] : null}
                            attachments={(p.paramRowId && resultAttachments?.[p.paramRowId]) || []}
                            attachmentsAvailable={resultAttachments !== null}
                            canAttach={!readOnly && row?.sampleStage !== 'completed'}
                            onAttachmentsChange={(next) => {
                              const id = p.paramRowId
                              if (!id) return
                              setResultAttachments((prev) => ({ ...(prev ?? {}), [id]: next }))
                            }}
                          />
                        )
                        return readOnly ? (
                          <>
                            <span
                              className="w-full break-words whitespace-pre-wrap text-center leading-relaxed"
                              title={resultsTitle || undefined}
                            >
                              {resultsDisplay || '—'}
                            </span>
                            {meta}
                          </>
                        ) : (
                          <TestResultsEntryCell
                            value={p.results}
                            testLabel={p.testLabel}
                            sectionCompareSources={buildSectionCompareSources(
                              sectionCompareItems,
                              paramKeyFromRow(p.paramRowId, p.testLabel),
                            )}
                            onChange={(next) => updateDraft(index, { results: next })}
                            footer={meta}
                          />
                        )
                      })()}
                    </div>
                    <div className={cn(cellClass, 'min-w-0 flex-col items-stretch justify-center gap-1 text-left')}>
                      {traceability === 'missing' ? (
                        <span className="text-center text-[11px] text-stone-500">—</span>
                      ) : readOnly ? (
                        (p.equipmentUsed ?? []).length === 0 ? (
                          <span className="text-center text-[11px] text-stone-500">
                            {traceability === 'unknown' ? '…' : 'Not recorded'}
                          </span>
                        ) : (
                          <ul className="space-y-0.5 text-[11px] leading-snug">
                            {(p.equipmentUsed ?? []).map((s) =>
                              isNoEquipmentEntry(s) ? (
                                <li key="none" className="break-words">
                                  <span className="font-medium">No equipment used</span>
                                  {s.reason.trim() ? (
                                    <span className="block text-stone-600">{s.reason.trim()}</span>
                                  ) : null}
                                </li>
                              ) : (
                              <li key={s.equipment_id} className="break-words">
                                {formatEquipmentUsed(s)}
                                {s.override_reason ? (
                                  <span
                                    className="block text-amber-800"
                                    title={`${s.reason ?? ''} · ${s.override_by_name ?? ''}`}
                                  >
                                    Director override: {s.override_reason}
                                  </span>
                                ) : null}
                              </li>
                              ),
                            )}
                          </ul>
                        )
                      ) : (
                        (() => {
                          const used = p.equipmentUsed ?? []
                          const disabled = saving || traceability !== 'available'
                          if (!equipmentUsedIsRecorded(used)) {
                            return (
                              <div className="flex justify-center">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 rounded-none border-stone-500"
                                  aria-label={`Add equipment / CRMs for ${p.testLabel}`}
                                  title="Add equipment / CRMs used (optional)"
                                  onClick={() => {
                                    setPickerMode('edit')
                                    setPickerIndex(index)
                                  }}
                                  disabled={disabled}
                                >
                                  <Wrench className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )
                          }
                          const items = equipmentSnapshotsOf(used)
                          const notUsable = items.some((s) => s.usable === false && !s.override_reason)
                          const count = isNoEquipmentEntry(used[0]) ? 0 : items.length
                          return (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={cn(
                                'h-auto min-h-8 w-full min-w-0 gap-1 whitespace-normal rounded-none border-stone-500 px-2 py-1 text-[11px]',
                                notUsable && 'border-red-600 text-red-700',
                              )}
                              title={`${used.map((s) => formatEquipmentUsed(s)).join('\n')}\n\nClick to view · double-click to edit`}
                              onClick={() => {
                                if (viewClickTimerRef.current) window.clearTimeout(viewClickTimerRef.current)
                                viewClickTimerRef.current = window.setTimeout(() => {
                                  viewClickTimerRef.current = null
                                  setPickerMode('view')
                                  setPickerIndex(index)
                                }, 250)
                              }}
                              onDoubleClick={() => {
                                if (viewClickTimerRef.current) window.clearTimeout(viewClickTimerRef.current)
                                viewClickTimerRef.current = null
                                setPickerMode('edit')
                                setPickerIndex(index)
                              }}
                              disabled={disabled}
                            >
                              <Eye className="h-3.5 w-3.5 shrink-0" />
                              {count > 0 ? `View (${count})` : 'View · no equipment'}
                            </Button>
                          )
                        })()
                      )}
                    </div>
                    <div className={cn(cellClass, 'justify-center text-center')}>
                      {(() => {
                        if (!p.testParameterId) return 'Not linked to master'
                        const scope = nablScopeByParameterId[p.testParameterId]
                        const outsideRange = p.nablScopeOverride === 'Non NABL'
                        if (scope === 'NABL' && !readOnly && scopeOverrideStatus === 'available') {
                          // A result outside the accredited range is reported as Non-NABL; never the other way.
                          return (
                            <select
                              aria-label={`NABL scope for ${p.testLabel}`}
                              title="Choose Non NABL when this result is outside the range the laboratory is accredited for"
                              className={cn(
                                'h-8 w-full min-w-0 rounded-none border bg-white px-1 text-[11px]',
                                outsideRange ? 'border-amber-700 text-amber-900' : 'border-stone-500',
                              )}
                              value={outsideRange ? 'Non NABL' : 'NABL'}
                              disabled={saving}
                              onChange={(e) => {
                                scopeTouchedRef.current.add(p.paramRowId || p.testLabel)
                                updateDraft(index, {
                                  nablScopeOverride: e.target.value === 'Non NABL' ? 'Non NABL' : null,
                                })
                              }}
                            >
                              <option value="NABL">NABL</option>
                              <option value="Non NABL">Non NABL</option>
                            </select>
                          )
                        }
                        if (scope === 'NABL' && outsideRange) {
                          return (
                            <span className="text-amber-900">
                              Non NABL
                              <span className="block text-[10px] text-stone-600">outside accredited range</span>
                            </span>
                          )
                        }
                        // Same words as the Test Parameter master (accreditation bodies "NABL" / "Non NABL").
                        if (scope === 'NABL' || scope === 'Non NABL') return scope
                        if (scope) return scope
                        if (nablScopeLoadError) return 'Unable to determine'
                        return nablScopeLoading ? 'Loading…' : 'Master unavailable'
                      })()}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="relative shrink-0 overflow-hidden border-t-2 border-stone-600 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white sm:px-5">
          <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-xs text-stone-300">Selected: {selectedCount}</span>
              {traceability === 'missing' ? (
                <span className="text-[11px] text-amber-200">
                  Equipment used is not recorded yet: the database update for equipment traceability
                  (20261026100100) is pending.
                </span>
              ) : null}
              {equipmentError ? (
                <span className="text-[11px] font-medium text-red-300" role="alert">
                  {equipmentError}
                </span>
              ) : null}
            </div>
            {!readOnly ? (
              <Button
                type="button"
                className={cn('h-8', limsPrimaryBtnClass)}
                onClick={() => void handleSaveClick()}
                disabled={saving || envPreparing || draft.length === 0}
              >
                {saving ? 'Saving…' : envPreparing ? 'Checking conditions…' : 'Save & Close'}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className={limsDarkBarBtnClass}
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Close
              </Button>
            )}
          </div>
        </div>
      </DialogContent>

      <Dialog
        open={bulkDatePrompt !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setBulkDatePrompt(null)
        }}
      >
        <DialogContent className={cn(limsDialogClass, 'max-w-sm p-0')} layer="nested">
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-8 text-left">
              <DialogTitle className="text-base font-semibold text-white">
                Populate {bulkDateLabel}?
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="space-y-4 bg-[#f7f3eb] px-4 py-4">
            <DialogDescription className="text-[#57534e]">
              Apply{' '}
              <span className="font-medium text-[#1c1917]">
                {bulkDatePrompt ? formatDateDisplay(bulkDatePrompt.value) : '—'}
              </span>{' '}
              as {bulkDateLabel} for {bulkDateTargetLabel} in this section?
            </DialogDescription>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="rounded-none border-stone-500"
                onClick={() => setBulkDatePrompt(null)}
              >
                Cancel
              </Button>
              <Button type="button" className={limsPrimaryBtnClass} onClick={applyBulkDate}>
                OK
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {!readOnly && pickerEntry ? (
        <EquipmentUsedPickerDialog
          key={`${pickerIndex}-${pickerEntry.paramRowId ?? pickerEntry.testLabel}`}
          open
          onOpenChange={(next) => {
            if (!next) setPickerIndex(null)
          }}
          testLabel={pickerEntry.testLabel}
          testDate={testDateOf(pickerEntry)}
          section={row?.department ?? null}
          options={equipmentOptions}
          loading={equipmentLoading}
          loadError={equipmentLoadError}
          initial={pickerEntry.equipmentUsed ?? []}
          suggestedIds={readLastEquipmentSelection(equipmentParamKey(pickerEntry))}
          isDirector={isDirector}
          directorId={user?.id ?? ''}
          directorName={profileName.trim() || user?.email || ''}
          askReason={askReason}
          canApplyToOthers={draft.length > 1}
          onConfirm={handlePickerConfirm}
          mode={pickerMode}
        />
      ) : null}

      <SectionSampleDescViewDialog
        row={row}
        open={sampleDetailsOpen}
        onOpenChange={setSampleDetailsOpen}
      />

      {!readOnly && onAddTests ? (
        <AddSectionTestDialog
          open={addTestOpen}
          onOpenChange={setAddTestOpen}
          row={row}
          existingDraft={draft}
          onConfirm={handleAddTestsConfirm}
          saving={addingTests}
        />
      ) : null}

      <Dialog open={editSpecOpen} onOpenChange={setEditSpecOpen}>
        <DialogContent
          className={cn(
            limsDialogClass,
            '!max-w-md !gap-0 !p-0',
            'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
          )}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          portalClassName="lg:left-[268px]"
          layer="nested"
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-8 text-left">
              <DialogTitle className="text-base font-semibold text-white">
                Edit Specified Requirements — Section {sectionLabel}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="space-y-4 bg-[#f7f3eb] px-4 py-4">
            {editSpecEntry?.testLabel ? (
              <p className="text-sm font-medium text-[#1c1917]">{editSpecEntry.testLabel}</p>
            ) : null}
            <div className="space-y-2">
              <Label
                htmlFor="section-results-edit-spec-value"
                className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
              >
                Specified Requirement
              </Label>
              <Textarea
                id="section-results-edit-spec-value"
                rows={3}
                value={editSpecValue}
                onChange={(e) => setEditSpecValue(e.target.value)}
                placeholder="e.g. 0.30 Maximum"
                className="rounded-none border-stone-500 bg-stone-50"
                disabled={editSpecSaving}
              />
            </div>
            {editSpecError ? <p className="text-sm text-red-700">{editSpecError}</p> : null}
          </div>
          <DialogFooter className="relative gap-2 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 sm:justify-end">
            <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, 'relative min-w-[8.5rem]')}
              onClick={() => void saveEditSpec()}
              disabled={editSpecSaving}
            >
              {editSpecSaving ? 'Saving…' : 'Save & Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
