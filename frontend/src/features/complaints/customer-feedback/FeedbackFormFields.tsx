import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import { limsPrimaryBtnClass, limsRegistryFormClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { EmployeeOption } from '../shared'
import {
  EVAL_STATUSES,
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  type EvalStatus,
  type FeedbackForm,
  type FeedbackStatus,
  type FeedbackType,
} from './types'

function EmployeePicker({
  employees,
  employeeId,
  displayName,
  onPick,
}: {
  employees: EmployeeOption[]
  employeeId: string
  displayName: string
  onPick: (id: string, name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selectedLabel =
    employees.find((e) => e.id === employeeId)?.full_name || displayName || ''
  const options = useMemo<FilterComboboxOption[]>(() => {
    const q = (open ? query : selectedLabel).trim().toLowerCase()
    return employees
      .filter((e) => !q || e.full_name.toLowerCase().includes(q))
      .slice(0, 40)
      .map((e) => ({ id: e.id, label: e.full_name }))
  }, [employees, open, query, selectedLabel])

  return (
    <FilterCombobox
      listId="feedback-evaluator"
      value={open ? query : selectedLabel}
      onValueChange={(v) => {
        setQuery(v)
        if (!open) setOpen(true)
        if (!v.trim()) onPick('', '')
      }}
      options={options}
      onSelectOption={(opt) => {
        onPick(opt.id, opt.label)
        setQuery(opt.label)
        setOpen(false)
      }}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setQuery(selectedLabel)
      }}
      placeholder="Type to search employee…"
    />
  )
}

export function FeedbackFormFields({
  form,
  onChange,
  employees,
  canSave,
  saveLoading,
  onSave,
  evaluationFocus,
}: {
  form: FeedbackForm
  onChange: (next: FeedbackForm) => void
  employees: EmployeeOption[]
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  evaluationFocus?: boolean
}) {
  return (
    <div className={cn(limsRegistryFormClass, 'space-y-5')}>
      <p className="border border-dashed border-stone-400 bg-[#fffcf7] px-3 py-2 text-xs text-stone-600">
        {evaluationFocus
          ? 'ISO 17025 continual improvement — evaluate feedback significance, decide actions, and record outcomes.'
          : 'Customer Feedback register — capture praise, suggestions and concerns for evaluation and improvement.'}
      </p>

      {!evaluationFocus ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="fbk-id">Feedback ID</Label>
              <Input id="fbk-id" value={form.feedbackId} readOnly className="bg-stone-100" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fbk-received">Received At</Label>
              <Input
                id="fbk-received"
                type="datetime-local"
                value={form.receivedAt}
                onChange={(e) => onChange({ ...form, receivedAt: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.feedbackType}
                onValueChange={(v) => onChange({ ...form, feedbackType: v as FeedbackType })}
              >
                <SelectTrigger aria-label="Feedback type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="fbk-name">Customer Name</Label>
              <Input
                id="fbk-name"
                value={form.customerName}
                onChange={(e) => onChange({ ...form, customerName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fbk-org">Organisation</Label>
              <Input
                id="fbk-org"
                value={form.customerOrg}
                onChange={(e) => onChange({ ...form, customerOrg: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fbk-contact">Contact</Label>
              <Input
                id="fbk-contact"
                value={form.customerContact}
                onChange={(e) => onChange({ ...form, customerContact: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fbk-service">Related Service / Activity</Label>
              <Input
                id="fbk-service"
                value={form.relatedService}
                onChange={(e) => onChange({ ...form, relatedService: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => onChange({ ...form, status: v as FeedbackStatus })}
              >
                <SelectTrigger aria-label="Feedback status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fbk-desc">Feedback Description</Label>
            <Textarea
              id="fbk-desc"
              rows={3}
              value={form.description}
              onChange={(e) => onChange({ ...form, description: e.target.value })}
              className="!min-h-8 resize-y"
            />
          </div>
        </>
      ) : (
        <div className="border border-stone-500 bg-[#fffcf7] p-3">
          <p className="font-mono text-xs text-amber-800">{form.feedbackId}</p>
          <p className="mt-1 text-sm font-semibold text-stone-900">{form.customerName || '—'}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{form.description || '—'}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fbk-significance">Significance / Trend</Label>
          <Textarea
            id="fbk-significance"
            rows={2}
            value={form.significance}
            onChange={(e) => onChange({ ...form, significance: e.target.value })}
            className="!min-h-8 resize-y"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fbk-eval-notes">Evaluation Notes</Label>
          <Textarea
            id="fbk-eval-notes"
            rows={2}
            value={form.evaluationNotes}
            onChange={(e) => onChange({ ...form, evaluationNotes: e.target.value })}
            className="!min-h-8 resize-y"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fbk-actions">Actions Decided</Label>
          <Textarea
            id="fbk-actions"
            rows={2}
            value={form.actionsDecided}
            onChange={(e) => onChange({ ...form, actionsDecided: e.target.value })}
            className="!min-h-8 resize-y"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fbk-improve">Improvement Actions</Label>
          <Textarea
            id="fbk-improve"
            rows={2}
            value={form.improvementActions}
            onChange={(e) => onChange({ ...form, improvementActions: e.target.value })}
            className="!min-h-8 resize-y"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Evaluated By</Label>
          <EmployeePicker
            employees={employees}
            employeeId={form.evaluatedByEmployeeId}
            displayName={form.evaluatedByName}
            onPick={(id, name) =>
              onChange({ ...form, evaluatedByEmployeeId: id, evaluatedByName: name })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fbk-eval-at">Evaluated At</Label>
          <Input
            id="fbk-eval-at"
            type="datetime-local"
            value={form.evaluatedAt}
            onChange={(e) => onChange({ ...form, evaluatedAt: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Evaluation Status</Label>
          <Select
            value={form.evaluationStatus}
            onValueChange={(v) => {
              const next = v as EvalStatus
              onChange({
                ...form,
                evaluationStatus: next,
                status:
                  next === 'Completed'
                    ? 'Closed'
                    : next === 'In Progress'
                      ? 'Under Evaluation'
                      : form.status,
              })
            }}
          >
            <SelectTrigger aria-label="Evaluation status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVAL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="button"
          className={cn('min-w-[7rem]', limsPrimaryBtnClass)}
          disabled={!canSave || saveLoading}
          onClick={onSave}
        >
          {saveLoading ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
