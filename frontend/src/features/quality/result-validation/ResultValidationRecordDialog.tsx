import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { checkTypeLabel } from './checkTypes'
import { withIqcPlanAcceptanceCriteria } from './iqcPlanAcceptanceCriteria'
import { ResultValidityCheckFormFields } from './ResultValidityCheckFormFields'
import type {
  EquipmentOption,
  IqcOption,
  ResultValidityCheckForm,
  ResultValidityCheckRow,
  ResultValidityCheckType,
  SampleOption,
  UserOption,
} from './types'
import { emptyResultValidityForm, rowToForm } from './types'

export function ResultValidationRecordDialog({
  open,
  onOpenChange,
  row,
  saving,
  users,
  equipment,
  iqcMasters,
  samples,
  initialCheckType,
  fixedCheckType,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: ResultValidityCheckRow | null
  saving: boolean
  users: UserOption[]
  equipment: EquipmentOption[]
  iqcMasters: IqcOption[]
  samples: SampleOption[]
  initialCheckType?: ResultValidityCheckType
  fixedCheckType?: ResultValidityCheckType
  onSave: (form: ResultValidityCheckForm) => Promise<void>
}) {
  const [form, setForm] = useState<ResultValidityCheckForm>(() => emptyResultValidityForm())
  const [error, setError] = useState<string | null>(null)

  const loadNewForm = async (checkType: ResultValidityCheckType) => {
    const base = emptyResultValidityForm(checkType)
    try {
      setForm(await withIqcPlanAcceptanceCriteria(base))
    } catch {
      setForm(base)
    }
  }

  useEffect(() => {
    if (!open) return
    setError(null)
    if (row) {
      setForm(rowToForm(row))
      return
    }
    void loadNewForm(initialCheckType ?? fixedCheckType ?? '7_7_g')
  }, [open, row, initialCheckType, fixedCheckType])

  const handleSubmit = async () => {
    setError(null)
    if (!form.checkDate) {
      setError('Check date is required.')
      return
    }
    if (form.status === 'unsatisfactory' && !form.actionTaken.trim()) {
      setError('Action taken is required when status is Unsatisfactory (Clause 7.7.3).')
      return
    }
    try {
      await onSave({
        ...form,
        title: form.title.trim() || checkTypeLabel(form.checkType),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{row ? `Edit Check — ${row.checkRef}` : 'New Internal Quality Check'}</DialogTitle>
        </DialogHeader>

        <ResultValidityCheckFormFields
          form={form}
          onChange={setForm}
          users={users}
          equipment={equipment}
          iqcMasters={iqcMasters}
          samples={samples}
          isNewRecord={!row}
          fixedCheckType={fixedCheckType}
          onCheckTypeChange={(type) => void loadNewForm(type)}
        />

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? 'Saving…' : row ? 'Update Check' : 'Save Check'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
