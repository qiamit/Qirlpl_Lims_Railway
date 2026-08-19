import { useEffect, useMemo, useState } from 'react'
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsPageShellClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import { formatSupabaseError } from '@/lib/formatSupabaseError'
import { isSupabaseMissingColumnError } from '@/lib/supabaseErrors'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import type { TestAllocationRow } from '../types'
import type { UnderTestingFormState } from './SampleUnderTestingForm'
import { SampleUnderTestingTable } from './SampleUnderTestingTable'
import { SampleUnderTestingHeaderBar } from './SampleUnderTestingHeaderBar'
import { SampleUnderTestingFooterBar } from './SampleUnderTestingFooterBar'
import {
  SectionResultsEntryDialog,
  type SectionResultsDraft,
} from './SectionResultsEntryDialog'
import type { SectionTestSelectionChange } from './allocatedTestsForSection'
import {
  fetchSectionParameterRows,
  insertAllocatedTestsIntoSection,
  removeAllocatedTestsFromSection,
} from './insertAllocatedTestsIntoSection'
import { SampleUnderTestingForm } from './SampleUnderTestingForm'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { canDeleteSampleHandlingRecords, isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  confirmDestructiveDelete,
  deleteTestAllocationsForSections,
} from '@/features/sample-handling/shared/deleteSampleRecords'
import { sortParametersByClause } from './sectionParameterRows'
import { resolveSectionSpecificRequirement } from '../shared/resolveSectionSpecificRequirement'
import { TestParameterViewDialog } from '../shared/TestParameterViewDialog'
import { saveSectionSpecificRequirement } from '../shared/saveSectionSpecificRequirement'
import type { SectionParameterEntry } from './sectionParameterRows'
import {
  isParameterSentForReview,
  shouldHideFromSampleUnderTesting,
  buildLegacyResultsReviewSampleIds,
  collectSentForReviewAllocationIds,
} from './sampleUnderTestingVisibility'
import {
  isActiveReviewerName,
  isResultsReviewStatusApproved,
  RESULTS_REVIEW_STATUS_UNDER_REVIEW,
} from '../results-under-review/resultsUnderReviewPartitions'
import { pickTestAllocationPerSection } from '../shared/pickTestAllocationPerSection'
import { fetchByIdChunks, fetchAllByRange } from '../shared/fetchByIdChunks'
import {
  buildLoadDiagnostics,
  type SampleUnderTestingLoadDiagnostics,
} from './sampleUnderTestingDiagnostics'
import { syncSampleReportPreparationStage } from '@/features/sample-handling/report-preparation/sampleReportReadiness'
import { SectionSampleDescViewDialog } from '../shared/SectionSampleDescViewDialog'
import { isSectionSubmittedForReview } from './underTestingSectionStatus'

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

type LoadedTestAlloc = {
  id: string
  sample_allocation_id: string
  assigned_employee_id?: string | null
  assigned_employee_name?: string | null
  test_parameter_summary?: string | null
  test_parameter_ids?: string[] | null
  sent_for_testing?: boolean | null
  referred_back_from_review?: boolean | null
}

export default function SampleUnderTestingMasterPage() {
  const { user, profileName, designation, profileReady } = useAuth()
  const showDelete = canDeleteSampleHandlingRecords(designation)
  const [rows, setRows] = useState<TestAllocationRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [jumpTo, setJumpTo] = useState('')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formRow, setFormRow] = useState<TestAllocationRow | null>(null)
  const [formInitial, setFormInitial] = useState<UnderTestingFormState | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [sampleDescViewRow, setSampleDescViewRow] = useState<TestAllocationRow | null>(null)
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
  const [loadDiagnostics, setLoadDiagnostics] = useState<SampleUnderTestingLoadDiagnostics | null>(
    null,
  )

  const loadRows = async () => {
    if (!user?.id) {
      setRows([])
      setListLoading(false)
      return
    }
    setListError(null)
    setListLoading(true)
    try {
      const testAllocsRaw = await fetchAllByRange(async (from, to) => {
        const { data, error } = await supabase
          .from('test_allocations')
          .select(
            'id, sample_allocation_id, assigned_employee_id, assigned_employee_name, test_parameter_summary, test_parameter_ids, sent_for_testing, referred_back_from_review',
          )
          .eq('sent_for_testing', true)
          .order('id', { ascending: true })
          .range(from, to)
        if (error) throw error
        return Array.isArray(data) ? data : []
      })
      if (testAllocsRaw.length === 0) {
        setRows([])
        setLoadDiagnostics({
          totalSentSections: 0,
          totalSentSrfs: 0,
          visibleSectionsAfterVisibility: 0,
          visibleSrfsAfterVisibility: 0,
          entries: [],
        })
        return
      }
      const allocIds = [
        ...new Set(
          testAllocsRaw
            .map((t: { sample_allocation_id: string }) => t.sample_allocation_id)
            .filter(Boolean),
        ),
      ]
      const allocations = await fetchByIdChunks(allocIds, 100, async (chunkIds) => {
        const { data: allocData, error: allocErr } = await supabase
          .from('sample_allocations')
          .select('id, sample_id, section_code, allocation_date, department, designation')
          .in('id', chunkIds)
        if (allocErr) throw allocErr
        return Array.isArray(allocData) ? allocData : []
      })
      const allocMap = new Map(allocations.map((a: { id: string }) => [a.id, a]))
      const sampleIds = [...new Set(allocations.map((a: { sample_id: string }) => a.sample_id))]
      const allocationIds = Array.from(new Set(testAllocsRaw.map((t: { id: string }) => t.id)))

      // Samples + parameters in parallel (largest cost); IS codes after samples.
      const [sampleData, paramRowsRaw] = await Promise.all([
        fetchByIdChunks(sampleIds, 100, async (chunkIds) => {
          const { data, error } = await supabase
            .from('samples')
            .select(
              'id, srf_number, date_of_sample_receiving, test_report_is_code_id, referback_from_allocation, stage, sample_description, sample_declaration',
            )
            .in('id', chunkIds)
          if (error) throw error
          return Array.isArray(data) ? data : []
        }),
        allocationIds.length === 0
          ? Promise.resolve([] as Record<string, unknown>[])
          : fetchByIdChunks(allocationIds, 60, async (chunkIds) => {
              const { data: paramData, error: paramErr } = await supabase
                .from('test_allocation_parameters')
                .select(
                  'id, test_allocation_id, test_parameter_id, test_label, test_start_date, test_end_date, results, results_reviewer_id, results_reviewer_name, results_review_status, specific_requirement',
                )
                .in('test_allocation_id', chunkIds)
              if (paramErr) throw paramErr
              return Array.isArray(paramData) ? paramData : []
            }),
      ])

      const isCodeIds = [
        ...new Set(
          sampleData
            .map((s: { test_report_is_code_id?: string | null }) => s.test_report_is_code_id)
            .filter(Boolean),
        ),
      ] as string[]
      let isCodeMap = new Map<string, string>()
      if (isCodeIds.length > 0) {
        const isCodes = await fetchByIdChunks(isCodeIds, 100, async (chunkIds) => {
          const { data: isCodeData, error } = await supabase
            .from('is_codes')
            .select('id, is_number, revision_year')
            .in('id', chunkIds)
          if (error) throw error
          return Array.isArray(isCodeData) ? isCodeData : []
        })
        isCodeMap = new Map(
          isCodes.map(
            (c: { id: string; is_number?: string; revision_year?: string | null }) => [
              c.id,
              formatIsCodeLabelFromParts(c.is_number, c.revision_year) || (c.is_number ?? c.id),
            ],
          ),
        )
      }
      const samplesMap = new Map(
        sampleData.map(
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

      const sentForReviewAllocIds = collectSentForReviewAllocationIds(
        paramRowsRaw as Array<{
          test_allocation_id?: string | null
          results_reviewer_id?: string | null
          results_reviewer_name?: string | null
          results_review_status?: string | null
        }>,
      )

      const sampleIdBySampleAllocationId = new Map(
        allocations.map((a: { id: string; sample_id: string }) => [a.id, a.sample_id]),
      )
      const samplesStageById = new Map(
        [...samplesMap.entries()].map(([id, s]) => [id, (s as { stage?: string | null }).stage ?? null]),
      )
      const legacyResultsReviewSampleIds = buildLegacyResultsReviewSampleIds(
        testAllocsRaw as { id: string; sample_allocation_id: string }[],
        sampleIdBySampleAllocationId,
        samplesStageById,
        sentForReviewAllocIds,
      )

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
          results_reviewer_id: string | null
          results_reviewer_name: string | null
          results_review_status: string | null
          specific_requirement: string | null
        }[]
      >()
      if (paramRowsRaw.length > 0) {
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
            results_reviewer_id: string | null
            results_reviewer_name: string | null
            results_review_status: string | null
            specific_requirement: string | null
          }[]
        >()
        for (const p of paramRowsRaw as {
          id: string
          test_allocation_id?: string | null
          test_parameter_id?: string | null
          test_label?: string | null
          test_start_date?: string | null
          test_end_date?: string | null
          results?: string | null
          results_reviewer_id?: string | null
          results_reviewer_name?: string | null
          results_review_status?: string | null
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
            results_review_status: p.results_review_status ?? null,
            specific_requirement: p.specific_requirement ?? null,
          })
        }
        paramsByAllocationId = map
      }

      const testAllocs = pickTestAllocationPerSection(
        testAllocsRaw as LoadedTestAlloc[],
        paramsByAllocationId,
      )

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
        { name: string; specificRequirement: string | null; clauseNo: string | null; unitValue: string | null; isCodeLabel: string | null }
      >()
      if (tpIdsForLookup.size > 0) {
        const tpMetaRows = await fetchByIdChunks([...tpIdsForLookup], 100, async (chunkIds) => {
          const { data, error } = await supabase
            .from('test_parameters')
            .select('id, item_name, specific_requirement, clause_no, unit_value, is_code_label')
            .in('id', chunkIds)
          if (error) throw error
          return Array.isArray(data) ? data : []
        })
        for (const row of tpMetaRows) {
          const r = row as {
            id: string
            item_name?: string | null
            specific_requirement?: string | null
            clause_no?: string | null
            unit_value?: string | null
            is_code_label?: string | null
          }
          testParamMetaById.set(r.id, {
            name: (r.item_name ?? '').trim() || r.id,
            specificRequirement: (r.specific_requirement ?? '').trim() || null,
            clauseNo: (r.clause_no ?? '').trim() || null,
            unitValue: (r.unit_value ?? '').trim() || null,
            isCodeLabel: (r.is_code_label ?? '').trim() || null,
          })
        }
      }

      const visibilityHiddenSections: {
        sampleId: string
        srfNumber: string | null
        stage: string | null
        sectionCode: string
      }[] = []

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
            const referredBackFromReview =
              (t as { referred_back_from_review?: boolean | null }).referred_back_from_review === true
            if (
              shouldHideFromSampleUnderTesting({
                testAllocationId,
                sampleId: a.sample_id,
                sentForReviewAllocIds,
                legacyResultsReviewSampleIds,
                sentForTesting,
              })
            ) {
              visibilityHiddenSections.push({
                sampleId: a.sample_id,
                srfNumber: sample.srf_number ?? null,
                stage: sample.stage ?? null,
                sectionCode: a.section_code,
              })
              return null
            }

            const allocationId = testAllocationId
            const fromDb = paramsByAllocationId.get(testAllocationId) ?? []
            const sectionApproved =
              fromDb.some((p) =>
                isResultsReviewStatusApproved(p.results_review_status, p.results_reviewer_name),
              ) ||
              String(sample.stage ?? '')
                .trim()
                .toLowerCase() === 'completed'
            const sectionSentForReview =
              !referredBackFromReview &&
              (fromDb.some((p) =>
                isParameterSentForReview({
                  results_reviewer_id: p.results_reviewer_id,
                  results_reviewer_name: p.results_reviewer_name,
                  results_review_status: p.results_review_status,
                }),
              ) ||
                String(sample.stage ?? '')
                  .trim()
                  .toLowerCase() === 'completed')

            let parameterRows = fromDb.map((p) => ({
              id: p.id,
              testAllocationId: p.test_allocation_id,
              testParameterId: p.test_parameter_id,
              testLabel: p.test_label,
              clauseNo: p.test_parameter_id
                ? (testParamMetaById.get(p.test_parameter_id)?.clauseNo ?? null)
                : null,
              unitValue: p.test_parameter_id
                ? (testParamMetaById.get(p.test_parameter_id)?.unitValue ?? null)
                : null,
              isCodeLabel: p.test_parameter_id
                ? (testParamMetaById.get(p.test_parameter_id)?.isCodeLabel ?? null)
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
              resultsReviewerId: p.results_reviewer_id,
              resultsReviewerName: p.results_reviewer_name,
              resultsReviewStatus: p.results_review_status,
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
                    unitValue: tpId ? (testParamMetaById.get(tpId)?.unitValue ?? null) : null,
                    isCodeLabel: tpId ? (testParamMetaById.get(tpId)?.isCodeLabel ?? null) : null,
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
              (p) =>
                p.results_reviewer_id ||
                isActiveReviewerName(p.results_reviewer_name),
            )
            const approvedRow = fromDbParams.find((p) =>
              isResultsReviewStatusApproved(p.results_review_status, p.results_reviewer_name),
            )
            const resultsLocked = sectionSentForReview
            const reviewStatus =
              approvedRow?.results_review_status ??
              reviewerRow?.results_review_status ??
              fromDbParams.find((p) => p.results_review_status)?.results_review_status ??
              null
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
              sectionReviewApproved: sectionApproved,
              referredBackFromReview,
              resultsReviewStatus: reviewStatus,
              resultsReviewerName:
                reviewerRow?.results_reviewer_name ??
                (isActiveReviewerName(approvedRow?.results_reviewer_name)
                  ? approvedRow?.results_reviewer_name
                  : null) ??
                null,
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
              sampleStage: sample?.stage ?? null,
              testStartDate: null,
              results: null,
              testEndDate: null,
              parameters: parameterRows,
            }
          },
        )
        .filter((r): r is TestAllocationRow => r != null)

      const samplesById = new Map(
        [...samplesMap.entries()].map(([id, s]) => [
          id,
          { srf_number: s.srf_number, stage: s.stage },
        ]),
      )
      setLoadDiagnostics(
        buildLoadDiagnostics({
          testAllocs: testAllocs as { id: string; sample_allocation_id: string }[],
          visibleRows: list,
          legacyResultsReviewSampleIds,
          visibilityHiddenSections,
          sampleIdBySampleAllocationId,
          allocations: allocations as { id: string; sample_id: string; section_code: string }[],
          samplesById,
        }),
      )
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
      setLoadDiagnostics(null)
      return
    }
    if (!profileReady) return
    void loadRows()
  }, [user?.id, profileReady])

  const restrictToOwnAssignments = useMemo(() => {
    if (!profileReady) return false
    if (isLaboratoryDirector(designation)) return false
    return true
  }, [profileReady, designation])

  const rowsForAssignmentFilter = useMemo(() => {
    if (!restrictToOwnAssignments || !user?.id) return rows
    return rows.filter((r) => isRowAssignedToUser(r, user.id, profileName))
  }, [rows, restrictToOwnAssignments, user?.id, profileName])

  const srfDiagnostics = useMemo(() => {
    if (!loadDiagnostics || !isLaboratoryDirector(designation)) return null
    return loadDiagnostics
  }, [loadDiagnostics, designation])

  const submittedForReviewRows = useMemo(
    () => rowsForAssignmentFilter.filter((r) => isSectionSubmittedForReview(r)),
    [rowsForAssignmentFilter],
  )

  const pendingRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const pending = rowsForAssignmentFilter.filter((r) => !isSectionSubmittedForReview(r))
    if (!q) return pending
    return pending.filter((r) =>
      [
        r.sectionCode,
        r.department,
        r.srfNumber,
        r.testParameterSummary,
        r.results,
        r.sampleDescription,
        r.declaredValue,
        r.isCodeLabel,
        r.assignedEmployeeName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [rowsForAssignmentFilter, search])

  const pageCount = Math.max(1, Math.ceil(pendingRows.length / pageSize))
  const pagedRows = useMemo(
    () => pendingRows.slice((page - 1) * pageSize, page * pageSize),
    [pendingRows, page, pageSize],
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

  const handleAddTestsToSection = async (change: SectionTestSelectionChange) => {
    const row = resultsDialogRow
    if (!row?.testAllocationId || row.resultsLocked) return
    if (
      change.toAdd.length === 0 &&
      change.toRemove.length === 0 &&
      change.toUpdate.length === 0
    ) {
      return
    }

    setSaveMessage(null)
    try {
      if (change.toAdd.length > 0) {
        await insertAllocatedTestsIntoSection(row.testAllocationId, change.toAdd)
      }
      if (change.toRemove.length > 0) {
        await removeAllocatedTestsFromSection(row.testAllocationId, change.toRemove)
      }
      for (const test of change.toUpdate) {
        const draftEntry = row.parameters?.find(
          (p) =>
            p.testParameterId === test.testParameterId ||
            p.testLabel.trim().toLowerCase() === test.testLabel.trim().toLowerCase(),
        )
        await saveSectionSpecificRequirement({
          testAllocationId: row.testAllocationId,
          testParameterId: test.testParameterId,
          testLabel: test.testLabel,
          paramRowId: draftEntry?.id ?? null,
          specificRequirement: test.specificRequirement,
        })
      }
      const parameters = await fetchSectionParameterRows(row.testAllocationId)
      const testParameterIds = parameters
        .map((p) => p.testParameterId?.trim())
        .filter((id): id is string => Boolean(id))
      const testParameterSummary = parameters.map((p) => p.testLabel).join(', ')
      const updatedRow: TestAllocationRow = {
        ...row,
        parameters,
        testParameterIds,
        testParameterSummary: testParameterSummary || row.testParameterSummary,
      }
      setResultsDialogRow(updatedRow)
      setRows((prev) =>
        prev.map((r) =>
          r.testAllocationId === row.testAllocationId
            ? {
                ...r,
                parameters,
                testParameterIds,
                testParameterSummary: testParameterSummary || r.testParameterSummary,
              }
            : r,
        ),
      )
      const parts: string[] = []
      if (change.toAdd.length > 0) {
        parts.push(
          `added ${change.toAdd.length} test${change.toAdd.length === 1 ? '' : 's'}`,
        )
      }
      if (change.toRemove.length > 0) {
        parts.push(
          `removed ${change.toRemove.length} test${change.toRemove.length === 1 ? '' : 's'}`,
        )
      }
      if (change.toUpdate.length > 0) {
        parts.push(
          `updated ${change.toUpdate.length} requirement${change.toUpdate.length === 1 ? '' : 's'}`,
        )
      }
      setSaveMessage(
        `Section ${row.sectionCode}: ${parts.join(', ')}. Test Allocation updated.`,
      )
      void loadRows()
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Unable to update section tests')
      throw err
    }
  }

  const handleUpdateSectionSpecificRequirement = async (
    entry: SectionParameterEntry,
    nextValue: string,
  ): Promise<{ sectionSpecOverride: string | null; specificRequirement: string | null }> => {
    const row = resultsDialogRow
    if (!row?.testAllocationId || row.resultsLocked) {
      throw new Error('Editing is locked for this section.')
    }
    const testParameterId = entry.testParameterId?.trim()
    if (!testParameterId) {
      throw new Error('Test parameter is not linked to this section.')
    }

    const { data: tpRow } = await supabase
      .from('test_parameters')
      .select('specific_requirement')
      .eq('id', testParameterId)
      .maybeSingle()
    const masterValue = String(
      (tpRow as { specific_requirement?: string | null } | null)?.specific_requirement ?? '',
    )
    const normalized = nextValue.trim() || null

    const paramRowId = await saveSectionSpecificRequirement({
      testAllocationId: row.testAllocationId,
      testParameterId,
      testLabel: entry.testLabel,
      paramRowId: entry.paramRowId,
      specificRequirement: normalized,
    })

    const resolvedDisplay = resolveSectionSpecificRequirement(normalized, masterValue)
    const updatedRow: TestAllocationRow = {
      ...row,
      parameters: row.parameters?.map((p) =>
        p.testParameterId === testParameterId
          ? {
              ...p,
              id: paramRowId ?? p.id,
              sectionSpecOverride: normalized,
              specificRequirement: resolvedDisplay,
            }
          : p,
      ),
    }

    setResultsDialogRow(updatedRow)
    setRows((prev) =>
      prev.map((r) => (r.testAllocationId === row.testAllocationId ? updatedRow : r)),
    )

    return {
      sectionSpecOverride: normalized,
      specificRequirement: resolvedDisplay,
    }
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
      const withIds = draft.filter((p) => Boolean(p.paramRowId?.trim()))
      const withoutIds = draft.filter((p) => !p.paramRowId?.trim())

      if (withIds.length > 0) {
        const results = await Promise.all(
          withIds.map((p) =>
            supabase
              .from('test_allocation_parameters')
              .update({
                test_start_date: p.testStartDate || null,
                test_end_date: p.testEndDate || null,
                results: p.results || null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', p.paramRowId as string),
          ),
        )
        const failed = results.find((r) => r.error)
        if (failed?.error) throw failed.error
      }

      for (const p of withoutIds) {
        const testParameterIdForInsert =
          row.parameters?.find((x) => x.testLabel === p.testLabel)?.testParameterId ?? null
        const label = (p.testLabel ?? '').trim()
        const { data: existingRow } = await supabase
          .from('test_allocation_parameters')
          .select('id')
          .eq('test_allocation_id', allocationId)
          .eq('test_label', label)
          .maybeSingle()
        const existingId = (existingRow as { id?: string } | null)?.id
        const fields = {
          test_start_date: p.testStartDate || null,
          test_end_date: p.testEndDate || null,
          results: p.results || null,
          updated_at: new Date().toISOString(),
        }
        if (existingId) {
          const { error } = await supabase
            .from('test_allocation_parameters')
            .update(fields)
            .eq('id', existingId)
          if (error) throw error
        } else {
          const { error } = await supabase.from('test_allocation_parameters').insert({
            test_allocation_id: allocationId,
            test_parameter_id: testParameterIdForInsert,
            test_label: label,
            ...fields,
          })
          if (error) throw error
        }
      }

      setRows((prev) =>
        prev.map((r) => {
          if (r.testAllocationId !== allocationId) return r
          const nextParams = draft.map((p, i) => ({
            id: p.paramRowId ?? r.parameters?.[i]?.id ?? `local-${p.testLabel}`,
            testAllocationId: allocationId,
            testParameterId: p.testParameterId,
            testLabel: p.testLabel,
            clauseNo: p.clauseNo ?? r.parameters?.find((x) => x.testLabel === p.testLabel)?.clauseNo ?? null,
            unitValue: p.unitValue ?? r.parameters?.find((x) => x.testLabel === p.testLabel)?.unitValue ?? null,
            isCodeLabel:
              p.isCodeLabel ?? r.parameters?.find((x) => x.testLabel === p.testLabel)?.isCodeLabel ?? null,
            specificRequirement: p.specificRequirement,
            testStartDate: p.testStartDate,
            testEndDate: p.testEndDate,
            results: p.results,
          }))
          return {
            ...r,
            parameters: sortParametersByClause(nextParams),
            referredBackFromReview: r.referredBackFromReview,
          }
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
      await loadRows()
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
    for (const r of pendingRows) {
      if (seen.has(r.sampleAllocationId)) continue
      seen.add(r.sampleAllocationId)
      out.push({
        sampleAllocationId: r.sampleAllocationId,
        label: (r.sectionCode ?? '').trim() || '—',
      })
    }
    return out.sort((a, b) => a.label.localeCompare(b.label))
  }, [pendingRows])

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
          results_review_status: RESULTS_REVIEW_STATUS_UNDER_REVIEW,
        })
        .eq('test_allocation_id', testAllocationId)
      if (paramErr) throw paramErr

      const clearReferbackFlag = await supabase
        .from('test_allocations')
        .update({ referred_back_from_review: false })
        .eq('id', testAllocationId)
      if (
        clearReferbackFlag.error &&
        !isSupabaseMissingColumnError(clearReferbackFlag.error, 'referred_back_from_review')
      ) {
        throw clearReferbackFlag.error
      }

      const { data: stageRow, error: stageReadErr } = await supabase
        .from('samples')
        .select('stage')
        .eq('id', reviewSampleId)
        .maybeSingle()
      if (stageReadErr) throw stageReadErr
      const curStage = String((stageRow as { stage?: string | null } | null)?.stage ?? '').trim()
      if (curStage === 'results_review' || curStage === 'report_preparation') {
        await syncSampleReportPreparationStage(reviewSampleId)
      } else {
        const { error: stageErr } = await supabase
          .from('samples')
          .update({ stage: 'results_review' })
          .eq('id', reviewSampleId)
        if (stageErr) throw stageErr
      }

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
          isCodeLabel =
            formatIsCodeLabelFromParts(r.is_number, r.revision_year) || r.is_number || isCodeId
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

  return (
    <div className={limsPageShellClass}>
      <SampleUnderTestingHeaderBar
        search={search}
        onSearchChange={(value) => {
          setSearch(value)
          setPage(1)
        }}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        showDiagnostics={isLaboratoryDirector(designation)}
        diagnostics={srfDiagnostics}
        diagnosticsLoading={listLoading}
        assistantRows={pendingRows}
        submittedForReviewRows={submittedForReviewRows}
      />

      <SampleUnderTestingTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        emptyStateMessage={
          restrictToOwnAssignments
            ? 'No sections pending results assigned to you. Use Submitted for Review in the header for sent sections, or ask your Technical Manager to use Send for Testing in Test Allocation.'
            : 'No sections pending results. Use Submitted for Review in the header to view sections already sent for review.'
        }
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAll}
        onOpenResults={openResultsDialog}
        onViewSampleDetails={setSampleDescViewRow}
        onReferback={handleReferback}
        onSendForReview={openSendForReviewForRow}
        groupBySrf={isLaboratoryDirector(designation)}
      />

      <SectionSampleDescViewDialog
        row={sampleDescViewRow}
        open={sampleDescViewRow !== null}
        onOpenChange={(open) => {
          if (!open) setSampleDescViewRow(null)
        }}
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
        onAddTests={handleAddTestsToSection}
        onUpdateSpecificRequirement={handleUpdateSectionSpecificRequirement}
        onViewTestParameter={
          resultsDialogRow
            ? (testLabel) => void handleViewTestParameter(resultsDialogRow, testLabel)
            : undefined
        }
      />

      <SampleUnderTestingFooterBar
        page={page}
        pageCount={pageCount}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJump={() => {
          const n = Number(jumpTo)
          if (Number.isFinite(n) && n > 0) setPage(Math.min(pageCount, Math.max(1, Math.floor(n))))
          setJumpTo('')
        }}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(pageCount, p + 1))}
        selectedCount={selectedIds.size}
        saveMessage={saveMessage}
        loading={listLoading}
        showDelete={showDelete}
        onDeleteSelected={handleDeleteSelected}
      />

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

      <TestParameterViewDialog
        open={testParamViewOpen}
        onOpenChange={setTestParamViewOpen}
        label={testParamViewLabel}
        parameters={testParamViewData}
        extras={testParamViewExtras}
        sectionParameters={testParamViewRow?.parameters}
        sectionCode={testParamViewRow?.sectionCode}
      />

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
        <DialogContent
          className={cn(
            limsDialogClass,
            'max-h-[90vh] max-w-2xl overflow-hidden p-0',
            'md:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
          )}
          overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
          portalClassName="md:left-[268px]"
          aria-describedby={undefined}
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                Send Result for Review
              </DialogTitle>
            </DialogHeader>
          </div>
          <form
            className="flex min-h-0 flex-col"
            onSubmit={(e) => {
              e.preventDefault()
              void handleSubmitSendForReview()
            }}
          >
            <div className="max-h-[calc(90vh-7.5rem)] space-y-4 overflow-y-auto bg-[#f7f3eb] px-4 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="review-section"
                    className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                  >
                    Section code
                  </Label>
                  <Select
                    value={sendForReviewRow?.sampleAllocationId ?? ''}
                    onValueChange={(v) => {
                      if (!v) {
                        applySendForReviewRow(null)
                        return
                      }
                      const row = pendingRows.find((r) => r.sampleAllocationId === v) ?? null
                      applySendForReviewRow(row)
                    }}
                  >
                    <SelectTrigger
                      id="review-section"
                      aria-label="Select section code"
                      className={cn(limsFieldClass, 'w-full')}
                    >
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
                    <p className="text-xs text-stone-600">No sections in the current list. Adjust search or filters.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="review-department"
                    className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                  >
                    Department
                  </Label>
                  <Select
                    value={reviewDepartment}
                    onValueChange={(v) => {
                      setReviewDepartment(v)
                      setReviewDesignation('')
                      setReviewEmployeeId('')
                    }}
                    disabled={!sendForReviewRow}
                  >
                    <SelectTrigger
                      id="review-department"
                      aria-label="Select department"
                      className={cn(limsFieldClass, 'w-full')}
                    >
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
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="review-designation"
                    className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                  >
                    Designation
                  </Label>
                  <Select
                    value={reviewDesignation}
                    onValueChange={(v) => {
                      setReviewDesignation(v)
                      setReviewEmployeeId('')
                    }}
                    disabled={!sendForReviewRow || !reviewDepartment}
                  >
                    <SelectTrigger
                      id="review-designation"
                      aria-label="Select designation"
                      className={cn(limsFieldClass, 'w-full')}
                    >
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
                  <Label
                    htmlFor="review-employee"
                    className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
                  >
                    Name of Employee
                  </Label>
                  <Select
                    value={reviewEmployeeId}
                    onValueChange={setReviewEmployeeId}
                    disabled={
                      !sendForReviewRow || !reviewDesignation || reviewUsersLoading || reviewUsers.length === 0
                    }
                  >
                    <SelectTrigger
                      id="review-employee"
                      aria-label="Select employee"
                      className={cn(limsFieldClass, 'w-full')}
                    >
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
              </div>
              {reviewSubmitError ? <p className="text-sm text-red-700">{reviewSubmitError}</p> : null}
            </div>
            <DialogFooter className="gap-2 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 sm:justify-end">
              <Button
                type="button"
                className={limsDarkBarBtnClass}
                onClick={() => setSendForReviewOpen(false)}
                disabled={reviewSubmitLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className={limsPrimaryBtnClass}
                disabled={!sendForReviewRow || !reviewEmployeeId || reviewSubmitLoading}
              >
                {reviewSubmitLoading ? 'Sending…' : 'Send for Review'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
