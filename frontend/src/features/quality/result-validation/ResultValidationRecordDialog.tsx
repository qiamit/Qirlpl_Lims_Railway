import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'

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

const SIDEBAR_CENTERED_DIALOG_CLASS = cn(
  limsDialogClass,
  'max-h-[92vh] w-[calc(100vw-1rem)] max-w-5xl sm:w-full',
  'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2',
  'lg:w-[min(64rem,calc(100vw-268px-2rem))] lg:max-w-[min(64rem,calc(100vw-268px-2rem))]',
  'md:!-translate-x-1/2 md:!-translate-y-1/2',
)

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
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={SIDEBAR_CENTERED_DIALOG_CLASS}
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              {row ? `Edit Check — ${row.checkRef}` : 'New Internal Quality Check'}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div
          className={cn(
            limsRegistryFormClass,
            'max-h-[min(72vh,720px)] overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5',
          )}
        >
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
          {error ? (
            <p className="mt-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 border-t border-stone-400 bg-stone-100 px-4 py-3 sm:px-6">
          <Button
            type="button"
            variant="outline"
            className={limsOutlineBtnClass}
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            {saving ? 'Saving…' : row ? 'Update Check' : 'Save Check'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
