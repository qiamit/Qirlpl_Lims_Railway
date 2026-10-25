import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
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
  acceptabilityLabel,
  NC_ACCEPTABILITY,
  NC_RISK_LEVELS,
  NC_SOURCE_AREAS,
  NC_STATUSES,
  type NcAcceptability,
  type NcRiskLevel,
  type NcSourceArea,
  type NcWorkRecordForm,
  type NcWorkStatus,
} from './types'

function EmployeePicker({
  employees,
  employeeId,
  displayName,
  onPick,
  listId,
}: {
  employees: EmployeeOption[]
  employeeId: string
  displayName: string
  onPick: (id: string, name: string) => void
  listId: string
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
      listId={listId}
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

/** SRF picker: links the NC to a sample, which holds that sample's test report issue while the NC is open. */
function SamplePicker({
  sampleId,
  srfNumber,
  onPick,
}: {
  sampleId: string
  srfNumber: string
  onPick: (id: string, srf: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<FilterComboboxOption[]>([])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    let cancelled = false
    const timer = window.setTimeout(() => {
      let req = supabase
        .from('samples')
        .select('id, srf_number, stage')
        .not('srf_number', 'is', null)
        .order('created_at', { ascending: false })
        .limit(25)
      if (q) req = req.ilike('srf_number', `%${q.replace(/[%_]/g, '')}%`)
      void req.then(({ data, error }) => {
        if (cancelled || error) return
        setOptions(
          ((data ?? []) as Array<{ id: string; srf_number: string | null; stage: string | null }>).map((r) => ({
            id: r.id,
            label: r.srf_number ?? r.id,
            secondaryLabel: r.stage ? r.stage.replace(/_/g, ' ') : undefined,
          })),
        )
      })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, query])

  return (
    <FilterCombobox
      listId="ncw-sample"
      value={open ? query : srfNumber}
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
        if (next) setQuery(srfNumber)
      }}
      placeholder={sampleId ? 'Linked sample' : 'Type SRF number (optional)…'}
    />
  )
}

export function NcWorkRecordFormFields({
  form,
  onChange,
  employees,
  canSave,
  saveLoading,
  onSave,
  evaluationFocus,
  sampleLinkAvailable = false,
}: {
  form: NcWorkRecordForm
  onChange: (next: NcWorkRecordForm) => void
  employees: EmployeeOption[]
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  /** When true, emphasize evaluation / decision fields */
  evaluationFocus?: boolean
  /** Sample link columns exist (migration 20261029100300). */
  sampleLinkAvailable?: boolean
}) {
  return (
    <div className={cn(limsRegistryFormClass, 'space-y-5')}>
      {!evaluationFocus ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="ncw-id">NC ID</Label>
              <Input id="ncw-id" value={form.ncId} readOnly className="bg-stone-100 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ncw-detected">Detected At *</Label>
              <Input
                id="ncw-detected"
                type="datetime-local"
                value={form.detectedAt}
                onChange={(e) => onChange({ ...form, detectedAt: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Source Area</Label>
              <Select
                value={form.sourceArea}
                onValueChange={(v) => onChange({ ...form, sourceArea: v as NcSourceArea })}
              >
                <SelectTrigger aria-label="Source area">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NC_SOURCE_AREAS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => onChange({ ...form, status: v as NcWorkStatus })}
              >
                <SelectTrigger aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NC_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Reported By</Label>
              <EmployeePicker
                listId="ncw-reporter"
                employees={employees}
                employeeId={form.reportedByEmployeeId}
                displayName={form.reportedByName}
                onPick={(id, name) =>
                  onChange({ ...form, reportedByEmployeeId: id, reportedByName: name })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ncw-eq">Equipment / Activity</Label>
              <Input
                id="ncw-eq"
                value={form.equipmentOrActivity}
                onChange={(e) => onChange({ ...form, equipmentOrActivity: e.target.value })}
              />
            </div>
          </div>

          {sampleLinkAvailable ? (
            <div className="space-y-1.5">
              <Label>Affected Sample / SRF</Label>
              <SamplePicker
                sampleId={form.sampleId}
                srfNumber={form.srfNumber}
                onPick={(id, srf) => onChange({ ...form, sampleId: id, srfNumber: srf })}
              />
              <p className="text-[11px] text-stone-500">
                While this NC is not Closed and work has not been authorized to resume, the test report of this sample
                cannot be issued (only the Laboratory Director can override).
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="ncw-desc">Description of Nonconforming Work *</Label>
            <Textarea
              id="ncw-desc"
              value={form.description}
              onChange={(e) => onChange({ ...form, description: e.target.value })}
              rows={3}
              className="!min-h-8 resize-y"
            />
          </div>
        </>
      ) : (
        <div className="rounded-none border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-700">
          <span className="font-mono text-amber-800">{form.ncId}</span>
          {' · '}
          {form.equipmentOrActivity || '—'}
          <p className="mt-1 text-stone-600">{form.description || 'No description'}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Risk Level (7.10.1 b)</Label>
          <Select
            value={form.riskLevel}
            onValueChange={(v) => onChange({ ...form, riskLevel: v as NcRiskLevel })}
          >
            <SelectTrigger aria-label="Risk level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NC_RISK_LEVELS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Acceptability Decision (7.10.1 d)</Label>
          <Select
            value={form.acceptabilityDecision}
            onValueChange={(v) =>
              onChange({ ...form, acceptabilityDecision: v as NcAcceptability })
            }
          >
            <SelectTrigger aria-label="Acceptability">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NC_ACCEPTABILITY.map((s) => (
                <SelectItem key={s} value={s}>
                  {acceptabilityLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ncw-actions">Actions Taken (7.10.1 b)</Label>
        <Textarea
          id="ncw-actions"
          value={form.actionsTaken}
          onChange={(e) => onChange({ ...form, actionsTaken: e.target.value })}
          rows={2}
          className="!min-h-8 resize-y"
          placeholder="Halt / repeat work, withhold reports, etc."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ncw-sig">Significance Evaluation (7.10.1 c)</Label>
          <Textarea
            id="ncw-sig"
            value={form.significanceEvaluation}
            onChange={(e) => onChange({ ...form, significanceEvaluation: e.target.value })}
            rows={2}
            className="!min-h-8 resize-y"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ncw-impact">Impact on Previous Results (7.10.1 c)</Label>
          <Textarea
            id="ncw-impact"
            value={form.impactOnPreviousResults}
            onChange={(e) => onChange({ ...form, impactOnPreviousResults: e.target.value })}
            rows={2}
            className="!min-h-8 resize-y"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="inline-flex items-center gap-2 text-sm text-stone-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded-none border-stone-500"
              checked={form.customerNotified}
              onChange={(e) => onChange({ ...form, customerNotified: e.target.checked })}
            />
            Customer notified (7.10.1 e)
          </label>
          <Textarea
            value={form.customerNotifyDetails}
            onChange={(e) => onChange({ ...form, customerNotifyDetails: e.target.value })}
            rows={2}
            className="!min-h-8 resize-y"
            placeholder="Notification / recall details"
          />
          <label className="inline-flex items-center gap-2 text-sm text-stone-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded-none border-stone-500"
              checked={form.workRecalled}
              onChange={(e) => onChange({ ...form, workRecalled: e.target.checked })}
            />
            Work recalled where necessary
          </label>
        </div>
        <div className="space-y-1.5">
          <Label>Authorize Resumption (7.10.1 f)</Label>
          <EmployeePicker
            listId="ncw-resumption"
            employees={employees}
            employeeId={form.resumptionAuthorizedByEmployeeId}
            displayName={form.resumptionAuthorizedByName}
            onPick={(id, name) =>
              onChange({
                ...form,
                resumptionAuthorizedByEmployeeId: id,
                resumptionAuthorizedByName: name,
              })
            }
          />
          <Label htmlFor="ncw-rts" className="mt-2 block">
            Resumption Authorized At
          </Label>
          <Input
            id="ncw-rts"
            type="datetime-local"
            value={form.resumptionAuthorizedAt}
            onChange={(e) => onChange({ ...form, resumptionAuthorizedAt: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2 text-sm text-stone-800">
          <input
            type="checkbox"
            className="h-4 w-4 rounded-none border-stone-500"
            checked={form.correctiveActionRequired}
            onChange={(e) => {
              const checked = e.target.checked
              onChange({
                ...form,
                correctiveActionRequired: checked,
                status: checked ? 'CAPA Required' : form.status === 'CAPA Required' ? 'Under Evaluation' : form.status,
              })
            }}
          />
          Corrective action required (7.10.3)
        </label>
        {evaluationFocus ? (
          <div className="space-y-1.5 min-w-[12rem]">
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => onChange({ ...form, status: v as NcWorkStatus })}
            >
              <SelectTrigger aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NC_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <div className="flex justify-end pt-1">
        <Button
          type="button"
          className={cn('min-w-[7rem]', limsPrimaryBtnClass)}
          disabled={!canSave}
          onClick={onSave}
        >
          {saveLoading ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
