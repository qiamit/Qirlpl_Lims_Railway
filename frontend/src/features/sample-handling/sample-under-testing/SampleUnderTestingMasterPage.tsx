import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import { formatSupabaseError } from '@/lib/formatSupabaseError'
import type { TestAllocationRow } from '../types'
import type { UnderTestingFormState } from './SampleUnderTestingForm'
import { SampleUnderTestingTable } from './SampleUnderTestingTable'
import {
  SectionResultsEntryDialog,
  type SectionResultsDraft,
} from './SectionResultsEntryDialog'
import { SampleUnderTestingForm } from './SampleUnderTestingForm'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { canDeleteSampleHandlingRecords, isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  confirmDestructiveDelete,
  deleteTestAllocationsForSections,
} from '@/features/sample-handling/shared/deleteSampleRecords'
import { SampleHandlingDeleteButton } from '@/features/sample-handling/shared/SampleHandlingDeleteButton'
import { isDepartmentTestingEngineer, type UserAccessContext } from '@/lib/moduleAccess'
import { SampleUnderTestingAssistant } from './SampleUnderTestingAssistant'
import { sortParametersByClause } from './sectionParameterRows'
import { resolveSectionSpecificRequirement } from '../shared/resolveSectionSpecificRequirement'
import {
  buildLegacyResultsReviewSampleIds,
  fetchSentForReviewTestAllocationIds,
  shouldHideFromSampleUnderTesting,
} from './sampleUnderTestingVisibility'

type ReviewUser = { id: string; name: string; designation: string; departmentName: string }

function isRowAssignedToUser(
  row: TestAllocationRow,
  userId: string,
  profileName: string,
): boolean {
  if (row.assignedEmployeeId === userId) return true
  const assignedName = (row.assignedEmployeeName ?? '').trim().toLowerCase()
  const myName = profileName.trim().toLowerCase()
  return Boolean(assignedName && myName && assignedName === myName)
}

export default function SampleUnderTestingMasterPage() {
  const { user, profileName, designation, departmentName, profileReady } = useAuth()
  const showDelete = canDeleteSampleHandlingRecords(designation)
  const access: UserAccessContext = { designation, departmentName }
  const forceOwnAssignmentsOnly = isDepartmentTestingEngineer(access)
  const [rows, setRows] = useState<TestAllocationRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formRow, setFormRow] = useState<TestAllocationRow | null>(null)
  const [formInitial, setFormInitial] = useState<UnderTestingFormState | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [testParamViewOpen, setTestParamViewOpen] = useState(false)
  const [testParamViewRow, setTestParamViewRow] = useState<TestAllocationRow | null>(null)
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

  const IS_CODE_FILES_BUCKET = 'is-code-files'

  const [editSpecOpen, setEditSpecOpen] = useState(false)
  const [editSpecParamId, setEditSpecParamId] = useState<string | null>(null)
  const [editSpecValue, setEditSpecValue] = useState('')
  const [editSpecSaving, setEditSpecSaving] = useState(false)
  const [editSpecError, setEditSpecError] = useState<string | null>(null)

  const [resultsDialogOpen, setResultsDialogOpen] = useState(false)
  const [resultsDialogRow, setResultsDialogRow] = useState<TestAllocationRow | null>(null)
  const [resultsDialogSaving, setResultsDialogSaving] = useState(false)

  const [sendForReviewOpen, setSendForReviewOpen] = useState(false)
  const [sendForReviewRow, setSendForReviewRow] = useState<TestAllocationRow | null>(null)
  const [reviewDepartment, setReviewDepartment] = useState('')
  const [reviewDesignation, setReviewDesignation] = useState('')
  const [reviewEmployeeId, setReviewEmployeeId] = useState('')
  const [reviewUsers, setReviewUsers] = useState<ReviewUser[]>([])
  const [reviewUsersLoading, setReviewUsersLoading] = useState(false)
  const [reviewSubmitLoading, setReviewSubmitLoading] = useState(false)
  const [reviewSubmitError, setReviewSubmitError] = useState<string | null>(null)
  /** Off for Lab Director (can show all). On for everyone else — only Test Allocation rows where Select Employee = you. */
  const [onlyMyAssignments, setOnlyMyAssignments] = useState(true)

  const loadRows = async () => {
    if (!user?.id) {
      setRows([])
      setListLoading(false)
      return
    }
    setListError(null)
    setListLoading(true)
    try {
      const { data: testAllocData, error: taErr } = await supabase
        .from('test_allocations')
        .select(
          'id, sample_allocation_id, assigned_employee_id, assigned_employee_name, test_parameter_summary, test_parameter_ids, sent_for_testing',
        )
        .eq('sent_for_testing', true)
        .order('created_at', { ascending: false })
      if (taErr) throw taErr
      const testAllocs = Array.isArray(testAllocData) ? testAllocData : []
      if (testAllocs.length === 0) {
        setRows([])
        return
      }
      const allocIds = testAllocs.map((t: { sample_allocation_id: string }) => t.sample_allocation_id)
      const { data: allocData, error: allocErr } = await supabase
        .from('sample_allocations')
        .select('id, sample_id, section_code, allocation_date, department, designation')
        .in('id', allocIds)
      if (allocErr) throw allocErr
      const allocations = Array.isArray(allocData) ? allocData : []
      const allocMap = new Map(allocations.map((a: { id: string }) => [a.id, a]))
      const sampleIds = [...new Set(allocations.map((a: { sample_id: string }) => a.sample_id))]
      const { data: sampleData, error: sampleErr } = await supabase
        .from('samples')
        .select(
          'id, srf_number, date_of_sample_receiving, test_report_is_code_id, referback_from_allocation, stage, sample_description, sample_declaration',
        )
        .in('id', sampleIds)
      if (sampleErr) throw sampleErr
      const isCodeIds = [
        ...new Set(
          (Array.isArray(sampleData) ? sampleData : [])
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
        (
          Array.isArray(sampleData) ? sampleData : []
        ).map(
          (s: {
            id: string
            srf_number?: string
            date_of_sample_receiving?: string
            test_report_is_code_id?: string | null
            referback_from_allocation?: boolean | null
            stage?: string | null
            sample_description?: string | null
            sample_declaration?: string | null
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
              stage: s.stage ?? null,
              sampleDescription: s.sample_description ?? null,
              declaredValue: s.sample_declaration ?? null,
            },
          ],
        ),
      )
      const allocationIds = Array.from(new Set(testAllocs.map((t: { id: string }) => t.id)))

      const sentForReviewAllocIds = await fetchSentForReviewTestAllocationIds(allocationIds)

      const sampleIdBySampleAllocationId = new Map(
        allocations.map((a: { id: string; sample_id: string }) => [a.id, a.sample_id]),
      )
      const samplesStageById = new Map(
        [...samplesMap.entries()].map(([id, s]) => [id, (s as { stage?: string | null }).stage ?? null]),
      )
      const legacyResultsReviewSampleIds = buildLegacyResultsReviewSampleIds(
        testAllocs as { id: string; sample_allocation_id: string }[],
        sampleIdBySampleAllocationId,
        samplesStageById,
        sentForReviewAllocIds,
      )

      let paramsByAllocationId = new Map<string, {
        id: string
        test_allocation_id: string
        test_parameter_id: string | null
        test_label: string
        test_start_date: string | null
        test_end_date: string | null
        results: string | null
        results_reviewer_id: string | null
        results_reviewer_name: string | null
        specific_requirement: string | null
      }[]>()
      if (allocationIds.length > 0) {
        const { data: paramData, error: paramErr } = await supabase
          .from('test_allocation_parameters')
          .select(
            'id, test_allocation_id, test_parameter_id, test_label, test_start_date, test_end_date, results, results_reviewer_id, results_reviewer_name, specific_requirement',
          )
          .in('test_allocation_id', allocationIds)
        if (paramErr) throw paramErr
        const paramRows = Array.isArray(paramData) ? paramData : []
        const map = new Map<string, {
          id: string
          test_allocation_id: string
          test_parameter_id: string | null
          test_label: string
          test_start_date: string | null
          test_end_date: string | null
          results: string | null
          results_reviewer_id: string | null
          results_reviewer_name: string | null
          specific_requirement: string | null
        }[]>()
        for (const p of paramRows as {
          id: string
          test_allocation_id?: string | null
          test_parameter_id?: string | null
          test_label?: string | null
          test_start_date?: string | null
          test_end_date?: string | null
          results?: string | null
          results_reviewer_id?: string | null
          results_reviewer_name?: string | null
          specific_requirement?: string | null
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
            results_reviewer_id: p.results_reviewer_id ?? null,
            results_reviewer_name: p.results_reviewer_name ?? null,
            specific_requirement: p.specific_requirement ?? null,
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
      const testParamMetaById = new Map<
        string,
        { name: string; specificRequirement: string | null; clauseNo: string | null }
      >()
      if (tpIdsForLookup.size > 0) {
        const { data: tpMetaRows } = await supabase
          .from('test_parameters')
          .select('id, item_name, specific_requirement, clause_no')
          .in('id', [...tpIdsForLookup])
        for (const row of Array.isArray(tpMetaRows) ? tpMetaRows : []) {
          const r = row as {
            id: string
            item_name?: string | null
            specific_requirement?: string | null
            clause_no?: string | null
          }
          testParamMetaById.set(r.id, {
            name: (r.item_name ?? '').trim() || r.id,
            specificRequirement: (r.specific_requirement ?? '').trim() || null,
            clauseNo: (r.clause_no ?? '').trim() || null,
          })
        }
      }

      const list: TestAllocationRow[] = testAllocs
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
            const sample = samplesMap.get(a.sample_id) as
              | (ReturnType<typeof samplesMap.get> extends Map<string, infer V> ? V : any)
              | undefined
            if (!sample) return null

            const testAllocationId = t.id
            const sentForTesting = !!(t as { sent_for_testing?: boolean | null }).sent_for_testing
            if (
              shouldHideFromSampleUnderTesting({
                testAllocationId,
                sampleId: a.sample_id,
                sentForReviewAllocIds,
                legacyResultsReviewSampleIds,
                sentForTesting,
              })
            ) {
              return null
            }

            const allocationId = testAllocationId
            const fromDb = paramsByAllocationId.get(testAllocationId) ?? []
            let parameterRows = fromDb.map((p) => ({
              id: p.id,
              testAllocationId: p.test_allocation_id,
              testParameterId: p.test_parameter_id,
              testLabel: p.test_label,
              clauseNo: p.test_parameter_id
                ? (testParamMetaById.get(p.test_parameter_id)?.clauseNo ?? null)
                : null,
              sectionSpecOverride: p.specific_requirement ?? null,
              specificRequirement: resolveSectionSpecificRequirement(
                p.specific_requirement,
                p.test_parameter_id
                  ? testParamMetaById.get(p.test_parameter_id)?.specificRequirement
                  : null,
              ),
              testStartDate: p.test_start_date,
              testEndDate: p.test_end_date,
              results: p.results,
            }))
            if (parameterRows.length === 0 && allocationId) {
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
                    testAllocationId: allocationId,
                    testParameterId: tpId,
                    testLabel: label,
                    clauseNo: tpId ? (testParamMetaById.get(tpId)?.clauseNo ?? null) : null,
                    sectionSpecOverride: null,
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

            parameterRows = sortParametersByClause(parameterRows)
            const fromDbParams = paramsByAllocationId.get(testAllocationId) ?? []
            const reviewerRow = fromDbParams.find(
              (p) => p.results_reviewer_id || p.results_reviewer_name?.trim(),
            )
            const resultsLocked = sentForReviewAllocIds.has(testAllocationId)
            return {
              testAllocationId,
              sampleAllocationId: a.id,
              sampleId: a.sample_id,
              sectionCode: a.section_code,
              isCodeId: sample?.isCodeId ?? null,
              isCodeLabel: sample?.isCodeLabel ?? null,
              sampleDescription: (sample as { sampleDescription?: string | null }).sampleDescription ?? null,
              declaredValue: (sample as { declaredValue?: string | null }).declaredValue ?? null,
              resultsLocked,
              resultsReviewerName: reviewerRow?.results_reviewer_name ?? null,
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
      setListError(err instanceof Error ? err.message : 'Unable to load your test allocations')
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    if (!user?.id) {
      setRows([])
      return
    }
    if (!profileReady) return
    void loadRows()
  }, [user?.id, profileReady])

  useEffect(() => {
    if (!profileReady) return
    if (forceOwnAssignmentsOnly || !isLaboratoryDirector(designation)) {
      setOnlyMyAssignments(true)
    } else {
      setOnlyMyAssignments(false)
    }
  }, [profileReady, designation, forceOwnAssignmentsOnly])

  const rowsForAssignmentFilter = useMemo(() => {
    const filterActive =
      forceOwnAssignmentsOnly || onlyMyAssignments || !isLaboratoryDirector(designation)
    if (!filterActive || !user?.id) return rows
    return rows.filter((r) => isRowAssignedToUser(r, user.id, profileName))
  }, [
    rows,
    onlyMyAssignments,
    forceOwnAssignmentsOnly,
    user?.id,
    profileName,
    designation,
  ])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rowsForAssignmentFilter
    return rowsForAssignmentFilter.filter(
      (r) =>
        [r.sectionCode, r.srfNumber, r.testParameterSummary, r.results, r.sampleDescription, r.declaredValue, r.isCodeLabel]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
    )
  }, [rowsForAssignmentFilter, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize],
  )

  const handleEdit = (row: TestAllocationRow) => {
    setFormRow(row)
    const toDate = (v: string | null | undefined) =>
      v ? new Date(v).toISOString().slice(0, 10) : ''
    setFormInitial({
      testStartDate: toDate(row.testStartDate),
      results: row.results ?? '',
      testEndDate: toDate(row.testEndDate),
    })
    setFormOpen(true)
  }

  const handleSaveForm = (state: UnderTestingFormState) => {
    if (!formRow) return
    void (async () => {
      setSaveMessage(null)
      try {
        // Section-level fields are deprecated; per-parameter values are edited directly in the table.
        setSaveMessage('Per-parameter dates & results are edited in the table above.')
        setFormOpen(false)
        setFormRow(null)
        setFormInitial(null)
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Save failed')
      }
    })()
  }

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAll = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      pagedRows.forEach((r) => (checked ? next.add(r.sampleAllocationId) : next.delete(r.sampleAllocationId)))
      return next
    })
  }

  const handleDeleteSelected = () => {
    const allocIds = Array.from(selectedIds)
    if (!confirmDestructiveDelete(allocIds.length, 'section under testing')) return
    void (async () => {
      setListLoading(true)
      setSaveMessage(null)
      try {
        const count = await deleteTestAllocationsForSections(allocIds)
        setSelectedIds(new Set())
        setSaveMessage(`Deleted ${count} section(s) from Sample Under Testing.`)
        await loadRows()
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Delete failed')
      } finally {
        setListLoading(false)
      }
    })()
  }

  const handleReferback = async (row: TestAllocationRow) => {
    try {
      const testAllocationId = row.testAllocationId?.trim()
      if (!testAllocationId) {
        setSaveMessage('Missing test allocation for this section.')
        return
      }
      const sampleId = row.sampleId?.trim()
      const { error } = await supabase
        .from('test_allocations')
        .update({ sent_for_testing: false })
        .eq('id', testAllocationId)
      if (error) {
        setSaveMessage(formatSupabaseError(error))
        return
      }
      if (sampleId) {
        await supabase
          .from('samples')
          .update({ referback_from_allocation: false })
          .eq('id', sampleId)
      }
      setSaveMessage(`Section ${row.sectionCode} referred back to Test Allocation.`)
      await loadRows()
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Referback failed')
    }
  }

  const persistParameterFieldToDb = async (
    allocationId: string,
    paramRowId: string | null,
    labelForCreate: string | undefined,
    field: 'test_start_date' | 'results' | 'test_end_date',
    value: string | null,
    rowCtx: TestAllocationRow | undefined,
  ) => {
    const testParameterIdForInsert =
      rowCtx?.parameters?.find((p) => p.testLabel === labelForCreate)?.testParameterId ?? null

    if (paramRowId) {
      const payload = { [field]: value || null, updated_at: new Date().toISOString() }
      const { error } = await supabase
        .from('test_allocation_parameters')
        .update(payload)
        .eq('id', paramRowId)
      if (error) throw error
      return
    }

    const label = (labelForCreate ?? '').trim()
    const { data: existingRow } = await supabase
      .from('test_allocation_parameters')
      .select('id')
      .eq('test_allocation_id', allocationId)
      .eq('test_label', label)
      .maybeSingle()
    const existingId = (existingRow as { id?: string } | null)?.id
    const patch = { [field]: value || null, updated_at: new Date().toISOString() }
    if (existingId) {
      const { error } = await supabase.from('test_allocation_parameters').update(patch).eq('id', existingId)
      if (error) throw error
    } else {
      const payload: Record<string, unknown> = {
        test_allocation_id: allocationId,
        test_parameter_id: testParameterIdForInsert,
        test_label: label,
        [field]: value || null,
      }
      const { error } = await supabase.from('test_allocation_parameters').insert(payload)
      if (error) throw error
    }
  }

  const advanceSampleStageIfNeeded = async (sid: string): Promise<string | null> => {
    const { data: stRow, error: stageReadErr } = await supabase
      .from('samples')
      .select('stage')
      .eq('id', sid)
      .maybeSingle()
    if (stageReadErr || !stRow) {
      if (stageReadErr && import.meta.env.DEV) {
        console.warn('[SampleUnderTesting] samples stage read skipped:', stageReadErr.message)
      }
      return null
    }
    const curSt = (stRow as { stage?: string | null }).stage
    if (curSt === 'receiving' || curSt === 'allocation' || curSt === 'test_allocation') {
      const { error: stageUpdErr } = await supabase.from('samples').update({ stage: 'under_testing' }).eq('id', sid)
      if (stageUpdErr) {
        const hint = formatSupabaseError(stageUpdErr)
        if (import.meta.env.DEV) console.warn('[SampleUnderTesting] samples stage update:', hint)
        return hint
      }
    }
    return null
  }

  const openResultsDialog = (row: TestAllocationRow) => {
    setResultsDialogRow(row)
    setResultsDialogOpen(true)
  }

  const handleSaveSectionResults = async (draft: SectionResultsDraft[]) => {
    const row = resultsDialogRow
    if (!row?.testAllocationId || row.resultsLocked) return
    const allocationId = row.testAllocationId
    const sampleId = row.sampleId?.trim()
    if (!sampleId) return

    setResultsDialogSaving(true)
    setSaveMessage(null)
    try {
      for (const p of draft) {
        await persistParameterFieldToDb(
          allocationId,
          p.paramRowId,
          p.testLabel,
          'test_start_date',
          p.testStartDate,
          row,
        )
        await persistParameterFieldToDb(
          allocationId,
          p.paramRowId,
          p.testLabel,
          'test_end_date',
          p.testEndDate,
          row,
        )
        await persistParameterFieldToDb(
          allocationId,
          p.paramRowId,
          p.testLabel,
          'results',
          p.results,
          row,
        )
      }

      setRows((prev) =>
        prev.map((r) => {
          if (r.testAllocationId !== allocationId) return r
          const nextParams = draft.map((p, i) => ({
            id: p.paramRowId ?? r.parameters?.[i]?.id ?? `local-${p.testLabel}`,
            testAllocationId: allocationId,
            testParameterId: p.testParameterId,
            testLabel: p.testLabel,
            clauseNo: r.parameters?.find((x) => x.testLabel === p.testLabel)?.clauseNo ?? null,
            specificRequirement: p.specificRequirement,
            testStartDate: p.testStartDate,
            testEndDate: p.testEndDate,
            results: p.results,
          }))
          return { ...r, parameters: sortParametersByClause(nextParams) }
        }),
      )

      const stageSaveHint = await advanceSampleStageIfNeeded(sampleId)
      setSaveMessage(
        stageSaveHint
          ? `Results saved. Sample stage not advanced: ${stageSaveHint}`
          : `Results saved for section ${row.sectionCode}.`,
      )
      setResultsDialogOpen(false)
      setResultsDialogRow(null)
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setResultsDialogSaving(false)
    }
  }

  const loadReviewUsers = async () => {
    setReviewUsersLoading(true)
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, designation, department_name, status')
        .order('full_name', { ascending: true })
      if (error) throw error
      const rows = Array.isArray(data) ? data : []
      setReviewUsers(
        rows
          .filter((u) => (u as { status?: string }).status?.toLowerCase() !== 'inactive')
          .map((u) => ({
            id: String((u as { id: string }).id),
            name: String((u as { full_name?: string }).full_name ?? ''),
            designation: String((u as { designation?: string }).designation ?? '').trim(),
            departmentName: String((u as { department_name?: string }).department_name ?? '').trim(),
          })),
      )
    } catch {
      setReviewUsers([])
    } finally {
      setReviewUsersLoading(false)
    }
  }

  const applySendForReviewRow = (row: TestAllocationRow | null) => {
    setSendForReviewRow(row)
    if (row) {
      setReviewDepartment(row.department?.trim() ?? '')
      setReviewDesignation('Technical Manager')
      setReviewEmployeeId('')
    } else {
      setReviewDepartment('')
      setReviewDesignation('')
      setReviewEmployeeId('')
    }
  }

  const openSendForReviewForRow = (row: TestAllocationRow) => {
    setReviewSubmitError(null)
    applySendForReviewRow(row)
    setSendForReviewOpen(true)
    setReviewUsers([])
    void loadReviewUsers()
  }

  const sendForReviewSectionOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: { sampleAllocationId: string; label: string }[] = []
    for (const r of filteredRows) {
      if (seen.has(r.sampleAllocationId)) continue
      seen.add(r.sampleAllocationId)
      out.push({
        sampleAllocationId: r.sampleAllocationId,
        label: (r.sectionCode ?? '').trim() || '—',
      })
    }
    return out.sort((a, b) => a.label.localeCompare(b.label))
  }, [filteredRows])

  const norm = (s: string) => (s ?? '').trim().toLowerCase()

  // Link to User Management: departments = stored list merged with unique from users (same as User Management)
  const reviewDepartmentOptions = useMemo(() => {
    const fromStorage: string[] = []
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('userManagement.departments') : null
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) fromStorage.push(...(parsed.filter((v) => typeof v === 'string') as string[]))
      }
    } catch {
      /* ignore */
    }
    const fromUsers = reviewUsers.map((u) => u.departmentName).filter((d) => d && d.trim())
    const merged = Array.from(new Set([...fromStorage, ...fromUsers]))
      .map((d) => d.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
    return merged
  }, [reviewUsers])

  // Filter designations by selected department (from User Management table / designationByDepartment when available)
  const reviewDesignationOptions = useMemo(() => {
    if (!reviewDepartment) return []
    const deptNorm = norm(reviewDepartment)
    // Match designationByDepartment key by normalized department name
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('userManagement.designationByDepartment') : null
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string[]>
        if (parsed && typeof parsed === 'object') {
          const key = Object.keys(parsed).find((k) => norm(k) === deptNorm)
          if (key && Array.isArray(parsed[key]))
            return [...parsed[key]].sort((a, b) => a.localeCompare(b))
        }
      }
    } catch {
      /* ignore */
    }
    const set = new Set(
      reviewUsers.filter((u) => norm(u.departmentName) === deptNorm).map((u) => u.designation).filter(Boolean),
    )
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [reviewUsers, reviewDepartment])

  const reviewEmployeeOptions = useMemo(() => {
    if (!reviewDepartment || !reviewDesignation || reviewUsers.length === 0) return []
    const dept = norm(reviewDepartment)
    const des = norm(reviewDesignation)
    return reviewUsers.filter(
      (u) => norm(u.departmentName) === dept && norm(u.designation) === des,
    )
  }, [reviewUsers, reviewDepartment, reviewDesignation])

  const ensureParameterRowsForSendReview = async (row: TestAllocationRow, testAllocationId: string) => {
    const { data: existing, error } = await supabase
      .from('test_allocation_parameters')
      .select('id')
      .eq('test_allocation_id', testAllocationId)
      .limit(1)
    if (error) throw error
    if (Array.isArray(existing) && existing.length > 0) return

    const fromRow = row.parameters?.filter((p) => p.testLabel?.trim()) ?? []
    if (fromRow.length > 0) {
      for (const p of fromRow) {
        const { error: insErr } = await supabase.from('test_allocation_parameters').insert({
          test_allocation_id: testAllocationId,
          test_parameter_id: p.testParameterId,
          test_label: p.testLabel,
          test_start_date: p.testStartDate,
          test_end_date: p.testEndDate,
          results: p.results,
        })
        if (insErr) throw insErr
      }
      return
    }

    const summary = row.testParameterSummary?.trim() ?? ''
    const labels = summary ? summary.split(',').map((s) => s.trim()).filter(Boolean) : []
    const ids = row.testParameterIds ?? []
    for (let i = 0; i < labels.length; i += 1) {
      const { error: insErr } = await supabase.from('test_allocation_parameters').insert({
        test_allocation_id: testAllocationId,
        test_parameter_id: ids[i] ?? null,
        test_label: labels[i]!,
      })
      if (insErr) throw insErr
    }
  }

  const handleSubmitSendForReview = async () => {
    if (reviewSubmitLoading) return
    if (!sendForReviewRow) {
      setReviewSubmitError('Select a section code.')
      return
    }
    if (!reviewEmployeeId) {
      setReviewSubmitError('Select an employee to review.')
      return
    }
    const reviewSampleId = typeof sendForReviewRow.sampleId === 'string' ? sendForReviewRow.sampleId.trim() : ''
    const testAllocationId =
      typeof sendForReviewRow.testAllocationId === 'string' ? sendForReviewRow.testAllocationId.trim() : ''
    if (!reviewSampleId || !testAllocationId) {
      setReviewSubmitError('Missing sample or test allocation for this section.')
      return
    }

    const reviewer = reviewUsers.find((u) => u.id === reviewEmployeeId)
    const reviewerName = reviewer?.name?.trim() || null

    setReviewSubmitLoading(true)
    setReviewSubmitError(null)
    try {
      await ensureParameterRowsForSendReview(sendForReviewRow, testAllocationId)

      const { error: paramErr } = await supabase
        .from('test_allocation_parameters')
        .update({
          results_reviewer_id: reviewEmployeeId,
          results_reviewer_name: reviewerName,
        })
        .eq('test_allocation_id', testAllocationId)
      if (paramErr) throw paramErr

      const { error: stageErr } = await supabase
        .from('samples')
        .update({ stage: 'results_review' })
        .eq('id', reviewSampleId)
      if (stageErr) throw stageErr

      setSaveMessage('Sent for review.')
      setSendForReviewOpen(false)
      applySendForReviewRow(null)
      await loadRows()
    } catch (err) {
      setReviewSubmitError(formatSupabaseError(err))
    } finally {
      setReviewSubmitLoading(false)
    }
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
    setTestParamViewRow(row)
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
      const summaryLabels = (row.testParameterSummary ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const ids = row.testParameterIds ?? []
      const index = summaryLabels.findIndex((l) => l.toLowerCase() === label.toLowerCase())
      const paramFromRow = row.parameters?.find((p) => p.testLabel.toLowerCase() === label.toLowerCase())
      const allocationTestParamId =
        paramFromRow?.testParameterId ?? (index >= 0 && ids[index] ? ids[index] : null)

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
    if (!id || !testParamViewRow) return
    const sectionParam = testParamViewRow.parameters?.find((p) => p.testParameterId === id)
    const current = resolveSectionSpecificRequirement(
      sectionParam?.sectionSpecOverride,
      String(tp.specific_requirement ?? ''),
    )
    setEditSpecParamId(id)
    setEditSpecValue(current ?? '')
    setEditSpecError(null)
    setEditSpecOpen(true)
  }

  const saveEditSpecificRequirement = async () => {
    if (!editSpecParamId || !testParamViewRow?.testAllocationId) return
    setEditSpecSaving(true)
    setEditSpecError(null)
    const nextValue = editSpecValue.trim() || null
    const testAllocationId = testParamViewRow.testAllocationId
    const label =
      testParamViewRow.parameters?.find((p) => p.testParameterId === editSpecParamId)?.testLabel ??
      testParamViewLabel
    try {
      const masterValue = String(
        testParamViewData.find((tp) => typeof tp.id === 'string' && tp.id === editSpecParamId)
          ?.specific_requirement ?? '',
      )
      const resolvedDisplay = resolveSectionSpecificRequirement(nextValue, masterValue)
      const sectionParam = testParamViewRow.parameters?.find((p) => p.testParameterId === editSpecParamId)
      const paramRowId = sectionParam?.id && !sectionParam.id.startsWith('local-') ? sectionParam.id : null

      if (paramRowId) {
        const { error } = await supabase
          .from('test_allocation_parameters')
          .update({ specific_requirement: nextValue })
          .eq('id', paramRowId)
          .eq('test_allocation_id', testAllocationId)
        if (error) throw error
      } else {
        const { data: existing } = await supabase
          .from('test_allocation_parameters')
          .select('id')
          .eq('test_allocation_id', testAllocationId)
          .eq('test_parameter_id', editSpecParamId)
          .maybeSingle()
        if (existing?.id) {
          const { error } = await supabase
            .from('test_allocation_parameters')
            .update({ specific_requirement: nextValue })
            .eq('id', existing.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('test_allocation_parameters').insert({
            test_allocation_id: testAllocationId,
            test_parameter_id: editSpecParamId,
            test_label: label,
            specific_requirement: nextValue,
          })
          if (error) throw error
        }
      }

      setRows((prev) =>
        prev.map((row) => {
          if (row.testAllocationId !== testAllocationId) return row
          return {
            ...row,
            parameters: row.parameters?.map((p) =>
              p.testParameterId === editSpecParamId
                ? { ...p, sectionSpecOverride: nextValue, specificRequirement: resolvedDisplay }
                : p,
            ),
          }
        }),
      )
      setTestParamViewRow((prev) =>
        prev && prev.testAllocationId === testAllocationId
          ? {
              ...prev,
              parameters: prev.parameters?.map((p) =>
                p.testParameterId === editSpecParamId
                  ? { ...p, sectionSpecOverride: nextValue, specificRequirement: resolvedDisplay }
                  : p,
              ),
            }
          : prev,
      )
      setEditSpecOpen(false)
      setEditSpecParamId(null)
      setEditSpecValue('')
      setSaveMessage(`Specified requirement updated for section ${testParamViewRow.sectionCode} only.`)
    } catch (err) {
      setEditSpecError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setEditSpecSaving(false)
    }
  }

  const displayName = profileName || user?.email || 'User'
  const displayDepartment = departmentName?.trim() ? departmentName.trim() : '—'
  const displayDesignation = designation?.trim() ? designation : '—'

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-md border bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <h1 className="text-2xl font-semibold text-foreground whitespace-nowrap">
            Sample Under Testing
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
          {!forceOwnAssignmentsOnly && isLaboratoryDirector(designation) && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground shrink-0">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={onlyMyAssignments}
                onChange={(e) => {
                  setOnlyMyAssignments(e.target.checked)
                  setPage(1)
                }}
                aria-label="Only my assignments"
              />
              <span>Only my assignments</span>
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 shrink-0">
          <SampleUnderTestingAssistant rows={filteredRows} search={search} />
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

      <SampleUnderTestingTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        emptyStateMessage={
          forceOwnAssignmentsOnly || onlyMyAssignments || !isLaboratoryDirector(designation)
            ? 'No sections sent for testing are assigned to you. Ask your Technical Manager to use Send for Testing in Test Allocation.'
            : 'No sections sent for testing. Use Send for Testing in Test Allocation, or check the error above.'
        }
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAll}
        onOpenResults={openResultsDialog}
        onReferback={handleReferback}
        onSendForReview={openSendForReviewForRow}
      />

      <SectionResultsEntryDialog
        open={resultsDialogOpen}
        onOpenChange={(open) => {
          setResultsDialogOpen(open)
          if (!open) setResultsDialogRow(null)
        }}
        row={resultsDialogRow}
        readOnly={Boolean(resultsDialogRow?.resultsLocked)}
        saving={resultsDialogSaving}
        onSave={handleSaveSectionResults}
        onViewTestParameter={
          resultsDialogRow
            ? (testLabel) => void handleViewTestParameter(resultsDialogRow, testLabel)
            : undefined
        }
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

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFormRow(null)
            setFormInitial(null)
          }
          setFormOpen(open)
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enter Test Start Date, Results & Test End Date</DialogTitle>
          </DialogHeader>
          {formRow && formInitial && (
            <SampleUnderTestingForm
              row={formRow}
              initial={formInitial}
              onSave={handleSaveForm}
              onClose={() => {
                setFormOpen(false)
                setFormRow(null)
                setFormInitial(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={testParamViewOpen} onOpenChange={setTestParamViewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="text-lg">Test Parameter: {testParamViewLabel || '—'}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto space-y-5 pr-1">
            {testParamViewData.length === 0 ? (
              <>
                {!testParamViewExtras.loading && (
                  <p className="text-sm text-muted-foreground py-2">
                    No matching test parameter found in Test Parameter directory.
                  </p>
                )}
                <Card className="overflow-hidden border-border shadow-sm">
                  <CardContent className="p-5 pt-4">
                    <section>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Sample &amp; IS Code
                      </h4>
                      {testParamViewExtras.loading ? (
                        <p className="text-sm text-muted-foreground">Loading sample details…</p>
                      ) : (
                        <div className="rounded-md bg-muted/30 border border-border/50 p-3 space-y-4 text-sm">
                          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2">
                            <span className="text-muted-foreground">IS Code</span>
                            <span className="font-medium">{testParamViewExtras.isCodeLabel?.trim() || '—'}</span>
                            <span className="text-muted-foreground">Sample Description</span>
                            <span className="whitespace-pre-wrap font-medium">
                              {testParamViewExtras.sampleDescription?.trim() || '—'}
                            </span>
                            <span className="text-muted-foreground">Declared Value</span>
                            <span className="whitespace-pre-wrap font-medium">
                              {testParamViewExtras.declaredValue?.trim() || '—'}
                            </span>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
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
                  </CardContent>
                </Card>
              </>
            ) : (
              testParamViewData.map((tp, idx) => {
                const fmt = (v: unknown) => (v !== null && v !== undefined && String(v).trim() !== '' ? String(v) : '—')
                const tpId = typeof tp.id === 'string' ? tp.id.trim() : ''
                const sectionParam = testParamViewRow?.parameters?.find((p) => p.testParameterId === tpId)
                const displaySpecificRequirement = fmt(
                  resolveSectionSpecificRequirement(
                    sectionParam?.sectionSpecOverride,
                    String(tp.specific_requirement ?? ''),
                  ),
                )
                return (
                  <Card key={tpId || idx} className="overflow-hidden border-border shadow-sm">
                    <CardHeader className="py-4 px-5 bg-primary/5 border-b border-border">
                      <CardTitle className="text-base font-semibold text-foreground">{fmt(tp.item_name)}</CardTitle>
                      <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                        <span>IS Code: <span className="font-medium text-foreground">{fmt(testParamViewExtras.isCodeLabel ?? tp.is_code_label)}</span></span>
                        <span className="text-border">|</span>
                        <span>Method: <span className="font-medium text-foreground">{fmt(tp.test_method)}</span></span>
                        <span className="text-border">|</span>
                        <span>Clause {fmt(tp.clause_no)} · Unit: {fmt(tp.unit_value)}</span>
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
                              <span className="text-muted-foreground">IS Code</span>
                              <span className="font-medium">{testParamViewExtras.isCodeLabel?.trim() || '—'}</span>
                              <span className="text-muted-foreground">Sample Description</span>
                              <span className="whitespace-pre-wrap font-medium">
                                {testParamViewExtras.sampleDescription?.trim() || '—'}
                              </span>
                              <span className="text-muted-foreground">Declared Value</span>
                              <span className="whitespace-pre-wrap font-medium">
                                {testParamViewExtras.declaredValue?.trim() || '—'}
                              </span>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
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
                              <span className="whitespace-pre-wrap font-medium">{displaySpecificRequirement}</span>
                              {tpId && testParamViewRow && !testParamViewRow.resultsLocked ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 shrink-0 gap-1.5"
                                  aria-label="Edit specified requirement for this section"
                                  title="Section-only override (does not change Test Parameter master)"
                                  onClick={() => openEditSpecificRequirement(tp)}
                                >
                                  <Pencil size={14} />
                                  Edit
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">Link test parameter in Test Allocation to enable edit.</span>
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
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editSpecOpen} onOpenChange={setEditSpecOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Edit Specific Requirement — Section {testParamViewRow?.sectionCode ?? '—'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Applies only to this section code. Test Parameter master and other sections are not changed.
            </p>
            <div className="space-y-2">
              <Label htmlFor="under-test-edit-spec">Specific Requirement</Label>
              <Textarea
                id="under-test-edit-spec"
                rows={3}
                value={editSpecValue}
                onChange={(e) => setEditSpecValue(e.target.value)}
                placeholder="e.g. 0.12 Maximum"
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

      <Dialog
        open={sendForReviewOpen}
        onOpenChange={(open) => {
          if (!open) {
            applySendForReviewRow(null)
            setReviewUsersLoading(false)
            setReviewSubmitError(null)
          }
          setSendForReviewOpen(open)
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send Result for Review</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4 py-2"
            onSubmit={(e) => {
              e.preventDefault()
              void handleSubmitSendForReview()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="review-section">Section code</Label>
              <Select
                value={sendForReviewRow?.sampleAllocationId ?? ''}
                onValueChange={(v) => {
                  if (!v) {
                    applySendForReviewRow(null)
                    return
                  }
                  const row = filteredRows.find((r) => r.sampleAllocationId === v) ?? null
                  applySendForReviewRow(row)
                }}
              >
                <SelectTrigger id="review-section" aria-label="Select section code">
                  <SelectValue placeholder="Select section code…" />
                </SelectTrigger>
                <SelectContent>
                  {sendForReviewSectionOptions.map((opt) => (
                    <SelectItem key={opt.sampleAllocationId} value={opt.sampleAllocationId}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sendForReviewSectionOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">No sections in the current list. Adjust search or filters.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-department">Department</Label>
              <Select
                value={reviewDepartment}
                onValueChange={(v) => {
                  setReviewDepartment(v)
                  setReviewDesignation('')
                  setReviewEmployeeId('')
                }}
                disabled={!sendForReviewRow}
              >
                <SelectTrigger id="review-department" aria-label="Select department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {reviewDepartmentOptions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-designation">Designation</Label>
              <Select
                value={reviewDesignation}
                onValueChange={(v) => {
                  setReviewDesignation(v)
                  setReviewEmployeeId('')
                }}
                disabled={!sendForReviewRow || !reviewDepartment}
              >
                <SelectTrigger id="review-designation" aria-label="Select designation">
                  <SelectValue placeholder="Select designation" />
                </SelectTrigger>
                <SelectContent>
                  {reviewDesignationOptions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-employee">Name of Employee</Label>
              <Select
                value={reviewEmployeeId}
                onValueChange={setReviewEmployeeId}
                disabled={
                  !sendForReviewRow || !reviewDesignation || reviewUsersLoading || reviewUsers.length === 0
                }
              >
                <SelectTrigger id="review-employee" aria-label="Select employee">
                  <SelectValue
                    placeholder={
                      reviewUsersLoading
                        ? 'Loading users…'
                        : reviewUsers.length === 0
                          ? 'No users found in User Management'
                          : reviewEmployeeOptions.length === 0
                            ? 'No employee for this department & designation'
                            : 'Select employee'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {reviewEmployeeOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {reviewSubmitError && <p className="text-sm text-destructive">{reviewSubmitError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSendForReviewOpen(false)}
                disabled={reviewSubmitLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!sendForReviewRow || !reviewEmployeeId || reviewSubmitLoading}
              >
                {reviewSubmitLoading ? 'Sending…' : 'Send for Review'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
