import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Pencil, FileText, FolderOpen } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { TestAllocationRow } from '../types'

export type TestAllocationFormState = {
  sampleAllocationId: string
  sectionCode: string
  department: string | null
  designation: string | null
  testParameterIds: string[]
  testParameterSummary: string
  assignedEmployeeId: string
  assignedEmployeeName: string
}

type EmployeeOption = { id: string; name: string; department: string; designation: string }
export type TestParamOption = { id: string; label: string; specificRequirement?: string; underAccreditation?: string; isCodeId?: string | null; department?: string | null }

export function TestAllocationForm({
  row,
  form,
  onChange,
  onSave,
  onClose,
  testParamOptions,
  employeesFiltered,
  designationOptions = [],
  onTestParameterUpdated,
}: {
  row: TestAllocationRow
  form: TestAllocationFormState
  onChange: (next: TestAllocationFormState) => void
  onSave: () => void
  onClose: () => void
  testParamOptions: TestParamOption[]
  employeesFiltered: EmployeeOption[]
  designationOptions?: string[]
  /** Called after a test parameter specific requirement is updated so parent can refresh the list */
  onTestParameterUpdated?: () => void
}) {
  const navigate = useNavigate()
  const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(() => new Set(form.testParameterIds))
  const [testParamSearch, setTestParamSearch] = useState('')
  const selectAllHeaderRef = useRef<HTMLInputElement>(null)

  const [editSpecOpen, setEditSpecOpen] = useState(false)
  const [editSpecParamId, setEditSpecParamId] = useState<string | null>(null)
  const [editSpecValue, setEditSpecValue] = useState('')
  const [editSpecSaving, setEditSpecSaving] = useState(false)
  const [editSpecError, setEditSpecError] = useState<string | null>(null)

  const [sampleDetailsOpen, setSampleDetailsOpen] = useState(false)
  const [sampleDetailsLoading, setSampleDetailsLoading] = useState(false)
  const [sampleDetailsError, setSampleDetailsError] = useState<string | null>(null)
  const [sampleDetails, setSampleDetails] = useState<{
    sample_description: string | null
    sample_declaration: string | null
    any_other_information: string | null
  } | null>(null)

  useEffect(() => {
    setLocalSelectedIds(new Set(form.testParameterIds))
  }, [form.sampleAllocationId, form.testParameterIds])

  const filteredTestParamOptions = testParamOptions.filter((opt) => {
    const matchIsCode = (opt.isCodeId ?? null) === (row.isCodeId ?? null)
    const matchDept = (opt.department ?? '').trim() === (row.department ?? '').trim()
    return matchIsCode && matchDept
  })

  const searchFilteredOptions = testParamSearch.trim()
    ? filteredTestParamOptions.filter((opt) => {
        const q = testParamSearch.trim().toLowerCase()
        const label = (opt.label ?? '').toLowerCase()
        const spec = (opt.specificRequirement ?? '').toLowerCase()
        const accr = (opt.underAccreditation ?? '').toLowerCase()
        return label.includes(q) || spec.includes(q) || accr.includes(q)
      })
    : filteredTestParamOptions

  const toggleTestParam = (id: string) => {
    const next = new Set(localSelectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    const ids = Array.from(next)
    const labels = ids
      .map((tid) => testParamOptions.find((o) => o.id === tid)?.label)
      .filter(Boolean) as string[]
    setLocalSelectedIds(next)
    onChange({ ...form, testParameterIds: ids, testParameterSummary: labels.join(', ') })
  }

  const allFilteredSelected =
    searchFilteredOptions.length > 0 &&
    searchFilteredOptions.every((o) => localSelectedIds.has(o.id))
  const someFilteredSelected = searchFilteredOptions.some((o) => localSelectedIds.has(o.id))

  useEffect(() => {
    const el = selectAllHeaderRef.current
    if (el) el.indeterminate = !allFilteredSelected && someFilteredSelected
  }, [allFilteredSelected, someFilteredSelected])

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const next = new Set(localSelectedIds)
      searchFilteredOptions.forEach((o) => next.delete(o.id))
      const ids = Array.from(next)
      const labels = ids
        .map((tid) => testParamOptions.find((opt) => opt.id === tid)?.label)
        .filter(Boolean) as string[]
      setLocalSelectedIds(next)
      onChange({ ...form, testParameterIds: ids, testParameterSummary: labels.join(', ') })
    } else {
      const next = new Set(localSelectedIds)
      searchFilteredOptions.forEach((o) => next.add(o.id))
      const ids = Array.from(next)
      const labels = ids
        .map((tid) => testParamOptions.find((opt) => opt.id === tid)?.label)
        .filter(Boolean) as string[]
      setLocalSelectedIds(next)
      onChange({ ...form, testParameterIds: ids, testParameterSummary: labels.join(', ') })
    }
  }

  const openEditSpec = (opt: TestParamOption) => {
    setEditSpecParamId(opt.id)
    setEditSpecValue(opt.specificRequirement ?? '')
    setEditSpecError(null)
    setEditSpecOpen(true)
  }

  const saveEditSpec = async () => {
    if (!editSpecParamId) return
    setEditSpecSaving(true)
    setEditSpecError(null)
    try {
      const { error } = await supabase
        .from('test_parameters')
        .update({ specific_requirement: editSpecValue.trim() || null })
        .eq('id', editSpecParamId)
      if (error) throw error
      onTestParameterUpdated?.()
      setEditSpecOpen(false)
      setEditSpecParamId(null)
      setEditSpecValue('')
    } catch (err) {
      setEditSpecError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setEditSpecSaving(false)
    }
  }

  const openSampleDetails = async () => {
    setSampleDetailsOpen(true)
    setSampleDetailsError(null)
    setSampleDetails(null)
    setSampleDetailsLoading(true)
    try {
      const { data: sampleData, error: sampleError } = await supabase
        .from('samples')
        .select('sample_description, sample_declaration, any_other_information')
        .eq('id', row.sampleId)
        .single()
      if (sampleError) throw sampleError
      const d = sampleData as {
        sample_description?: string | null
        sample_declaration?: string | null
        any_other_information?: string | null
      }
      setSampleDetails({
        sample_description: d.sample_description ?? null,
        sample_declaration: d.sample_declaration ?? null,
        any_other_information: d.any_other_information ?? null,
      })
    } catch (err) {
      setSampleDetailsError(err instanceof Error ? err.message : 'Failed to load sample details')
    } finally {
      setSampleDetailsLoading(false)
    }
  }

  const fmtDetail = (v: string | null | undefined) => (v != null && String(v).trim() !== '' ? String(v).trim() : '—')

  const IS_CODE_FILES_BUCKET = 'is-code-files'

  const getSignedUrlForIsCodeFile = async (storagePath: string): Promise<string | undefined> => {
    try {
      const { data, error } = await supabase.storage.from(IS_CODE_FILES_BUCKET).createSignedUrl(storagePath, 60 * 10)
      if (error) throw error
      return data?.signedUrl
    } catch {
      return undefined
    }
  }

  const openViewFilesWindow = async () => {
    if (!row.isCodeId || !row.isCodeLabel) return
    const win = window.open('', '_blank', 'width=700,height=500')
    if (!win) return
    const esc = (s: string) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>IS Code Files</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;margin:16px;}h1{font-size:18px;} .muted{color:#64748b;font-size:12px;margin-bottom:12px;} .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;} .name{flex:1;} .btn{padding:6px 12px;border-radius:8px;background:#0f172a;color:white;text-decoration:none;font-size:12px;} .btn:hover{background:#1e293b;} .empty{color:#64748b;padding:18px;border:1px dashed #cbd5e1;border-radius:8px;}</style></head><body><h1>IS Code Files</h1><div class="muted">${esc(row.isCodeLabel)}</div><div class="muted">Loading…</div></body></html>`)
    win.document.close()

    const { data: fileList, error } = await supabase
      .from('is_code_files')
      .select('id, file_name, storage_path')
      .eq('is_code_id', row.isCodeId)
      .order('created_at', { ascending: false })
    if (error) {
      win.document.open()
      win.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>IS Code Files</title></head><body><h1>IS Code Files</h1><p>Failed to load files.</p></body></html>`)
      win.document.close()
      return
    }
    const list = Array.isArray(fileList) ? fileList : []
    const withUrls: { file_name: string; url?: string }[] = []
    for (const f of list) {
      const url = await getSignedUrlForIsCodeFile((f as { storage_path: string }).storage_path)
      withUrls.push({ file_name: (f as { file_name: string }).file_name, url })
    }
    const items =
      withUrls.length === 0
        ? '<div class="empty">No files in IS Code directory for this code.</div>'
        : withUrls
            .map(
              (f) =>
                `<div class="row"><span class="name">${esc(f.file_name)}</span>${f.url ? `<a class="btn" href="${esc(f.url)}" target="_blank" rel="noreferrer">View</a>` : '<span class="muted">—</span>'}</div>`,
            )
            .join('')
    win.document.open()
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>IS Code Files</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;margin:16px;}h1{font-size:18px;} .muted{color:#64748b;font-size:12px;margin-bottom:12px;} .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;} .name{flex:1;} .btn{padding:6px 12px;border-radius:8px;background:#0f172a;color:white;text-decoration:none;font-size:12px;} .btn:hover{background:#1e293b;} .empty{color:#64748b;padding:18px;border:1px dashed #cbd5e1;border-radius:8px;}</style></head><body><h1>IS Code Files</h1><div class="muted">${esc(row.isCodeLabel)}</div>${items}</body></html>`)
    win.document.close()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Section Code</Label>
          <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">{row.sectionCode}</div>
        </div>
        <div className="space-y-2">
          <Label>IS Code</Label>
          <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">{row.isCodeLabel ?? '-'}</div>
        </div>
        <div className="space-y-2">
          <Label>Department</Label>
          <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">{row.department ?? '-'}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Designation</Label>
          <Select
            value={form.designation ?? ''}
            onValueChange={(value) => onChange({ ...form, designation: value || null })}
          >
            <SelectTrigger>
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
          {designationOptions.length === 0 && row.department && (
            <p className="text-xs text-muted-foreground">No designations in Test Parameters for this department.</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Select Employee</Label>
          <Select
            value={form.assignedEmployeeId || ''}
            onValueChange={(value) => {
              const emp = employeesFiltered.find((e) => e.id === value)
              onChange({
                ...form,
                assignedEmployeeId: value,
                assignedEmployeeName: emp?.name ?? '',
              })
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select employee (filtered by dept/designation)" />
            </SelectTrigger>
            <SelectContent>
              {employeesFiltered.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.name} {emp.designation ? `(${emp.designation})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {employeesFiltered.length === 0 && (row.department || form.designation) && (
            <p className="text-xs text-muted-foreground">No employees in User Management match this department and designation.</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-sm font-medium leading-none h-auto py-0 px-0 hover:bg-transparent"
              onClick={() => navigate('/masters/test-parameter?openAdd=1')}
              title="Open Add New Test Parameter form"
            >
              Test Parameters
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openViewFilesWindow}
              disabled={!row.isCodeId}
              title={row.isCodeId ? `View files for ${row.isCodeLabel ?? 'IS Code'}` : 'Select a section with IS Code to view files'}
            >
              <FolderOpen className="mr-1 h-4 w-4" />
              View Files
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openSampleDetails}
            >
              <FileText className="mr-1 h-4 w-4" />
              View Sample Details
            </Button>
          </div>
          <Input
            placeholder="Search in table..."
            value={testParamSearch}
            onChange={(e) => setTestParamSearch(e.target.value)}
            className="max-w-xs h-9"
          />
        </div>
        <div className="max-h-48 overflow-y-auto rounded-md border">
          {filteredTestParamOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2 text-center">No test parameters for this IS Code &amp; Department.</p>
          ) : searchFilteredOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2 text-center">No matches for &quot;{testParamSearch.trim()}&quot;.</p>
          ) : (
            <table className="w-full text-sm border-collapse text-center">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-9 p-2 font-medium">
                    <div className="flex justify-center">
                      <input
                        ref={selectAllHeaderRef}
                        type="checkbox"
                        aria-label="Select all test parameters"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAll}
                      />
                    </div>
                  </th>
                  <th className="p-2 font-medium">Test Name</th>
                  <th className="p-2 font-medium">Specified Requirement</th>
                  <th className="p-2 font-medium">Under Accreditation</th>
                </tr>
              </thead>
              <tbody>
                {searchFilteredOptions.map((opt) => (
                  <tr
                    key={opt.id}
                    className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer"
                    onClick={() => toggleTestParam(opt.id)}
                  >
                    <td className="p-2">
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          checked={localSelectedIds.has(opt.id)}
                          onChange={() => toggleTestParam(opt.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </td>
                    <td className="p-2">{opt.label || '-'}</td>
                    <td className="p-2 text-muted-foreground">
                      <div className="flex items-center justify-center gap-1">
                        <span>{opt.specificRequirement ?? '-'}</span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          aria-label="Edit specified requirement"
                          onClick={(e) => {
                            e.stopPropagation()
                            openEditSpec(opt)
                          }}
                        >
                          <Pencil size={14} />
                        </Button>
                      </div>
                    </td>
                    <td className="p-2">{opt.underAccreditation ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={onSave}>
          Save
        </Button>
      </div>

      <Dialog open={editSpecOpen} onOpenChange={setEditSpecOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Specified Requirement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-spec-value">Specified Requirement</Label>
              <Textarea
                id="edit-spec-value"
                rows={3}
                value={editSpecValue}
                onChange={(e) => setEditSpecValue(e.target.value)}
                placeholder="e.g. 0.30 Maximum"
              />
            </div>
            {editSpecError && (
              <p className="text-sm text-destructive">{editSpecError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditSpecOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void saveEditSpec()} disabled={editSpecSaving}>
                {editSpecSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sampleDetailsOpen} onOpenChange={setSampleDetailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sample Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {sampleDetailsLoading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {sampleDetailsError && (
              <p className="text-sm text-destructive">{sampleDetailsError}</p>
            )}
            {!sampleDetailsLoading && !sampleDetailsError && sampleDetails && (
              <div className="grid gap-4 text-sm">
                <div className="space-y-2">
                  <h5 className="font-medium text-foreground">Sample Description &amp; Sample Declaration</h5>
                  <div className="grid grid-cols-[120px_1fr] gap-2 items-baseline">
                    <span className="text-muted-foreground">Sample Description</span>
                    <span className="whitespace-pre-wrap">{fmtDetail(sampleDetails.sample_description)}</span>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2 items-start">
                    <span className="text-muted-foreground pt-0.5">Sample Declaration</span>
                    <span className="whitespace-pre-wrap">{fmtDetail(sampleDetails.sample_declaration)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <h5 className="font-medium text-foreground">Any Other Information</h5>
                  <div className="grid grid-cols-[120px_1fr] gap-2 items-start">
                    <span className="text-muted-foreground pt-0.5">Details</span>
                    <span className="whitespace-pre-wrap">{fmtDetail(sampleDetails.any_other_information)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
