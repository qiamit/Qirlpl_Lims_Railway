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
  COMPLAINT_STATUSES,
  type ComplaintForm,
  type ComplaintStatus,
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
      listId="complaint-reviewer"
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
      placeholder="Type to search reviewer…"
    />
  )
}

export function ComplaintFormFields({
  form,
  onChange,
  employees,
  canSave,
  saveLoading,
  onSave,
}: {
  form: ComplaintForm
  onChange: (next: ComplaintForm) => void
  employees: EmployeeOption[]
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
}) {
  return (
    <div className={cn(limsRegistryFormClass, 'space-y-5')}>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="cmp-id">Complaint ID</Label>
          <Input id="cmp-id" value={form.complaintId} readOnly className="bg-stone-100" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cmp-received">Received At</Label>
          <Input
            id="cmp-received"
            type="datetime-local"
            value={form.receivedAt}
            onChange={(e) => onChange({ ...form, receivedAt: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={form.status}
            onValueChange={(v) => onChange({ ...form, status: v as ComplaintStatus })}
          >
            <SelectTrigger aria-label="Complaint status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPLAINT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="cmp-name">Complainant Name</Label>
          <Input
            id="cmp-name"
            value={form.complainantName}
            onChange={(e) => onChange({ ...form, complainantName: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cmp-org">Organisation</Label>
          <Input
            id="cmp-org"
            value={form.complainantOrg}
            onChange={(e) => onChange({ ...form, complainantOrg: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cmp-contact">Contact</Label>
          <Input
            id="cmp-contact"
            value={form.complainantContact}
            onChange={(e) => onChange({ ...form, complainantContact: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cmp-desc">Complaint Description</Label>
        <Textarea
          id="cmp-desc"
          rows={3}
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          className="!min-h-8 resize-y"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cmp-activity">Related Laboratory Activity</Label>
          <Input
            id="cmp-activity"
            value={form.relatedActivity}
            onChange={(e) => onChange({ ...form, relatedActivity: e.target.value })}
            placeholder="e.g. Testing / Report / Calibration"
          />
        </div>
        <div className="flex flex-wrap items-end gap-4 pb-1">
          <label className="inline-flex items-center gap-2 text-sm text-stone-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded-none border-stone-500"
              checked={form.relatesToLab}
              onChange={(e) => onChange({ ...form, relatesToLab: e.target.checked })}
            />
            Relates to lab activities (§7.9.2)
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-stone-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded-none border-stone-500"
              checked={form.validated}
              onChange={(e) => onChange({ ...form, validated: e.target.checked })}
            />
            Validated (§7.9.4)
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cmp-validation">Validation Notes (§7.9.4)</Label>
        <Textarea
          id="cmp-validation"
          rows={2}
          value={form.validationNotes}
          onChange={(e) => onChange({ ...form, validationNotes: e.target.value })}
          className="!min-h-8 resize-y"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cmp-invest">Investigation Notes (§7.9.3 a)</Label>
          <Textarea
            id="cmp-invest"
            rows={3}
            value={form.investigationNotes}
            onChange={(e) => onChange({ ...form, investigationNotes: e.target.value })}
            className="!min-h-8 resize-y"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cmp-actions">Actions Taken (§7.9.3 b–c)</Label>
          <Textarea
            id="cmp-actions"
            rows={3}
            value={form.actionsTaken}
            onChange={(e) => onChange({ ...form, actionsTaken: e.target.value })}
            className="!min-h-8 resize-y"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cmp-outcome">Decision / Outcome</Label>
        <Textarea
          id="cmp-outcome"
          rows={2}
          value={form.decisionOutcome}
          onChange={(e) => onChange({ ...form, decisionOutcome: e.target.value })}
          className="!min-h-8 resize-y"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="cmp-ack">Acknowledged (§7.9.5)</Label>
          <Input
            id="cmp-ack"
            type="datetime-local"
            value={form.acknowledgedAt}
            onChange={(e) => onChange({ ...form, acknowledgedAt: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cmp-progress">Progress Reported</Label>
          <Input
            id="cmp-progress"
            type="datetime-local"
            value={form.progressReportedAt}
            onChange={(e) => onChange({ ...form, progressReportedAt: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cmp-outcome-at">Outcome Communicated</Label>
          <Input
            id="cmp-outcome-at"
            type="datetime-local"
            value={form.outcomeCommunicatedAt}
            onChange={(e) => onChange({ ...form, outcomeCommunicatedAt: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Impartial Reviewer (§7.9.6)</Label>
          <EmployeePicker
            employees={employees}
            employeeId={form.reviewedByEmployeeId}
            displayName={form.reviewedByName}
            onPick={(id, name) =>
              onChange({ ...form, reviewedByEmployeeId: id, reviewedByName: name })
            }
          />
        </div>
        <div className="flex flex-wrap items-end gap-4 pb-1">
          <label className="inline-flex items-center gap-2 text-sm text-stone-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded-none border-stone-500"
              checked={form.reviewerNotInvolved}
              onChange={(e) => onChange({ ...form, reviewerNotInvolved: e.target.checked })}
            />
            Reviewer not involved in original activity
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-stone-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded-none border-stone-500"
              checked={form.formalClosureNoticeSent}
              onChange={(e) => onChange({ ...form, formalClosureNoticeSent: e.target.checked })}
            />
            Formal closure notice sent (§7.9.7)
          </label>
        </div>
      </div>

      <div className="space-y-2 md:w-1/3">
        <Label htmlFor="cmp-closed">Closed At</Label>
        <Input
          id="cmp-closed"
          type="datetime-local"
          value={form.closedAt}
          onChange={(e) => onChange({ ...form, closedAt: e.target.value })}
        />
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
