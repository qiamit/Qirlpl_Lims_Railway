import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Ban, CheckCircle2, Circle, FileDown, Loader2, Save, Send, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { loadEquipmentOptions, snapshotFromOption, type EquipmentOption, type EquipmentUsedSnapshot } from '@/lib/equipmentTraceability'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { limsDeleteBtnClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import { EnvPanel, MessageLine } from '@/features/environment/EnvironmentUi'
import { useModuleAccessOptional } from '@/features/settings/module-access/ModuleAccessProvider'
import { AnalysisStatusBadge, ComingLaterChip, IndicativeBadge, MetallographyMissingNotice } from '../MetallographyUi'
import { ringSummaryComplete } from '../engines/ringTest/ringMaths'
import { RING_TEST_ENGINE_VERSION, scaleToMmPerPx, type Annotation, type GrayImage, type Mark, type OperatorAdjustments, type RingGeometry, type RingTestSummary, type ScaleInput } from '../engines/types'
import { formatMetallographyResult } from '../formatResult'
import {
  addFieldFromFile,
  completeAnalysis,
  deleteField,
  excludeField,
  fetchMetallographyPermissions,
  getAnalysis,
  includeField,
  listUsableCalibrations,
  metallographyErrorText,
  nextFieldNo,
  updateAnalysis,
  updateField,
  voidAnalysis,
} from '../metallographyApi'
import { assertImagePixels, assertMetallographyImage, removeObjects, uploadOverlayPng } from '../metallographyStorage'
import {
  ANALYSIS_KIND_LABEL,
  AVAILABLE_ANALYSIS_KINDS,
  RING_TEST_DEFAULT_SETTINGS,
  type Analysis,
  type AnalysisDetail,
  type AnalysisField,
  type AnalysisUpdateInput,
  type DisplaySettings,
  type FieldMarks,
  type InImageScale,
  type MetallographyPermissions,
  type MetallographyUseResult,
  type RingTestMethodSettings,
  type ScaleCalibration,
} from '../types'
import { MetallographyAnalysisView } from '../view/MetallographyAnalysisView'
import { printMetallographyWorksheet } from '../worksheet/metallographyWorksheetHtml'
import { FieldStrip } from './FieldStrip'
import { ImageEditToolbar, type StageTool } from './ImageEditToolbar'
import { ImageStage } from './ImageStage'
import { ResultPanel } from './ResultPanel'
import { ScalePanel, type ScaleDraft, type ScaleMode } from './ScalePanel'
import { displayForSave, fitDisplay, normalizeDisplay, resetDisplay, zoomAt, type Display } from './displayAdjustments'
import {
  checkFieldOriginals,
  decodeToGray,
  inImageMmPerPx,
  LAYER_COLORS,
  nonRingMarks,
  objectUrlFor,
  readImageSize,
  releaseObjectUrls,
  renderOverlayPng,
  withNonRingMarks,
  withRingMarks,
  type FieldMedia,
} from './imageCanvasUtils'
import { RingTestPanel } from './panels/RingTestPanel'
import { ringGeometryFromMarks } from './panels/ring/ringMarks'

/**
 * S2 workbench (full page) and S2d (the same component in the Enter Results
 * dialog), design 3.3. Steps: Image → Scale & equipment → Analyse → Review
 * marks → Complete → Use result.
 *
 *  - Left: fields (upload original: checked, SHA-256 in the browser, stored
 *    unchanged; re-hashed on every open with a red banner on mismatch).
 *  - Centre: the analysis-kind panel (ring test in Phase 1, the other kinds
 *    "coming later") and the image stage (zoom / pan, view-only brightness /
 *    contrast, scale bar, ROI and exclusion polygons, marks, annotations).
 *  - Right: scale and equipment, then the result panel.
 *  - Actions: Save draft, Complete (checked again by the database), Void,
 *    Print worksheet; once completed the read-only view (Supersede, Void,
 *    Re-check) and, in the dialog, Use result.
 *
 * When the analysis is not in progress the workbench renders
 * MetallographyAnalysisView.
 */

const ANALYSES_PATH = '/metallography/analyses'

export type MetallographyWorkbenchProps = {
  analysisId: string
  mode: 'page' | 'dialog'
  /** Forced read-only (review screens). Otherwise read-only when status !== 'in_progress' or no edit right. */
  readOnly?: boolean
  /** Dialog mode only: hand the result back to Enter Results. */
  onUseResult?: (r: MetallographyUseResult) => void
  /** Dialog mode: close. Page mode: ignored. */
  onClose?: () => void
  /** Dialog mode: the analysis shown changed (supersede opened the new one). */
  onAnalysisChange?: (id: string) => void
}

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'notfound' }
  | { status: 'error'; message: string }
  | { status: 'ok'; detail: AnalysisDetail; permissions: MetallographyPermissions }

const isRingSummary = (s: unknown): s is RingTestSummary => Boolean(s) && (s as { kind?: unknown }).kind === 'ring_test'

/** Result payload for Enter Results: reported_value unchanged, equipment to pre-select. */
function resultForEnterResults(a: Analysis): MetallographyUseResult | null {
  if (a.status !== 'completed' || !a.reportedValue) return null
  if (a.kind === 'ring_test' && !(isRingSummary(a.resultSummary) && ringSummaryComplete(a.resultSummary))) return null
  return {
    results: a.reportedValue,
    metallographyAnalysisId: a.id,
    suggestedEquipmentIds: [a.microscopeEquipmentId, a.cameraEquipmentId, a.inImageScale?.ruler_equipment_id ?? null].filter(
      (x): x is string => Boolean(x),
    ),
    indicative: a.indicative,
  }
}

/** Analysis with fields and context, plus the caller's metallography rights. */
async function fetchWorkbenchState(id: string): Promise<LoadState> {
  try {
    const [res, perms] = await Promise.all([getAnalysis(id), fetchMetallographyPermissions()])
    if (res.status === 'missing' || perms.status === 'missing') return { status: 'missing' }
    if (!res.data) return { status: 'notfound' }
    return { status: 'ok', detail: res.data, permissions: perms.data }
  } catch (e) {
    return { status: 'error', message: metallographyErrorText(e) }
  }
}

export function MetallographyWorkbench(props: MetallographyWorkbenchProps) {
  const { analysisId, mode, readOnly, onUseResult, onClose, onAnalysisChange } = props
  const navigate = useNavigate()
  const [currentId, setCurrentId] = useState(analysisId)
  const [prevPropId, setPrevPropId] = useState(analysisId)
  if (prevPropId !== analysisId) {
    setPrevPropId(analysisId)
    setCurrentId(analysisId)
  }
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const seqRef = useRef(0)

  const load = useCallback(async () => {
    const seq = ++seqRef.current
    const next = await fetchWorkbenchState(currentId)
    if (seq === seqRef.current) setState(next)
  }, [currentId])

  useEffect(() => {
    const seq = ++seqRef.current
    void fetchWorkbenchState(currentId).then((next) => {
      if (seq === seqRef.current) setState(next)
    })
  }, [currentId])

  /** Supersede / void from the view: open the new analysis, or reload. */
  const onChanged = (next: Analysis) => {
    if (next.id === currentId) {
      void load()
      return
    }
    if (mode === 'page') navigate(`${ANALYSES_PATH}/${next.id}`)
    else {
      setCurrentId(next.id)
      onAnalysisChange?.(next.id)
    }
  }

  if (state.status === 'loading') {
    return (
      <p className="flex items-center gap-2 p-3 text-[13px] text-stone-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading analysis…
      </p>
    )
  }
  if (state.status === 'missing') return <MetallographyMissingNotice />
  if (state.status === 'notfound') return <MessageLine tone="error" text="Analysis not found, or you cannot see it." />
  if (state.status === 'error') return <MessageLine tone="error" text={state.message} />

  const a = state.detail.analysis
  if (a.status !== 'in_progress') {
    const result = resultForEnterResults(a)
    return (
      <div className="space-y-3">
        {mode === 'dialog' && onUseResult && !readOnly ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-2 border-amber-600/60 bg-amber-50 px-3 py-2 text-[13px]">
            <span>
              {result
                ? `${a.analysisNo} is completed. Use its result in Enter Results.`
                : a.status === 'completed'
                  ? 'This analysis has no complete reported value.'
                  : `${a.analysisNo} is ${a.status}; its result cannot be used.`}
            </span>
            <button
              type="button"
              disabled={!result}
              className={cn(limsPrimaryBtnClass, 'inline-flex items-center gap-1.5 text-[12.5px]')}
              onClick={() => {
                if (!result) return
                onUseResult(result)
                onClose?.()
              }}
            >
              <Send className="h-4 w-4" /> Use result
            </button>
          </div>
        ) : null}
        {mode === 'page' && a.status === 'completed' && a.paramRowId && state.detail.context?.linkedAnalysisId !== a.id ? (
          <MessageLine text={`To report this result, open the parameter in Enter Results: it shows "${a.analysisNo} completed — Use result".`} />
        ) : null}
        <MetallographyAnalysisView key={a.id} analysisId={a.id} allowRecheck={!(mode === 'dialog' && onUseResult)} onChanged={onChanged} />
      </div>
    )
  }

  return (
    <WorkbenchEditor
      key={a.id}
      detail={state.detail}
      permissions={state.permissions}
      mode={mode}
      forcedReadOnly={Boolean(readOnly)}
      reload={load}
    />
  )
}

// ---------------------------------------------------------------------------
// Editor (analysis in progress)
// ---------------------------------------------------------------------------

type FieldEdit = {
  display?: Display
  adjustments?: OperatorAdjustments
  annotations?: Annotation[]
  marks?: FieldMarks
}

type RingState = { geometry: RingGeometry; marks: Mark[]; summary: RingTestSummary | null; dNominalMm: number | null }

type Decoded = { fieldId: string; blob: Blob; width: number; height: number; gray: GrayImage }

type Busy = null | 'save' | 'complete' | 'void' | 'upload' | 'field' | 'print'

function Steps({ items }: { items: Array<{ label: string; done: boolean }> }) {
  const current = items.findIndex((s) => !s.done)
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[11.5px]" aria-label="Steps">
      {items.map((s, i) => (
        <li
          key={s.label}
          className={cn(
            'inline-flex items-center gap-1 border px-2 py-0.5',
            s.done ? 'border-emerald-700/40 bg-emerald-50 text-emerald-900' : i === current ? 'border-amber-600 bg-amber-50 font-semibold text-amber-950' : 'border-stone-300 bg-stone-50 text-stone-500',
          )}
          aria-current={i === current ? 'step' : undefined}
        >
          {s.done ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
          {s.label}
        </li>
      ))}
    </ol>
  )
}

function WorkbenchEditor({
  detail,
  permissions,
  mode,
  forcedReadOnly,
  reload,
}: {
  detail: AnalysisDetail
  permissions: MetallographyPermissions
  mode: 'page' | 'dialog'
  forcedReadOnly: boolean
  reload: () => Promise<void>
}) {
  const a = detail.analysis
  const snap = a.methodSnapshot
  const fields = detail.fields
  const { user, designation, profileName } = useAuth()
  const isDirector = isLaboratoryDirector(designation)
  const moduleAccess = useModuleAccessOptional()
  const canEditModule = !moduleAccess || moduleAccess.loading || moduleAccess.canEditPath(ANALYSES_PATH)
  const ask = useReasonForChange()

  const isAnalyst = Boolean(user && a.performedBy === user.id)
  const locked = detail.context?.locked ?? false
  const canEdit = !forcedReadOnly && permissions.canRun && canEditModule && (isAnalyst || isDirector) && (!locked || isDirector)
  const readOnly = !canEdit

  const kindAvailable = AVAILABLE_ANALYSIS_KINDS.has(a.kind)
  const isRing = a.kind === 'ring_test'
  const allowInImage = snap?.scale_mode === 'in_image_reference'
  const settings = useMemo(
    () => ({ ...RING_TEST_DEFAULT_SETTINGS, ...(snap?.settings ?? {}) }) as RingTestMethodSettings,
    [snap],
  )
  const ringDefaults = useMemo(
    () => ({ angularCorrectionDeg: settings.angular_correction_deg, outerGapPx: settings.outer_gap_px, innerGapPx: settings.inner_gap_px }),
    [settings],
  )

  // ---- Draft state (initialised once from the record; the editor is keyed by analysis id)
  const [draft, setDraft] = useState<ScaleDraft>(() => ({
    scaleCalibrationId: a.scaleCalibrationId,
    inImageScale: a.inImageScale,
    magnification: a.magnification ?? '',
    etchant: a.etchant ?? '',
    specimenPrep: a.specimenPrep ?? {},
    testDate: a.testDate,
  }))
  const [scaleMode, setScaleMode] = useState<ScaleMode>(() =>
    a.scaleCalibrationId ? 'calibration' : a.inImageScale || allowInImage ? (allowInImage ? 'in_image' : 'calibration') : 'calibration',
  )
  const [edits, setEdits] = useState<Record<string, FieldEdit>>({})
  const [ring, setRing] = useState<RingState | null>(null)
  const [dNominalMm, setDNominalMm] = useState<number | null>(() => {
    const p = a.engineParams?.d_nominal_mm
    if (typeof p === 'number' && p > 0) return p
    return isRingSummary(a.resultSummary) ? (a.resultSummary.d_nominal_mm ?? a.resultSummary.d_mm) : null
  })
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' | 'ok' } | null>(null)

  // ---- Stage state
  const [activeFieldId, setActiveFieldId] = useState<string | null>(() => (fields.find((f) => !f.excluded) ?? fields[0])?.id ?? null)
  const [tool, setTool] = useState<StageTool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [annotationColor, setAnnotationColor] = useState<string>(LAYER_COLORS.annotation)
  const [centre, setCentre] = useState<'analyse' | 'image'>(isRing ? 'analyse' : 'image')

  // ---- Originals: download once, re-hash on open
  const [media, setMedia] = useState<Record<string, FieldMedia>>({})
  const startedRef = useRef(new Set<string>())
  const blobsRef = useRef(new Set<Blob>())
  useEffect(() => {
    const blobs = blobsRef.current
    return () => releaseObjectUrls(blobs)
  }, [])
  useEffect(() => {
    const todo = fields.filter((f) => !startedRef.current.has(f.id))
    if (todo.length === 0) return
    todo.forEach((f) => startedRef.current.add(f.id))
    void checkFieldOriginals(todo, (fieldId, m) => {
      if (m.blob) blobsRef.current.add(m.blob)
      setMedia((prev) => ({ ...prev, [fieldId]: m }))
    })
  }, [fields])

  const mismatch = fields.some((f) => media[f.id]?.status === 'mismatch' || media[f.id]?.status === 'error')
  const included = useMemo(() => fields.filter((f) => !f.excluded).sort((x, y) => x.fieldNo - y.fieldNo), [fields])
  const ringField = isRing ? (included[0] ?? null) : null
  // reload() gives new field objects: key the decode on the id and the blob only.
  const ringFieldId = ringField?.id ?? null
  const ringBlob = ringFieldId ? (media[ringFieldId]?.status === 'ok' ? media[ringFieldId]?.blob : null) : null

  // ---- Decode the ring field once for the ring engine (grey, original resolution)
  const [decoded, setDecoded] = useState<Decoded | null>(null)
  const [decodeError, setDecodeError] = useState<{ blob: Blob; text: string } | null>(null)
  const decodedKeyRef = useRef<{ fieldId: string; blob: Blob } | null>(null)
  useEffect(() => {
    if (!ringFieldId || !ringBlob) return
    // Already decoded (or decoding) this blob for this field: nothing to redo.
    const last = decodedKeyRef.current
    if (last && last.fieldId === ringFieldId && last.blob === ringBlob) return
    decodedKeyRef.current = { fieldId: ringFieldId, blob: ringBlob }
    let cancelled = false
    void decodeToGray(ringBlob)
      .then((d) => {
        if (!cancelled) setDecoded({ fieldId: ringFieldId, blob: ringBlob, ...d })
      })
      .catch((e) => {
        if (!cancelled) setDecodeError({ blob: ringBlob, text: metallographyErrorText(e) })
      })
    return () => {
      cancelled = true
      // A cancelled decode never landed: allow it to run again.
      if (decodedKeyRef.current?.fieldId === ringFieldId && decodedKeyRef.current.blob === ringBlob) {
        decodedKeyRef.current = null
      }
    }
  }, [ringFieldId, ringBlob])
  const ringImage = decoded && ringField && decoded.fieldId === ringField.id && decoded.blob === ringBlob ? decoded : null
  const ringDecodeError = decodeError && decodeError.blob === ringBlob ? decodeError.text : null

  // ---- Calibrations valid on the test date at the fields' resolution
  const fieldSizes = useMemo(() => {
    const seen = new Map<string, { width: number; height: number }>()
    for (const f of included) {
      if (f.imageWidthPx && f.imageHeightPx) seen.set(`${f.imageWidthPx}x${f.imageHeightPx}`, { width: f.imageWidthPx, height: f.imageHeightPx })
    }
    return [...seen.values()]
  }, [included])
  // Depends on plain values only: fieldSizes is a new array after every reload().
  const calWidth = fieldSizes.length === 1 ? fieldSizes[0].width : null
  const calHeight = fieldSizes.length === 1 ? fieldSizes[0].height : null
  const calKey = `${draft.testDate}|${calWidth !== null && calHeight !== null ? `${calWidth}x${calHeight}` : '-'}`
  const [calResult, setCalResult] = useState<{ key: string; list: ScaleCalibration[] } | null>(null)
  useEffect(() => {
    let cancelled = false
    void listUsableCalibrations({ onDate: draft.testDate, imageWidthPx: calWidth, imageHeightPx: calHeight })
      .then((res) => {
        if (!cancelled) setCalResult({ key: calKey, list: res.status === 'ok' ? res.data : [] })
      })
      .catch(() => {
        if (!cancelled) setCalResult({ key: calKey, list: [] })
      })
    return () => {
      cancelled = true
    }
  }, [calKey, draft.testDate, calWidth, calHeight])
  const calibrations = calResult?.key === calKey ? calResult.list : []
  const calibrationsLoading = calResult?.key !== calKey
  const selectedCalibration =
    calibrations.find((c) => c.id === draft.scaleCalibrationId) ??
    (detail.calibration && detail.calibration.id === draft.scaleCalibrationId ? detail.calibration : null)

  // ---- Equipment (testing kind) for badges and the stored snapshot
  const [equipment, setEquipment] = useState<EquipmentOption[] | null>(null)
  const [equipmentError, setEquipmentError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadEquipmentOptions()
      .then((list) => !cancelled && setEquipment(list))
      .catch((e) => {
        if (!cancelled) {
          setEquipment([])
          setEquipmentError(metallographyErrorText(e))
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ---- Scale handed to the engines (no default scale)
  const inImageMm = inImageMmPerPx(draft.inImageScale)
  const scale: ScaleInput | null =
    scaleMode === 'calibration'
      ? selectedCalibration && selectedCalibration.status === 'verified'
        ? { kind: 'calibration', umPerPxX: selectedCalibration.umPerPxX, umPerPxY: selectedCalibration.umPerPxY }
        : null
      : inImageMm
        ? { kind: 'in_image', mmPerPx: inImageMm }
        : null
  const scaleReady =
    scale !== null && (scaleMode === 'calibration' || Boolean(draft.inImageScale?.ruler_equipment_id))

  // ---- Result
  const summary: RingTestSummary | null = ring ? ring.summary : isRingSummary(a.resultSummary) ? a.resultSummary : null
  const formatted = useMemo(
    () =>
      summary
        ? formatMetallographyResult({ kind: a.kind, summary, reportedUnit: snap?.reported_unit ?? null, decimals: snap?.decimals ?? null })
        : null,
    [summary, a.kind, snap],
  )
  const resultReady = Boolean(isRing && summary && ringSummaryComplete(summary) && formatted?.results)

  // ---- Active field on the stage
  const activeField = fields.find((f) => f.id === activeFieldId) ?? null
  const activeMedia = activeField ? media[activeField.id] : undefined
  const edit = activeField ? (edits[activeField.id] ?? {}) : {}
  const display = edit.display ?? normalizeDisplay(activeField?.displaySettings)
  const fieldMarks = (f: AnalysisField): FieldMarks => edits[f.id]?.marks ?? f.marks
  const adjustments = edit.adjustments ?? activeField?.operatorAdjustments ?? null
  const annotations = edit.annotations ?? activeField?.annotations ?? []
  const marks = activeField ? fieldMarks(activeField).items : []

  const patchEdit = (fieldId: string, patch: FieldEdit, markDirty = true) => {
    setEdits((prev) => ({ ...prev, [fieldId]: { ...prev[fieldId], ...patch } }))
    if (markDirty) setDirty(true)
  }
  const patchDraft = (patch: Partial<ScaleDraft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
  }

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty || mode !== 'page') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, mode])

  const initialGeometry = useMemo(
    () => (ringField ? ringGeometryFromMarks(ringField.marks.items, ringDefaults) : null),
    [ringField, ringDefaults],
  )

  const equipmentSnapshot = (): EquipmentUsedSnapshot[] | undefined => {
    if (!equipment) return undefined
    const ids =
      scaleMode === 'calibration'
        ? [selectedCalibration?.microscopeEquipmentId, selectedCalibration?.cameraEquipmentId, selectedCalibration?.stageMicrometerEquipmentId]
        : [draft.inImageScale?.ruler_equipment_id]
    return [...new Set(ids.filter((x): x is string => Boolean(x)))]
      .map((id) => equipment.find((o) => o.id === id))
      .filter((o): o is EquipmentOption => Boolean(o))
      .map((o) => snapshotFromOption(o, draft.testDate))
  }

  /** In-image scale as the database accepts it (only complete lines; null when none). */
  const inImageForSave = (): InImageScale | null => {
    const s = draft.inImageScale
    const lines = (s?.lines ?? []).filter((l) => l.length_mm > 0 && Math.hypot(l.x2 - l.x1, l.y2 - l.y1) >= 1)
    if (!s || lines.length === 0) return null
    return {
      lines: lines.map((l) => ({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, length_mm: l.length_mm })),
      ruler_equipment_id: s.ruler_equipment_id || null,
      field_no: s.field_no ?? ringField?.fieldNo ?? activeField?.fieldNo,
    }
  }

  /** Saves the analysis and every edited field. Throws on failure. */
  const persist = async () => {
    const patch: AnalysisUpdateInput = {
      scaleCalibrationId: scaleMode === 'calibration' ? draft.scaleCalibrationId : null,
      inImageScale: scaleMode === 'in_image' ? inImageForSave() : null,
      magnification: draft.magnification.trim() || null,
      etchant: draft.etchant.trim() || null,
      specimenPrep: draft.specimenPrep,
      testDate: draft.testDate,
      reportedUnit: snap?.reported_unit ?? null,
    }
    const snapshot = equipmentSnapshot()
    if (snapshot) patch.equipmentSnapshot = snapshot
    if (isRing) {
      patch.engineVersion = summary?.engine_version ?? RING_TEST_ENGINE_VERSION
      patch.engineParams = { ...(a.engineParams ?? {}), d_nominal_mm: dNominalMm }
      if (ring) {
        patch.resultSummary = ring.summary
        patch.reportedValue = formatted?.results || null
      }
    }
    await updateAnalysis(a.id, patch)
    for (const [fieldId, e] of Object.entries(edits)) {
      if (!fields.some((f) => f.id === fieldId)) continue
      await updateField(fieldId, {
        displaySettings: e.display ? (displayForSave(e.display) as DisplaySettings) : undefined,
        operatorAdjustments: e.adjustments,
        annotations: e.annotations,
        marks: e.marks,
      })
    }
  }

  const afterSave = async () => {
    await reload()
    setEdits({})
    setDirty(false)
  }

  const saveDraft = async () => {
    setBusy('save')
    setMessage(null)
    try {
      await persist()
      await afterSave()
      setMessage({ text: 'Draft saved.', tone: 'ok' })
    } catch (e) {
      setMessage({ text: metallographyErrorText(e), tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  /** Overlay PNG (original + marks) for every field in use; failures do not block Complete. */
  const renderOverlays = async (): Promise<string[]> => {
    const warnings: string[] = []
    for (const f of included) {
      const blob = media[f.id]?.blob
      if (!blob) continue
      try {
        const png = await renderOverlayPng(blob, {
          marks: fieldMarks(f).items,
          adjustments: edits[f.id]?.adjustments ?? f.operatorAdjustments,
          annotations: edits[f.id]?.annotations ?? f.annotations,
          scaleLines: draft.inImageScale && (draft.inImageScale.field_no ?? ringField?.fieldNo) === f.fieldNo ? draft.inImageScale.lines : null,
        })
        const up = await uploadOverlayPng(a.id, f.fieldNo, png)
        if (up.path !== f.renderedOverlayPath) {
          await updateField(f.id, { renderedOverlayPath: up.path })
          if (f.renderedOverlayPath?.startsWith(`analyses/${a.id}/`)) await removeObjects([f.renderedOverlayPath])
        }
      } catch (e) {
        warnings.push(`Field ${f.fieldNo}: overlay not saved (${metallographyErrorText(e)}).`)
      }
    }
    return warnings
  }

  const complete = async (overrideReason?: string) => {
    if (mismatch) {
      setMessage({ text: 'An original does not match its recorded hash. The analysis cannot be completed.', tone: 'error' })
      return
    }
    if (included.length < (snap?.min_fields ?? 1)) {
      setMessage({ text: `At least ${snap?.min_fields ?? 1} image field(s) are needed.`, tone: 'error' })
      return
    }
    if (!scaleReady) {
      setMessage({
        text:
          scaleMode === 'calibration'
            ? 'Choose a verified microscope calibration.'
            : 'Draw the reference line, enter its length and choose the ruler used.',
        tone: 'error',
      })
      return
    }
    if (isRing && !resultReady) {
      setMessage({ text: 'Place the rings and apply t1–t8 first.', tone: 'error' })
      return
    }
    setBusy('complete')
    setMessage(null)
    try {
      await persist()
      const warnings = await renderOverlays()
      await completeAnalysis(a.id, overrideReason ? { overrideReason } : {})
      if (overrideReason) await recordReason('metallography_analyses', a.id, overrideReason)
      setDirty(false)
      setEdits({})
      if (warnings.length) setMessage({ text: `Completed. ${warnings.join(' ')}`, tone: 'info' })
      await reload()
    } catch (e) {
      const text = metallographyErrorText(e)
      setBusy(null)
      if (isDirector && !overrideReason && /Only the Laboratory Director can proceed, with a reason/i.test(text)) {
        const reason = await ask({
          title: 'Complete with a Director override',
          recordLabel: a.analysisNo ?? undefined,
          description: text,
          confirmLabel: 'Complete',
        })
        if (reason) await complete(reason)
        return
      }
      setMessage({ text, tone: 'error' })
      await reload().catch(() => undefined)
    } finally {
      setBusy(null)
    }
  }

  const doVoid = async () => {
    const reason = await ask({ title: 'Reason for voiding the analysis', recordLabel: a.analysisNo ?? undefined, confirmLabel: 'Void' })
    if (!reason) return
    setBusy('void')
    setMessage(null)
    try {
      await voidAnalysis(a.id, reason)
      await recordReason('metallography_analyses', a.id, reason)
      setDirty(false)
      await reload()
    } catch (e) {
      setMessage({ text: metallographyErrorText(e), tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const doPrint = async () => {
    setBusy('print')
    setMessage(null)
    try {
      await printMetallographyWorksheet(detail, { printedByName: profileName })
    } catch (e) {
      setMessage({ text: metallographyErrorText(e), tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  // ---- Fields
  const upload = async (file: File, location: string) => {
    setBusy('upload')
    setMessage(null)
    try {
      assertMetallographyImage(file)
      const size = await readImageSize(file)
      assertImagePixels(size.width, size.height)
      const f = await addFieldFromFile({
        analysisId: a.id,
        fieldNo: nextFieldNo(fields),
        file,
        imageWidthPx: size.width,
        imageHeightPx: size.height,
        capturedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null,
        locationOnSpecimen: location,
      })
      // The bytes were hashed just before upload: show the local file without downloading it again.
      startedRef.current.add(f.id)
      blobsRef.current.add(file)
      setMedia((prev) => ({ ...prev, [f.id]: { status: 'ok', blob: file, actual: f.rawImageSha256 } }))
      setActiveFieldId(f.id)
      await reload()
      setMessage({ text: `Field ${f.fieldNo} added (SHA-256 ${f.rawImageSha256.slice(0, 16)}…).`, tone: 'ok' })
    } catch (e) {
      setMessage({ text: metallographyErrorText(e), tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const runField = async (fn: () => Promise<unknown>) => {
    setBusy('field')
    setMessage(null)
    try {
      await fn()
      await reload()
    } catch (e) {
      setMessage({ text: metallographyErrorText(e), tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const onExclude = async (f: AnalysisField) => {
    const reason = await ask({ title: 'Reason for excluding this field', recordLabel: `${a.analysisNo ?? ''} · Field ${f.fieldNo}`, confirmLabel: 'Exclude' })
    if (reason) await runField(() => excludeField(f.id, reason))
  }
  const onRemove = async (f: AnalysisField) => {
    if (!window.confirm(`Remove field ${f.fieldNo} and its image from this analysis?`)) return
    await runField(async () => {
      await deleteField(f)
      setEdits((prev) => {
        const rest = { ...prev }
        delete rest[f.id]
        return rest
      })
      if (activeFieldId === f.id) setActiveFieldId(null)
    })
  }

  // ---- Stage callbacks
  const deleteSelected = () => {
    if (!activeField || !selectedId) return
    const id = selectedId
    setSelectedId(null)
    if (id === 'roi') return patchEdit(activeField.id, { adjustments: { ...(adjustments ?? {}), roi: null } })
    if (id.startsWith('scale_')) {
      const i = Number(id.slice(6))
      const lines = draft.inImageScale?.lines ?? []
      return patchDraft({ inImageScale: { ...(draft.inImageScale ?? { ruler_equipment_id: null }), lines: lines.filter((_, j) => j !== i) } })
    }
    if (annotations.some((x) => x.id === id)) return patchEdit(activeField.id, { annotations: annotations.filter((x) => x.id !== id) })
    if (adjustments?.exclusions?.some((x) => x.id === id)) {
      return patchEdit(activeField.id, { adjustments: { ...adjustments, exclusions: adjustments.exclusions.filter((x) => x.id !== id) } })
    }
    const own = nonRingMarks(fieldMarks(activeField))
    if (own.some((m) => m.id === id && m.origin === 'operator')) {
      patchEdit(activeField.id, { marks: withNonRingMarks(fieldMarks(activeField), own.filter((m) => m.id !== id)) })
    }
  }

  const onScaleLineDrawn = (line: { x1: number; y1: number; x2: number; y2: number }) => {
    const prev = draft.inImageScale
    const fieldNo = activeField?.fieldNo
    const sameField = !prev?.field_no || prev.field_no === fieldNo
    patchDraft({
      inImageScale: {
        ruler_equipment_id: prev?.ruler_equipment_id ?? null,
        field_no: fieldNo,
        lines: [...(sameField ? (prev?.lines ?? []) : []), { ...line, length_mm: 0 }],
      },
    })
    setScaleMode('in_image')
    setTool('select')
    setMessage({ text: 'Reference line drawn: enter its known length in Scale and equipment.', tone: 'info' })
  }

  const steps = [
    { label: 'Image', done: included.length >= (snap?.min_fields ?? 1) && !mismatch },
    { label: 'Scale & equipment', done: scaleReady },
    { label: 'Analyse', done: Boolean(summary) },
    { label: 'Review marks', done: resultReady },
    { label: 'Complete', done: false },
    { label: 'Use result', done: false },
  ]

  const ctx = detail.context
  const stageScaleLines =
    draft.inImageScale && (draft.inImageScale.field_no ?? ringField?.fieldNo ?? activeField?.fieldNo) === activeField?.fieldNo
      ? draft.inImageScale.lines
      : null

  return (
    <div className="space-y-3">
      <EnvPanel
        title={`${a.analysisNo ?? 'Analysis'} · ${ANALYSIS_KIND_LABEL[a.kind]}`}
        right={
          <div className="flex flex-wrap items-center gap-1.5">
            <AnalysisStatusBadge status={a.status} />
            {a.indicative ? <IndicativeBadge /> : null}
            {!kindAvailable ? <ComingLaterChip /> : null}
          </div>
        }
      >
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-4">
            <Info label="SRF" value={ctx?.srfNumber} />
            <Info label="Parameter" value={ctx?.testLabel} />
            <Info label="Standard" value={snap?.standard_ref} />
            <Info label="Analyst" value={a.performedByName} />
          </div>
          <Steps items={steps} />
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <>
                <button type="button" disabled={busy !== null} className={cn(limsOutlineBtnClass, 'inline-flex items-center gap-1.5 border text-[12.5px]')} onClick={() => void saveDraft()}>
                  {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft
                </button>
                <button
                  type="button"
                  disabled={busy !== null || !kindAvailable}
                  className={cn(limsPrimaryBtnClass, 'inline-flex items-center gap-1.5 text-[12.5px]')}
                  onClick={() => void complete()}
                >
                  {busy === 'complete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Complete
                </button>
                <button type="button" disabled={busy !== null} className={cn(limsDeleteBtnClass, 'inline-flex items-center px-3 text-[12.5px]')} onClick={() => void doVoid()}>
                  {busy === 'void' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Void
                </button>
              </>
            ) : null}
            <button type="button" disabled={busy !== null} className={cn(limsOutlineBtnClass, 'inline-flex items-center gap-1.5 border text-[12.5px]')} onClick={() => void doPrint()}>
              {busy === 'print' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Print worksheet
            </button>
            {mode === 'page' ? (
              <Link to={ANALYSES_PATH} className="text-[12.5px] font-semibold text-amber-800 hover:underline">
                Back to analyses
              </Link>
            ) : null}
            {dirty ? <span className="text-[12px] font-semibold text-amber-800">Unsaved changes</span> : null}
          </div>
          {!canEdit ? (
            <p className="text-[12px] text-stone-600">
              {forcedReadOnly
                ? 'Read-only.'
                : locked
                  ? 'The result is under review, approved or issued: refer it back before changing this analysis.'
                  : 'Read-only: only the analyst (or the Laboratory Director) with Edit on Analyses can change this analysis.'}
            </p>
          ) : null}
          {mode === 'dialog' ? (
            <p className="text-[11.5px] text-stone-500">Use result becomes available after Complete.</p>
          ) : null}
          <MessageLine text={message?.text ?? null} tone={message?.tone} />
        </div>
      </EnvPanel>

      {mismatch ? (
        <p role="alert" className="flex items-start gap-2 border-2 border-red-600 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          An original image does not match its recorded SHA-256 (or cannot be read). Do not analyse it; tell the Quality Manager.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)_340px]">
        <EnvPanel title="Fields">
          <FieldStrip
            fields={fields}
            media={media}
            activeFieldId={activeFieldId}
            onSelect={(id) => {
              setActiveFieldId(id)
              setSelectedId(null)
            }}
            readOnly={readOnly}
            busy={busy !== null}
            minFields={snap?.min_fields ?? 1}
            onUpload={upload}
            onExclude={(f) => void onExclude(f)}
            onInclude={(f) => void runField(() => includeField(f.id))}
            onRemove={(f) => void onRemove(f)}
          />
        </EnvPanel>

        <section className="min-w-0 space-y-2">
          {isRing ? (
            <div role="tablist" aria-label="Centre view" className="flex gap-1">
              {(
                [
                  ['analyse', 'Ring test'],
                  ['image', 'Image and annotations'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={centre === v}
                  onClick={() => setCentre(v)}
                  className={cn(
                    'h-9 border px-3 text-[12px] font-semibold sm:h-8',
                    centre === v ? 'border-stone-800 bg-stone-800 text-amber-200' : 'border-stone-400 bg-stone-50 text-stone-700',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          {isRing && centre === 'analyse' ? (
            !ringField ? (
              <p className="border border-dashed border-stone-400 bg-[#fffcf7] p-4 text-[13px] text-stone-600">Add the ring photo in Fields first.</p>
            ) : mismatch ? (
              <p className="border-2 border-red-600 bg-red-50 p-4 text-[13px] text-red-900">The ring photo failed its hash check.</p>
            ) : ringDecodeError ? (
              <MessageLine tone="error" text={ringDecodeError} />
            ) : !ringImage ? (
              <p className="flex items-center gap-2 border border-stone-300 bg-[#fffcf7] p-4 text-[13px] text-stone-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading and checking the ring photo…
              </p>
            ) : (
              <RingTestPanel
                analysis={a}
                field={ringField}
                image={{ blob: ringImage.blob, width: ringImage.width, height: ringImage.height, gray: ringImage.gray }}
                settings={settings}
                scale={scale}
                dNominalMm={dNominalMm}
                readOnly={readOnly}
                initialGeometry={initialGeometry}
                onInImageScaleChange={
                  allowInImage
                    ? (s) => {
                        patchDraft({ inImageScale: { ...s, field_no: ringField.fieldNo, ruler_equipment_id: s.ruler_equipment_id ?? draft.inImageScale?.ruler_equipment_id ?? null } })
                        setScaleMode('in_image')
                      }
                    : undefined
                }
                onChange={(next) => {
                  setRing({ geometry: next.geometry, marks: next.marks, summary: next.summary, dNominalMm: next.dNominalMm })
                  setDNominalMm(next.dNominalMm)
                  setEdits((prev) => ({
                    ...prev,
                    [ringField.id]: { ...prev[ringField.id], marks: withRingMarks(prev[ringField.id]?.marks ?? ringField.marks, next.marks) },
                  }))
                  setDirty(true)
                }}
              />
            )
          ) : (
            <div className="min-w-0 overflow-hidden border-2 border-stone-500">
              <ImageEditToolbar
                tool={tool}
                onToolChange={setTool}
                display={display}
                onDisplayChange={(d) => activeField && patchEdit(activeField.id, { display: d }, false)}
                onZoom={(f) => activeField && patchEdit(activeField.id, { display: zoomAt(display, f, 0, 0, 0, 0) }, false)}
                onFit={() => activeField && patchEdit(activeField.id, { display: fitDisplay(display) }, false)}
                onResetView={() => activeField && patchEdit(activeField.id, { display: resetDisplay() }, false)}
                drawingDisabled={readOnly}
                allowScaleLine={allowInImage && scaleMode === 'in_image'}
                annotationColor={annotationColor}
                onAnnotationColorChange={setAnnotationColor}
                onDeleteSelected={deleteSelected}
                canDeleteSelected={Boolean(selectedId)}
                disabled={!activeMedia?.blob}
              />
              <ImageStage
                imageUrl={activeMedia?.blob ? objectUrlFor(activeMedia.blob) : null}
                width={activeField?.imageWidthPx ?? 0}
                height={activeField?.imageHeightPx ?? 0}
                display={display}
                onDisplayChange={(d) => activeField && patchEdit(activeField.id, { display: d }, false)}
                tool={tool}
                readOnly={readOnly}
                marks={marks}
                adjustments={adjustments}
                annotations={annotations}
                scaleLines={stageScaleLines}
                mmPerPx={scale ? scaleToMmPerPx(scale) : null}
                annotationColor={annotationColor}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onAdjustmentsChange={(next) => activeField && patchEdit(activeField.id, { adjustments: next })}
                onAnnotationsChange={(next) => activeField && patchEdit(activeField.id, { annotations: next })}
                onMarkAdded={(m) =>
                  activeField &&
                  patchEdit(activeField.id, { marks: withNonRingMarks(fieldMarks(activeField), [...nonRingMarks(fieldMarks(activeField)), m]) })
                }
                onScaleLineDrawn={onScaleLineDrawn}
                onDeleteSelected={deleteSelected}
                loading={Boolean(activeField) && (!activeMedia || activeMedia.status === 'checking')}
                emptyText={
                  activeMedia?.status === 'error'
                    ? `The original could not be read: ${activeMedia.error ?? ''}`
                    : activeMedia?.status === 'mismatch'
                      ? 'This original does not match its recorded hash.'
                      : undefined
                }
              />
              {!kindAvailable ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-stone-300 bg-stone-50 px-3 py-2 text-[12.5px] text-stone-700">
                  <ComingLaterChip /> The {ANALYSIS_KIND_LABEL[a.kind].toLowerCase()} engine comes in a later phase. Images, scale and
                  annotations can be recorded now.
                </div>
              ) : null}
            </div>
          )}
        </section>

        <div className="space-y-3">
          <EnvPanel title="Scale and equipment">
            <ScalePanel
              draft={draft}
              onChange={(patch) => {
                if (patch.testDate && patch.testDate !== draft.testDate) setMessage({ text: `Test date set to ${formatDate(patch.testDate)}.`, tone: 'info' })
                patchDraft(patch)
              }}
              readOnly={readOnly}
              fieldSizes={fieldSizes}
              calibrations={calibrations}
              calibrationsLoading={calibrationsLoading}
              selectedCalibration={selectedCalibration}
              equipment={equipment ?? []}
              equipmentLoading={equipment === null}
              equipmentError={equipmentError}
              allowInImage={allowInImage}
              mode={scaleMode}
              onModeChange={(m) => {
                setScaleMode(m)
                setDirty(true)
              }}
              onDrawReferenceLine={() => {
                setCentre('image')
                setTool('scale_line')
              }}
            />
          </EnvPanel>
          <EnvPanel title="Result">
            <ResultPanel
              kind={a.kind}
              summary={summary}
              formatted={formatted}
              reportedUnit={snap?.reported_unit ?? null}
              includedFields={included.length}
              minFields={snap?.min_fields ?? 1}
              minCountsPerField={snap?.min_counts_per_field ?? null}
              indicative={a.indicative}
              pendingText={isRing ? 'Place the inner and outer rings, then apply t1–t8.' : null}
            />
          </EnvPanel>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="truncate text-stone-900" title={value ?? undefined}>
        {value || '—'}
      </div>
    </div>
  )
}
