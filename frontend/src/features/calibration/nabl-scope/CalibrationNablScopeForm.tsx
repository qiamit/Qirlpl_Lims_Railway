import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MeasurementUnitSelect } from '@/features/masters/measurement-units/MeasurementUnitSelect'
import { NablLookupSelect } from '@/features/masters/product-services/NablLookupSelect'
import {
  limsFieldWithAddShellClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  CALIBRATION_FACILITY_TYPE_OPTIONS,
  joinCmcParts,
  splitCmcParts,
  type CalibrationNablScopeForm,
  type CmcSign,
} from './types'

export function CalibrationNablScopeFormView({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
}: {
  form: CalibrationNablScopeForm
  onChange: (next: CalibrationNablScopeForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
}) {
  const cmcParts = splitCmcParts(form.cmc)

  const patchCmc = (patch: Partial<ReturnType<typeof splitCmcParts>>) => {
    onChange({
      ...form,
      cmc: joinCmcParts({ ...cmcParts, ...patch }),
    })
  }

  return (
    <div className={cn(limsRegistryFormClass, 'space-y-5')}>
      <div className="grid gap-4 md:grid-cols-3">
        <NablLookupSelect
          kind="discipline_name"
          id="calib-nabl-discipline"
          label="Discipline Name"
          value={form.disciplineName}
          onChange={(disciplineName) => onChange({ ...form, disciplineName })}
          placeholder=""
        />

        <NablLookupSelect
          kind="group_name"
          id="calib-nabl-group"
          label="Group"
          value={form.groupName}
          onChange={(groupName) => onChange({ ...form, groupName })}
          placeholder=""
        />

        <div className="space-y-2">
          <Label htmlFor="calib-nabl-facility">Type of Calibration Facility</Label>
          <Select
            value={form.facilityType}
            onValueChange={(v) => onChange({ ...form, facilityType: v })}
          >
            <SelectTrigger id="calib-nabl-facility" aria-label="Type of calibration facility">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CALIBRATION_FACILITY_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="calib-nabl-measurand">Measurand / Instrument / Quantity Measured</Label>
        <Textarea
          id="calib-nabl-measurand"
          value={form.measurand}
          onChange={(e) => onChange({ ...form, measurand: e.target.value })}
          rows={1}
          className="!min-h-8 resize-y"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="calib-nabl-method">Calibration or Measurement Method / Procedure</Label>
          <Textarea
            id="calib-nabl-method"
            value={form.calibrationMethod}
            onChange={(e) => onChange({ ...form, calibrationMethod: e.target.value })}
            rows={1}
            className="!min-h-8 resize-y"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="calib-nabl-range">Measurement Range (and Frequency, if applicable)</Label>
          <Textarea
            id="calib-nabl-range"
            value={form.measurementRange}
            onChange={(e) => onChange({ ...form, measurementRange: e.target.value })}
            rows={1}
            className="!min-h-8 resize-y"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="calib-nabl-cmc-value">CMC (±) — absolute or %</Label>
        <div className={cn(limsFieldWithAddShellClass, 'items-stretch')}>
          <Select
            value={cmcParts.sign}
            onValueChange={(v) => patchCmc({ sign: v as CmcSign })}
          >
            <SelectTrigger
              id="calib-nabl-cmc-sign"
              aria-label="CMC sign"
              className="h-full w-[4.25rem] shrink-0 rounded-none border-0 border-r border-stone-500 bg-transparent px-2 shadow-none focus:ring-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="±">±</SelectItem>
              <SelectItem value="+">+</SelectItem>
              <SelectItem value="-">−</SelectItem>
            </SelectContent>
          </Select>
          <Input
            id="calib-nabl-cmc-value"
            inputMode="decimal"
            aria-label="CMC value"
            value={cmcParts.value}
            onChange={(e) => patchCmc({ value: e.target.value.replace(/[^0-9.]/g, '') })}
            className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
          />
          <div className="min-w-0 flex-[1.2] border-l border-stone-500">
            <MeasurementUnitSelect
              id="calib-nabl-cmc-unit"
              value={cmcParts.unit}
              onChange={(unit) => patchCmc({ unit })}
              showLabel={false}
              showManageButton
              placeholder=""
              className="min-w-0"
              shellClassName="h-full border-0 focus-within:border-transparent focus-within:ring-0"
              inputClassName="px-2"
            />
          </div>
        </div>
      </div>

      <div className="-mx-4 mt-2 flex items-center justify-end gap-2 border-t border-stone-300 bg-stone-50 px-4 py-3 sm:-mx-6 sm:px-6">
        <Button
          type="button"
          className={limsPrimaryBtnClass}
          onClick={onSave}
          disabled={!canSave}
        >
          {saveLoading ? 'Saving…' : 'Save & Close'}
        </Button>
      </div>
    </div>
  )
}
