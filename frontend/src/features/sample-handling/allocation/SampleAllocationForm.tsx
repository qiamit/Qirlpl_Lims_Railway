import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SampleSrfViewDialog } from '@/features/sample-handling/shared/SampleSrfViewDialog'
import type { SampleRow } from '../types'
import { Plus, Trash2, FileText, FolderOpen } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { normalizeIsCodeLabel } from '@/features/masters/is-codes/formatIsCodeLabel'
import {
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  generateSectionCode,
  sanitizeSectionCodeInput,
  SECTION_CODE_LENGTH,
} from './sectionCode'

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

const emptySection = (): AllocationSection => ({
  sectionCode: generateSectionCode(),
  department: '',
  designation: '',
  sampleQuantity: '',
})

const readonlyBoxClass =
  'flex min-h-10 items-center rounded-none border border-stone-500 bg-stone-100 px-3 py-2 text-sm text-stone-900'

const sectionCardClass =
  'space-y-4 rounded-none border-2 border-stone-500 bg-[#f7f3eb]/70 p-4 ring-1 ring-amber-700/15'

export function SampleAllocationForm({
  form,
  onChange,
  onSave,
  onClose: _onClose,
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

  const currentSample = samples.find((s) => s.id === form.sampleId) ?? null

  useEffect(() => {
    const fromForm = form.srfNumber?.trim()
    if (fromForm) {
      setSrfInput(fromForm)
      return
    }
    if (form.sampleId && currentSample) {
      const label = currentSample.srf_number || currentSample.sample_code || currentSample.id
      if (label) setSrfInput(label)
    } else if (!form.sampleId) {
      setSrfInput('')
    }
  }, [form.sampleId, form.srfNumber, currentSample?.id, currentSample?.srf_number, currentSample?.sample_code])

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

  useEffect(() => {
    if (!currentSample) {
      if (!form.sampleId && form.isCodeLabel) {
        onChange({ ...form, isCodeLabel: '' })
      }
      return
    }
    const label = currentSample.srf_number || currentSample.sample_code || currentSample.id
    const isLabel =
      currentSample.test_report_is_code_id != null
        ? isCodeOptions.find((o) => o.id === currentSample.test_report_is_code_id)?.label ?? ''
        : ''
    const date = form.allocationDate || currentSample.date_of_sample_receiving?.slice(0, 10) || today()
    const patch: Partial<SampleAllocationFormState> = {}
    if (label && form.srfNumber !== label) patch.srfNumber = label
    if (form.isCodeLabel !== isLabel) patch.isCodeLabel = isLabel
    if (form.allocationDate !== date) patch.allocationDate = date
    if (Object.keys(patch).length > 0) {
      onChange({ ...form, ...patch })
    }
    // form/onChange intentionally omitted — only re-sync when sample or IS-code options change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSample?.id, currentSample?.test_report_is_code_id, isCodeOptions])

  const addSection = () => {
    onChange({ ...form, sections: [...form.sections, emptySection()] })
  }

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
    <div className={cn(limsRegistryFormClass, 'space-y-5')}>
      <div className={sectionCardClass}>
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-900">Select SRF</h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0 space-y-2">
            <Label>SRF Number</Label>
            {lockSrfSection || form.sampleId ? (
              <div className={readonlyBoxClass}>{form.srfNumber || srfInput || '—'}</div>
            ) : (
              <div className="relative">
                <Input
                  value={srfInput}
                  onChange={(e) => setSrfInput(e.target.value)}
                  onFocus={() => setSrfDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setSrfDropdownOpen(false), 120)}
                  placeholder="Type to Search or Select SRF"
                  autoComplete="off"
                />
                {srfDropdownOpen && filteredSrfOptions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-none border-2 border-stone-500 bg-white shadow-lg ring-1 ring-amber-700/20">
                    <ul className="max-h-48 overflow-auto text-sm">
                      {filteredSrfOptions.map((opt) => {
                        const sample = samples.find((s) => s.id === opt.id)
                        if (!sample) return null
                        return (
                          <li key={opt.id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left hover:bg-amber-50"
                              onMouseDown={(e) => e.preventDefault()}
                              onPointerDown={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleSelectSrf(sample)
                              }}
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
          <div className="min-w-0 space-y-2">
            <Label>Date of Allocation</Label>
            {lockSrfSection ? (
              <div className={readonlyBoxClass}>{form.allocationDate || today()}</div>
            ) : (
              <Input
                type="date"
                value={form.allocationDate || today()}
                onChange={(e) => onChange({ ...form, allocationDate: e.target.value })}
              />
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <Label>Test Report as per IS</Label>
            <div className={readonlyBoxClass}>
              {normalizeIsCodeLabel(form.isCodeLabel) || '—'}
            </div>
          </div>
          <div className="min-w-0 space-y-2">
            <Label>Sample Quantity</Label>
            <div className={readonlyBoxClass}>{currentSample?.sample_quantity ?? '—'}</div>
          </div>
        </div>
      </div>

      <div className={sectionCardClass}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-900">
            Sample Allocation Section
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('gap-1', limsOutlineBtnClass)}
              onClick={() => void openViewIsCodeFiles()}
              disabled={!form.sampleId || !isCodeId}
              title={
                isCodeId
                  ? `View IS Code files for ${form.isCodeLabel || 'selected standard'}`
                  : 'Select an SRF with a linked IS Code to view files'
              }
            >
              <FolderOpen className="h-4 w-4" />
              View IS Code File
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('gap-1', limsOutlineBtnClass)}
              onClick={() => setSampleDetailsOpen(true)}
              disabled={!form.sampleId}
            >
              <FileText className="h-4 w-4" />
              View Sample Details
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('gap-1', limsOutlineBtnClass)}
              onClick={addSection}
              disabled={!form.sampleId}
            >
              <Plus className="h-4 w-4" />
              Add Section
            </Button>
          </div>
        </div>

        {!form.sampleId ? (
          <p className="text-sm text-stone-600">Select an SRF above to add allocation sections.</p>
        ) : form.sections.length === 0 ? (
          <p className="text-sm text-stone-600">
            No sections yet. Click &quot;Add Section&quot; to allocate to departments/designations.
          </p>
        ) : (
          <div className="space-y-3">
            {form.sections.map((sec, index) => (
              <div
                key={sec.id ?? `section-row-${index}`}
                className="grid grid-cols-1 items-end gap-3 rounded-none border border-stone-500 bg-white/80 p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_2.25rem]"
              >
                <div className="min-w-0 space-y-1">
                  <Label>Section</Label>
                  <Input
                    value={sec.sectionCode}
                    onChange={(e) =>
                      updateSection(index, { sectionCode: sanitizeSectionCodeInput(e.target.value) })
                    }
                    placeholder="10-digit code"
                    maxLength={SECTION_CODE_LENGTH}
                    className="font-mono tracking-wide"
                    aria-label={`Section code row ${index + 1}`}
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <Label>Department</Label>
                  <Select
                    value={sec.department || ''}
                    onValueChange={(v) => updateSection(index, { department: v })}
                  >
                    <SelectTrigger>
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
                <div className="min-w-0 space-y-1">
                  <Label>Designation</Label>
                  <Select
                    value={sec.designation || ''}
                    onValueChange={(v) => updateSection(index, { designation: v })}
                  >
                    <SelectTrigger>
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
                <div className="min-w-0 space-y-1">
                  <Label>Quantity</Label>
                  <Input
                    value={sec.sampleQuantity}
                    onChange={(e) => updateSection(index, { sampleQuantity: e.target.value })}
                    placeholder="Qty"
                  />
                </div>
                <div className="flex items-end pb-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-9 shrink-0 rounded-none text-red-700 hover:bg-red-50 hover:text-red-800"
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

      <div className="mt-1 flex items-center justify-end border-t border-stone-200 pt-3">
        <Button
          type="button"
          className={limsPrimaryBtnClass}
          onClick={onSave}
          disabled={!canSave || saveLoading}
        >
          {saveLoading ? 'Saving…' : 'Save & Close'}
        </Button>
      </div>

      <SampleSrfViewDialog
        open={sampleDetailsOpen}
        onOpenChange={setSampleDetailsOpen}
        sampleId={form.sampleId || null}
        fallbackSrf={form.srfNumber}
        fallbackIsLabel={form.isCodeLabel}
        hideClient
      />
    </div>
  )
}
