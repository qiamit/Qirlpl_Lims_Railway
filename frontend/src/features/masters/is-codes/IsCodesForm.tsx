import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { IsAspect, IsCodeForm } from './types'
import { isValidAmendment2, isValidYear4 } from './types'

export function IsCodesForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
  onClear,
  onPickFiles,
  aspectOptions,
  aspectDialogOpen,
  setAspectDialogOpen,
  newAspect,
  setNewAspect,
  onAddAspect,
  onDeleteAspect,
  onOpenFiles,
}: {
  form: IsCodeForm
  onChange: (next: IsCodeForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  onClear: () => void
  onPickFiles: (files: File[]) => void
  aspectOptions: Array<{ id: string; label: string }>
  aspectDialogOpen: boolean
  setAspectDialogOpen: (value: boolean) => void
  newAspect: string
  setNewAspect: (value: string) => void
  onAddAspect: () => void
  onDeleteAspect: (id: string) => void
  onOpenFiles: () => void
}) {
  const yearError = isValidYear4(form.revisionYear) ? null : 'Year must be up to 4 digits'
  const raError = form.reaffirmationYear.trim().length === 0 || /^RA[0-9]{0,4}$/.test(form.reaffirmationYear.trim()) ? null : 'Use RA + Year (e.g. RA2026)'
  const amendError = isValidAmendment2(form.amendmentNumber) ? null : 'Up to 2 digits'

  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-6 pt-5">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 md:col-span-3 space-y-2">
            <Label className="text-xs">IS Number</Label>
            <Input
              placeholder="IS 1234"
              value={form.isNumber}
              onChange={(e) => onChange({ ...form, isNumber: e.target.value })}
            />
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <Label className="text-xs">Revision of Year</Label>
            <Input
              inputMode="numeric"
              placeholder="YYYY"
              value={form.revisionYear}
              onChange={(e) => onChange({ ...form, revisionYear: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })}
            />
            {yearError && <p className="text-xs text-destructive">{yearError}</p>}
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <Label className="text-xs">Reaffirmation Year</Label>
            <Input
              placeholder="RA2026"
              value={form.reaffirmationYear}
              onChange={(e) => {
                const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                const next = v.startsWith('RA') ? v : `RA${v.replace(/^RA/, '')}`
                onChange({ ...form, reaffirmationYear: next.slice(0, 6) })
              }}
            />
            {raError && <p className="text-xs text-destructive">{raError}</p>}
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <Label className="text-xs">Amendment Number</Label>
            <Input
              inputMode="numeric"
              placeholder="01"
              value={form.amendmentNumber}
              onChange={(e) => onChange({ ...form, amendmentNumber: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) })}
            />
            {amendError && <p className="text-xs text-destructive">{amendError}</p>}
          </div>

          <div className="col-span-12 space-y-2">
            <Label className="text-xs">Title of the IS Code</Label>
            <Input
              placeholder="Enter title"
              value={form.title}
              onChange={(e) => onChange({ ...form, title: e.target.value })}
            />
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex items-center justify-between h-5">
              <Label className="text-xs">Aspact of IS</Label>
              <Dialog open={aspectDialogOpen} onOpenChange={setAspectDialogOpen}>
                <DialogTrigger asChild>
                  <button className="text-[11px] font-medium text-primary flex items-center gap-1 hover:underline">
                    <Plus size={12} />
                    Add
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Manage Aspects</DialogTitle>
                    <DialogDescription>Add or remove aspects.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-aspect" className="text-xs">Add Aspect</Label>
                      <Input
                        id="new-aspect"
                        placeholder="e.g., Specification"
                        value={newAspect}
                        onChange={(e) => setNewAspect(e.target.value)}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Existing</p>
                      <div className="space-y-1 max-h-40 overflow-auto">
                        {aspectOptions.map((a) => (
                          <div key={a.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm">
                            <span>{a.label}</span>
                            {aspectOptions.length > 1 && (
                              <button type="button" onClick={() => onDeleteAspect(a.id)} className="text-destructive hover:text-destructive/80">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => setAspectDialogOpen(false)}>Close</Button>
                    <Button type="button" onClick={onAddAspect} disabled={!newAspect.trim()}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Select value={form.aspect} onValueChange={(v) => onChange({ ...form, aspect: v as IsAspect })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from(new Set([form.aspect, ...aspectOptions.map((x) => x.label)].filter((v) => String(v ?? '').trim().length > 0))).map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <Label className="text-xs">Testing Charges</Label>
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={form.testingCharges}
              onChange={(e) => onChange({ ...form, testingCharges: e.target.value.replace(/[^0-9.]/g, '') })}
            />
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <Label className="text-xs">Remarks</Label>
            <Input
              placeholder="Enter remarks"
              value={form.remarks}
              onChange={(e) => onChange({ ...form, remarks: e.target.value })}
            />
          </div>

          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="flex items-center justify-between h-5">
              <Label className="text-xs">IS Code Files</Label>
              <button
                type="button"
                className="text-[11px] font-medium text-primary flex items-center gap-1 hover:underline"
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.multiple = true
                  input.onchange = () => {
                    const list = Array.from(input.files ?? [])
                    onPickFiles(list)
                  }
                  input.click()
                }}
              >
                <Plus size={12} />
                Add
              </button>
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={onOpenFiles}>
              View Files
            </Button>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClear} disabled={saveLoading} className="w-28">
          Clear
        </Button>
        <Button type="button" onClick={onSave} disabled={!canSave} className="w-28">
          {saveLoading ? 'Saving…' : 'Save'}
        </Button>
      </CardFooter>
    </Card>
  )
}
