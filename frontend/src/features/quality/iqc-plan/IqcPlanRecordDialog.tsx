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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RESULT_VALIDATION_MODULES } from '@/features/quality/result-validation/resultValidationModules'
import { IQC_PLAN_DEFAULT_ACCEPTANCE_CRITERIA } from './iqcPlanDefaults'
import { frequencySelectOptions } from './iqcPlanFrequency'
import { IQC_PLAN_STATUS_LABELS } from './iqcPlanStatus'
import type { IqcPlanForm, IqcPlanRow, IqcPlanStatus } from './types'
import { emptyIqcPlanForm, rowToIqcPlanForm } from './types'

const CHECK_NAME_OPTIONS = RESULT_VALIDATION_MODULES.filter((module) => module.checkType != null)

export function IqcPlanRecordDialog({
  open,
  onOpenChange,
  row,
  saving,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: IqcPlanRow | null
  saving: boolean
  onSave: (form: IqcPlanForm) => Promise<void>
}) {
  const [form, setForm] = useState<IqcPlanForm>(() => emptyIqcPlanForm())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(row ? rowToIqcPlanForm(row) : emptyIqcPlanForm())
    setError(null)
  }, [open, row])

  const checkNameOptions = useMemo(() => {
    const names = new Set(CHECK_NAME_OPTIONS.map((module) => module.label))
    if (form.checkName.trim()) names.add(form.checkName.trim())
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [form.checkName])

  const frequencyOptions = useMemo(
    () => frequencySelectOptions(form.frequency),
    [form.frequency],
  )

  const applyCheckName = (name: string) => {
    const module = CHECK_NAME_OPTIONS.find((item) => item.label === name)
    setForm((prev) => ({
      ...prev,
      checkName: name,
      checkTypeSlug: module?.slug ?? prev.checkTypeSlug,
    }))
  }

  const handleSubmit = async () => {
    setError(null)
    if (!form.checkName.trim()) {
      setError('Name / Type of Check is required.')
      return
    }
    if (!form.frequency.trim()) {
      setError('Frequency is required.')
      return
    }
    try {
      await onSave(form)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{row ? 'Edit IQC Plan Item' : 'Add IQC Plan Item'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Name / Type of Check</Label>
            <Select value={form.checkName} onValueChange={applyCheckName}>
              <SelectTrigger aria-label="Name or type of check">
                <SelectValue placeholder="Select check type" />
              </SelectTrigger>
              <SelectContent>
                {checkNameOptions.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Frequency</Label>
            <Select
              value={form.frequency}
              onValueChange={(value) => setForm((prev) => ({ ...prev, frequency: value }))}
            >
              <SelectTrigger aria-label="Frequency">
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                {frequencyOptions.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((prev) => ({ ...prev, status: v as IqcPlanStatus }))}
            >
              <SelectTrigger aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(IQC_PLAN_STATUS_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Acceptance Criteria</Label>
            <Textarea
              value={form.acceptanceCriteria}
              onChange={(e) => setForm((prev) => ({ ...prev, acceptanceCriteria: e.target.value }))}
              rows={2}
              placeholder={IQC_PLAN_DEFAULT_ACCEPTANCE_CRITERIA}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Last Done</Label>
            <Input
              type="date"
              value={form.lastDone}
              onChange={(e) => setForm((prev) => ({ ...prev, lastDone: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Next Due</Label>
            <Input
              type="date"
              value={form.nextDue}
              onChange={(e) => setForm((prev) => ({ ...prev, nextDue: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Remarks</Label>
            <Textarea
              value={form.remarks}
              onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
              rows={2}
            />
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? 'Saving…' : row ? 'Update' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
