import { useState } from 'react'
import { AlertTriangle, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { limsDialogClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { EnvSelect, Field, MessageLine, envInputClass } from '@/features/environment/EnvironmentUi'
import { ComingLaterChip } from '../MetallographyUi'
import { createMethod, metallographyErrorText, updateMethod } from '../metallographyApi'
import {
  ANALYSIS_KINDS,
  ANALYSIS_KIND_LABEL,
  ANALYSIS_KIND_STANDARD_HINT,
  AVAILABLE_ANALYSIS_KINDS,
  RING_TEST_DEFAULT_SETTINGS,
  type AnalysisKind,
  type MethodSettings,
  type ParameterMethod,
  type ParameterMethodInput,
  type RingTestMethodSettings,
  type ScaleMode,
} from '../types'

/** The Test Parameter master row being mapped. */
export type MappableParameter = {
  id: string
  itemName: string
  testMethod: string | null
  unitValue: string | null
}

/** Prefills per kind (Method Setup holds the real values). */
const KIND_DEFAULTS: Record<
  AnalysisKind,
  { quantity: string; unit: string | null; decimals: number | null; scaleMode: ScaleMode; variant: string }
> = {
  ring_test: { quantity: 'ring_values', unit: 'mm', decimals: 3, scaleMode: 'in_image_reference', variant: '' },
  grain_size: { quantity: 'G', unit: null, decimals: 1, scaleMode: 'calibration', variant: 'intercept' },
  inclusion: { quantity: 'worst_field_ratings', unit: null, decimals: 1, scaleMode: 'calibration', variant: '' },
  decarburization: { quantity: 'mean_depth_mm', unit: 'mm', decimals: 2, scaleMode: 'calibration', variant: '' },
  microstructure: { quantity: 'phase_fraction_pct', unit: '%', decimals: 1, scaleMode: 'calibration', variant: 'point_count' },
  macro: { quantity: 'macro_measurements', unit: 'mm', decimals: 2, scaleMode: 'in_image_reference', variant: '' },
}

const IN_IMAGE_KINDS: ReadonlySet<AnalysisKind> = new Set<AnalysisKind>(['ring_test', 'macro'])

type RingForm = {
  thicknessMin: string
  thicknessMax: string
  shareMin: string
  shareMax: string
  inclusive: boolean
  verified: boolean
  outerGap: string
  innerGap: string
  angular: string
}

type Form = {
  kind: AnalysisKind
  variant: string
  standardRef: string
  quantity: string
  unit: string
  decimals: string
  minFields: string
  minCounts: string
  scaleMode: ScaleMode
  ring: RingForm
}

const text = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))

function ringForm(settings: MethodSettings | null | undefined): RingForm {
  const s: RingTestMethodSettings = { ...RING_TEST_DEFAULT_SETTINGS, ...(settings ?? {}) }
  return {
    thicknessMin: text(s.thickness_min_factor),
    thicknessMax: text(s.thickness_max_factor),
    shareMin: text(s.tm_share_min_pct),
    shareMax: text(s.tm_share_max_pct),
    inclusive: s.limits_inclusive !== false,
    verified: s.limits_verified === true,
    outerGap: text(s.outer_gap_px),
    innerGap: text(s.inner_gap_px),
    angular: text(s.angular_correction_deg),
  }
}

function initialForm(parameter: MappableParameter, method: ParameterMethod | null): Form {
  if (method) {
    return {
      kind: method.analysisKind,
      variant: method.methodVariant ?? '',
      standardRef: method.standardRef,
      quantity: method.reportedQuantity,
      unit: method.reportedUnit ?? '',
      decimals: text(method.decimals),
      minFields: text(method.minFields),
      minCounts: text(method.minCountsPerField),
      scaleMode: method.scaleMode,
      ring: ringForm(method.settings),
    }
  }
  const d = KIND_DEFAULTS.ring_test
  return {
    kind: 'ring_test',
    variant: d.variant,
    standardRef: parameter.testMethod ?? '',
    quantity: d.quantity,
    unit: parameter.unitValue ?? d.unit ?? '',
    decimals: text(d.decimals),
    minFields: '1',
    minCounts: '',
    scaleMode: d.scaleMode,
    ring: ringForm(null),
  }
}

const parseNum = (v: string): number | null => {
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Validates the form; returns the payload or a plain-English problem. */
function toPayload(
  f: Form,
  parameter: MappableParameter,
  method: ParameterMethod | null,
): { input: ParameterMethodInput } | { problem: string } {
  if (!f.quantity.trim()) return { problem: 'Enter the reported quantity.' }
  if (!f.standardRef.trim() && !parameter.testMethod?.trim()) {
    return { problem: 'Enter the standard / method reference (the test parameter has no test method).' }
  }
  const decimals = parseNum(f.decimals)
  if (f.kind !== 'ring_test' && f.decimals.trim() && (decimals === null || !Number.isInteger(decimals) || decimals < 0 || decimals > 6)) {
    return { problem: 'Decimals must be a whole number from 0 to 6.' }
  }
  const minFields = parseNum(f.minFields)
  if (minFields === null || !Number.isInteger(minFields) || minFields < 1) {
    return { problem: 'Minimum fields must be a whole number of 1 or more.' }
  }
  const minCounts = parseNum(f.minCounts)
  if (f.minCounts.trim() && (minCounts === null || !Number.isInteger(minCounts) || minCounts < 1)) {
    return { problem: 'Minimum counts per field must be a whole number of 1 or more, or empty.' }
  }
  if (f.scaleMode === 'in_image_reference' && !IN_IMAGE_KINDS.has(f.kind)) {
    return { problem: 'An in-image reference scale is allowed only for ring test and macro.' }
  }

  // Keep keys this form does not edit (same kind only; a new kind starts empty).
  let settings: MethodSettings = method && method.analysisKind === f.kind ? { ...method.settings } : {}
  if (f.kind === 'ring_test') {
    const r = f.ring
    const tMin = parseNum(r.thicknessMin)
    const tMax = parseNum(r.thicknessMax)
    const sMin = parseNum(r.shareMin)
    const sMax = parseNum(r.shareMax)
    const outer = parseNum(r.outerGap)
    const inner = parseNum(r.innerGap)
    const angular = parseNum(r.angular)
    if (tMin === null || tMax === null || tMin <= 0 || tMax >= 1 || tMin >= tMax) {
      return { problem: 'Thickness factors must satisfy 0 < minimum < maximum < 1 (for example 0.07 and 0.15).' }
    }
    if (sMin === null || sMax === null || sMin < 0 || sMax > 100 || sMin >= sMax) {
      return { problem: 'TM share limits must satisfy 0 ≤ minimum < maximum ≤ 100 %.' }
    }
    if (outer === null || inner === null || outer < 0 || inner < 0) {
      return { problem: 'Outer and inner gaps must be numbers of 0 px or more.' }
    }
    if (angular === null || Math.abs(angular) > 45) {
      return { problem: 'Angular correction must be a number between −45° and 45°.' }
    }
    const ring: RingTestMethodSettings = {
      thickness_min_factor: tMin,
      thickness_max_factor: tMax,
      tm_share_min_pct: sMin,
      tm_share_max_pct: sMax,
      limits_inclusive: r.inclusive,
      limits_verified: r.verified,
      outer_gap_px: outer,
      inner_gap_px: inner,
      angular_correction_deg: angular,
    }
    settings = { ...settings, ...ring }
  }

  return {
    input: {
      testParameterId: parameter.id,
      analysisKind: f.kind,
      methodVariant: f.variant.trim() || null,
      standardRef: f.standardRef.trim() || null,
      reportedQuantity: f.quantity.trim(),
      reportedUnit: f.unit.trim() || null,
      // Ring test: fixed precision (thickness 3, TM share 2), see formatResult.ts.
      decimals: f.kind === 'ring_test' ? 3 : f.decimals.trim() ? decimals : null,
      minFields,
      minCountsPerField: f.minCounts.trim() ? minCounts : null,
      scaleMode: f.scaleMode,
      settings,
    },
  }
}

/**
 * Map a test parameter to an analysis kind, or change the mapping (S5 Test
 * parameters tab). A change to an existing mapping asks for the reason.
 */
export function MethodMappingDialog({
  parameter,
  method,
  onClose,
  onSaved,
}: {
  parameter: MappableParameter
  /** Existing mapping, or null to map the parameter. */
  method: ParameterMethod | null
  onClose: () => void
  onSaved: (m: ParameterMethod, message: string) => void
}) {
  const askReason = useReasonForChange()
  const [form, setForm] = useState<Form>(() => initialForm(parameter, method))
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))
  const setRing = (patch: Partial<RingForm>) => setForm((f) => ({ ...f, ring: { ...f.ring, ...patch } }))

  const changeKind = (kind: AnalysisKind) => {
    const d = KIND_DEFAULTS[kind]
    setForm((f) => ({
      ...f,
      kind,
      // Only prefill when this is a new mapping; an edit keeps what was typed.
      ...(method
        ? { scaleMode: IN_IMAGE_KINDS.has(kind) ? f.scaleMode : 'calibration' }
        : {
            variant: d.variant,
            quantity: d.quantity,
            unit: parameter.unitValue ?? d.unit ?? '',
            decimals: text(d.decimals),
            scaleMode: d.scaleMode,
          }),
    }))
  }

  const save = async () => {
    const res = toPayload(form, parameter, method)
    if ('problem' in res) {
      setProblem(res.problem)
      return
    }
    let reason: string | null = null
    if (method) {
      reason = await askReason({
        title: `Reason for changing the method of ${parameter.itemName}`,
        recordLabel: `${parameter.itemName} · ${ANALYSIS_KIND_LABEL[method.analysisKind]}`,
        description: 'Analyses already started keep the method as it was when they were created.',
        confirmLabel: 'Save changes',
        quickPicks: [
          'Limits verified against IS 1786',
          'Standard revised',
          'Entry error corrected',
          'Method validation outcome',
        ],
      })
      if (!reason) return
    }
    setSaving(true)
    setProblem(null)
    try {
      const saved = method ? await updateMethod(method.id, res.input) : await createMethod(res.input)
      if (method && reason) await recordReason('metallography_parameter_methods', method.id, reason)
      onSaved(saved, method ? `${parameter.itemName}: method saved.` : `${parameter.itemName} mapped to ${ANALYSIS_KIND_LABEL[saved.analysisKind]}.`)
    } catch (err) {
      setProblem(metallographyErrorText(err))
    } finally {
      setSaving(false)
    }
  }

  const ring = form.ring
  const available = AVAILABLE_ANALYSIS_KINDS.has(form.kind)

  return (
    <Dialog open onOpenChange={(o) => (!o && !saving ? onClose() : undefined)}>
      <DialogContent className={cn(limsDialogClass, 'flex max-h-[100dvh] w-[calc(100vw-0.5rem)] max-w-2xl flex-col sm:max-h-[95dvh]')}>
        <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white">
              {method ? 'Change metallography method' : 'Map to metallography'}
            </DialogTitle>
            <DialogDescription className="text-[12px] text-stone-300">{parameter.itemName}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
          <MessageLine tone="error" text={problem} />

          <fieldset className="border border-stone-400 bg-white p-2.5">
            <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-stone-700">Method</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Analysis kind" htmlFor="mm-kind">
                <EnvSelect id="mm-kind" value={form.kind} onChange={(v) => changeKind(v as AnalysisKind)}>
                  {ANALYSIS_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ANALYSIS_KIND_LABEL[k]}
                      {AVAILABLE_ANALYSIS_KINDS.has(k) ? '' : ' (coming later)'}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="Method variant (optional)" htmlFor="mm-variant">
                <Input
                  id="mm-variant"
                  className={envInputClass}
                  value={form.variant}
                  onChange={(e) => set({ variant: e.target.value })}
                  placeholder="e.g. intercept, planimetric"
                />
              </Field>
              {!available ? (
                <div className="flex items-center gap-2 text-[12px] text-stone-700 sm:col-span-2">
                  <ComingLaterChip /> The parameter can be mapped now; its analysis engine comes in a later release.
                </div>
              ) : null}
              <Field label="Standard / method reference" htmlFor="mm-standard" className="sm:col-span-2">
                <Input
                  id="mm-standard"
                  className={envInputClass}
                  value={form.standardRef}
                  onChange={(e) => set({ standardRef: e.target.value })}
                  placeholder={parameter.testMethod || ANALYSIS_KIND_STANDARD_HINT[form.kind] || 'Standard and clause'}
                />
              </Field>
              <Field label="Reported quantity" htmlFor="mm-quantity">
                <Input
                  id="mm-quantity"
                  className={envInputClass}
                  value={form.quantity}
                  onChange={(e) => set({ quantity: e.target.value })}
                />
              </Field>
              <Field label="Reported unit" htmlFor="mm-unit">
                <Input id="mm-unit" className={envInputClass} value={form.unit} onChange={(e) => set({ unit: e.target.value })} />
              </Field>
              <Field label="Decimals" htmlFor="mm-decimals">
                <Input
                  id="mm-decimals"
                  inputMode="numeric"
                  className={envInputClass}
                  value={form.kind === 'ring_test' ? '3' : form.decimals}
                  disabled={form.kind === 'ring_test'}
                  onChange={(e) => set({ decimals: e.target.value })}
                />
                {form.kind === 'ring_test' ? (
                  <p className="text-[11.5px] text-stone-600">Fixed: thickness 3, TM share 2 decimals.</p>
                ) : null}
              </Field>
              <Field label="Scale" htmlFor="mm-scale">
                <EnvSelect id="mm-scale" value={form.scaleMode} onChange={(v) => set({ scaleMode: v as ScaleMode })}>
                  <option value="calibration">Microscope calibration (µm/px)</option>
                  <option value="in_image_reference" disabled={!IN_IMAGE_KINDS.has(form.kind)}>
                    Reference line in the image (ring / macro)
                  </option>
                </EnvSelect>
              </Field>
              <Field label="Minimum fields" htmlFor="mm-fields">
                <Input
                  id="mm-fields"
                  inputMode="numeric"
                  className={envInputClass}
                  value={form.minFields}
                  onChange={(e) => set({ minFields: e.target.value })}
                />
              </Field>
              <Field label="Minimum counts per field (optional)" htmlFor="mm-counts">
                <Input
                  id="mm-counts"
                  inputMode="numeric"
                  className={envInputClass}
                  value={form.minCounts}
                  onChange={(e) => set({ minCounts: e.target.value })}
                />
              </Field>
            </div>
          </fieldset>

          {form.kind === 'ring_test' ? (
            <fieldset className="border border-stone-400 bg-white p-2.5">
              <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-stone-700">
                Ring test limits and drawing
              </legend>
              {!ring.verified ? (
                <p className="mb-2 flex items-start gap-2 border border-amber-600/60 bg-amber-50 px-2 py-1.5 text-[12px] text-amber-950">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Verify against IS 1786. These start as the old program's values (0.07d–0.15d, 30–50 % TM).
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Thickness min (× d)" htmlFor="mm-tmin">
                  <Input
                    id="mm-tmin"
                    inputMode="decimal"
                    className={envInputClass}
                    value={ring.thicknessMin}
                    onChange={(e) => setRing({ thicknessMin: e.target.value })}
                  />
                </Field>
                <Field label="Thickness max (× d)" htmlFor="mm-tmax">
                  <Input
                    id="mm-tmax"
                    inputMode="decimal"
                    className={envInputClass}
                    value={ring.thicknessMax}
                    onChange={(e) => setRing({ thicknessMax: e.target.value })}
                  />
                </Field>
                <Field label="TM share min (%)" htmlFor="mm-smin">
                  <Input
                    id="mm-smin"
                    inputMode="decimal"
                    className={envInputClass}
                    value={ring.shareMin}
                    onChange={(e) => setRing({ shareMin: e.target.value })}
                  />
                </Field>
                <Field label="TM share max (%)" htmlFor="mm-smax">
                  <Input
                    id="mm-smax"
                    inputMode="decimal"
                    className={envInputClass}
                    value={ring.shareMax}
                    onChange={(e) => setRing({ shareMax: e.target.value })}
                  />
                </Field>
                <Field label="Outer gap (px)" htmlFor="mm-outer">
                  <Input
                    id="mm-outer"
                    inputMode="decimal"
                    className={envInputClass}
                    value={ring.outerGap}
                    onChange={(e) => setRing({ outerGap: e.target.value })}
                  />
                </Field>
                <Field label="Inner gap (px)" htmlFor="mm-inner">
                  <Input
                    id="mm-inner"
                    inputMode="decimal"
                    className={envInputClass}
                    value={ring.innerGap}
                    onChange={(e) => setRing({ innerGap: e.target.value })}
                  />
                </Field>
                <Field label="Angular correction (°)" htmlFor="mm-angle">
                  <Input
                    id="mm-angle"
                    inputMode="decimal"
                    className={envInputClass}
                    value={ring.angular}
                    onChange={(e) => setRing({ angular: e.target.value })}
                  />
                </Field>
              </div>
              <div className="mt-2 flex flex-wrap gap-4">
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={ring.inclusive}
                    onChange={(e) => setRing({ inclusive: e.target.checked })}
                  />
                  A value equal to a limit passes
                </label>
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={ring.verified}
                    onChange={(e) => setRing({ verified: e.target.checked })}
                  />
                  Limits verified against IS 1786
                </label>
              </div>
            </fieldset>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t-2 border-stone-500 bg-stone-100 px-3 py-2">
          <Button variant="outline" className={limsOutlineBtnClass} onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className={limsPrimaryBtnClass} onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {method ? 'Save changes' : 'Map'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
