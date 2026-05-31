import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabaseClient'
import {
  fetchReportPrepSectionsForReferback,
  type ReportPrepSectionOption,
} from './fetchReportPrepSectionsForReferback'

type ReviewUser = { id: string; name: string; designation: string; departmentName: string }

type ReferbackFormRow = {
  localId: string
  sampleAllocationId: string
  department: string
  designation: string
  employeeId: string
}

const norm = (s: string) => (s ?? '').trim().toLowerCase()

function newLocalId() {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function emptyFormRow(): ReferbackFormRow {
  return {
    localId: newLocalId(),
    sampleAllocationId: '',
    department: '',
    designation: '',
    employeeId: '',
  }
}

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

export function TestReportReferbackToReviewDialog({
  open,
  onOpenChange,
  sampleId,
  srfNumber,
  defaultEmployeeId,
  defaultDesignation,
  onSubmit,
  submitLoading,
  submitError,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleId: string | null
  srfNumber: string | null
  defaultEmployeeId?: string
  defaultDesignation?: string
  onSubmit: (
    sections: Array<{ testAllocationId: string; reviewer: { id: string; name: string } }>,
  ) => Promise<void>
  submitLoading: boolean
  submitError: string | null
}) {
  const [sectionOptions, setSectionOptions] = useState<ReportPrepSectionOption[]>([])
  const [sectionsLoading, setSectionsLoading] = useState(false)
  const [users, setUsers] = useState<ReviewUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [formRows, setFormRows] = useState<ReferbackFormRow[]>([emptyFormRow()])

  const srfLabel = srfNumber?.trim() || '—'

  useEffect(() => {
    if (!open || !sampleId) {
      setSectionOptions([])
      setFormRows([emptyFormRow()])
      return
    }

    let canceled = false
    setSectionsLoading(true)
    void fetchReportPrepSectionsForReferback(sampleId)
      .then((opts) => {
        if (canceled) return
        setSectionOptions(opts)
        const first = opts[0]
        setFormRows([
          {
            localId: newLocalId(),
            sampleAllocationId: first?.sampleAllocationId ?? '',
            department: first?.department?.trim() ?? '',
            designation: defaultDesignation?.trim() || 'Quality Manager',
            employeeId: defaultEmployeeId?.trim() ?? '',
          },
        ])
      })
      .catch(() => {
        if (!canceled) {
          setSectionOptions([])
          setFormRows([emptyFormRow()])
        }
      })
      .finally(() => {
        if (!canceled) setSectionsLoading(false)
      })

    return () => {
      canceled = true
    }
  }, [open, sampleId, defaultEmployeeId, defaultDesignation])

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

  const usedAllocIds = useMemo(
    () => new Set(formRows.map((r) => r.sampleAllocationId).filter(Boolean)),
    [formRows],
  )

  const sectionByAllocId = useMemo(
    () => new Map(sectionOptions.map((s) => [s.sampleAllocationId, s])),
    [sectionOptions],
  )

  const updateRow = (localId: string, patch: Partial<ReferbackFormRow>) => {
    setFormRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)))
  }

  const onSectionChange = (localId: string, sampleAllocationId: string) => {
    const sec = sectionByAllocId.get(sampleAllocationId)
    updateRow(localId, {
      sampleAllocationId,
      department: sec?.department?.trim() ?? '',
      designation: defaultDesignation?.trim() || 'Quality Manager',
      employeeId: '',
    })
  }

  const addRow = () => {
    const next = sectionOptions.find((s) => !usedAllocIds.has(s.sampleAllocationId))
    setFormRows((prev) => [
      ...prev,
      {
        localId: newLocalId(),
        sampleAllocationId: next?.sampleAllocationId ?? '',
        department: next?.department?.trim() ?? '',
        designation: defaultDesignation?.trim() || 'Quality Manager',
        employeeId: '',
      },
    ])
  }

  const removeRow = (localId: string) => {
    setFormRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.localId !== localId)))
  }

  const canAddRow = sectionOptions.length > formRows.length

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Array<{ testAllocationId: string; reviewer: { id: string; name: string } }> = []

    for (const row of formRows) {
      if (!row.sampleAllocationId.trim()) continue
      const sec = sectionByAllocId.get(row.sampleAllocationId)
      const taId = sec?.testAllocationId?.trim()
      if (!taId) return
      const dept = row.department.trim()
      const des = row.designation.trim()
      const person = users.find(
        (u) => u.id === row.employeeId && norm(u.departmentName) === norm(dept) && norm(u.designation) === norm(des),
      )
      if (!person) return
      payload.push({
        testAllocationId: taId,
        reviewer: { id: person.id, name: person.name },
      })
    }

    if (payload.length === 0) return
    await onSubmit(payload)
  }

  const submitReady = formRows.some((row) => {
    const taId = sectionByAllocId.get(row.sampleAllocationId)?.testAllocationId?.trim()
    if (!row.sampleAllocationId || !taId || !row.designation || !row.employeeId) return false
    const person = users.find(
      (u) =>
        u.id === row.employeeId &&
        norm(u.departmentName) === norm(row.department) &&
        norm(u.designation) === norm(row.designation),
    )
    return Boolean(person)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Refer back to Results Under Review</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          Select section code(s) to send for re-review. The SRF stays in Test Report Preparation if other
          sections are not referred back.
        </p>
        <form className="space-y-4 py-2" onSubmit={(e) => void handleSubmit(e)}>
          <div className="space-y-2">
            <Label htmlFor="prep-referback-srf">SRF number</Label>
            <Select value={sampleId ?? 'srf'} disabled>
              <SelectTrigger id="prep-referback-srf" aria-label="SRF number">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sampleId ? <SelectItem value={sampleId}>{srfLabel}</SelectItem> : null}
              </SelectContent>
            </Select>
          </div>

          {sectionsLoading ? (
            <p className="text-sm text-muted-foreground">Loading section codes…</p>
          ) : sectionOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sections available for refer back on this SRF (they may already be in review).
            </p>
          ) : (
            <div className="space-y-4">
              {formRows.map((row, index) => {
                const designationOptions = designationOptionsForDepartment(users, row.department)
                const employeeOptions = users.filter(
                  (u) =>
                    norm(u.departmentName) === norm(row.department) &&
                    norm(u.designation) === norm(row.designation),
                )
                const availableSections = sectionOptions.filter(
                  (s) =>
                    s.sampleAllocationId === row.sampleAllocationId ||
                    !usedAllocIds.has(s.sampleAllocationId),
                )

                return (
                  <div
                    key={row.localId}
                    className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Section {index + 1}
                      </span>
                      {formRows.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label="Remove row"
                          onClick={() => removeRow(row.localId)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label>Section code</Label>
                      <Select
                        value={row.sampleAllocationId || undefined}
                        onValueChange={(v) => onSectionChange(row.localId, v)}
                      >
                        <SelectTrigger aria-label={`Section code row ${index + 1}`}>
                          <SelectValue placeholder="Select section code" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableSections.map((s) => (
                            <SelectItem key={s.sampleAllocationId} value={s.sampleAllocationId}>
                              {s.sectionCode}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Department</Label>
                      <Select value={row.department || 'dept'} disabled>
                        <SelectTrigger aria-label="Department">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {row.department ? (
                            <SelectItem value={row.department}>{row.department}</SelectItem>
                          ) : (
                            <SelectItem value="dept">—</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Designation</Label>
                      <Select
                        value={row.designation}
                        onValueChange={(v) => updateRow(row.localId, { designation: v, employeeId: '' })}
                        disabled={!row.sampleAllocationId}
                      >
                        <SelectTrigger aria-label="Designation">
                          <SelectValue placeholder="Select designation" />
                        </SelectTrigger>
                        <SelectContent>
                          {designationOptions.map((d) => (
                            <SelectItem key={d} value={d}>
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Name of employee (reviewer)</Label>
                      <Select
                        value={row.employeeId}
                        onValueChange={(v) => updateRow(row.localId, { employeeId: v })}
                        disabled={
                          !row.designation || usersLoading || employeeOptions.length === 0
                        }
                      >
                        <SelectTrigger aria-label="Select reviewer">
                          <SelectValue
                            placeholder={
                              usersLoading
                                ? 'Loading users…'
                                : employeeOptions.length === 0
                                  ? 'No user for this department & designation'
                                  : 'Select employee'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {employeeOptions.map((u) => (
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

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={addRow}
                disabled={!canAddRow}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add section row
              </Button>
            </div>
          )}

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!submitReady || submitLoading || sectionOptions.length === 0}
            >
              {submitLoading ? 'Referring back…' : 'Refer back'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
