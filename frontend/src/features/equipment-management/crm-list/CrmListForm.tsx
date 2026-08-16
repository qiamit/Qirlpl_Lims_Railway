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
import { MeasurementUnitSelect } from '@/features/masters/measurement-units/MeasurementUnitSelect'
import {
  limsFieldWithAddShellClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { isValidYearOrEmpty, type CrmForm, type UncertaintySign } from './types'

export function CrmListForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
}: {
  form: CrmForm
  onChange: (next: CrmForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
}) {
  const yearError = isValidYearOrEmpty(form.yearOfPurchase)
    ? null
    : 'Year must be between 1900 and 2100'

  return (
    <div className={cn(limsRegistryFormClass, 'space-y-5')}>
      {yearError ? (
        <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {yearError}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="crm-id-no">ID No</Label>
          <Input
            id="crm-id-no"
            value={form.idNo}
            onChange={(e) => onChange({ ...form, idNo: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="crm-year">Year of Purchase</Label>
          <Input
            id="crm-year"
            value={form.yearOfPurchase}
            onChange={(e) =>
              onChange({ ...form, yearOfPurchase: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })
            }
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="crm-type">CRM Type</Label>
          <Input
            id="crm-type"
            value={form.crmType}
            onChange={(e) => onChange({ ...form, crmType: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="crm-make">Make</Label>
          <Input
            id="crm-make"
            value={form.make}
            onChange={(e) => onChange({ ...form, make: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="crm-trace-from">Traceability From</Label>
          <Input
            id="crm-trace-from"
            value={form.traceabilityFrom}
            onChange={(e) => onChange({ ...form, traceabilityFrom: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="crm-trace-as-per">Traceability As Per</Label>
          <Input
            id="crm-trace-as-per"
            value={form.traceabilityAsPer}
            onChange={(e) => onChange({ ...form, traceabilityAsPer: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="crm-uncertainty-value">Uncertainty</Label>
          <div className={cn(limsFieldWithAddShellClass, 'items-stretch')}>
            <Select
              value={form.uncertaintySign}
              onValueChange={(v) =>
                onChange({ ...form, uncertaintySign: v as UncertaintySign })
              }
            >
              <SelectTrigger
                id="crm-uncertainty-sign"
                aria-label="Uncertainty sign"
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
              id="crm-uncertainty-value"
              inputMode="decimal"
              aria-label="Uncertainty value"
              value={form.uncertaintyValue}
              onChange={(e) =>
                onChange({
                  ...form,
                  uncertaintyValue: e.target.value.replace(/[^0-9.]/g, ''),
                })
              }
              className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
            />
            <div className="min-w-0 flex-[1.2] border-l border-stone-500">
              <MeasurementUnitSelect
                id="crm-uncertainty-unit"
                value={form.uncertaintyUnit}
                onChange={(uncertaintyUnit) => onChange({ ...form, uncertaintyUnit })}
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
        <div className="space-y-2">
          <Label htmlFor="crm-valid-upto">Valid Up To</Label>
          <Input
            id="crm-valid-upto"
            type="date"
            value={form.validUpto}
            onChange={(e) => onChange({ ...form, validUpto: e.target.value })}
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="button"
          className={cn('min-w-[7rem]', limsPrimaryBtnClass)}
          disabled={!canSave || saveLoading}
          onClick={onSave}
        >
          {saveLoading ? 'Saving…' : 'Save & Close'}
        </Button>
      </div>
    </div>
  )
}
