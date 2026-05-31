import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import { formatSupabaseError } from '@/lib/formatSupabaseError'
import type { TestAllocationRow } from '../types'
import { ResultsUnderReviewTable } from './ResultsUnderReviewTable'
import { ResultsUnderReviewAssistant } from './ResultsUnderReviewAssistant'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { canDeleteSampleHandlingRecords, isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  confirmDestructiveDelete,
  deleteTestAllocationsForSections,
} from '@/features/sample-handling/shared/deleteSampleRecords'
import { SampleHandlingDeleteButton } from '@/features/sample-handling/shared/SampleHandlingDeleteButton'
import { departmentsMatch } from '@/features/sample-handling/shared/departmentMatch'
import { loadResultsUnderReviewRowsForDirector } from './loadResultsUnderReviewRowsForDirector'
import { fetchLinkedReviewerProfileIds } from '@/features/sample-handling/shared/reviewerProfileIds'
import { resolveUserDepartment } from '@/features/sample-handling/shared/resolveUserDepartment'
import { ensureTestAllocationParameterRows } from '@/features/sample-handling/shared/ensureTestAllocationParameterRows'
import { ResultsUnderReviewReferbackDialog } from './ResultsUnderReviewReferbackDialog'

export default function ResultsUnderReviewMasterPage() {
  const { user, profileName, designation, departmentName, profileReady } = useAuth()
  const location = useLocation()
  const [rows, setRows] = useState<TestAllocationRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [resolvedDepartment, setResolvedDepartment] = useState('')
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const showDelete = canDeleteSampleHandlingRecords(designation)

  const [testParamViewOpen, setTestParamViewOpen] = useState(false)
  const [testParamViewData, setTestParamViewData] = useState<Record<string, unknown>[]>([])
  const [testParamViewLabel, setTestParamViewLabel] = useState('')
  const [testParamViewExtras, setTestParamViewExtras] = useState<{
    loading: boolean
    sampleDescription: string | null
    declaredValue: string | null
    srfNumber: string | null
    isCodeLabel: string | null
    isCodeFiles: { file_name: string; url?: string }[]
  }>({
    loading: false,
    sampleDescription: null,
    declaredValue: null,
    srfNumber: null,
    isCodeLabel: null,
    isCodeFiles: [],
  })

  const [editSpecOpen, setEditSpecOpen] = useState(false)
  const [editSpecParamId, setEditSpecParamId] = useState<string | null>(null)
  const [editSpecValue, setEditSpecValue] = useState('')
  const [editSpecSaving, setEditSpecSaving] = useState(false)
  const [editSpecError, setEditSpecError] = useState<string | null>(null)

  const [referbackDialogOpen, setReferbackDialogOpen] = useState(false)
  const [referbackRow, setReferbackRow] = useState<TestAllocationRow | null>(null)
  const [referbackSubmitLoading, setReferbackSubmitLoading] = useState(false)
  const [referbackSubmitError, setReferbackSubmitError] = useState<string | null>(null)

  const IS_CODE_FILES_BUCKET = 'is-code-files'

  const loadRows = async () => {
    if (!user?.id) {
      setRows([])
      setListLoading(false)
      return
    }
    setListError(null)
    setListLoading(true)
    try {
      if (isLaboratoryDirector(designation)) {
        setResolvedDepartment(departmentName.trim() || 'Administration')
        const list = await loadResultsUnderReviewRowsForDirector()
        setRows(list)
        return
      }

      const userDept = await resolveUserDepartment(user, departmentName)
      setResolvedDepartment(userDept)
      if (!userDept) {
        setListError(
          'Department is not set on your user profile. Update it in User Management (Department field), then refresh this page.',
        )
        setRows([])
        return
      }

      const reviewerProfileIds = await fetchLinkedReviewerProfileIds(user.id, userDept)
      if (reviewerProfileIds.length === 0) {
        setRows([])
        return
      }

      // Reviewer is per parameter (test_allocation_parameters), not on samples.
      const { data: reviewerParamRows, error: paramReviewerErr } = await supabase
        .from('test_allocation_parameters')
        .select('test_allocation_id')
        .in('results_reviewer_id', reviewerProfileIds)
      if (paramReviewerErr) throw paramReviewerErr
      const reviewerParams = Array.isArray(reviewerParamRows) ? reviewerParamRows : []
      if (reviewerParams.length === 0) {
        setRows([])
        return
      }

      const testAllocationIds = [
        ...new Set(
          reviewerParams
            .map((p: { test_allocation_id?: string | null }) => p.test_allocation_id)
            .filter((id): id is string => typeof id === 'string' && id.trim() !== ''),
        ),
      ]
      if (testAllocationIds.length === 0) {
        setRows([])
        return
      }

      const { data: testAllocData, error: taErr } = await supabase
        .from('test_allocations')
        .select(
          'id, sample_allocation_id, assigned_employee_id, assigned_employee_name, test_parameter_summary, test_parameter_ids',
        )
        .in('id', testAllocationIds)
        .order('created_at', { ascending: false })
      if (taErr) throw taErr
      const testAllocs = Array.isArray(testAllocData) ? testAllocData : []
      if (testAllocs.length === 0) {
        setRows([])
        return
      }

      const allocIds = [
        ...new Set(
          testAllocs
            .map((t: { sample_allocation_id?: string | null }) => t.sample_allocation_id)
            .filter((id): id is string => typeof id === 'string' && id.trim() !== ''),
        ),
      ]
      if (allocIds.length === 0) {
        setRows([])
        return
      }

      const { data: allocData, error: allocErr } = await supabase
        .from('sample_allocations')
        .select('id, sample_id, section_code, allocation_date, department, designation')
        .in('id', allocIds)
      if (allocErr) throw allocErr

      const allocations = (Array.isArray(allocData) ? allocData : []).filter((a: {
        department?: string | null
      }) => departmentsMatch(a.department, userDept))
      const allocMap = new Map(allocations.map((a: { id: string }) => [a.id, a]))

      const sampleIds = [
        ...new Set(
          allocations
            .map((a: { sample_id?: string | null }) => a.sample_id)
            .filter((id): id is string => typeof id === 'string' && id.trim() !== ''),
        ),
      ]
      const { data: sampleRows, error: sampleErr } = await supabase
        .from('samples')
        .select('id, srf_number, date_of_sample_receiving, test_report_is_code_id, referback_from_allocation')
        .in('id', sampleIds)
        .eq('stage', 'results_review')
      if (sampleErr) throw sampleErr
      const samples = Array.isArray(sampleRows) ? sampleRows : []
      if (samples.length === 0) {
        setRows([])
        return
      }

      const isCodeIds = [
        ...new Set(
          samples
            .map((s: { test_report_is_code_id?: string | null }) => s.test_report_is_code_id)
            .filter(Boolean),
        ),
      ] as string[]
      let isCodeMap = new Map<string, string>()
      if (isCodeIds.length > 0) {
        const { data: isCodeData } = await supabase
          .from('is_codes')
          .select('id, is_number, revision_year')
          .in('id', isCodeIds)
        const isCodes = Array.isArray(isCodeData) ? isCodeData : []
        isCodeMap = new Map(
          isCodes.map(
            (c: { id: string; is_number?: string; revision_year?: string | null }) => [
              c.id,
              c.revision_year ? `${c.is_number ?? ''} : ${c.revision_year}` : (c.is_number ?? c.id),
            ],
          ),
        )
      }
      const samplesMap = new Map(
        samples.map(
          (s: {
            id: string
            srf_number?: string
            date_of_sample_receiving?: string
            test_report_is_code_id?: string | null
            referback_from_allocation?: boolean | null
          }) => [
            s.id,
            {
              srf_number: s.srf_number ?? null,
              date_of_sample_receiving: s.date_of_sample_receiving ?? null,
              isCodeId: s.test_report_is_code_id ?? null,
              isCodeLabel: s.test_report_is_code_id
                ? (isCodeMap.get(s.test_report_is_code_id) ?? null)
                : null,
              referbackFromAllocation: !!s.referback_from_allocation,
            },
          ],
        ),
      )

      const visibleTestAllocs = testAllocs.filter((t: { sample_allocation_id: string }) => {
        const a = allocMap.get(t.sample_allocation_id) as
          | { sample_id?: string; department?: string | null }
          | undefined
        if (!a?.sample_id || !samplesMap.has(a.sample_id)) return false
        if (!departmentsMatch(a.department, userDept)) return false
        return true
      })
      const allocationIds = visibleTestAllocs.map((t: { id: string }) => t.id)
      let paramsByAllocationId = new Map<
        string,
        {
          id: string
          test_allocation_id: string
          test_parameter_id: string | null
          test_label: string
          test_start_date: string | null
          test_end_date: string | null
          results: string | null
        }[]
      >()
      if (allocationIds.length > 0) {
        const { data: paramData, error: paramErr } = await supabase
          .from('test_allocation_parameters')
          .select('id, test_allocation_id, test_parameter_id, test_label, test_start_date, test_end_date, results')
          .in('test_allocation_id', allocationIds)
        if (paramErr) throw paramErr
        const paramRows = Array.isArray(paramData) ? paramData : []
        const map = new Map<
          string,
          {
            id: string
            test_allocation_id: string
            test_parameter_id: string | null
            test_label: string
            test_start_date: string | null
            test_end_date: string | null
            results: string | null
          }[]
        >()
        for (const p of paramRows as {
          id: string
          test_allocation_id?: string | null
          test_parameter_id?: string | null
          test_label?: string | null
          test_start_date?: string | null
          test_end_date?: string | null
          results?: string | null
        }[]) {
          const key = (p.test_allocation_id as string) ?? ''
          if (!key) continue
          if (!map.has(key)) map.set(key, [])
          map.get(key)!.push({
            id: p.id,
            test_allocation_id: key,
            test_parameter_id: p.test_parameter_id ?? null,
            test_label: p.test_label ?? '',
            test_start_date: p.test_start_date ?? null,
            test_end_date: p.test_end_date ?? null,
            results: p.results ?? null,
          })
        }
        paramsByAllocationId = map
      }

      const tpIdsForLookup = new Set<string>()
      for (const params of paramsByAllocationId.values()) {
        for (const p of params) {
          if (p.test_parameter_id) tpIdsForLookup.add(p.test_parameter_id)
        }
      }
      for (const t of testAllocs as { test_parameter_ids?: unknown }[]) {
        const raw = t.test_parameter_ids
        if (!Array.isArray(raw)) continue
        for (const id of raw) {
          if (typeof id === 'string' && id.trim()) tpIdsForLookup.add(id.trim())
        }
      }
      const testParamMetaById = new Map<string, { name: string; specificRequirement: string | null }>()
      if (tpIdsForLookup.size > 0) {
        const { data: tpMetaRows } = await supabase
          .from('test_parameters')
          .select('id, item_name, specific_requirement')
          .in('id', [...tpIdsForLookup])
        for (const row of Array.isArray(tpMetaRows) ? tpMetaRows : []) {
          const r = row as { id: string; item_name?: string | null; specific_requirement?: string | null }
          testParamMetaById.set(r.id, {
            name: (r.item_name ?? '').trim() || r.id,
            specificRequirement: (r.specific_requirement ?? '').trim() || null,
          })
        }
      }

      const list: TestAllocationRow[] = visibleTestAllocs
        .map(
          (t: {
            id: string
            sample_allocation_id: string
            assigned_employee_id?: string | null
            assigned_employee_name?: string | null
            test_parameter_summary?: string | null
            test_parameter_ids?: string[] | null
          }) => {
            const a = allocMap.get(t.sample_allocation_id) as
              | {
                  id: string
                  sample_id: string
                  section_code: string
                  allocation_date: string | null
                  department: string | null
                  designation: string | null
                }
              | undefined
            if (!a) return null
            const sample = samplesMap.get(a.sample_id)
            if (!sample) return null
            const params = paramsByAllocationId.get(t.id) ?? []
            let parameterRows = params.map((p) => ({
              id: p.id,
              testAllocationId: p.test_allocation_id,
              testParameterId: p.test_parameter_id,
              testLabel: p.test_label,
              specificRequirement: p.test_parameter_id
                ? (testParamMetaById.get(p.test_parameter_id)?.specificRequirement ?? null)
                : null,
              testStartDate: p.test_start_date,
              testEndDate: p.test_end_date,
              results: p.results,
            }))
            if (parameterRows.length === 0) {
              const summaryStr = (t.test_parameter_summary ?? '').trim()
              const ids = Array.isArray(t.test_parameter_ids)
                ? (t.test_parameter_ids as string[]).map((x) => String(x).trim()).filter(Boolean)
                : []
              let labels = summaryStr
                ? summaryStr.split(',').map((x) => x.trim()).filter(Boolean)
                : []
              if (labels.length === 0 && ids.length > 0) {
                labels = ids.map((id) => testParamMetaById.get(id)?.name ?? id)
              } else {
                for (let i = labels.length; i < ids.length; i += 1) {
                  const id = ids[i]!
                  labels.push(testParamMetaById.get(id)?.name ?? id)
                }
              }
              if (labels.length > 0) {
                parameterRows = labels.map((label, i) => {
                  const tpId = ids[i] ?? null
                  return {
                    id: '',
                    testAllocationId: t.id,
                    testParameterId: tpId,
                    testLabel: label,
                    specificRequirement: tpId
                      ? (testParamMetaById.get(tpId)?.specificRequirement ?? null)
                      : null,
                    testStartDate: null,
                    testEndDate: null,
                    results: null,
                  }
                })
              }
            }
            return {
              testAllocationId: t.id,
              sampleAllocationId: a.id,
              sampleId: a.sample_id,
              sectionCode: a.section_code,
              isCodeId: sample?.isCodeId ?? null,
              isCodeLabel: sample?.isCodeLabel ?? null,
              srfNumber: sample?.srf_number ?? null,
              allocationDate: a.allocation_date ?? sample?.date_of_sample_receiving ?? null,
              department: a.department ?? null,
              designation: a.designation ?? null,
              testParameterSummary: t.test_parameter_summary ?? null,
              testParameterIds: [
                ...new Set([
                  ...parameterRows
                    .map((p) => p.testParameterId)
                    .filter((id): id is string => typeof id === 'string' && id.trim() !== ''),
                  ...(Array.isArray(t.test_parameter_ids)
                    ? (t.test_parameter_ids as string[]).map((x) => String(x).trim()).filter(Boolean)
                    : []),
                ]),
              ],
              assignedEmployeeId: t.assigned_employee_id ?? null,
              assignedEmployeeName: t.assigned_employee_name ?? null,
              referbackFromAllocation: sample?.referbackFromAllocation ?? false,
              testStartDate: null,
              results: null,
              testEndDate: null,
              parameters: parameterRows,
            }
          },
        )
        .filter((r): r is TestAllocationRow => r != null)
      setRows(list)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load results for review')
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    if (!profileReady) return
    void loadRows()
  }, [user?.id, departmentName, designation, profileReady, location.pathname])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        [r.sectionCode, r.srfNumber, r.testParameterSummary, r.results]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
    )
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize],
  )

  const toggleRow = (sampleAllocationId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(sampleAllocationId)) next.delete(sampleAllocationId)
      else next.add(sampleAllocationId)
      return next
    })
  }

  const toggleAllOnPage = (checked: boolean) => {
    const ids = [...new Set(pagedRows.map((r) => r.sampleAllocationId))]
    setSelectedIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)))
      return next
    })
  }

  const handleDeleteSelected = () => {
    const allocIds = Array.from(selectedIds)
    if (!confirmDestructiveDelete(allocIds.length, 'section in review')) return
    void (async () => {
      setListLoading(true)
      setSaveMessage(null)
      try {
        const count = await deleteTestAllocationsForSections(allocIds)
        setSelectedIds(new Set())
        setSaveMessage(`Deleted ${count} section(s) from Results Under Review.`)
        await loadRows()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setListLoading(false)
      }
    })()
  }

  const loadIsCodeFilesForView = async (isCodeId: string): Promise<{ file_name: string; url?: string }[]> => {
    const out: { file_name: string; url?: string }[] = []
    const { data: fileRows } = await supabase
      .from('is_code_files')
      .select('file_name, storage_path')
      .eq('is_code_id', isCodeId)
      .order('created_at', { ascending: false })

    let fileList = Array.isArray(fileRows) ? fileRows : []
    if (fileList.length === 0) {
      const { data: objects } = await supabase.storage.from(IS_CODE_FILES_BUCKET).list(isCodeId, { limit: 20 })
      fileList = (Array.isArray(objects) ? objects : [])
        .map((o) => {
          const name = String((o as { name?: string }).name ?? '')
          if (!name) return null
          return { file_name: name, storage_path: `${isCodeId}/${name}` }
        })
        .filter((x): x is { file_name: string; storage_path: string } => x !== null)
    }

    for (const f of fileList) {
      const storagePath = (f as { storage_path?: string }).storage_path
      const fileName = (f as { file_name?: string }).file_name ?? 'File'
      if (!storagePath) {
        out.push({ file_name: fileName })
        continue
      }
      try {
        const { data: signed } = await supabase.storage
          .from(IS_CODE_FILES_BUCKET)
          .createSignedUrl(storagePath, 60 * 10)
        out.push({ file_name: fileName, url: signed?.signedUrl })
      } catch {
        out.push({ file_name: fileName })
      }
    }
    return out
  }

  const handleViewTestParameter = async (row: TestAllocationRow, testLabel: string) => {
    setTestParamViewLabel(testLabel)
    setTestParamViewOpen(true)
    setTestParamViewData([])
    setTestParamViewExtras({
      loading: true,
      sampleDescription: null,
      declaredValue: null,
      srfNumber: row.srfNumber ?? null,
      isCodeLabel: row.isCodeLabel ?? null,
      isCodeFiles: [],
    })
    const label = testLabel.trim()
    try {
      let allocationTestParamId: string | null = null
      if (Array.isArray(row.parameters) && row.parameters.length > 0) {
        const match = row.parameters.find((p) => p.testLabel.trim().toLowerCase() === label.toLowerCase())
        allocationTestParamId = match?.testParameterId ?? null
      }
      if (!allocationTestParamId) {
        const summaryLabels = (row.testParameterSummary ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        const ids = row.testParameterIds ?? []
        const index = summaryLabels.findIndex((l) => l.toLowerCase() === label.toLowerCase())
        allocationTestParamId = index >= 0 && ids[index] ? ids[index] : null
      }

      const tpPromise = allocationTestParamId
        ? supabase.from('test_parameters').select('*').eq('id', allocationTestParamId).maybeSingle()
        : supabase.from('test_parameters').select('*').ilike('item_name', `%${label}%`).limit(5)

      const samplePromise = supabase
        .from('samples')
        .select('sample_description, sample_declaration, test_report_is_code_id, srf_number')
        .eq('id', row.sampleId)
        .maybeSingle()

      const [tpResult, sampleResult] = await Promise.all([tpPromise, samplePromise])

      if (tpResult.error) throw tpResult.error
      let tpList: Record<string, unknown>[] = []
      if ('data' in tpResult && tpResult.data && !Array.isArray(tpResult.data)) {
        tpList = [tpResult.data as Record<string, unknown>]
      } else {
        tpList = Array.isArray(tpResult.data) ? (tpResult.data as Record<string, unknown>[]) : []
      }
      setTestParamViewData(tpList)

      const sampleRow = sampleResult.data as {
        sample_description?: string | null
        sample_declaration?: string | null
        test_report_is_code_id?: string | null
        srf_number?: string | null
      } | null

      const tpIsCodeId =
        typeof tpList[0]?.is_code_id === 'string' ? (tpList[0].is_code_id as string) : null
      const isCodeId = row.isCodeId ?? sampleRow?.test_report_is_code_id ?? tpIsCodeId

      let isCodeLabel = row.isCodeLabel ?? null
      if (!isCodeLabel && isCodeId) {
        const { data: isRow } = await supabase
          .from('is_codes')
          .select('is_number, revision_year')
          .eq('id', isCodeId)
          .maybeSingle()
        if (isRow) {
          const r = isRow as { is_number?: string; revision_year?: string | null }
          isCodeLabel = r.revision_year
            ? `${r.is_number ?? ''} : ${r.revision_year}`
            : (r.is_number ?? isCodeId)
        }
      }

      const isCodeFiles = isCodeId ? await loadIsCodeFilesForView(isCodeId) : []

      setTestParamViewExtras({
        loading: false,
        sampleDescription: sampleRow?.sample_description ?? null,
        declaredValue: sampleRow?.sample_declaration ?? null,
        srfNumber: sampleRow?.srf_number ?? row.srfNumber ?? null,
        isCodeLabel,
        isCodeFiles,
      })
    } catch {
      setTestParamViewData([])
      setTestParamViewExtras((prev) => ({ ...prev, loading: false }))
    }
  }

  const openEditSpecificRequirement = (tp: Record<string, unknown>) => {
    const id = typeof tp.id === 'string' ? tp.id : null
    if (!id) return
    setEditSpecParamId(id)
    setEditSpecValue(String(tp.specific_requirement ?? '').trim())
    setEditSpecError(null)
    setEditSpecOpen(true)
  }

  const saveEditSpecificRequirement = async () => {
    if (!editSpecParamId) return
    setEditSpecSaving(true)
    setEditSpecError(null)
    const nextValue = editSpecValue.trim() || null
    try {
      const { error } = await supabase
        .from('test_parameters')
        .update({ specific_requirement: nextValue })
        .eq('id', editSpecParamId)
      if (error) throw error

      setTestParamViewData((prev) =>
        prev.map((tp) =>
          tp.id === editSpecParamId ? { ...tp, specific_requirement: nextValue } : tp,
        ),
      )
      setRows((prev) =>
        prev.map((row) => ({
          ...row,
          parameters: row.parameters?.map((p) =>
            p.testParameterId === editSpecParamId ? { ...p, specificRequirement: nextValue } : p,
          ),
        })),
      )
      setEditSpecOpen(false)
      setEditSpecParamId(null)
      setEditSpecValue('')
      setSaveMessage('Specific requirement updated in Test Parameter master.')
    } catch (err) {
      setEditSpecError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setEditSpecSaving(false)
    }
  }

  const clearSectionReviewAssignment = async (testAllocationId: string) => {
    const { error } = await supabase
      .from('test_allocation_parameters')
      .update({ results_reviewer_id: null, results_reviewer_name: null })
      .eq('test_allocation_id', testAllocationId)
    if (error) throw error
  }

  const sampleStillHasResultsInReview = async (sampleId: string): Promise<boolean> => {
    const { data: allocRows, error: allocErr } = await supabase
      .from('sample_allocations')
      .select('id')
      .eq('sample_id', sampleId)
    if (allocErr) throw allocErr
    const allocIds = (Array.isArray(allocRows) ? allocRows : [])
      .map((r) => String((r as { id?: string }).id ?? '').trim())
      .filter(Boolean)
    if (allocIds.length === 0) return false

    const { data: taRows, error: taErr } = await supabase
      .from('test_allocations')
      .select('id')
      .in('sample_allocation_id', allocIds)
    if (taErr) throw taErr
    const taIds = (Array.isArray(taRows) ? taRows : [])
      .map((r) => String((r as { id?: string }).id ?? '').trim())
      .filter(Boolean)
    if (taIds.length === 0) return false

    const { data: paramRows, error: paramErr } = await supabase
      .from('test_allocation_parameters')
      .select('results_reviewer_id')
      .in('test_allocation_id', taIds)
    if (paramErr) throw paramErr
    return (Array.isArray(paramRows) ? paramRows : []).some(
      (p) => (p as { results_reviewer_id?: string | null }).results_reviewer_id,
    )
  }

  const openReferbackDialog = (row: TestAllocationRow) => {
    setReferbackSubmitError(null)
    setReferbackRow(row)
    setReferbackDialogOpen(true)
  }

  const submitReferbackToUnderTesting = async (employee: { id: string; name: string }) => {
    const row = referbackRow
    if (!row) return
    const testAllocationId = row.testAllocationId?.trim()
    const sampleId = row.sampleId?.trim()
    if (!testAllocationId || !sampleId) {
      setReferbackSubmitError('Missing section data for refer back.')
      return
    }

    setReferbackSubmitLoading(true)
    setReferbackSubmitError(null)
    try {
      await ensureTestAllocationParameterRows(testAllocationId)
      await clearSectionReviewAssignment(testAllocationId)

      const { error: taErr } = await supabase
        .from('test_allocations')
        .update({
          sent_for_testing: true,
          assigned_employee_id: employee.id,
          assigned_employee_name: employee.name,
        })
        .eq('id', testAllocationId)
      if (taErr) throw taErr

      const stillInReview = await sampleStillHasResultsInReview(sampleId)
      if (!stillInReview) {
        const { error: stageErr } = await supabase
          .from('samples')
          .update({ stage: 'under_testing', referback_from_allocation: false })
          .eq('id', sampleId)
        if (stageErr) throw stageErr
      } else {
        const { error: flagErr } = await supabase
          .from('samples')
          .update({ referback_from_allocation: false })
          .eq('id', sampleId)
        if (flagErr) throw flagErr
      }

      setSaveMessage(
        `Section ${row.sectionCode} referred back to Sample Under Testing (assigned to ${employee.name}).`,
      )
      setReferbackDialogOpen(false)
      setReferbackRow(null)
      await loadRows()
    } catch (err) {
      setReferbackSubmitError(formatSupabaseError(err))
    } finally {
      setReferbackSubmitLoading(false)
    }
  }

  const handleApproved = async (row: TestAllocationRow) => {
    try {
      const testAllocationId = row.testAllocationId?.trim()
      const sampleId = row.sampleId?.trim()
      if (!testAllocationId || !sampleId) {
        setSaveMessage('Missing section data for approval.')
        return
      }

      await clearSectionReviewAssignment(testAllocationId)

      const stillInReview = await sampleStillHasResultsInReview(sampleId)
      if (!stillInReview) {
        const { error: stageErr } = await supabase
          .from('samples')
          .update({ stage: 'report_preparation' })
          .eq('id', sampleId)
        if (stageErr) throw stageErr
      }

      setSaveMessage(`Section ${row.sectionCode} approved for test report preparation (Clause 7.8).`)
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    }
  }

  const displayName = profileName || user?.email || 'User'
  const displayDepartment =
    resolvedDepartment.trim() || departmentName?.trim() || '—'
  const displayDesignation = designation?.trim() ? designation : '—'

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-md border bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <h1 className="text-2xl font-semibold text-foreground whitespace-nowrap">
            Results Under Review
          </h1>
          <div className="md:w-[40%]">
            <Input
              placeholder="Search section, SRF, results..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-28">
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v))
                setPage(1)
              }}
            >
              <SelectTrigger aria-label="Rows per page">
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
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 shrink-0">
          <ResultsUnderReviewAssistant rows={filteredRows} search={search} />
          <p className="text-sm text-muted-foreground">
            Logged in as: <span className="font-medium text-foreground">{displayName}</span>
            {displayDepartment !== '—' && (
              <>
                {' · '}
                <span className="font-medium text-foreground">{displayDepartment}</span>
              </>
            )}
            {displayDesignation !== '—' && (
              <>
                {' · '}
                <span className="font-medium text-foreground">{displayDesignation}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <ResultsUnderReviewTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        onReferback={openReferbackDialog}
        onApproved={handleApproved}
        onViewTestParameter={handleViewTestParameter}
        showSelection={showDelete}
        selectedIds={selectedIds}
        onToggleSelection={toggleRow}
        onToggleAllSelection={toggleAllOnPage}
      />

      <div className="rounded-md border bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {showDelete ? (
              <SampleHandlingDeleteButton
                disabled={listLoading || selectedIds.size === 0}
                onClick={handleDeleteSelected}
              />
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {saveMessage && <p className="text-sm text-emerald-700">{saveMessage}</p>}
            <span className="text-xs text-muted-foreground">
              Page {page} / {pageCount} · {filteredRows.length} allocation(s)
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount || listLoading}
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={testParamViewOpen} onOpenChange={setTestParamViewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="text-lg">Test Parameter: {testParamViewLabel || '—'}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto space-y-5 pr-1">
            {testParamViewData.length === 0 && !testParamViewExtras.loading ? (
              <p className="text-sm text-muted-foreground py-4">
                No matching test parameter found in Test Parameter directory.
              </p>
            ) : (
              testParamViewData.map((tp, idx) => {
                const fmt = (v: unknown) =>
                  v !== null && v !== undefined && String(v).trim() !== '' ? String(v) : '—'
                const tpId = typeof tp.id === 'string' ? tp.id : String(idx)
                return (
                  <Card key={tpId} className="overflow-hidden border-border shadow-sm">
                    <CardHeader className="py-4 px-5 bg-primary/5 border-b border-border">
                      <CardTitle className="text-base font-semibold text-foreground">{fmt(tp.item_name)}</CardTitle>
                      <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                        <span>
                          IS Code:{' '}
                          <span className="font-medium text-foreground">
                            {fmt(testParamViewExtras.isCodeLabel ?? tp.is_code_label)}
                          </span>
                        </span>
                        <span className="text-border">|</span>
                        <span>
                          Method: <span className="font-medium text-foreground">{fmt(tp.test_method)}</span>
                        </span>
                        <span className="text-border">|</span>
                        <span>
                          Clause {fmt(tp.clause_no)} · Unit: {fmt(tp.unit_value)}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5 space-y-5 pt-4">
                      <section>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          Sample &amp; IS Code
                        </h4>
                        {testParamViewExtras.loading ? (
                          <p className="text-sm text-muted-foreground">Loading sample details…</p>
                        ) : (
                          <div className="rounded-md bg-muted/30 border border-border/50 p-3 space-y-4 text-sm">
                            <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2">
                              <span className="text-muted-foreground">Sample Description</span>
                              <span className="whitespace-pre-wrap font-medium">
                                {fmt(testParamViewExtras.sampleDescription)}
                              </span>
                              <span className="text-muted-foreground">Declared Value</span>
                              <span className="whitespace-pre-wrap font-medium">
                                {fmt(testParamViewExtras.declaredValue)}
                              </span>
                            </div>
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                                IS Code Files
                              </p>
                              {testParamViewExtras.isCodeFiles.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No files uploaded for this IS Code.</p>
                              ) : (
                                <ul className="space-y-2">
                                  {testParamViewExtras.isCodeFiles.map((f) => (
                                    <li
                                      key={f.file_name}
                                      className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background px-3 py-2"
                                    >
                                      <span className="text-sm truncate">{f.file_name}</span>
                                      {f.url ? (
                                        <a
                                          href={f.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-xs font-medium text-primary hover:underline shrink-0"
                                        >
                                          View
                                        </a>
                                      ) : (
                                        <span className="text-xs text-muted-foreground shrink-0">—</span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}
                      </section>
                      <section>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Requirements</h4>
                        <div className="rounded-md bg-muted/30 border border-border/50 p-3 space-y-1.5 text-sm">
                          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2">
                            <span className="text-muted-foreground">Specific Requirement</span>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <span className="whitespace-pre-wrap font-medium">{fmt(tp.specific_requirement)}</span>
                              {typeof tp.id === 'string' ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 shrink-0 gap-1.5"
                                  aria-label="Edit specific requirement in Test Parameter master"
                                  title="Updates Test Parameter directory"
                                  onClick={() => openEditSpecificRequirement(tp)}
                                >
                                  <Pencil size={14} />
                                  Edit
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  Link test parameter in Test Allocation to enable edit.
                                </span>
                              )}
                            </div>
                            <span className="text-muted-foreground">Acceptance Criteria</span>
                            <span>{fmt(tp.acceptance_criteria)}</span>
                          </div>
                        </div>
                      </section>
                      <section>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Uncertainty</h4>
                        <div className="rounded-md bg-muted/30 border border-border/50 p-3 text-sm">
                          <span className="text-muted-foreground mr-1">Uncertainty (MU):</span>
                          <span className="font-medium">{fmt(tp.uncertainty_mu)}</span>
                        </div>
                      </section>
                    </CardContent>
                  </Card>
                )
              })
            )}
            {testParamViewData.length === 0 && testParamViewExtras.loading && (
              <Card className="overflow-hidden border-border shadow-sm">
                <CardContent className="p-5 pt-4">
                  <p className="text-sm text-muted-foreground">Loading sample details…</p>
                </CardContent>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editSpecOpen} onOpenChange={setEditSpecOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Specific Requirement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="review-edit-spec">Specific Requirement</Label>
              <Textarea
                id="review-edit-spec"
                rows={3}
                value={editSpecValue}
                onChange={(e) => setEditSpecValue(e.target.value)}
                placeholder="e.g. 410 Minimum"
              />
            </div>
            {editSpecError && <p className="text-sm text-destructive">{editSpecError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditSpecOpen(false)} disabled={editSpecSaving}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void saveEditSpecificRequirement()} disabled={editSpecSaving}>
                {editSpecSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ResultsUnderReviewReferbackDialog
        open={referbackDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setReferbackRow(null)
            setReferbackSubmitError(null)
          }
          setReferbackDialogOpen(open)
        }}
        row={referbackRow}
        onSubmit={submitReferbackToUnderTesting}
        submitLoading={referbackSubmitLoading}
        submitError={referbackSubmitError}
      />
    </div>
  )
}
