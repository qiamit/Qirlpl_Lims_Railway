import { useEffect, useRef, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Pencil, FileText, FolderOpen, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPanelClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
  limsTableClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { AddTestParameterNestedDialog } from '@/features/masters/test-parameter/AddTestParameterNestedDialog'
import { normalizeIsCodeLabel } from '@/features/masters/is-codes/formatIsCodeLabel'
import { IsCodeFilesViewDialog } from '@/features/sample-handling/shared/IsCodeFilesViewDialog'
import { resolveSectionSpecificRequirement } from '../shared/resolveSectionSpecificRequirement'
import { saveSectionSpecificRequirement } from '../shared/saveSectionSpecificRequirement'
import type { TestAllocationRow } from '../types'

const fieldLabelClass = 'text-[11px] font-semibold uppercase tracking-wide text-stone-600'
const readonlyBoxClass =
  'rounded-none border border-stone-500 bg-stone-50 px-3 py-2 text-sm text-stone-900 shadow-none'
const thClass = cn(limsTableHeadClass, 'border border-stone-700 !p-1.5')
const tdClass = 'border border-[#e7e0d4] !p-1.5 align-middle text-xs text-[#292524]'
const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/70 hover:bg-[#fde68a]/80'
const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 accent-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

export type TestAllocationFormState = {
  sampleAllocationId: string
  sectionCode: string
  department: string | null
  designation: string | null
  testParameterIds: string[]
  testParameterSummary: string
  assignedEmployeeId: string
  assignedEmployeeName: string
  /** Per-section overrides keyed by test_parameter id (not written to test_parameters master). */
  sectionSpecOverrides: Record<string, string>
}

type EmployeeOption = { id: string; name: string; department: string; designation: string }
export type TestParamOption = {
  id: string
  label: string
  specificRequirement?: string
  underAccreditation?: string
  clauseNo?: string | null
  unitValue?: string | null
  uncertaintyMu?: string | null
  isCodeId?: string | null
  department?: string | null
}

export function TestAllocationForm({
  row,
  form,
  onChange,
  onSave,
  saveLoading = false,
  testParamOptions,
  employeesFiltered,
  designationOptions = [],
  onRefreshTestParams,
  onTestParamAdded,
}: {
  row: TestAllocationRow
  form: TestAllocationFormState
  onChange: (next: TestAllocationFormState) => void
  onSave: () => void
  saveLoading?: boolean
  testParamOptions: TestParamOption[]
  employeesFiltered: EmployeeOption[]
  designationOptions?: string[]
  onRefreshTestParams?: () => void | Promise<void>
  onTestParamAdded?: (param: TestParamOption) => void
}) {
  const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(() => new Set(form.testParameterIds))
  const [testParamSearch, setTestParamSearch] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [jumpTo, setJumpTo] = useState('')
  const selectAllHeaderRef = useRef<HTMLInputElement>(null)
  const autoSelectedForAllocRef = useRef<string | null>(null)

  const [addTestParameterOpen, setAddTestParameterOpen] = useState(false)
  const [viewFilesOpen, setViewFilesOpen] = useState(false)
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

  // Default: select all matching test parameters when Allot Tests opens (empty selection).
  useEffect(() => {
    const allocId = form.sampleAllocationId
    if (autoSelectedForAllocRef.current === allocId) return
    if (filteredTestParamOptions.length === 0) return

    if ((form.testParameterIds?.length ?? 0) > 0) {
      autoSelectedForAllocRef.current = allocId
      return
    }

    autoSelectedForAllocRef.current = allocId
    const ids = filteredTestParamOptions.map((o) => o.id)
    const labels = filteredTestParamOptions.map((o) => o.label).filter(Boolean)
    setLocalSelectedIds(new Set(ids))
    onChange({
      ...form,
      testParameterIds: ids,
      testParameterSummary: labels.join(', '),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per allocation when options are ready
  }, [form.sampleAllocationId, filteredTestParamOptions.length, testParamOptions])

  const searchFilteredOptions = testParamSearch.trim()
    ? filteredTestParamOptions.filter((opt) => {
        const q = testParamSearch.trim().toLowerCase()
        const label = (opt.label ?? '').toLowerCase()
        const spec = (opt.specificRequirement ?? '').toLowerCase()
        const accr = (opt.underAccreditation ?? '').toLowerCase()
        return label.includes(q) || spec.includes(q) || accr.includes(q)
      })
    : filteredTestParamOptions

  const pageCount = Math.max(1, Math.ceil(searchFilteredOptions.length / pageSize))
  const pagedOptions = searchFilteredOptions.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    setPage(1)
  }, [testParamSearch, pageSize, form.sampleAllocationId, row.isCodeId, row.department])

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount))
  }, [pageCount])

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

  const displaySpecificRequirement = (opt: TestParamOption): string => {
    const override = form.sectionSpecOverrides[opt.id]
    if (override !== undefined) return override.trim() || '-'
    return opt.specificRequirement?.trim() || '-'
  }

  const openEditSpec = (opt: TestParamOption) => {
    setEditSpecParamId(opt.id)
    const current =
      resolveSectionSpecificRequirement(
        form.sectionSpecOverrides[opt.id],
        opt.specificRequirement,
      ) ?? ''
    setEditSpecValue(current)
    setEditSpecError(null)
    setEditSpecOpen(true)
  }

  const saveEditSpec = async () => {
    if (!editSpecParamId) return
    setEditSpecSaving(true)
    setEditSpecError(null)
    const nextValue = editSpecValue.trim()
    try {
      const testAllocationId = row.testAllocationId?.trim()
      const label = testParamOptions.find((o) => o.id === editSpecParamId)?.label ?? editSpecParamId

      if (testAllocationId) {
        await saveSectionSpecificRequirement({
          testAllocationId,
          testParameterId: editSpecParamId,
          testLabel: label,
          specificRequirement: nextValue || null,
        })
      }

      onChange({
        ...form,
        sectionSpecOverrides: {
          ...form.sectionSpecOverrides,
          [editSpecParamId]: nextValue,
        },
      })
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

  const openAddTestParameterDirectory = () => {
    setAddTestParameterOpen(true)
  }

  const handleTestParameterAdded = (param: {
    id: string
    label: string
    specificRequirement: string
    underAccreditation: string
    clauseNo: string | null
    unitValue: string | null
    uncertaintyMu: string | null
    isCodeId: string | null
    department: string | null
  }) => {
    onTestParamAdded?.(param)
    if (!onTestParamAdded) void onRefreshTestParams?.()
    const nextIds = Array.from(new Set([...form.testParameterIds, param.id]))
    const labels = nextIds
      .map((tid) => (tid === param.id ? param.label : testParamOptions.find((o) => o.id === tid)?.label))
      .filter(Boolean) as string[]
    setLocalSelectedIds(new Set(nextIds))
    onChange({
      ...form,
      testParameterIds: nextIds,
      testParameterSummary: labels.join(', '),
    })
  }

  return (
    <div className={cn(limsRegistryFormClass, 'flex min-h-0 flex-col gap-4')}>
      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-start">
        <div className="min-w-0 space-y-2">
          <Label className={fieldLabelClass}>Section Code</Label>
          <div className={readonlyBoxClass}>{row.sectionCode}</div>
        </div>
        <div className="min-w-0 space-y-2">
          <Label className={fieldLabelClass}>IS Code</Label>
          <div className={readonlyBoxClass}>
            {normalizeIsCodeLabel(row.isCodeLabel) || '-'}
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          <Label className={fieldLabelClass}>Department</Label>
          <div className={readonlyBoxClass}>{row.department ?? '-'}</div>
        </div>
        <div className="min-w-0 space-y-2">
          <Label className={fieldLabelClass}>Designation</Label>
          <Select
            value={form.designation ?? ''}
            onValueChange={(value) =>
              onChange({
                ...form,
                designation: value || null,
                assignedEmployeeId: '',
                assignedEmployeeName: '',
              })
            }
          >
            <SelectTrigger className={limsFieldClass}>
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
            <p className="text-xs text-stone-500">No designations for this department.</p>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <Label className={fieldLabelClass}>
            Select Employee <span className="text-red-600" aria-hidden>*</span>
          </Label>
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
            disabled={!form.designation?.trim()}
          >
            <SelectTrigger className={limsFieldClass}>
              <SelectValue
                placeholder={
                  form.designation?.trim()
                    ? 'Select Employee Name'
                    : 'Select designation first'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {employeesFiltered.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.designation?.trim() && employeesFiltered.length === 0 && (
            <p className="text-xs text-stone-500">
              No matching employees for this department/designation.
            </p>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-2">
        <div className="flex h-9 shrink-0 flex-nowrap items-center gap-2 overflow-x-auto [&_button]:!h-9 [&_button]:min-h-9 [&_button]:px-3 [&_button[role=combobox]]:!h-9 [&_input]:!h-9">
          <Button
            type="button"
            size="sm"
            className={cn(limsPrimaryBtnClass, 'shrink-0 gap-1')}
            onClick={openAddTestParameterDirectory}
            title="Add a new test parameter in Test Parameter directory"
          >
            <Plus className="h-4 w-4" />
            Add Test Parameter
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(limsOutlineBtnClass, 'shrink-0')}
            onClick={() => setViewFilesOpen(true)}
            disabled={!row.isCodeId}
            title={
              row.isCodeId
                ? `View files for ${normalizeIsCodeLabel(row.isCodeLabel) || 'IS Code'}`
                : 'Select a section with IS Code to view files'
            }
          >
            <FolderOpen className="mr-1 h-4 w-4" />
            View Files
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(limsOutlineBtnClass, 'shrink-0')}
            onClick={openSampleDetails}
          >
            <FileText className="mr-1 h-4 w-4" />
            View Sample Details
          </Button>
          <Input
            placeholder="Search in Table"
            value={testParamSearch}
            onChange={(e) => setTestParamSearch(e.target.value)}
            className={cn(limsFieldClass, 'ml-auto w-[11rem] min-w-[9rem] shrink-0 sm:w-[14rem]')}
          />
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className={cn(limsFieldClass, 'w-[7rem] shrink-0')} aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 / Page</SelectItem>
              <SelectItem value="10">10 / Page</SelectItem>
              <SelectItem value="20">20 / Page</SelectItem>
              <SelectItem value="50">50 / Page</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className={cn(limsPanelClass, 'flex w-full flex-col overflow-hidden bg-[#f7f3eb]')}>
          <div>
          {filteredTestParamOptions.length === 0 ? (
            <div className="m-3 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-4 text-center sm:m-4">
              <p className="text-sm text-[#57534e]">No test parameters for this IS Code &amp; Department.</p>
            </div>
          ) : searchFilteredOptions.length === 0 ? (
            <div className="m-3 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-4 text-center sm:m-4">
              <p className="text-sm text-[#57534e]">No matches for &quot;{testParamSearch.trim()}&quot;.</p>
            </div>
          ) : (
            <table className={cn(limsTableClass, 'table-fixed')}>
              <colgroup>
                <col className="w-9" />
                <col className="w-[22%]" />
                <col className="w-[10%]" />
                <col className="w-[28%]" />
                <col className="w-[14%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead>
                <tr className="border-stone-700 bg-stone-800">
                  <th className={cn(thClass, 'w-9')}>
                    <div className="flex justify-center">
                      <input
                        ref={selectAllHeaderRef}
                        type="checkbox"
                        className={checkboxClass}
                        aria-label="Select all test parameters"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAll}
                      />
                    </div>
                  </th>
                  <th className={cn(thClass, 'text-left')}>Test Name</th>
                  <th className={thClass}>Clause Number</th>
                  <th className={thClass}>Specified Requirement</th>
                  <th className={thClass}>Uncertainty of Measurement</th>
                  <th className={thClass}>Under Accreditation</th>
                </tr>
              </thead>
              <tbody>
                {pagedOptions.map((opt, index) => {
                  const selected = localSelectedIds.has(opt.id)
                  return (
                  <tr
                    key={opt.id}
                    className={cn(
                      'cursor-pointer',
                      selected ? rowSelectedClass : index % 2 === 0 ? rowEvenClass : rowOddClass,
                    )}
                    onClick={() => toggleTestParam(opt.id)}
                  >
                    <td className={cn(tdClass, 'w-9')}>
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          checked={selected}
                          onChange={() => toggleTestParam(opt.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </td>
                    <td className={cn(tdClass, 'text-left text-[12.5px] font-semibold tracking-tight')}>
                      <span className="line-clamp-2 break-words" title={opt.label || undefined}>
                        {opt.label || '-'}
                      </span>
                    </td>
                    <td className={cn(tdClass, 'text-center break-words whitespace-normal text-[#57534e]')}>
                      {opt.clauseNo?.trim() || '-'}
                    </td>
                    <td className={cn(tdClass, 'break-words whitespace-normal text-[#57534e]')}>
                      <div className="flex w-full items-center gap-1">
                        <span
                          className="line-clamp-2 min-w-0 flex-1 break-words text-center"
                          title={displaySpecificRequirement(opt)}
                        >
                          {displaySpecificRequirement(opt)}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="ml-auto h-7 w-7 shrink-0 rounded-none text-amber-800 hover:bg-amber-500/15 hover:text-amber-950"
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
                    <td className={cn(tdClass, 'text-center break-words whitespace-normal text-[#57534e]')}>
                      {opt.uncertaintyMu?.trim() || '-'}
                    </td>
                    <td className={cn(tdClass, 'text-center break-words whitespace-normal font-medium text-[#1c1917]')}>
                      {opt.underAccreditation ?? '-'}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          </div>
          <div className="relative shrink-0 overflow-hidden border-t-2 border-stone-600 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2 text-white sm:px-4">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <div className="relative flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <span className="text-xs text-stone-300">
                Selected: {localSelectedIds.size}
                {searchFilteredOptions.length > 0
                  ? ` · Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, searchFilteredOptions.length)} of ${searchFilteredOptions.length}`
                  : ''}
              </span>
              <div className="flex h-8 flex-wrap items-center gap-2 [&_button]:!h-8 [&_button]:min-h-8 [&_input]:!h-8">
                {searchFilteredOptions.length > 0 ? (
                  <>
                    <Input
                      className={cn(limsDarkBarFieldClass, '!h-8 w-20')}
                      placeholder="Page"
                      value={jumpTo}
                      onChange={(e) => setJumpTo(e.target.value.replace(/[^0-9]/g, ''))}
                      aria-label="Jump to page"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(limsDarkBarBtnClass, '!h-8')}
                      onClick={() => {
                        const n = Number(jumpTo)
                        if (Number.isFinite(n) && n > 0) {
                          setPage(Math.min(pageCount, Math.max(1, Math.floor(n))))
                        }
                        setJumpTo('')
                      }}
                    >
                      Jump
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={cn(limsDarkBarBtnClass, '!h-8 !w-8')}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <span className="text-xs font-medium leading-8 text-stone-300">
                      Page {page} / {pageCount}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={cn(limsDarkBarBtnClass, '!h-8 !w-8')}
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                      disabled={page >= pageCount}
                      aria-label="Next page"
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </>
                ) : null}
                <Button
                  type="button"
                  className={cn(limsPrimaryBtnClass, 'ml-auto !h-8 min-w-[8.5rem] lg:ml-2')}
                  onClick={onSave}
                  disabled={saveLoading}
                >
                  {saveLoading ? 'Saving…' : 'Save & Close'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={editSpecOpen} onOpenChange={setEditSpecOpen}>
        <DialogContent className={cn(limsDialogClass, '!max-w-md !gap-0 !p-0')}>
          <div className="relative bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-5 py-3 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white">
                Edit Specified Requirements — Section {form.sectionCode || row.sectionCode}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="space-y-4 bg-[#f7f3eb] p-5">
            <p className="text-xs text-stone-500">
              Applies only to this section code. Test Parameter master and other sections are not changed.
            </p>
            <div className="space-y-2">
              <Label htmlFor="edit-spec-value" className={fieldLabelClass}>
                Specified Requirement
              </Label>
              <Textarea
                id="edit-spec-value"
                rows={3}
                value={editSpecValue}
                onChange={(e) => setEditSpecValue(e.target.value)}
                placeholder="e.g. 0.30 Maximum"
                className="rounded-none border-stone-500 bg-stone-50 shadow-none focus-visible:border-amber-600 focus-visible:ring-amber-500/20"
              />
            </div>
            {editSpecError && <p className="text-sm text-red-700">{editSpecError}</p>}
          </div>
          <div className="relative flex justify-end gap-2 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-5 py-3">
            <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, 'relative min-w-[8.5rem]')}
              onClick={() => void saveEditSpec()}
              disabled={editSpecSaving}
            >
              {editSpecSaving ? 'Saving…' : 'Save & Close'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sampleDetailsOpen} onOpenChange={setSampleDetailsOpen}>
        <DialogContent
          persistOnFocusLoss
          layer="nested"
          aria-describedby={undefined}
          className={cn(
            limsDialogClass,
            'left-1/2 top-1/2 max-w-lg -translate-x-1/2 -translate-y-1/2 p-0',
          )}
        >
          <div className="relative bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-5 py-3 text-white">
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative text-left">
              <DialogTitle className="text-base font-semibold text-white">Sample Details</DialogTitle>
            </DialogHeader>
          </div>
          <div className="space-y-3 bg-[#f7f3eb] p-5">
            {sampleDetailsLoading && <p className="text-sm text-stone-600">Loading…</p>}
            {sampleDetailsError && <p className="text-sm text-red-700">{sampleDetailsError}</p>}
            {!sampleDetailsLoading && !sampleDetailsError && sampleDetails && (
              <div className="space-y-3 text-sm text-stone-800">
                <article className="overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
                  <header className="border-b border-stone-600 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5">
                    <h5 className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Sample Description &amp; Sample Declaration
                    </h5>
                  </header>
                  <dl className="divide-y divide-stone-200">
                    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                        Sample Description
                      </dt>
                      <dd className="whitespace-pre-wrap break-words font-medium leading-relaxed text-stone-900">
                        {fmtDetail(sampleDetails.sample_description)}
                      </dd>
                    </div>
                    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                        Sample Declaration
                      </dt>
                      <dd className="whitespace-pre-wrap break-words font-medium leading-relaxed text-stone-900">
                        {fmtDetail(sampleDetails.sample_declaration)}
                      </dd>
                    </div>
                  </dl>
                </article>

                <article className="overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
                  <header className="border-b border-stone-600 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5">
                    <h5 className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Any Other Information
                    </h5>
                  </header>
                  <dl>
                    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                        Details
                      </dt>
                      <dd className="whitespace-pre-wrap break-words font-medium leading-relaxed text-stone-900">
                        {fmtDetail(sampleDetails.any_other_information)}
                      </dd>
                    </div>
                  </dl>
                </article>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AddTestParameterNestedDialog
        open={addTestParameterOpen}
        onOpenChange={setAddTestParameterOpen}
        prefill={{
          isCodeId: row.isCodeId,
          isCodeLabel: row.isCodeLabel,
          department: row.department,
          designation: form.designation,
        }}
        onSaved={handleTestParameterAdded}
      />

      <IsCodeFilesViewDialog
        open={viewFilesOpen}
        onOpenChange={setViewFilesOpen}
        isCodeId={row.isCodeId}
        isCodeLabel={row.isCodeLabel}
      />
    </div>
  )
}
