import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  fetchReportPrepSectionsForReferback,
  type ReportPrepSectionOption,
} from '@/features/sample-handling/report-preparation/fetchReportPrepSectionsForReferback'
import {
  BOTH_SECTION_CODES_LABEL,
  BOTH_SECTION_CODES_VALUE,
  ISSUED_REPORT_ISSUE_KINDS,
  ISSUED_REPORT_REFERBACK_TARGETS,
  type IssuedReportIssueKind,
  type IssuedReportReferbackTarget,
  type IssuedTestReportListRow,
} from './types'

type ReviewUser = { id: string; name: string; designation: string; departmentName: string }

const DEFAULT_TESTING_DESIGNATION = 'Testing Engineer'
const UNSET_SELECT = '__unset__'
const norm = (s: string) => (s ?? '').trim().toLowerCase()

function designationOptionsForDepartment(users: ReviewUser[], department: string): string[] {
  if (!department.trim()) return []
  const deptNorm = norm(department)
  try {
    const raw =
      typeof window !== 'undefined' ? window.localStorage.getItem('userManagement.designationByDepartment') : null
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string[]>
      if (parsed && typeof parsed === 'object') {
        const key = Object.keys(parsed).find((k) => norm(k) === deptNorm)
        if (key && Array.isArray(parsed[key])) {
          return [...parsed[key]].sort((a, b) => a.localeCompare(b))
        }
      }
    }
  } catch {
    /* ignore */
  }
  const set = new Set(
    users.filter((u) => norm(u.departmentName) === deptNorm).map((u) => u.designation).filter(Boolean),
  )
  return [...set].sort((a, b) => a.localeCompare(b))
}

function defaultTargetForDesignation(designation: string): IssuedReportReferbackTarget {
  const n = designation.toLowerCase()
  if (n.includes('review')) return 'results_review'
  if (n.includes('test') && n.includes('engineer')) return 'under_testing'
  return 'report_preparation'
}

const TARGET_DESIGNATION_PREFS: Record<IssuedReportReferbackTarget, string[]> = {
  allocation: ['Sample Incharge', 'Sample Cell Incharge', 'Sample In-charge'],
  test_allocation: ['Testing Engineer', 'Technical Manager'],
  under_testing: ['Testing Engineer'],
  results_review: ['Technical Manager'],
  report_preparation: ['Quality Manager', 'Technical Manager'],
}

function sectionLabel(s: ReportPrepSectionOption): string {
  const code = s.sectionCode?.trim() || '—'
  const dept = s.department?.trim()
  return dept ? `${code} — ${dept}` : code
}

export type IssuedReportAmendmentSectionAssign = {
  section: ReportPrepSectionOption
  department: string
  designation: string
  employee: { id: string; name: string }
  targetStage: IssuedReportReferbackTarget
}

export type IssuedReportAmendmentSubmitPayload = {
  issueKind: IssuedReportIssueKind
  sections: IssuedReportAmendmentSectionAssign[]
  remark: string
}

type SectionAssignDraft = {
  department: string
  designation: string
  employeeId: string
  targetStage: IssuedReportReferbackTarget
}

export function IssuedReportAmendmentDialog({
  open,
  onOpenChange,
  row,
  onSubmit,
  submitLoading,
  submitError,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: IssuedTestReportListRow | null
  onSubmit: (payload: IssuedReportAmendmentSubmitPayload) => Promise<void>
  submitLoading: boolean
  submitError: string | null
}) {
  const handleOpenChange = useFormDialogOpenChange(onOpenChange)
  const [issueKind, setIssueKind] = useState<IssuedReportIssueKind>('amendment')
  const [sectionOptions, setSectionOptions] = useState<ReportPrepSectionOption[]>([])
  const [sectionsLoading, setSectionsLoading] = useState(false)
  const [users, setUsers] = useState<ReviewUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [sampleAllocationId, setSampleAllocationId] = useState(BOTH_SECTION_CODES_VALUE)
  const [assigns, setAssigns] = useState<Record<string, SectionAssignDraft>>({})
  const [remark, setRemark] = useState('')

  const srfLabel = row?.srfNumber?.trim() || '—'
  const selectedSections = useMemo(() => {
    if (sampleAllocationId === BOTH_SECTION_CODES_VALUE) return sectionOptions
    return sectionOptions.filter((s) => s.sampleAllocationId === sampleAllocationId)
  }, [sampleAllocationId, sectionOptions])

  const pickEmployeeId = (
    usersList: ReviewUser[],
    department: string,
    designation: string,
    assignedId: string | null,
    preferAssigned: boolean,
  ) => {
    if (department && designation) {
      const dept = norm(department)
      const des = norm(designation)
      const matches = usersList.filter((u) => norm(u.departmentName) === dept && norm(u.designation) === des)
      if (preferAssigned && assignedId && matches.some((u) => u.id === assignedId)) return assignedId
      if (matches[0]) return matches[0].id
    }
    if (preferAssigned && assignedId && usersList.some((u) => u.id === assignedId)) return assignedId
    return ''
  }

  const pickDesignationForTarget = (
    target: IssuedReportReferbackTarget,
    department: string,
    usersList: ReviewUser[],
  ) => {
    const prefs = TARGET_DESIGNATION_PREFS[target]
    const available = designationOptionsForDepartment(usersList, department)
    for (const pref of prefs) {
      const exact = available.find((item) => norm(item) === norm(pref))
      if (exact) return exact
    }
    for (const pref of prefs) {
      const fuzzy = available.find(
        (item) => item.toLowerCase().includes(pref.toLowerCase()) || pref.toLowerCase().includes(item.toLowerCase()),
      )
      if (fuzzy) return fuzzy
    }
    return available[0] || prefs[0] || DEFAULT_TESTING_DESIGNATION
  }

  const departmentForTarget = (
    target: IssuedReportReferbackTarget,
    section: ReportPrepSectionOption,
    usersList: ReviewUser[],
  ) => {
    const named = (pattern: RegExp) => {
      const hit = usersList.find((u) => pattern.test(u.departmentName))
      return hit?.departmentName?.trim() || ''
    }
    if (target === 'allocation') return named(/sample\s*cell/i) || section.department?.trim() || ''
    if (target === 'report_preparation') return named(/quality/i) || section.department?.trim() || ''
    return section.department?.trim() || ''
  }

  const draftFromSection = (
    section: ReportPrepSectionOption,
    usersList: ReviewUser[],
    target?: IssuedReportReferbackTarget,
  ): SectionAssignDraft => {
    const resolvedTarget =
      target ?? defaultTargetForDesignation(section.designation?.trim() || DEFAULT_TESTING_DESIGNATION)
    const department = departmentForTarget(resolvedTarget, section, usersList)
    const designation = pickDesignationForTarget(resolvedTarget, department, usersList)
    const preferAssigned = resolvedTarget === 'under_testing' || resolvedTarget === 'test_allocation'
    return {
      department,
      designation,
      employeeId: pickEmployeeId(usersList, department, designation, section.assignedEmployeeId, preferAssigned),
      targetStage: resolvedTarget,
    }
  }

  const initAssigns = (list: ReportPrepSectionOption[], usersList: ReviewUser[]) => {
    const next: Record<string, SectionAssignDraft> = {}
    for (const section of list) {
      next[section.sampleAllocationId] = draftFromSection(section, usersList)
    }
    setAssigns(next)
  }

  const patchAssign = (allocId: string, patch: Partial<SectionAssignDraft>) => {
    setAssigns((prev) => {
      const current = prev[allocId]
      if (!current) return prev
      return { ...prev, [allocId]: { ...current, ...patch } }
    })
  }

  useEffect(() => {
    if (!open || !row) {
      setIssueKind('amendment')
      setSampleAllocationId(BOTH_SECTION_CODES_VALUE)
      setAssigns({})
      setRemark('')
      setSectionOptions([])
      return
    }
    setIssueKind('amendment')
    setSampleAllocationId(BOTH_SECTION_CODES_VALUE)
    setAssigns({})
    setRemark('')
  }, [open, row?.id])

  useEffect(() => {
    if (!open || !row?.id) return
    let canceled = false
    setSectionsLoading(true)
    void fetchReportPrepSectionsForReferback(row.id)
      .then((list) => {
        if (canceled) return
        setSectionOptions(list)
        setSampleAllocationId(BOTH_SECTION_CODES_VALUE)
        initAssigns(list, users)
      })
      .catch(() => {
        if (!canceled) {
          setSectionOptions([])
          setAssigns({})
        }
      })
      .finally(() => {
        if (!canceled) setSectionsLoading(false)
      })
    return () => {
      canceled = true
    }
  }, [open, row?.id])

  useEffect(() => {
    if (!open) return
    let canceled = false
    setUsersLoading(true)
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id, full_name, designation, department_name, status')
          .order('full_name', { ascending: true })
        if (error) throw error
        if (canceled) return
        const list = Array.isArray(data) ? data : []
        setUsers(
          list
            .filter((u) => String((u as { status?: string }).status ?? '').toLowerCase() !== 'inactive')
            .map((u) => ({
              id: String((u as { id: string }).id),
              name: String((u as { full_name?: string }).full_name ?? '').trim() || String((u as { id: string }).id),
              designation: String((u as { designation?: string }).designation ?? '').trim(),
              departmentName: String((u as { department_name?: string }).department_name ?? '').trim(),
            })),
        )
      } catch {
        if (!canceled) setUsers([])
      } finally {
        if (!canceled) setUsersLoading(false)
      }
    })()
    return () => {
      canceled = true
    }
  }, [open])

  useEffect(() => {
    if (!open || users.length === 0 || sectionOptions.length === 0) return
    setAssigns((prev) => {
      let changed = false
      const next = { ...prev }
      for (const section of sectionOptions) {
        const draft = next[section.sampleAllocationId]
        if (!draft) {
          next[section.sampleAllocationId] = draftFromSection(section, users)
          changed = true
          continue
        }
        const applied = draftFromSection(section, users, draft.targetStage)
        if (
          draft.department === applied.department &&
          draft.designation === applied.designation &&
          draft.employeeId === applied.employeeId
        ) {
          continue
        }
        next[section.sampleAllocationId] = applied
        changed = true
      }
      return changed ? next : prev
    })
  }, [open, users, sectionOptions])

  const allDepartmentOptions = useMemo(() => {
    const set = new Set<string>()
    for (const s of sectionOptions) {
      if (s.department?.trim()) set.add(s.department.trim())
    }
    for (const u of users) {
      if (u.departmentName) set.add(u.departmentName)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [users, sectionOptions])

  const designationChoices = (draft: SectionAssignDraft | undefined, section: ReportPrepSectionOption) => {
    const fromUsers = designationOptionsForDepartment(users, draft?.department ?? '')
    const merged = new Set([DEFAULT_TESTING_DESIGNATION, ...fromUsers])
    if (draft?.designation.trim()) merged.add(draft.designation.trim())
    if (section.designation?.trim()) merged.add(section.designation.trim())
    return [...merged].sort((a, b) => a.localeCompare(b))
  }

  const employeeChoices = (draft: SectionAssignDraft | undefined) => {
    const dept = norm(draft?.department ?? '')
    const des = norm(draft?.designation ?? '')
    const filtered =
      dept && des
        ? users.filter((u) => norm(u.departmentName) === dept && norm(u.designation) === des)
        : []
    if (draft?.employeeId && !filtered.some((u) => u.id === draft.employeeId)) {
      const extra = users.find((u) => u.id === draft.employeeId)
      if (extra) return [extra, ...filtered]
    }
    return filtered
  }

  const builtSections: IssuedReportAmendmentSectionAssign[] = selectedSections.flatMap((section) => {
    const draft = assigns[section.sampleAllocationId]
    if (!draft) return []
    const person = users.find((u) => u.id === draft.employeeId)
    if (!person || !draft.department || !draft.designation) return []
    return [
      {
        section,
        department: draft.department,
        designation: draft.designation,
        employee: { id: person.id, name: person.name },
        targetStage: draft.targetStage,
      },
    ]
  })

  const canSubmit = Boolean(row && selectedSections.length > 0 && builtSections.length === selectedSections.length && issueKind)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!row || !canSubmit) return
    await onSubmit({
      issueKind,
      sections: builtSections,
      remark,
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        portalClassName="lg:left-[268px]"
        className={cn(
          limsDialogClass,
          'flex w-[min(96vw,64rem)] max-w-[64rem] flex-col',
          // Sit in the portal flex box so the form centers in the main pane (sidebar excluded).
          'lg:!relative lg:!left-auto lg:!right-auto lg:!top-auto lg:!mx-0 lg:!translate-x-0 lg:!translate-y-0',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Issue Amendment / Revised / Supplementary
            </DialogTitle>
          </DialogHeader>
        </div>

        <form
          className={cn(limsRegistryFormClass, 'min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5')}
          onSubmit={(e) => void handleSubmit(e)}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 min-w-0">
              <Label htmlFor="issued-amend-kind">Issue type</Label>
              <Select value={issueKind} onValueChange={(v) => setIssueKind(v as IssuedReportIssueKind)}>
                <SelectTrigger id="issued-amend-kind" aria-label="Issue type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ISSUED_REPORT_ISSUE_KINDS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="issued-amend-srf">SRF Number</Label>
              <Input id="issued-amend-srf" value={srfLabel} readOnly aria-label="SRF number" />
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="issued-amend-section">Section code</Label>
              {sectionsLoading ? (
                <p className="text-sm text-stone-600">Loading section codes…</p>
              ) : sectionOptions.length === 0 ? (
                <p className="text-sm text-red-700">No section codes found on this SRF.</p>
              ) : (
                <Select
                  value={sampleAllocationId || undefined}
                  onValueChange={setSampleAllocationId}
                >
                  <SelectTrigger id="issued-amend-section" aria-label="Section code">
                    <SelectValue placeholder="Select section code" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BOTH_SECTION_CODES_VALUE}>{BOTH_SECTION_CODES_LABEL}</SelectItem>
                    {sectionOptions.map((s) => (
                      <SelectItem key={s.sampleAllocationId} value={s.sampleAllocationId}>
                        {sectionLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {selectedSections.map((section, index) => {
            const draft = assigns[section.sampleAllocationId]
            const empOptions = employeeChoices(draft)
            const desigOptions = designationChoices(draft, section)
            const showLabels = index === 0
            return (
              <div key={section.sampleAllocationId} className="grid gap-4 sm:grid-cols-5">
                <div className="space-y-2 min-w-0">
                  {showLabels ? <Label>Section code</Label> : <span className="sr-only">Section code</span>}
                  <Input
                    value={sectionLabel(section)}
                    readOnly
                    aria-label={`Section code ${section.sectionCode}`}
                  />
                </div>
                <div className="space-y-2 min-w-0">
                  {showLabels ? (
                    <Label htmlFor={`issued-amend-target-${section.sampleAllocationId}`}>Refer back to</Label>
                  ) : (
                    <span className="sr-only">Refer back to</span>
                  )}
                  <Select
                    value={draft?.targetStage ?? 'under_testing'}
                    onValueChange={(v) => {
                      const target = v as IssuedReportReferbackTarget
                      setAssigns((prev) => ({
                        ...prev,
                        [section.sampleAllocationId]: draftFromSection(section, users, target),
                      }))
                    }}
                  >
                    <SelectTrigger
                      id={`issued-amend-target-${section.sampleAllocationId}`}
                      aria-label={`Refer back to for ${section.sectionCode}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ISSUED_REPORT_REFERBACK_TARGETS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 min-w-0">
                  {showLabels ? (
                    <Label htmlFor={`issued-amend-dept-${section.sampleAllocationId}`}>Department</Label>
                  ) : (
                    <span className="sr-only">Department</span>
                  )}
                  <Select
                    value={draft?.department || UNSET_SELECT}
                    onValueChange={(v) => {
                      const target = draft?.targetStage ?? 'under_testing'
                      const designation = pickDesignationForTarget(target, v, users)
                      const preferAssigned = target === 'under_testing' || target === 'test_allocation'
                      const employeeId = pickEmployeeId(
                        users,
                        v,
                        designation,
                        section.assignedEmployeeId,
                        preferAssigned,
                      )
                      patchAssign(section.sampleAllocationId, { department: v, designation, employeeId })
                    }}
                  >
                    <SelectTrigger
                      id={`issued-amend-dept-${section.sampleAllocationId}`}
                      aria-label={`Department for ${section.sectionCode}`}
                    >
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSET_SELECT} disabled>
                        Select department
                      </SelectItem>
                      {allDepartmentOptions.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 min-w-0">
                  {showLabels ? (
                    <Label htmlFor={`issued-amend-desig-${section.sampleAllocationId}`}>Designation</Label>
                  ) : (
                    <span className="sr-only">Designation</span>
                  )}
                  <Select
                    value={draft?.designation || UNSET_SELECT}
                    onValueChange={(v) => {
                      const target = draft?.targetStage ?? 'under_testing'
                      const preferAssigned = target === 'under_testing' || target === 'test_allocation'
                      const employeeId = pickEmployeeId(
                        users,
                        draft?.department ?? '',
                        v,
                        section.assignedEmployeeId,
                        preferAssigned,
                      )
                      patchAssign(section.sampleAllocationId, { designation: v, employeeId })
                    }}
                  >
                    <SelectTrigger
                      id={`issued-amend-desig-${section.sampleAllocationId}`}
                      aria-label={`Designation for ${section.sectionCode}`}
                    >
                      <SelectValue placeholder="Select designation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSET_SELECT} disabled>
                        Select designation
                      </SelectItem>
                      {desigOptions.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 min-w-0">
                  {showLabels ? (
                    <Label htmlFor={`issued-amend-emp-${section.sampleAllocationId}`}>Employee</Label>
                  ) : (
                    <span className="sr-only">Employee</span>
                  )}
                  <Select
                    value={draft?.employeeId || UNSET_SELECT}
                    onValueChange={(v) => patchAssign(section.sampleAllocationId, { employeeId: v })}
                    disabled={usersLoading || (!draft?.employeeId && empOptions.length === 0)}
                  >
                    <SelectTrigger
                      id={`issued-amend-emp-${section.sampleAllocationId}`}
                      aria-label={`Employee for ${section.sectionCode}`}
                    >
                      <SelectValue
                        placeholder={
                          usersLoading
                            ? 'Loading users…'
                            : empOptions.length === 0
                              ? 'No employee for this department & designation'
                              : 'Select employee'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSET_SELECT} disabled>
                        Select employee
                      </SelectItem>
                      {empOptions.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )
          })}

          <div className="space-y-2">
            <Label htmlFor="issued-amend-remark">Remark</Label>
            <Textarea
              id="issued-amend-remark"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Optional reason (saved on the amendment record)"
              rows={2}
              className="min-h-16 resize-y"
            />
          </div>

          {submitError ? <p className="text-sm text-red-700">{submitError}</p> : null}

          <div className="flex justify-end gap-2 border-t border-stone-300 pt-3">
            <Button
              type="button"
              variant="outline"
              className={limsOutlineBtnClass}
              onClick={() => handleOpenChange(false)}
              disabled={submitLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className={limsPrimaryBtnClass}
              disabled={!canSubmit || submitLoading}
            >
              {submitLoading ? 'Referring back…' : 'Refer back'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
