import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { SampleRow } from '../types'
import { Plus, Trash2, FileText } from 'lucide-react'
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
                key={sec.sectionCode + index}
                className="grid grid-cols-[1fr_1fr_1fr_1fr_2.25rem] items-end gap-2 rounded-md border p-3"
              >
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Section</Label>
                  <Input
                    value={sec.sectionCode}
                    onChange={(e) => updateSection(index, { sectionCode: e.target.value })}
                    placeholder="Code"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Department</Label>
                  {departments.length > 0 ? (
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
                  ) : (
                    <Input
                      value={sec.department}
                      onChange={(e) => updateSection(index, { department: e.target.value })}
                      placeholder="Department"
                      className="h-9"
                    />
                  )}
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
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={onSave} disabled={!canSave}>
          Save allocation
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
