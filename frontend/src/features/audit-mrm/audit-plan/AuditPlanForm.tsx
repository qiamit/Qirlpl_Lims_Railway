import { useEffect, useMemo, useState } from 'react'
import { ListChecks, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { labRegistryFormClass } from '@/features/settings/lab-settings/labSettingsUi'
import { fetchDesignationAndDepartmentLabels } from '@/features/settings/lab-settings/labMasterOptions'
import { supabase } from '@/lib/supabaseClient'
import { ISO_17025_AUDIT_PLAN_CLAUSES } from '@/features/audit-mrm/audit-checklist/iso17025Clauses'
import {
  AUDIT_TYPES,
  emptyTeamRow,
  type AuditPlanForm,
  type AuditTeamFormRow,
  type AuditType,
} from './types'

type OrgTriple = {
  division: string
  department: string
  designation: string
}

function uniqSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).map((v) => v.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  )
}

function ensureOption(options: string[], value: string): string[] {
  const v = value.trim()
  if (!v) return options
  if (options.some((o) => o === v)) return options
  return [...options, v].sort((a, b) => a.localeCompare(b))
}

function departmentsForDivision(
  profiles: OrgTriple[],
  allDepartments: string[],
  division: string,
): string[] {
  if (!division.trim()) return []
  const fromProfiles = uniqSorted(
    profiles.filter((p) => p.division === division).map((p) => p.department),
  )
  return fromProfiles.length > 0 ? fromProfiles : allDepartments
}

function designationsForDivDept(
  profiles: OrgTriple[],
  allDesignations: string[],
  division: string,
  department: string,
): string[] {
  if (!division.trim() || !department.trim()) return []
  const fromProfiles = uniqSorted(
    profiles
      .filter((p) => p.division === division && p.department === department)
      .map((p) => p.designation),
  )
  return fromProfiles.length > 0 ? fromProfiles : allDesignations
}

function StackedSelect({
  id,
  label,
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: string[]
  placeholder: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Select
        value={value || undefined}
        onValueChange={onChange}
        disabled={disabled || options.length === 0}
      >
        <SelectTrigger id={id} aria-label={label} className="h-8 text-xs">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function CriteriaClausePickerDialog({
  open,
  onOpenChange,
  selected,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selected: string[]
  onApply: (clauseNos: string[]) => void
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected))
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!open) return
    setDraft(new Set(selected))
    setFilter('')
  }, [open, selected])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return ISO_17025_AUDIT_PLAN_CLAUSES
    return ISO_17025_AUDIT_PLAN_CLAUSES.filter(
      (c) =>
        c.clauseNo.toLowerCase().includes(q) || c.clauseMatter.toLowerCase().includes(q),
    )
  }, [filter])

  const toggle = (clauseNo: string) => {
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(clauseNo)) next.delete(clauseNo)
      else next.add(clauseNo)
      return next
    })
  }

  const orderedSelected = useMemo(() => {
    const set = draft
    return ISO_17025_AUDIT_PLAN_CLAUSES.map((c) => c.clauseNo).filter((no) => set.has(no))
  }, [draft])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Select ISO 17025 Clauses</DialogTitle>
        </DialogHeader>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by clause no or matter…"
          aria-label="Filter clauses"
        />
        <p className="text-xs text-muted-foreground">
          {draft.size} selected
          {orderedSelected.length > 0 ? ` · ${orderedSelected.slice(0, 8).join(', ')}${orderedSelected.length > 8 ? '…' : ''}` : ''}
        </p>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-muted/90 backdrop-blur">
              <tr>
                <th className="w-10 border-b border-border px-2 py-2 text-center text-xs">Sel</th>
                <th className="w-24 border-b border-border px-2 py-2 text-left text-xs">Clause</th>
                <th className="border-b border-border px-2 py-2 text-left text-xs">Matter</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const checked = draft.has(c.clauseNo)
                return (
                  <tr
                    key={c.clauseNo}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => toggle(c.clauseNo)}
                  >
                    <td className="border-b border-border px-2 py-1.5 text-center align-top">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-muted-foreground/30"
                        checked={checked}
                        onChange={() => toggle(c.clauseNo)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select clause ${c.clauseNo}`}
                      />
                    </td>
                    <td className="border-b border-border px-2 py-1.5 align-top font-mono text-xs font-medium">
                      {c.clauseNo}
                    </td>
                    <td className="border-b border-border px-2 py-1.5 align-top text-xs text-muted-foreground">
                      {c.clauseMatter.length > 160
                        ? `${c.clauseMatter.slice(0, 160)}…`
                        : c.clauseMatter}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No clauses match the filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-teal-600 text-white hover:bg-teal-500"
            onClick={() => {
              onApply(orderedSelected)
              onOpenChange(false)
            }}
          >
            Apply ({draft.size})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function AuditPlanForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
}: {
  form: AuditPlanForm
  onChange: (next: AuditPlanForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
}) {
  const [divisions, setDivisions] = useState<string[]>([])
  const [allDepartments, setAllDepartments] = useState<string[]>([])
  const [allDesignations, setAllDesignations] = useState<string[]>([])
  const [profiles, setProfiles] = useState<OrgTriple[]>([])
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [criteriaRowKey, setCriteriaRowKey] = useState<string | null>(null)

  useEffect(() => {
    let canceled = false
    void (async () => {
      try {
        const [labels, profileRes] = await Promise.all([
          fetchDesignationAndDepartmentLabels(),
          supabase
            .from('user_profiles')
            .select('division, department_name, designation, status'),
        ])
        if (canceled) return
        setDivisions(labels.divisions)
        setAllDepartments(labels.departments)
        setAllDesignations(labels.designations)

        if (profileRes.error) throw profileRes.error
        const triples: OrgTriple[] = (Array.isArray(profileRes.data) ? profileRes.data : [])
          .filter((r) => String((r as { status?: string }).status ?? 'Active').toLowerCase() !== 'inactive')
          .map((r) => ({
            division: String((r as { division?: unknown }).division ?? '').trim(),
            department: String((r as { department_name?: unknown }).department_name ?? '').trim(),
            designation: String((r as { designation?: unknown }).designation ?? '').trim(),
          }))
          .filter((t) => t.division || t.department || t.designation)
        setProfiles(triples)
        setOptionsError(null)
      } catch (err) {
        if (canceled) return
        setOptionsError(err instanceof Error ? err.message : 'Unable to load org options')
      }
    })()
    return () => {
      canceled = true
    }
  }, [])

  const set = <K extends keyof AuditPlanForm>(key: K, value: AuditPlanForm[K]) => {
    onChange({ ...form, [key]: value })
  }

  const patchTeamRow = (key: string, patch: Partial<AuditTeamFormRow>) => {
    onChange({
      ...form,
      teamRows: form.teamRows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    })
  }

  const addTeamRow = () => {
    onChange({ ...form, teamRows: [...form.teamRows, emptyTeamRow()] })
  }

  const removeTeamRow = (key: string) => {
    if (form.teamRows.length <= 1) {
      onChange({ ...form, teamRows: [emptyTeamRow()] })
      return
    }
    onChange({ ...form, teamRows: form.teamRows.filter((r) => r.key !== key) })
  }

  const criteriaEditingRow = form.teamRows.find((r) => r.key === criteriaRowKey) ?? null

  return (
    <div className={labRegistryFormClass}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="space-y-2">
          <Label htmlFor="audit-type">
            Audit Type <span className="text-destructive">*</span>
          </Label>
          <Select
            value={form.auditType}
            onValueChange={(v) => set('auditType', v as AuditType)}
          >
            <SelectTrigger id="audit-type" aria-label="Audit Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="audit-id">Audit ID</Label>
          <Input
            id="audit-id"
            value={form.auditId}
            readOnly
            className="bg-slate-50 font-mono"
            aria-label="Audit ID (auto-generated)"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="next-audit-date">
            Next Audit Date <span className="text-destructive">*</span>
          </Label>
          <Input
            id="next-audit-date"
            type="date"
            value={form.nextAuditDate}
            onChange={(e) => set('nextAuditDate', e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="proposed-from">
            Proposed Audit Date — From <span className="text-destructive">*</span>
          </Label>
          <Input
            id="proposed-from"
            type="date"
            value={form.proposedFrom}
            onChange={(e) => set('proposedFrom', e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="proposed-to">
            Proposed Audit Date — To <span className="text-destructive">*</span>
          </Label>
          <Input
            id="proposed-to"
            type="date"
            value={form.proposedTo}
            onChange={(e) => set('proposedTo', e.target.value)}
            required
          />
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Audit Team &amp; Criteria</h3>
          <p className="text-xs text-muted-foreground">
            Choose auditee / auditor org slots from User Management, and ISO 17025 clauses for criteria.
          </p>
          {optionsError ? (
            <p className="mt-1 text-xs text-destructive">{optionsError}</p>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="border border-border px-2 py-2 text-center text-xs min-w-[220px]">
                  Auditee
                </th>
                <th className="border border-border px-2 py-2 text-center text-xs min-w-[220px]">
                  Auditor
                </th>
                <th className="border border-border px-2 py-2 text-center text-xs min-w-[220px]">
                  Audit Criteria
                </th>
                <th className="border border-border px-2 py-2 text-center text-xs w-12">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {form.teamRows.map((row, index) => {
                const isLastRow = index === form.teamRows.length - 1
                const showDelete = !isLastRow && form.teamRows.length > 1

                const auditeeDeptOpts = ensureOption(
                  departmentsForDivision(profiles, allDepartments, row.auditeeDivision),
                  row.auditeeDepartment,
                )
                const auditeeDesigOpts = ensureOption(
                  designationsForDivDept(
                    profiles,
                    allDesignations,
                    row.auditeeDivision,
                    row.auditeeDepartment,
                  ),
                  row.auditeeDesignation,
                )
                const auditorDeptOpts = ensureOption(
                  departmentsForDivision(profiles, allDepartments, row.auditorDivision),
                  row.auditorDepartment,
                )
                const auditorDesigOpts = ensureOption(
                  designationsForDivDept(
                    profiles,
                    allDesignations,
                    row.auditorDivision,
                    row.auditorDepartment,
                  ),
                  row.auditorDesignation,
                )
                const divisionOptsAuditee = ensureOption(divisions, row.auditeeDivision)
                const divisionOptsAuditor = ensureOption(divisions, row.auditorDivision)

                return (
                  <tr key={row.key}>
                    <td className="border border-border p-2 align-top">
                      <div className="space-y-2">
                        <StackedSelect
                          id={`auditee-div-${row.key}`}
                          label="Division"
                          value={row.auditeeDivision}
                          options={divisionOptsAuditee}
                          placeholder="Select division"
                          onChange={(v) =>
                            patchTeamRow(row.key, {
                              auditeeDivision: v,
                              auditeeDepartment: '',
                              auditeeDesignation: '',
                            })
                          }
                        />
                        <StackedSelect
                          id={`auditee-dept-${row.key}`}
                          label="Department"
                          value={row.auditeeDepartment}
                          options={auditeeDeptOpts}
                          placeholder="Select department"
                          disabled={!row.auditeeDivision}
                          onChange={(v) =>
                            patchTeamRow(row.key, {
                              auditeeDepartment: v,
                              auditeeDesignation: '',
                            })
                          }
                        />
                        <StackedSelect
                          id={`auditee-desig-${row.key}`}
                          label="Designation"
                          value={row.auditeeDesignation}
                          options={auditeeDesigOpts}
                          placeholder="Select designation"
                          disabled={!row.auditeeDivision || !row.auditeeDepartment}
                          onChange={(v) => patchTeamRow(row.key, { auditeeDesignation: v })}
                        />
                      </div>
                    </td>
                    <td className="border border-border p-2 align-top">
                      <div className="space-y-2">
                        <StackedSelect
                          id={`auditor-div-${row.key}`}
                          label="Division"
                          value={row.auditorDivision}
                          options={divisionOptsAuditor}
                          placeholder="Select division"
                          onChange={(v) =>
                            patchTeamRow(row.key, {
                              auditorDivision: v,
                              auditorDepartment: '',
                              auditorDesignation: '',
                            })
                          }
                        />
                        <StackedSelect
                          id={`auditor-dept-${row.key}`}
                          label="Department"
                          value={row.auditorDepartment}
                          options={auditorDeptOpts}
                          placeholder="Select department"
                          disabled={!row.auditorDivision}
                          onChange={(v) =>
                            patchTeamRow(row.key, {
                              auditorDepartment: v,
                              auditorDesignation: '',
                            })
                          }
                        />
                        <StackedSelect
                          id={`auditor-desig-${row.key}`}
                          label="Designation"
                          value={row.auditorDesignation}
                          options={auditorDesigOpts}
                          placeholder="Select designation"
                          disabled={!row.auditorDivision || !row.auditorDepartment}
                          onChange={(v) => patchTeamRow(row.key, { auditorDesignation: v })}
                        />
                      </div>
                    </td>
                    <td className="border border-border p-2 align-top">
                      <div className="space-y-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full gap-1.5"
                          aria-label={`Select clauses for row ${index + 1}`}
                          onClick={() => setCriteriaRowKey(row.key)}
                        >
                          <ListChecks size={14} />
                          Select Clauses
                          {row.criteriaClauseNos.length > 0
                            ? ` (${row.criteriaClauseNos.length})`
                            : ''}
                        </Button>
                        {row.criteriaClauseNos.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {row.criteriaClauseNos.slice(0, 6).map((no) => (
                              <Badge key={no} variant="secondary" className="font-mono text-[10px] font-normal">
                                {no}
                              </Badge>
                            ))}
                            {row.criteriaClauseNos.length > 6 ? (
                              <Badge variant="outline" className="text-[10px] font-normal">
                                +{row.criteriaClauseNos.length - 6} more
                              </Badge>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-center text-[11px] text-muted-foreground">No clauses selected</p>
                        )}
                      </div>
                    </td>
                    <td className="border border-border p-1.5 text-center align-middle">
                      {isLastRow ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label="Add row"
                          onClick={addTeamRow}
                        >
                          <Plus size={14} />
                        </Button>
                      ) : showDelete ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete row ${index + 1}`}
                          onClick={() => removeTeamRow(row.key)}
                        >
                          <Trash2 size={14} className="text-destructive" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
        <Button
          type="button"
          className="bg-teal-600 text-white hover:bg-teal-500"
          onClick={onSave}
          disabled={!canSave || saveLoading}
        >
          {saveLoading ? 'Saving…' : 'Save & Close'}
        </Button>
      </div>

      <CriteriaClausePickerDialog
        open={criteriaRowKey != null}
        onOpenChange={(open) => {
          if (!open) setCriteriaRowKey(null)
        }}
        selected={criteriaEditingRow?.criteriaClauseNos ?? []}
        onApply={(clauseNos) => {
          if (!criteriaRowKey) return
          patchTeamRow(criteriaRowKey, { criteriaClauseNos: clauseNos })
        }}
      />
    </div>
  )
}
