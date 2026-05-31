import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  isValidIntegerOrEmpty,
  isValidNumberOrEmpty,
  NABL_TYPE_OF_TEST_OPTIONS,
  type NablScopeForm,
} from './types'

export function ProductServicesForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
  onClear,
}: {
  form: NablScopeForm
  onChange: (next: NablScopeForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  onClear: () => void
}) {
  const sNoError = isValidIntegerOrEmpty(form.sNo) ? null : 'S.No must be a positive whole number'
  const rangeMinError = isValidNumberOrEmpty(form.rangeMinimum) ? null : 'Range minimum must be a number'
  const rangeMaxError = isValidNumberOrEmpty(form.rangeMaximum) ? null : 'Range maximum must be a number'
  const minNum = form.rangeMinimum.trim() ? Number(form.rangeMinimum) : null
  const maxNum = form.rangeMaximum.trim() ? Number(form.rangeMaximum) : null
  const rangeOrderError =
    minNum != null && maxNum != null && minNum > maxNum
      ? 'Range minimum cannot be greater than range maximum'
      : null

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        {(sNoError || rangeMinError || rangeMaxError || rangeOrderError) && (
          <p className="text-sm text-destructive">
            {sNoError || rangeMinError || rangeMaxError || rangeOrderError}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="nabl-s-no">S.No</Label>
            <Input
              id="nabl-s-no"
              value={form.sNo}
              onChange={(e) => onChange({ ...form, sNo: e.target.value })}
              placeholder="1"
            />
          </div>

          <div className="space-y-2 md:col-span-3">
            <Label htmlFor="nabl-discipline">Discipline / Group</Label>
            <Input
              id="nabl-discipline"
              value={form.disciplineGroup}
              onChange={(e) => onChange({ ...form, disciplineGroup: e.target.value })}
              placeholder="CHEMICAL- BUILDING MATERIAL"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="nabl-materials">Materials or Products Tested</Label>
          <Input
            id="nabl-materials"
            value={form.materialsProducts}
            onChange={(e) => onChange({ ...form, materialsProducts: e.target.value })}
            placeholder="Fine & Coarse Aggregates"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nabl-component">Component / Parameter / Test Performed</Label>
          <Textarea
            id="nabl-component"
            value={form.componentParameter}
            onChange={(e) => onChange({ ...form, componentParameter: e.target.value })}
            placeholder="Organic Impurities"
            rows={3}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nabl-method">Test Method Specification</Label>
            <Input
              id="nabl-method"
              value={form.testMethodSpecification}
              onChange={(e) => onChange({ ...form, testMethodSpecification: e.target.value })}
              placeholder="IS 2386 (Part 2)"
            />
          </div>

          <div className="space-y-2">
            <Label>Permanent Testing</Label>
            <Select
              value={form.permanentTesting}
              onValueChange={(v) => onChange({ ...form, permanentTesting: v })}
            >
              <SelectTrigger aria-label="Permanent testing">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Permanent Testing">Permanent Testing</SelectItem>
                <SelectItem value="Temporary Testing">Temporary Testing</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Type of Test</Label>
            <Select
              value={form.typeOfTest || '__none__'}
              onValueChange={(v) =>
                onChange({ ...form, typeOfTest: v === '__none__' ? '' : v })
              }
            >
              <SelectTrigger aria-label="Type of test">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {NABL_TYPE_OF_TEST_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nabl-range-min">Range Minimum</Label>
            <Input
              id="nabl-range-min"
              type="number"
              inputMode="decimal"
              step="any"
              value={form.rangeMinimum}
              onChange={(e) => onChange({ ...form, rangeMinimum: e.target.value })}
              placeholder="e.g. 0.01"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nabl-range-max">Range Maximum</Label>
            <Input
              id="nabl-range-max"
              type="number"
              inputMode="decimal"
              step="any"
              value={form.rangeMaximum}
              onChange={(e) => onChange({ ...form, rangeMaximum: e.target.value })}
              placeholder="e.g. 100"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nabl-uncertainty">Uncertainty</Label>
            <Input
              id="nabl-uncertainty"
              value={form.uncertainty}
              onChange={(e) => onChange({ ...form, uncertainty: e.target.value })}
              placeholder="e.g. ±0.5% or ±0.02"
            />
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <div className="w-full flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClear} disabled={saveLoading}>
            Clear
          </Button>
          <Button type="button" onClick={onSave} disabled={!canSave}>
            {saveLoading ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
