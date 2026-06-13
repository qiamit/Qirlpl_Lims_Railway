import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabaseClient'
import type { TestAllocationRow } from '../types'

type ReviewUser = { id: string; name: string; designation: string; departmentName: string }

const DEFAULT_TESTING_DESIGNATION = 'Testing Engineer'
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

export function ResultsUnderReviewReferbackDialog({
  open,
  onOpenChange,
  row,
  onSubmit,
  submitLoading,
  submitError,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: TestAllocationRow | null
  onSubmit: (employee: { id: string; name: string; designation: string }) => Promise<void>
  submitLoading: boolean
  submitError: string | null
}) {
  const [users, setUsers] = useState<ReviewUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [designation, setDesignation] = useState(DEFAULT_TESTING_DESIGNATION)

  const department = row?.department?.trim() ?? ''
  const sectionLabel = row?.sectionCode?.trim() || '—'

  useEffect(() => {
    if (!open || !row) {
      setEmployeeId('')
      setDesignation(DEFAULT_TESTING_DESIGNATION)
      return
    }
    setDesignation(DEFAULT_TESTING_DESIGNATION)
    setEmployeeId(row.assignedEmployeeId?.trim() ?? '')
  }, [open, row?.testAllocationId, row?.assignedEmployeeId])

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

  const designationOptions = useMemo(() => {
    const fromUsers = designationOptionsForDepartment(users, department)
    const merged = new Set([DEFAULT_TESTING_DESIGNATION, ...fromUsers])
    if (designation.trim()) merged.add(designation.trim())
    return [...merged].sort((a, b) => a.localeCompare(b))
  }, [users, department, designation])

  const employeeOptions = useMemo(() => {
    if (!department || !designation) return []
    const dept = norm(department)
    const des = norm(designation)
    return users.filter((u) => norm(u.departmentName) === dept && norm(u.designation) === des)
  }, [users, department, designation])

  useEffect(() => {
    if (!open || !employeeId) return
    if (employeeOptions.some((u) => u.id === employeeId)) return
    setEmployeeId('')
  }, [open, employeeId, employeeOptions])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!employeeId) return
    const person = employeeOptions.find((u) => u.id === employeeId)
    if (!person) return
    await onSubmit({
      id: person.id,
      name: person.name,
      designation: designation.trim() || person.designation,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Refer back to Sample Under Testing</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          Assign the testing engineer to correct results and re-enter data before sending for review again.
        </p>
        <form className="space-y-4 py-2" onSubmit={(e) => void handleSubmit(e)}>
          <div className="space-y-2">
            <Label htmlFor="referback-section">Section code</Label>
            <Select value={row?.sampleAllocationId ?? 'section'} disabled>
              <SelectTrigger id="referback-section" aria-label="Section code">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {row?.sampleAllocationId ? (
                  <SelectItem value={row.sampleAllocationId}>{sectionLabel}</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="referback-department">Department</Label>
            <Select value={department || 'dept'} disabled>
              <SelectTrigger id="referback-department" aria-label="Department">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {department ? (
                  <SelectItem value={department}>{department}</SelectItem>
                ) : (
                  <SelectItem value="dept">—</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="referback-designation">Designation</Label>
            <Select
              value={designation}
              onValueChange={(v) => {
                setDesignation(v)
                setEmployeeId('')
              }}
              disabled={!row || !department}
            >
              <SelectTrigger id="referback-designation" aria-label="Select designation">
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
            <Label htmlFor="referback-employee">Name of employee (testing)</Label>
            <Select
              value={employeeId}
              onValueChange={setEmployeeId}
              disabled={!designation || usersLoading || employeeOptions.length === 0}
            >
              <SelectTrigger id="referback-employee" aria-label="Select testing engineer">
                <SelectValue
                  placeholder={
                    usersLoading
                      ? 'Loading users…'
                      : !designation
                        ? 'Select designation first'
                        : employeeOptions.length === 0
                          ? 'No employee for this department & designation'
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
            <Button type="submit" disabled={!row || !employeeId || submitLoading}>
              {submitLoading ? 'Referring back…' : 'Refer back'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
