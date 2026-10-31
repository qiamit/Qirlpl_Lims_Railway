import { AlertTriangle, CheckCircle2, Loader2, Ruler, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { checkEquipmentUsableOn, type EquipmentOption } from '@/lib/equipmentTraceability'
import { limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import { EnvSelect, Field, envInputClass } from '@/features/environment/EnvironmentUi'
import { calibrationValidFrom, localIsoDate } from '../metallographyApi'
import type { InImageScale, ScaleCalibration, SpecimenPrep } from '../types'
import { inImageMmPerPx, lineLengthPx } from './imageCanvasUtils'

/**
 * Right column of the workbench (design 3.3 S2 "scale and equipment", 3.5).
 * Scale is either a VERIFIED microscope calibration valid on the test date at
 * the fields' exact resolution, or (ring test / macro methods with scale mode
 * "in image") a reference line of known length drawn on the photo plus the
 * ruler used. There is no default scale. Microscope and camera come from the
 * calibration; each instrument shows whether it is usable on the test date
 * (same rule as equipment_usable_on, which the database checks at Complete).
 */

export type ScaleDraft = {
  scaleCalibrationId: string | null
  inImageScale: InImageScale | null
  magnification: string
  etchant: string
  specimenPrep: SpecimenPrep
  testDate: string
}

export type ScaleMode = 'calibration' | 'in_image'

export type ScalePanelProps = {
  draft: ScaleDraft
  onChange: (patch: Partial<ScaleDraft>) => void
  readOnly: boolean
  /** Distinct sizes of the fields in use (a calibration is valid at one resolution only). */
  fieldSizes: Array<{ width: number; height: number }>
  calibrations: ScaleCalibration[]
  calibrationsLoading: boolean
  /** The selected calibration (may be outside `calibrations` when it no longer qualifies). */
  selectedCalibration: ScaleCalibration | null
  equipment: EquipmentOption[]
  equipmentLoading: boolean
  equipmentError: string | null
  /** Method scale mode is "in image reference" (ring test, macro). */
  allowInImage: boolean
  mode: ScaleMode
  onModeChange: (mode: ScaleMode) => void
  /** Switch the stage to the reference-line tool. */
  onDrawReferenceLine?: () => void
}

function UsableBadge({ option, onDate, missingLabel }: { option: EquipmentOption | null; onDate: string; missingLabel?: string }) {
  if (!option) {
    return (
      <span className="inline-flex items-center gap-1 border border-stone-400 bg-stone-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-stone-600">
        {missingLabel ?? 'Not found in the equipment list'}
      </span>
    )
  }
  const check = checkEquipmentUsableOn(option, onDate)
  return check.usable ? (
    <span className="inline-flex items-center gap-1 border border-emerald-700/40 bg-emerald-100 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-800">
      <CheckCircle2 className="h-3 w-3" /> Usable on {formatDate(onDate)}
    </span>
  ) : (
    <span
      title={check.reason ?? undefined}
      className="inline-flex items-center gap-1 border border-red-700/50 bg-red-100 px-1.5 py-0.5 text-[10.5px] font-bold text-red-800"
    >
      <AlertTriangle className="h-3 w-3" /> {check.reason}
    </span>
  )
}

function EquipmentLine({ label, id, options, onDate }: { label: string; id: string | null; options: EquipmentOption[]; onDate: string }) {
  if (!id) return null
  const opt = options.find((o) => o.id === id) ?? null
  return (
    <div className="space-y-0.5 border-l-2 border-amber-600/60 pl-2 text-[12px]">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="font-semibold text-stone-900">{opt ? `${opt.assetCode} ${opt.name}` : id}</div>
      {opt?.calCertNo || opt?.calDueDate ? (
        <div className="text-stone-600">
          {opt.calCertNo ? `Cert. ${opt.calCertNo}` : ''}
          {opt.calCertNo && opt.calDueDate ? ' · ' : ''}
          {opt.calDueDate ? `due ${formatDate(opt.calDueDate)}` : ''}
        </div>
      ) : null}
      <UsableBadge option={opt} onDate={onDate} />
    </div>
  )
}

function calibrationLabel(c: ScaleCalibration): string {
  return [
    c.calCode ?? 'Calibration',
    c.objective,
    `${c.umPerPxX.toFixed(4)} µm/px`,
    `${c.imageWidthPx}×${c.imageHeightPx}`,
    `until ${formatDate(c.validUntil)}`,
  ].join(' · ')
}

export function ScalePanel(props: ScalePanelProps) {
  const {
    draft,
    onChange,
    readOnly,
    fieldSizes,
    calibrations,
    calibrationsLoading,
    selectedCalibration: cal,
    equipment,
    equipmentLoading,
    equipmentError,
    allowInImage,
    mode,
    onModeChange,
    onDrawReferenceLine,
  } = props
  const onDate = draft.testDate
  const prep = draft.specimenPrep
  const setPrep = (patch: Partial<SpecimenPrep>) => onChange({ specimenPrep: { ...prep, ...patch } })

  const sizeMismatch =
    cal !== null && fieldSizes.some((s) => s.width !== cal.imageWidthPx || s.height !== cal.imageHeightPx)
  const outOfDate = cal !== null && !(calibrationValidFrom(cal) <= onDate && onDate <= cal.validUntil)
  const notVerified = cal !== null && cal.status !== 'verified'

  const lines = draft.inImageScale?.lines ?? []
  const mmPerPx = inImageMmPerPx(draft.inImageScale)
  const setLines = (next: InImageScale['lines']) =>
    onChange({
      inImageScale: next.length === 0 && !draft.inImageScale?.ruler_equipment_id
        ? null
        : { ...(draft.inImageScale ?? { ruler_equipment_id: null }), lines: next, mm_per_px: undefined },
    })
  const rulerId = draft.inImageScale?.ruler_equipment_id ?? ''
  const instruments = equipment.filter((o) => o.kind === 'equipment')

  return (
    <div className="space-y-3 text-[12.5px]">
      <Field label="Test date" htmlFor="mg-test-date">
        <Input
          id="mg-test-date"
          type="date"
          className={envInputClass}
          value={draft.testDate}
          max={localIsoDate()}
          disabled={readOnly}
          onChange={(e) => e.target.value && onChange({ testDate: e.target.value })}
        />
      </Field>

      {allowInImage ? (
        <div role="radiogroup" aria-label="Scale source" className="grid grid-cols-2 gap-1">
          {(
            [
              ['calibration', 'Microscope calibration'],
              ['in_image', 'Reference line in image'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              disabled={readOnly}
              onClick={() => onModeChange(value)}
              className={cn(
                'h-9 border px-2 text-[11.5px] font-semibold sm:h-8',
                mode === value ? 'border-amber-700 bg-amber-700 text-white' : 'border-stone-500 bg-stone-50 text-stone-800',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {mode === 'calibration' ? (
        <div className="space-y-2">
          <Field label="Microscope calibration (verified)" htmlFor="mg-cal">
            <EnvSelect
              id="mg-cal"
              value={draft.scaleCalibrationId ?? ''}
              disabled={readOnly || calibrationsLoading}
              onChange={(v) => onChange({ scaleCalibrationId: v || null })}
            >
              <option value="">{calibrationsLoading ? 'Loading…' : '— Choose —'}</option>
              {cal && !calibrations.some((c) => c.id === cal.id) ? (
                <option value={cal.id}>{calibrationLabel(cal)} (does not qualify)</option>
              ) : null}
              {calibrations.map((c) => (
                <option key={c.id} value={c.id}>
                  {calibrationLabel(c)}
                </option>
              ))}
            </EnvSelect>
          </Field>
          {fieldSizes.length === 0 ? (
            <p className="text-[11.5px] text-stone-600">Add an image first: only calibrations at its exact resolution are offered.</p>
          ) : fieldSizes.length > 1 ? (
            <p className="text-[11.5px] text-red-800">The fields have different sizes; one calibration fits one resolution only.</p>
          ) : null}
          {!calibrationsLoading && calibrations.length === 0 && fieldSizes.length > 0 ? (
            <p className="text-[11.5px] text-amber-900">
              No verified calibration is valid on {formatDate(onDate)} at {fieldSizes[0].width}×{fieldSizes[0].height} px. Record one in
              Microscope Calibration.
            </p>
          ) : null}
          {cal ? (
            <div className="space-y-1 border border-stone-300 bg-stone-50 p-2">
              <div>
                <span className="font-semibold">{cal.calCode}</span> · {cal.objective}
                {cal.totalMagnification ? ` · ${cal.totalMagnification}×` : ''}
              </div>
              <div className="tabular-nums">
                x {cal.umPerPxX.toFixed(6)} µm/px · y {cal.umPerPxY.toFixed(6)} µm/px
                {cal.uRelScalePct !== null ? ` · u_rel ${cal.uRelScalePct.toFixed(2)} %` : ''}
              </div>
              <div>
                Valid {formatDate(calibrationValidFrom(cal))} to {formatDate(cal.validUntil)} · verified by {cal.verifiedByName ?? '—'}
              </div>
              {notVerified ? <p className="font-semibold text-red-800">This calibration is {cal.status}; choose a verified one.</p> : null}
              {outOfDate ? <p className="font-semibold text-red-800">Not valid on the test date.</p> : null}
              {sizeMismatch ? (
                <p className="font-semibold text-red-800">
                  Valid only for {cal.imageWidthPx}×{cal.imageHeightPx} px images; a field has another size.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11.5px] text-stone-600">
            Draw a line over a known length (ruler or scale in the photo) and enter that length. Several lines are averaged.
          </p>
          {!readOnly && onDrawReferenceLine ? (
            <button type="button" className={cn(limsOutlineBtnClass, 'inline-flex items-center gap-1.5 border px-3 text-[12px]')} onClick={onDrawReferenceLine}>
              <Ruler className="h-3.5 w-3.5" /> Draw reference line
            </button>
          ) : null}
          {lines.length === 0 ? <p className="text-[11.5px] text-amber-900">No reference line yet.</p> : null}
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 border border-stone-300 bg-stone-50 p-2">
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-stone-500">Line {i + 1}</div>
                <div className="tabular-nums">{lineLengthPx(l).toFixed(1)} px</div>
              </div>
              <Field label="Known length (mm)" className="w-32">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  className={envInputClass}
                  value={l.length_mm > 0 ? String(l.length_mm) : ''}
                  disabled={readOnly}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setLines(lines.map((x, j) => (j === i ? { ...x, length_mm: Number.isFinite(v) && v > 0 ? v : 0 } : x)))
                  }}
                />
              </Field>
              {!readOnly ? (
                <button
                  type="button"
                  aria-label={`Remove line ${i + 1}`}
                  className="inline-flex h-8 w-8 items-center justify-center border border-stone-400 text-red-700 hover:bg-red-50"
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}
          {mmPerPx !== null ? (
            <p className="tabular-nums">
              Scale: <span className="font-semibold">{(mmPerPx * 1000).toFixed(4)} µm/px</span> ({mmPerPx.toFixed(6)} mm/px)
            </p>
          ) : null}
          <Field label="Ruler / scale used (equipment)" htmlFor="mg-ruler">
            <EnvSelect
              id="mg-ruler"
              value={rulerId}
              disabled={readOnly || equipmentLoading}
              onChange={(v) =>
                onChange({ inImageScale: { ...(draft.inImageScale ?? { lines: [] }), ruler_equipment_id: v || null, mm_per_px: undefined } })
              }
            >
              <option value="">{equipmentLoading ? 'Loading…' : '— Choose —'}</option>
              {instruments.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.assetCode} {o.name}
                </option>
              ))}
            </EnvSelect>
          </Field>
        </div>
      )}

      <div className="space-y-2 border-t border-stone-300 pt-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-700">Equipment</div>
        {equipmentLoading ? (
          <p className="flex items-center gap-1 text-stone-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading equipment…
          </p>
        ) : null}
        {equipmentError ? <p className="text-red-800">{equipmentError}</p> : null}
        {mode === 'calibration' && cal ? (
          <>
            <EquipmentLine label="Microscope" id={cal.microscopeEquipmentId} options={equipment} onDate={onDate} />
            <EquipmentLine label="Camera" id={cal.cameraEquipmentId} options={equipment} onDate={onDate} />
            <EquipmentLine label="Stage micrometer (calibration)" id={cal.stageMicrometerEquipmentId} options={equipment} onDate={calibrationValidFrom(cal)} />
          </>
        ) : null}
        {mode === 'in_image' ? <EquipmentLine label="Ruler / scale" id={rulerId || null} options={equipment} onDate={onDate} /> : null}
        {mode === 'calibration' && !cal ? <p className="text-stone-600">Choose a calibration to see the microscope and camera.</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-stone-300 pt-2">
        <Field label="Magnification" htmlFor="mg-mag">
          <Input id="mg-mag" className={envInputClass} value={draft.magnification} maxLength={40} disabled={readOnly} placeholder="100×"
            onChange={(e) => onChange({ magnification: e.target.value })} />
        </Field>
        <Field label="Etchant" htmlFor="mg-etch">
          <Input id="mg-etch" className={envInputClass} value={draft.etchant} maxLength={80} disabled={readOnly} placeholder="Nital 2 %"
            onChange={(e) => onChange({ etchant: e.target.value })} />
        </Field>
        <Field label="Orientation" htmlFor="mg-orient">
          <EnvSelect id="mg-orient" value={prep.orientation ?? ''} disabled={readOnly}
            onChange={(v) => setPrep({ orientation: v === 'L' || v === 'T' ? v : null })}>
            <option value="">—</option>
            <option value="L">Longitudinal (L)</option>
            <option value="T">Transverse (T)</option>
          </EnvSelect>
        </Field>
        <Field label="Etch time (s)" htmlFor="mg-etch-s">
          <Input id="mg-etch-s" type="number" inputMode="numeric" min={0} className={envInputClass} disabled={readOnly}
            value={prep.etch_time_s ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value)
              setPrep({ etch_time_s: v !== null && Number.isFinite(v) && v >= 0 ? v : null })
            }} />
        </Field>
        <Field label="Polish" htmlFor="mg-polish" className="col-span-2">
          <Input id="mg-polish" className={envInputClass} value={prep.polish ?? ''} maxLength={120} disabled={readOnly} placeholder="1 µm diamond"
            onChange={(e) => setPrep({ polish: e.target.value || null })} />
        </Field>
        <Field label="Specimen location" htmlFor="mg-loc" className="col-span-2">
          <Input id="mg-loc" className={envInputClass} value={prep.location ?? ''} maxLength={120} disabled={readOnly} placeholder="Bar end, 50 mm from cut"
            onChange={(e) => setPrep({ location: e.target.value || null })} />
        </Field>
      </div>
    </div>
  )
}
