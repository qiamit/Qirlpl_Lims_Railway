import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { isValidNumberOrEmpty, type EquipmentForm, type EquipmentStatus } from './types'

export function EquipmentMasterForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
  onClear,
  locations,
}: {
  form: EquipmentForm
  onChange: (next: EquipmentForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  onClear: () => void
  locations: string[]
}) {
  const numberError = (label: string, v: string) => (isValidNumberOrEmpty(v) ? null : `${label} must be a number`)
  const muError = numberError('Uncertainty of Calibration (MU)', form.uncertaintyMu)
  const accError = numberError('Acceptance Criteria', form.acceptanceCriteria)

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        {(muError || accError) && (
          <div className="space-y-1">
            {muError && <p className="text-sm text-destructive">{muError}</p>}
            {accError && <p className="text-sm text-destructive">{accError}</p>}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2 md:col-span-1">
            <Label>Name of the Equipment</Label>
            <Input value={form.equipmentName} onChange={(e) => onChange({ ...form, equipmentName: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label>Equipment Code</Label>
            <Input value={form.equipmentCode} readOnly />
          </div>

          <div className="space-y-2">
            <Label>Status of the Equipment</Label>
            <Select value={form.status} onValueChange={(v) => onChange({ ...form, status: v as EquipmentStatus })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Make</Label>
            <Input value={form.make} onChange={(e) => onChange({ ...form, make: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Model & Serial Number</Label>
            <Input value={form.modelSerialNo} onChange={(e) => onChange({ ...form, modelSerialNo: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Least Count of Instrument</Label>
            <Input value={form.leastCount} onChange={(e) => onChange({ ...form, leastCount: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Range of Instrument</Label>
            <Input
              value={form.rangeOfInstrument}
              onChange={(e) => onChange({ ...form, rangeOfInstrument: e.target.value })}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Location of the Equipment</Label>
            <Select value={form.location} onValueChange={(v) => onChange({ ...form, location: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date of Placed in Service</Label>
            <Input type="date" value={form.placedDate} onChange={(e) => onChange({ ...form, placedDate: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Uncertainity of Calibration (MU)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">±</span>
              <Input
                value={form.uncertaintyMu}
                onChange={(e) => onChange({ ...form, uncertaintyMu: e.target.value })}
                className="pl-8 pr-10"
                placeholder="5.60"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Acceptance Creteria</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">±</span>
              <Input
                value={form.acceptanceCriteria}
                onChange={(e) => onChange({ ...form, acceptanceCriteria: e.target.value })}
                className="pl-8 pr-10"
                placeholder="5.60"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Remarks</Label>
            <Textarea value={form.remarks} onChange={(e) => onChange({ ...form, remarks: e.target.value })} />
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
