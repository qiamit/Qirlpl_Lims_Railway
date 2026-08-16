import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabaseClient'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  calculateNextDueDate,
  sanitizeDateStr,
  type Frequency,
} from '@/features/masters/equipment-master/types'
import type { EquipmentSource } from './types'

const FREQUENCIES: Frequency[] = [
  'Daily',
  'Weekly',
  'Monthly',
  'Quarterly',
  'Half Yearly',
  'Yearly',
]

type CalFormState = {
  calibrationFrequency: Frequency
  lastCalibrationDate: string
  nextCalibrationDue: string
  calibrationCertificateNumber: string
  calibrationCertificateUncertainty: string
  calibrationUncertaintyUnit: string
  calibrationCoverageFactor: string
  externalAgencyName: string
}

const emptyCalForm = (): CalFormState => ({
  calibrationFrequency: 'Yearly',
  lastCalibrationDate: '',
  nextCalibrationDue: '',
  calibrationCertificateNumber: '',
  calibrationCertificateUncertainty: '',
  calibrationUncertaintyUnit: '',
  calibrationCoverageFactor: '2',
  externalAgencyName: '',
})

function tableForSource(source: EquipmentSource): 'equipment_master' | 'equipment_for_calibration' | 'iqc_masters' {
  if (source === 'calibration' || source === 'calibration_iqc') return 'equipment_for_calibration'
  if (source === 'testing_iqc') return 'iqc_masters'
  return 'equipment_master'
}

function selectColumns(table: ReturnType<typeof tableForSource>): string {
  if (table === 'iqc_masters') {
    return 'calibration_frequency, last_calibration_date, next_calibration_due, calibration_certificate_number'
  }
  if (table === 'equipment_for_calibration') {
    return 'calibration_frequency, last_calibration_date, next_calibration_due, calibration_certificate_number, calibration_certificate_uncertainty, calibration_uncertainty_unit, calibration_coverage_factor, external_calibration_agency_name'
  }
  return 'calibration_frequency, last_calibration_date, next_calibration_due, calibration_certificate_number, calibration_certificate_uncertainty, calibration_uncertainty_unit, calibration_coverage_factor'
}

export function PostRepairCalibrationDialog({
  open,
  onOpenChange,
  equipmentSource,
  equipmentId,
  equipmentLabel,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipmentSource: EquipmentSource
  equipmentId: string
  equipmentLabel: string
  onSaved?: () => void
}) {
  const [form, setForm] = useState<CalFormState>(emptyCalForm)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const table = useMemo(() => tableForSource(equipmentSource), [equipmentSource])
  const showExtended = table !== 'iqc_masters'

  useEffect(() => {
    if (!open || !equipmentId) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      const { data, error: loadError } = await supabase
        .from(table)
        .select(selectColumns(table))
        .eq('id', equipmentId)
        .maybeSingle()
      if (cancelled) return
      if (loadError) {
        setError(loadError.message)
        setForm(emptyCalForm())
        setLoading(false)
        return
      }
      const row = (data ?? {}) as Record<string, unknown>
      const freq = String(row.calibration_frequency ?? '').trim() as Frequency
      const last = sanitizeDateStr(String(row.last_calibration_date ?? ''))
      const next =
        sanitizeDateStr(String(row.next_calibration_due ?? '')) ||
        calculateNextDueDate(last, freq || 'Yearly')
      setForm({
        calibrationFrequency: FREQUENCIES.includes(freq) ? freq : 'Yearly',
        lastCalibrationDate: last,
        nextCalibrationDue: next,
        calibrationCertificateNumber: String(row.calibration_certificate_number ?? ''),
        calibrationCertificateUncertainty: String(row.calibration_certificate_uncertainty ?? ''),
        calibrationUncertaintyUnit: String(row.calibration_uncertainty_unit ?? ''),
        calibrationCoverageFactor: String(row.calibration_coverage_factor ?? '2') || '2',
        externalAgencyName: String(row.external_calibration_agency_name ?? ''),
      })
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, equipmentId, table])

  useEffect(() => {
    if (!open) return
    const nextDue = calculateNextDueDate(form.lastCalibrationDate, form.calibrationFrequency)
    setForm((prev) =>
      prev.nextCalibrationDue === nextDue ? prev : { ...prev, nextCalibrationDue: nextDue },
    )
  }, [form.lastCalibrationDate, form.calibrationFrequency, open])

  const handleSave = async () => {
    if (!equipmentId) {
      setError('Select equipment first.')
      return
    }
    const last = sanitizeDateStr(form.lastCalibrationDate)
    if (!last) {
      setError('Last calibration date is required.')
      return
    }
    setSaving(true)
    setError(null)
    const nextDue =
      calculateNextDueDate(last, form.calibrationFrequency) || sanitizeDateStr(form.nextCalibrationDue)

    const basePayload: Record<string, string | null> = {
      calibration_frequency: form.calibrationFrequency || null,
      last_calibration_date: last || null,
      next_calibration_due: nextDue || null,
      calibration_certificate_number: form.calibrationCertificateNumber.trim() || null,
    }

    if (table === 'equipment_master' || table === 'equipment_for_calibration') {
      basePayload.calibration_certificate_uncertainty =
        form.calibrationCertificateUncertainty.trim() || null
      basePayload.calibration_uncertainty_unit = form.calibrationUncertaintyUnit.trim() || null
      basePayload.calibration_coverage_factor = form.calibrationCoverageFactor.trim() || '2'
    }
    if (table === 'equipment_for_calibration') {
      basePayload.external_calibration_agency_name = form.externalAgencyName.trim() || null
    }

    const { error: saveError } = await supabase.from(table).update(basePayload).eq('id', equipmentId)
    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    onSaved?.()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        className={cn(
          limsDialogClass,
          '!flex max-h-[min(92dvh,40rem)] w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0',
          'md:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:!-translate-x-1/2 md:!-translate-y-1/2',
        )}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Calibration Form
            </DialogTitle>
            {equipmentLabel ? (
              <p className="mt-0.5 text-xs text-stone-300">{equipmentLabel}</p>
            ) : null}
          </DialogHeader>
        </div>

        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5',
            limsRegistryFormClass,
          )}
        >
          {loading ? (
            <p className="text-sm text-stone-600">Loading calibration details…</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ebr-cal-freq">Frequency</Label>
                  <Select
                    value={form.calibrationFrequency || 'Yearly'}
                    onValueChange={(v) =>
                      setForm((prev) => ({ ...prev, calibrationFrequency: v as Frequency }))
                    }
                  >
                    <SelectTrigger id="ebr-cal-freq" aria-label="Calibration frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ebr-cal-last">Last Date *</Label>
                  <Input
                    id="ebr-cal-last"
                    type="date"
                    value={form.lastCalibrationDate}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, lastCalibrationDate: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ebr-cal-next">Next Due (Auto)</Label>
                  <Input
                    id="ebr-cal-next"
                    type="date"
                    value={form.nextCalibrationDue}
                    readOnly
                    className="bg-stone-100 font-mono text-stone-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ebr-cal-cert">Certificate Number</Label>
                  <Input
                    id="ebr-cal-cert"
                    value={form.calibrationCertificateNumber}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        calibrationCertificateNumber: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {showExtended ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ebr-cal-unc">Uncertainty</Label>
                    <Input
                      id="ebr-cal-unc"
                      inputMode="decimal"
                      value={form.calibrationCertificateUncertainty}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          calibrationCertificateUncertainty: e.target.value.replace(/[^0-9.]/g, ''),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ebr-cal-unit">Uncertainty Unit</Label>
                    <Input
                      id="ebr-cal-unit"
                      value={form.calibrationUncertaintyUnit}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          calibrationUncertaintyUnit: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ebr-cal-k">Coverage Factor</Label>
                    <Input
                      id="ebr-cal-k"
                      inputMode="decimal"
                      value={form.calibrationCoverageFactor}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          calibrationCoverageFactor: e.target.value.replace(/[^0-9.]/g, '') || '2',
                        }))
                      }
                    />
                  </div>
                  {table === 'equipment_for_calibration' ? (
                    <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                      <Label htmlFor="ebr-cal-agency">External Calibration Agency</Label>
                      <Input
                        id="ebr-cal-agency"
                        value={form.externalAgencyName}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, externalAgencyName: e.target.value }))
                        }
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {error ? <p className="text-sm text-rose-700">{error}</p> : null}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:px-6">
          <Button
            type="button"
            variant="outline"
            className="rounded-none"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            disabled={saving || loading || !equipmentId}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : 'Save Calibration'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
