import { useEffect, useMemo, useState } from 'react'
import { Eye, ListChecks, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { labRegistryFormClass } from '@/features/settings/lab-settings/labSettingsUi'
import {
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
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

function OrgSelect({
  id,
  label,
  value,
  options,
  placeholder,
  disabled,
  onChange,
  showLabel = false,
}: {
  id: string
  label: string
  value: string
  options: string[]
  placeholder: string
  disabled?: boolean
  onChange: (value: string) => void
  showLabel?: boolean
}) {
  return (
    <div className={showLabel ? 'space-y-1' : undefined}>
      {showLabel ? (
        <Label htmlFor={id} className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </Label>
      ) : null}
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
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          'flex max-h-[85vh] max-w-3xl flex-col overflow-hidden',
          'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:!-translate-x-1/2 md:!-translate-y-1/2',
        )}
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
            }}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              Select ISO 17025 Clauses
            </DialogTitle>
          </DialogHeader>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by clause no or matter…"
            aria-label="Filter clauses"
            className="h-8 rounded-none border-stone-500 bg-stone-50"
          />
          <p className="text-xs text-stone-600">
            {draft.size} selected
            {orderedSelected.length > 0
              ? ` · ${orderedSelected.slice(0, 8).join(', ')}${orderedSelected.length > 8 ? '…' : ''}`
              : ''}
          </p>
          <div className="min-h-0 flex-1 overflow-auto border border-stone-500 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-stone-800">
                <tr>
                  <th className="w-10 border-b border-stone-700 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-amber-200">
                    Sel
                  </th>
                  <th className="w-24 border-b border-stone-700 px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-amber-200">
                    Clause
                  </th>
                  <th className="border-b border-stone-700 px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-amber-200">
                    Matter
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[#f7f3eb]">
                {filtered.map((c) => {
                  const checked = draft.has(c.clauseNo)
                  return (
                    <tr
                      key={c.clauseNo}
                      className="cursor-pointer hover:bg-amber-50/80"
                      onClick={() => toggle(c.clauseNo)}
                    >
                      <td className="border-b border-stone-300 px-2 py-1.5 text-center align-top">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded-none border-stone-500"
                          checked={checked}
                          onChange={() => toggle(c.clauseNo)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select clause ${c.clauseNo}`}
                        />
                      </td>
                      <td className="border-b border-stone-300 px-2 py-1.5 align-top font-mono text-xs font-medium text-stone-900">
                        {c.clauseNo}
                      </td>
                      <td className="border-b border-stone-300 px-2 py-1.5 align-top text-xs text-stone-600">
                        {c.clauseMatter.length > 160
                          ? `${c.clauseMatter.slice(0, 160)}…`
                          : c.clauseMatter}
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-sm text-stone-500">
                      No clauses match the filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 border-t border-stone-200 pt-3">
            <Button
              type="button"
              variant="outline"
              className={limsOutlineBtnClass}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={limsPrimaryBtnClass}
              onClick={() => {
                onApply(orderedSelected)
                onOpenChange(false)
              }}
            >
              Apply ({draft.size})
            </Button>
          </div>
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
            className="bg-stone-100 font-mono"
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
            Proposed Date From <span className="text-destructive">*</span>
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
            Proposed Date To <span className="text-destructive">*</span>
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
          <h3 className="text-sm font-semibold text-stone-900">Audit Team &amp; Criteria</h3>
          {optionsError ? (
            <p className="mt-1 text-xs text-destructive">{optionsError}</p>
          ) : null}
        </div>

        <div className="overflow-x-auto border border-stone-500 bg-white">
          <table className="min-w-[1180px] w-full border-collapse text-sm">
            <thead>
              <tr className="bg-stone-800">
                <th
                  colSpan={3}
                  className="border border-stone-700 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200"
                >
                  Auditee
                </th>
                <th
                  colSpan={3}
                  className="border border-stone-700 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200"
                >
                  Auditor
                </th>
                <th
                  rowSpan={2}
                  className="border border-stone-700 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 min-w-[140px] align-middle"
                >
                  Audit Criteria
                </th>
                <th
                  rowSpan={2}
                  className="border border-stone-700 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 w-12 align-middle"
                >
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
              <tr className="bg-stone-800">
                <th className="border border-stone-700 px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-amber-100/90 min-w-[130px]">
                  Division
                </th>
                <th className="border border-stone-700 px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-amber-100/90 min-w-[130px]">
                  Department
                </th>
                <th className="border border-stone-700 px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-amber-100/90 min-w-[130px]">
                  Designation
                </th>
                <th className="border border-stone-700 px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-amber-100/90 min-w-[130px]">
                  Division
                </th>
                <th className="border border-stone-700 px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-amber-100/90 min-w-[130px]">
                  Department
                </th>
                <th className="border border-stone-700 px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-amber-100/90 min-w-[130px]">
                  Designation
                </th>
              </tr>
            </thead>
            <tbody className="bg-[#f7f3eb]">
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
                    <td className="border border-stone-400 p-1.5 align-middle">
                      <OrgSelect
                        id={`auditee-div-${row.key}`}
                        label="Auditee Division"
                        value={row.auditeeDivision}
                        options={divisionOptsAuditee}
                        placeholder="Division"
                        onChange={(v) =>
                          patchTeamRow(row.key, {
                            auditeeDivision: v,
                            auditeeDepartment: '',
                            auditeeDesignation: '',
                          })
                        }
                      />
                    </td>
                    <td className="border border-stone-400 p-1.5 align-middle">
                      <OrgSelect
                        id={`auditee-dept-${row.key}`}
                        label="Auditee Department"
                        value={row.auditeeDepartment}
                        options={auditeeDeptOpts}
                        placeholder="Department"
                        disabled={!row.auditeeDivision}
                        onChange={(v) =>
                          patchTeamRow(row.key, {
                            auditeeDepartment: v,
                            auditeeDesignation: '',
                          })
                        }
                      />
                    </td>
                    <td className="border border-stone-400 p-1.5 align-middle">
                      <OrgSelect
                        id={`auditee-desig-${row.key}`}
                        label="Auditee Designation"
                        value={row.auditeeDesignation}
                        options={auditeeDesigOpts}
                        placeholder="Designation"
                        disabled={!row.auditeeDivision || !row.auditeeDepartment}
                        onChange={(v) => patchTeamRow(row.key, { auditeeDesignation: v })}
                      />
                    </td>
                    <td className="border border-stone-400 p-1.5 align-middle">
                      <OrgSelect
                        id={`auditor-div-${row.key}`}
                        label="Auditor Division"
                        value={row.auditorDivision}
                        options={divisionOptsAuditor}
                        placeholder="Division"
                        onChange={(v) =>
                          patchTeamRow(row.key, {
                            auditorDivision: v,
                            auditorDepartment: '',
                            auditorDesignation: '',
                          })
                        }
                      />
                    </td>
                    <td className="border border-stone-400 p-1.5 align-middle">
                      <OrgSelect
                        id={`auditor-dept-${row.key}`}
                        label="Auditor Department"
                        value={row.auditorDepartment}
                        options={auditorDeptOpts}
                        placeholder="Department"
                        disabled={!row.auditorDivision}
                        onChange={(v) =>
                          patchTeamRow(row.key, {
                            auditorDepartment: v,
                            auditorDesignation: '',
                          })
                        }
                      />
                    </td>
                    <td className="border border-stone-400 p-1.5 align-middle">
                      <OrgSelect
                        id={`auditor-desig-${row.key}`}
                        label="Auditor Designation"
                        value={row.auditorDesignation}
                        options={auditorDesigOpts}
                        placeholder="Designation"
                        disabled={!row.auditorDivision || !row.auditorDepartment}
                        onChange={(v) => patchTeamRow(row.key, { auditorDesignation: v })}
                      />
                    </td>
                    <td className="border border-stone-400 p-1.5 align-middle">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(limsOutlineBtnClass, 'w-full gap-1.5')}
                        aria-label={
                          row.criteriaClauseNos.length > 0
                            ? `View clauses for row ${index + 1}`
                            : `Select clauses for row ${index + 1}`
                        }
                        onClick={() => setCriteriaRowKey(row.key)}
                      >
                        {row.criteriaClauseNos.length > 0 ? (
                          <>
                            <Eye size={14} />
                            View
                            {` (${row.criteriaClauseNos.length})`}
                          </>
                        ) : (
                          <>
                            <ListChecks size={14} />
                            Select
                          </>
                        )}
                      </Button>
                    </td>
                    <td className="border border-stone-400 p-1.5 text-center align-middle">
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

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-stone-200 pt-4">
        <Button
          type="button"
          className={limsPrimaryBtnClass}
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
