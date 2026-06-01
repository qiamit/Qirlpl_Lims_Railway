import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { SampleRow } from '../types'
import { Plus, Trash2, FileText, FolderOpen } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'

export type AllocationSection = {
  id?: string
  sectionCode: string
  department: string
  designation: string
  sampleQuantity: string
}

export type SampleAllocationFormState = {
  sampleId: string
  srfNumber: string
  allocationDate: string
  isCodeLabel: string
  sections: AllocationSection[]
}

const today = () => new Date().toISOString().slice(0, 10)

const randomSectionCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  for (let i = 0; i < 6; i += 1) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

const emptySection = (): AllocationSection => ({
  sectionCode: randomSectionCode(),
  department: '',
  designation: '',
  sampleQuantity: '',
})

export function SampleAllocationForm({
  form,
  onChange,
  onSave,
  onClose,
  saveLoading = false,
  samples,
  departments,
  designations,
  designationsByDepartment,
  isCodeOptions,
  allocatedSampleIds,
  lockSrfSection,
}: {
  form: SampleAllocationFormState
  onChange: (next: SampleAllocationFormState) => void
  onSave: () => void
  onClose: () => void
  saveLoading?: boolean
  samples: SampleRow[]
  departments: string[]
  designations: string[]
  designationsByDepartment: Record<string, string[]>
  isCodeOptions: Array<{ id: string; label: string }>
  allocatedSampleIds?: Set<string>
  lockSrfSection?: boolean
}) {
  const [srfInput, setSrfInput] = useState(form.srfNumber || '')
  const [srfDropdownOpen, setSrfDropdownOpen] = useState(false)

  const [sampleDetailsOpen, setSampleDetailsOpen] = useState(false)
  const [sampleDetailsLoading, setSampleDetailsLoading] = useState(false)
  const [sampleDetailsError, setSampleDetailsError] = useState<string | null>(null)
  const [sampleDetails, setSampleDetails] = useState<{
    sample_code: string | null
    sample_qr_code: string | null
    batch_number: string | null
    date_of_manufacturing: string | null
    sample_description: string | null
    sample_declaration: string | null
    any_other_information: string | null
  } | null>(null)

  const currentSample = samples.find((s) => s.id === form.sampleId) ?? null
  const sampleOptions = samples
    .filter(
      (s) =>
        (s.srf_number || s.sample_code || s.id) &&
        (!allocatedSampleIds?.has(s.id) || s.id === form.sampleId),
    )
    .map((s) => ({
      id: s.id,
      label: s.srf_number || s.sample_code || s.id,
    }))

  const filteredSrfOptions = srfInput.trim()
    ? sampleOptions.filter((opt) =>
        opt.label.toLowerCase().includes(srfInput.trim().toLowerCase()),
      )
    : sampleOptions

  // When sample is selected, set IS Code label and default date from sample
  useEffect(() => {
    if (!currentSample) {
      onChange({ ...form, isCodeLabel: '' })
      return
    }
    const isLabel =
      currentSample.test_report_is_code_id != null
        ? isCodeOptions.find((o) => o.id === currentSample.test_report_is_code_id)?.label ?? ''
        : ''
    const date = form.allocationDate || currentSample.date_of_sample_receiving?.slice(0, 10) || today()
    onChange({ ...form, isCodeLabel: isLabel, allocationDate: date })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSample?.id, currentSample?.test_report_is_code_id])

  const addSection = () => {
    onChange({ ...form, sections: [...form.sections, emptySection()] })
  }

  const openSampleDetails = async () => {
    if (!form.sampleId) return
    setSampleDetailsOpen(true)
    setSampleDetailsError(null)
    setSampleDetails(null)
    setSampleDetailsLoading(true)
    try {
      const { data, error } = await supabase
        .from('samples')
        .select('sample_code, sample_qr_code, batch_number, date_of_manufacturing, sample_description, sample_declaration, any_other_information')
        .eq('id', form.sampleId)
        .single()
      if (error) throw error
      setSampleDetails(data as { sample_code: string | null; sample_qr_code: string | null; batch_number: string | null; date_of_manufacturing: string | null; sample_description: string | null; sample_declaration: string | null; any_other_information: string | null })
    } catch (err) {
      setSampleDetailsError(err instanceof Error ? err.message : 'Failed to load sample details')
    } finally {
      setSampleDetailsLoading(false)
    }
  }

  const fmt = (v: string | null | undefined) => (v != null && String(v).trim() !== '' ? String(v).trim() : '—')

  const isCodeId = currentSample?.test_report_is_code_id ?? null
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

  const openViewIsCodeFiles = async () => {
    if (!isCodeId || !form.isCodeLabel) return
    const win = window.open('', '_blank', 'width=700,height=500')
    if (!win) return
    const esc = (s: string) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>IS Code Files</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;margin:16px;}h1{font-size:18px;} .muted{color:#64748b;font-size:12px;margin-bottom:12px;} .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;} .name{flex:1;} .btn{padding:6px 12px;border-radius:8px;background:#0f172a;color:white;text-decoration:none;font-size:12px;} .btn:hover{background:#1e293b;} .empty{color:#64748b;padding:18px;border:1px dashed #cbd5e1;border-radius:8px;}</style></head><body><h1>IS Code Files</h1><div class="muted">${esc(form.isCodeLabel)}</div><div class="muted">Loading…</div></body></html>`)
    win.document.close()

    const { data: fileList, error } = await supabase
      .from('is_code_files')
      .select('id, file_name, storage_path')
      .eq('is_code_id', isCodeId)
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
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>IS Code Files</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;margin:16px;}h1{font-size:18px;} .muted{color:#64748b;font-size:12px;margin-bottom:12px;} .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;} .name{flex:1;} .btn{padding:6px 12px;border-radius:8px;background:#0f172a;color:white;text-decoration:none;font-size:12px;} .btn:hover{background:#1e293b;} .empty{color:#64748b;padding:18px;border:1px dashed #cbd5e1;border-radius:8px;}</style></head><body><h1>IS Code Files</h1><div class="muted">${esc(form.isCodeLabel)}</div>${items}</body></html>`)
    win.document.close()
  }

  const updateSection = (index: number, patch: Partial<AllocationSection>) => {
    const next = form.sections.map((s, i) => {
      if (i !== index) return s
      const updated = { ...s, ...patch }
      if (patch.department != null && designationsByDepartment[updated.department]) {
        const allowed = designationsByDepartment[updated.department]
        if (updated.designation && !allowed.includes(updated.designation)) {
          updated.designation = ''
        }
      }
      return updated
    })
    onChange({ ...form, sections: next })
  }

  const getDesignationOptionsForSection = (section: AllocationSection): string[] => {
    const dept = section.department?.trim()
    if (dept && designationsByDepartment[dept]?.length) {
      return designationsByDepartment[dept]
    }
    return designations
  }

  const removeSection = (index: number) => {
    onChange({ ...form, sections: form.sections.filter((_, i) => i !== index) })
  }

  const handleSelectSrf = (sample: SampleRow) => {
    const label = sample.srf_number || sample.sample_code || sample.id
    setSrfInput(label)
    onChange({
      ...form,
      sampleId: sample.id,
      srfNumber: label,
      allocationDate: sample.date_of_sample_receiving?.slice(0, 10) || today(),
      isCodeLabel:
        isCodeOptions.find((o) => o.id === sample.test_report_is_code_id)?.label ?? '',
      sections: form.sections.length ? form.sections : [emptySection()],
    })
    setSrfDropdownOpen(false)
  }

  const canSave = form.sampleId && form.sections.length > 0 && form.sections.every(
    (s) => s.sectionCode.trim() && (s.department.trim() || s.designation.trim() || s.sampleQuantity.trim()),
  )

  return (
    <div className="space-y-6">
      {/* Step 1: Select SRF → IS Code, Date, Sample qty on one line, equal width */}
      <div className="space-y-4 rounded-lg border bg-muted/30 p-4 mx-[3mm]">
        <h4 className="text-sm font-semibold">Select SRF</h4>
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-2 min-w-0">
            <Label>SRF Number</Label>
            {lockSrfSection ? (
              <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm min-h-10 flex items-center">
                {form.srfNumber || '—'}
              </div>
            ) : (
              <div className="relative">
                <Input
                  value={srfInput}
                  onChange={(e) => setSrfInput(e.target.value)}
                  onFocus={() => setSrfDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setSrfDropdownOpen(false), 120)}
                  placeholder="Type to search or select SRF..."
                  autoComplete="off"
                />
                {srfDropdownOpen && filteredSrfOptions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
                    <ul className="max-h-48 overflow-auto text-sm">
                      {filteredSrfOptions.map((opt) => {
                        const sample = samples.find((s) => s.id === opt.id)
                        if (!sample) return null
                        return (
                          <li key={opt.id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left hover:bg-muted"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleSelectSrf(sample)}
                            >
                              {opt.label}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="space-y-2 min-w-0">
            <Label>Date of Allocation</Label>
            {lockSrfSection ? (
              <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm min-h-10 flex items-center">
                {form.allocationDate || today()}
              </div>
            ) : (
              <Input
                type="date"
                value={form.allocationDate || today()}
                onChange={(e) => onChange({ ...form, allocationDate: e.target.value })}
              />
            )}
          </div>
          <div className="space-y-2 min-w-0">
            <Label className="text-muted-foreground">Test Report as per IS</Label>
            <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm min-h-10 flex items-center">
              {form.isCodeLabel || '—'}
            </div>
          </div>
          <div className="space-y-2 min-w-0">
            <Label className="text-muted-foreground">Sample Quantity</Label>
            <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm min-h-10 flex items-center">
              {currentSample?.sample_quantity ?? '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Step 2: Sample Allocation Section */}
      <div className="space-y-4 rounded-lg border bg-muted/30 p-4 mx-[3mm]">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">
            2. Sample Allocation Section
          </h4>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void openViewIsCodeFiles()}
              disabled={!form.sampleId || !isCodeId}
              title={
                isCodeId
                  ? `View IS Code files for ${form.isCodeLabel || 'selected standard'}`
                  : 'Select an SRF with a linked IS Code to view files'
              }
            >
              <FolderOpen className="mr-1 h-4 w-4" />
              View IS Code File
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openSampleDetails}
              disabled={!form.sampleId}
            >
              <FileText className="mr-1 h-4 w-4" />
              View Sample Details
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSection}
              disabled={!form.sampleId}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add section
            </Button>
          </div>
        </div>

        {!form.sampleId ? (
          <p className="text-sm text-muted-foreground">
            Select an SRF above to add allocation sections.
          </p>
        ) : form.sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sections yet. Click &quot;Add section&quot; to allocate to departments/designations.
          </p>
        ) : (
          <div className="space-y-3">
            {form.sections.map((sec, index) => (
              <div
                key={sec.id ?? `section-row-${index}`}
                className="grid grid-cols-[1fr_1fr_1fr_1fr_2.25rem] items-end gap-2 rounded-md border p-3"
              >
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Section</Label>
                  <Input
                    value={sec.sectionCode}
                    onChange={(e) => updateSection(index, { sectionCode: e.target.value })}
                    placeholder="Code"
                    className="h-9"
                    aria-label={`Section code row ${index + 1}`}
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Department</Label>
                  <Select
                    value={sec.department || ''}
                    onValueChange={(v) => updateSection(index, { department: v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(
                        new Set([sec.department, ...departments].filter((d) => d?.trim())),
                      ).map((label) => (
                        <SelectItem key={label} value={label}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Designation</Label>
                  <Select
                    value={sec.designation || ''}
                    onValueChange={(v) => updateSection(index, { designation: v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(
                        new Set([sec.designation, ...getDesignationOptionsForSection(sec)].filter((d) => d?.trim())),
                      ).map((label) => (
                        <SelectItem key={label} value={label}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    value={sec.sampleQuantity}
                    onChange={(e) => updateSection(index, { sampleQuantity: e.target.value })}
                    placeholder="Qty"
                    className="h-9"
                  />
                </div>
                <div className="flex items-end pb-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                    aria-label="Remove section"
                    onClick={() => removeSection(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={saveLoading}>
          Cancel
        </Button>
        <Button type="button" onClick={onSave} disabled={!canSave || saveLoading}>
          {saveLoading ? 'Saving…' : 'Save allocation'}
        </Button>
      </div>

      <Dialog open={sampleDetailsOpen} onOpenChange={setSampleDetailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sample Details (from Sample Receiving)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {sampleDetailsLoading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {sampleDetailsError && (
              <p className="text-sm text-destructive">{sampleDetailsError}</p>
            )}
            {!sampleDetailsLoading && !sampleDetailsError && sampleDetails && (
              <div className="grid gap-3 text-sm">
                <div className="grid grid-cols-[140px_1fr] gap-2 items-baseline">
                  <span className="text-muted-foreground font-medium">Sample Code</span>
                  <span>{fmt(sampleDetails.sample_code)}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2 items-baseline">
                  <span className="text-muted-foreground font-medium">Sample QR Code</span>
                  <span>{fmt(sampleDetails.sample_qr_code)}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2 items-baseline">
                  <span className="text-muted-foreground font-medium">Batch Number</span>
                  <span>{fmt(sampleDetails.batch_number)}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2 items-baseline">
                  <span className="text-muted-foreground font-medium">Date of Manufacturing</span>
                  <span>{sampleDetails.date_of_manufacturing ? new Date(sampleDetails.date_of_manufacturing).toISOString().slice(0, 10) : '—'}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2 items-start">
                  <span className="text-muted-foreground font-medium pt-0.5">Sample Description</span>
                  <span className="whitespace-pre-wrap">{fmt(sampleDetails.sample_description)}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2 items-start">
                  <span className="text-muted-foreground font-medium pt-0.5">Sample Declaration</span>
                  <span className="whitespace-pre-wrap">{fmt(sampleDetails.sample_declaration)}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2 items-start">
                  <span className="text-muted-foreground font-medium pt-0.5">Any Other Information</span>
                  <span className="whitespace-pre-wrap">{fmt(sampleDetails.any_other_information)}</span>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
