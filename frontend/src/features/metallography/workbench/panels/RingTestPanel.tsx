import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Field, envInputClass, EnvSelect, MessageLine } from '@/features/environment/EnvironmentUi'
import type { GrayImage, Mark, RingGeometry, RingTestSummary, ScaleInput } from '@/features/metallography/engines/types'
import { metallographyErrorText } from '@/features/metallography/metallographyApi'
import type { Analysis, AnalysisField, InImageScale, RingTestLimits, RingTestMethodSettings } from '@/features/metallography/types'
import { useCanEditCurrentModule } from '@/features/settings/module-access/useCanEditCurrentModule'
import { Input } from '@/components/ui/input'
import { checkEquipmentUsableOn, loadEquipmentOptions, type EquipmentOption } from '@/lib/equipmentTraceability'
import { cn } from '@/lib/utils'
import { RingEditor, type RingEditorChange } from './ring/RingEditor'
import { mmPerPxFromRefLines, validRefLines, type RefLine } from './ring/ringGeometry'
import { restoreRingState, ringStateFromGeometry } from './ring/ringMarks'

/**
 * Ring test panel of the metallography workbench (design 3.3 "Ring test
 * panel", port of the old RingTestWorkflow). It holds what the workbench does
 * not: the nominal d, the in-image reference line with its ruler, and the
 * RingEditor. The workbench saves what onChange / onInImageScaleChange report
 * and completes the analysis; the database recomputes the ring decision.
 *
 * Use result stays blocked until t1–t8 are applied: `summary` is null until
 * both rings, the scale, d and the applied points are all there.
 */

export type RingTestPanelProps = {
  analysis: Analysis
  /** Field the ring is measured on (field_no 1 in Phase 1). */
  field: AnalysisField
  /** Original image (downloaded blob, already hash-checked) decoded once by the workbench. */
  image: { blob: Blob; width: number; height: number; gray: GrayImage }
  /** method_snapshot.settings merged over RING_TEST_DEFAULT_SETTINGS. */
  settings: RingTestMethodSettings
  /** Calibration scale or in-image scale; null until set (Use result stays blocked). */
  scale: ScaleInput | null
  /** Nominal bar diameter d (mm), prefilled from the sample when known; editable. */
  dNominalMm: number | null
  readOnly: boolean
  /** Saved geometry from field.marks (null on first open). */
  initialGeometry: RingGeometry | null
  /** Draw / edit the in-image reference line (ring photos without a calibration). */
  onInImageScaleChange?: (scale: InImageScale) => void
  /** Every edit: geometry for field.marks, summary for result_summary (null until t1–t8 are applied). */
  onChange: (next: { geometry: RingGeometry; marks: Mark[]; summary: RingTestSummary | null; dNominalMm: number | null }) => void
}

/** Debounce for the in-image scale (typing a length, nudging a line). */
const SCALE_EMIT_DELAY_MS = 400

function parseD(text: string): number | null {
  const n = Number(text.trim())
  return text.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null
}

function initialRefLines(analysis: Analysis, fieldNo: number): RefLine[] {
  const s = analysis.inImageScale
  if (!s || (s.field_no !== undefined && s.field_no !== fieldNo)) return []
  return (s.lines ?? []).map((l) => ({
    x1: l.x1,
    y1: l.y1,
    x2: l.x2,
    y2: l.y2,
    length_mm: Number.isFinite(l.length_mm) && l.length_mm > 0 ? l.length_mm : null,
  }))
}

export function RingTestPanel({
  analysis,
  field,
  image,
  settings,
  scale,
  dNominalMm,
  readOnly,
  initialGeometry,
  onInImageScaleChange,
  onChange,
}: RingTestPanelProps) {
  const canEdit = useCanEditCurrentModule()
  const locked = readOnly || !canEdit
  const inImageAllowed = analysis.methodSnapshot?.scale_mode === 'in_image_reference'

  const limits = useMemo<RingTestLimits>(
    () => ({
      thickness_min_factor: settings.thickness_min_factor,
      thickness_max_factor: settings.thickness_max_factor,
      tm_share_min_pct: settings.tm_share_min_pct,
      tm_share_max_pct: settings.tm_share_max_pct,
      limits_inclusive: settings.limits_inclusive,
    }),
    [
      settings.thickness_min_factor,
      settings.thickness_max_factor,
      settings.tm_share_min_pct,
      settings.tm_share_max_pct,
      settings.limits_inclusive,
    ],
  )

  // The stored marks are the record; initialGeometry is only a fallback.
  const [initialState] = useState(() => {
    const defaults = {
      angularCorrectionDeg: settings.angular_correction_deg,
      outerGapPx: settings.outer_gap_px,
      innerGapPx: settings.inner_gap_px,
    }
    return restoreRingState(field.marks?.items, defaults) ?? (initialGeometry ? ringStateFromGeometry(initialGeometry) : null)
  })

  const [dText, setDText] = useState(() => (dNominalMm !== null && dNominalMm > 0 ? String(dNominalMm) : ''))
  const dMm = parseD(dText)

  const [scaleLines, setScaleLines] = useState<RefLine[]>(() => initialRefLines(analysis, field.fieldNo))
  const [rulerId, setRulerId] = useState(() => analysis.inImageScale?.ruler_equipment_id ?? '')
  const [rulers, setRulers] = useState<EquipmentOption[] | null>(null)
  const [rulerError, setRulerError] = useState<string | null>(null)

  const localMmPerPx = useMemo(() => (inImageAllowed ? mmPerPxFromRefLines(scaleLines) : null), [inImageAllowed, scaleLines])

  /**
   * Scale for the result: a calibration always wins; otherwise the reference
   * lines on screen (same rule as the database), so the result follows the
   * line while it is drawn; otherwise what the workbench passed.
   */
  const effectiveScale = useMemo<ScaleInput | null>(() => {
    if (scale?.kind === 'calibration') return scale
    if (localMmPerPx !== null) return { kind: 'in_image', mmPerPx: localMmPerPx }
    return inImageAllowed ? null : scale
  }, [scale, localMmPerPx, inImageAllowed])

  useEffect(() => {
    if (!inImageAllowed) return
    let cancelled = false
    loadEquipmentOptions()
      .then((list) => {
        if (!cancelled) setRulers(list.filter((o) => o.kind === 'equipment'))
      })
      .catch((e: unknown) => {
        if (!cancelled) setRulerError(metallographyErrorText(e))
      })
    return () => {
      cancelled = true
    }
  }, [inImageAllowed])

  // Report the in-image scale (valid lines only; an empty list means "cleared").
  const lastScaleKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (locked || !inImageAllowed || !onInImageScaleChange) return
    const payload: InImageScale = {
      lines: validRefLines(scaleLines).map((l) => ({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, length_mm: l.length_mm })),
      ruler_equipment_id: rulerId || null,
      field_no: field.fieldNo,
    }
    const key = JSON.stringify(payload)
    if (lastScaleKeyRef.current === null) {
      lastScaleKeyRef.current = key
      return
    }
    if (key === lastScaleKeyRef.current) return
    const t = window.setTimeout(() => {
      lastScaleKeyRef.current = key
      onInImageScaleChange(payload)
    }, SCALE_EMIT_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [locked, inImageAllowed, onInImageScaleChange, scaleLines, rulerId, field.fieldNo])

  const handleEditorChange = useCallback(
    (next: RingEditorChange) => onChange({ geometry: next.geometry, marks: next.marks, summary: next.summary, dNominalMm: dMm }),
    [onChange, dMm],
  )

  const ruler = rulers?.find((r) => r.id === rulerId) ?? null
  const rulerUse = ruler ? checkEquipmentUsableOn(ruler, analysis.testDate) : null
  const validLineCount = validRefLines(scaleLines).length

  const scaleHint = inImageAllowed
    ? 'Set the scale: draw a reference line of known length (Scale line tool).'
    : 'Set the scale: choose a verified microscope calibration in Scale & equipment.'

  return (
    <div className="min-w-0 space-y-2">
      <div className="grid gap-3 border border-stone-400 bg-[#fffcf7] p-2 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:p-3">
        <Field label="Nominal diameter d (mm)" htmlFor={`ring-d-${field.id}`}>
          <Input
            id={`ring-d-${field.id}`}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={dText}
            disabled={locked}
            onChange={(e) => setDText(e.target.value)}
            placeholder="e.g. 12"
            className={envInputClass}
          />
          <p className="text-[11px] text-stone-500">
            {dNominalMm !== null && dNominalMm > 0
              ? `From the sample: ${dNominalMm} mm.`
              : 'Bar size of the sample. Used for the 0.07 d – 0.15 d limits.'}
          </p>
        </Field>

        <div className="min-w-0 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">Scale</p>
          {scale?.kind === 'calibration' ? (
            <p className="text-[13px] text-stone-800">
              Microscope calibration{analysis.scaleSnapshot?.cal_code ? ` ${analysis.scaleSnapshot.cal_code}` : ''}:{' '}
              <span className="font-mono">
                {scale.umPerPxX === scale.umPerPxY
                  ? `${scale.umPerPxX} µm/px`
                  : `x ${scale.umPerPxX} · y ${scale.umPerPxY} µm/px`}
              </span>
            </p>
          ) : inImageAllowed ? (
            <>
              <p className="text-[13px] text-stone-800">
                Reference line on the photo:{' '}
                {validLineCount > 0 && localMmPerPx !== null ? (
                  <span className="font-mono">
                    {validLineCount} line{validLineCount === 1 ? '' : 's'} · {localMmPerPx.toFixed(6)} mm/px
                  </span>
                ) : (
                  <span className="text-stone-500">none yet. Use the Scale line tool on a ruler in the photo.</span>
                )}
              </p>
              <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <EnvSelect
                  ariaLabel="Ruler / scale used for the reference line"
                  value={rulerId}
                  onChange={setRulerId}
                  disabled={locked || rulers === null}
                >
                  <option value="">{rulers === null && !rulerError ? 'Loading equipment…' : 'Choose the ruler / scale used'}</option>
                  {(rulers ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {[r.assetCode, r.name].filter(Boolean).join(' ')}
                    </option>
                  ))}
                  {rulerId && rulers && !ruler ? <option value={rulerId}>Equipment not in the list</option> : null}
                </EnvSelect>
                {rulerUse ? (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 whitespace-nowrap border px-1.5 py-0.5 text-[11px] font-semibold',
                      rulerUse.usable
                        ? 'border-emerald-700/40 bg-emerald-100 text-emerald-800'
                        : 'border-red-700/50 bg-red-100 text-red-800',
                    )}
                    title={rulerUse.reason ?? undefined}
                  >
                    {rulerUse.usable ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    {rulerUse.usable ? 'Usable on test date' : 'Not usable'}
                  </span>
                ) : null}
              </div>
              {rulerUse && !rulerUse.usable ? <p className="text-[11px] text-red-800">{rulerUse.reason}</p> : null}
              {validLineCount > 0 && !rulerId && !locked ? (
                <p className="text-[11px] text-amber-800">Choose the ruler / scale used: it is needed to complete.</p>
              ) : null}
              {rulerError ? <MessageLine text={rulerError} tone="error" /> : null}
            </>
          ) : (
            <p className="text-[13px] text-stone-500">{scaleHint}</p>
          )}
        </div>
      </div>

      <RingEditor
        key={field.id}
        image={image}
        scale={effectiveScale}
        dMm={dMm}
        limits={limits}
        limitsVerified={settings.limits_verified}
        angularCorrectionDeg={settings.angular_correction_deg}
        outerGapPx={settings.outer_gap_px}
        innerGapPx={settings.inner_gap_px}
        readOnly={locked}
        initialState={initialState}
        scaleLines={inImageAllowed ? scaleLines : undefined}
        onScaleLinesChange={inImageAllowed ? setScaleLines : undefined}
        scaleHint={scaleHint}
        onChange={locked ? undefined : handleEditorChange}
      />
    </div>
  )
}
