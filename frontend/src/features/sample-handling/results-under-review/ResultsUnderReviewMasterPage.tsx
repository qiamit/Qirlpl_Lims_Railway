import { useEffect, useMemo, useRef, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import { formatSupabaseError } from '@/lib/formatSupabaseError'
import { isSupabaseMissingColumnError } from '@/lib/supabaseErrors'
import type { TestAllocationRow } from '../types'
import { ResultsUnderReviewTable } from './ResultsUnderReviewTable'
import { ResultsUnderReviewHeaderBar } from './ResultsUnderReviewHeaderBar'
import { ResultsUnderReviewFooterBar } from './ResultsUnderReviewFooterBar'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import { canDeleteSampleHandlingRecords, isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  confirmDestructiveDelete,
  deleteTestAllocationsForSections,
} from '@/features/sample-handling/shared/deleteSampleRecords'
import { loadResultsUnderReviewRowsForDirector } from './loadResultsUnderReviewRowsForDirector'
import { resolveUserDepartment } from '@/features/sample-handling/shared/resolveUserDepartment'
import { ensureTestAllocationParameterRows } from '@/features/sample-handling/shared/ensureTestAllocationParameterRows'
import { ResultsUnderReviewReferbackDialog } from './ResultsUnderReviewReferbackDialog'
import { TestParameterViewDialog } from '../shared/TestParameterViewDialog'
import { SectionResultsEntryDialog } from '../sample-under-testing/SectionResultsEntryDialog'
import { SectionSampleDescViewDialog } from '../shared/SectionSampleDescViewDialog'
import {
  isSectionAssignedToResultsReviewer,
  partitionResultsUnderReviewRows,
  RESULTS_REVIEW_STATUS_APPROVED,
} from './resultsUnderReviewPartitions'
import {
  isSampleReadyForReportPreparation,
  sampleStillHasResultsInReview,
  syncSampleReportPreparationStage,
  syncSampleReportPreparationStages,
} from '@/features/sample-handling/report-preparation/sampleReportReadiness'

export default function ResultsUnderReviewMasterPage() {
  const { user, profileName, designation, departmentName, profileReady } = useAuth()
  const [rows, setRows] = useState<TestAllocationRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [jumpTo, setJumpTo] = useState('')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [sampleDescViewRow, setSampleDescViewRow] = useState<TestAllocationRow | null>(null)
  const showDelete = canDeleteSampleHandlingRecords(designation)
  const isDirector = isLaboratoryDirector(designation)

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

  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [reviewDialogRow, setReviewDialogRow] = useState<TestAllocationRow | null>(null)

  const [referbackDialogOpen, setReferbackDialogOpen] = useState(false)
  const [referbackRow, setReferbackRow] = useState<TestAllocationRow | null>(null)
  const [referbackSubmitLoading, setReferbackSubmitLoading] = useState(false)
  const [referbackSubmitError, setReferbackSubmitError] = useState<string | null>(null)
  const stageSyncGenerationRef = useRef(0)

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
      // Laboratory Director — all sections in results-review workflow.
      if (isDirector) {
        const list = await loadResultsUnderReviewRowsForDirector()
        setRows(list)
        void refreshRowsAfterStageSync(list, undefined)
        return
      }

      // Others — only sections allotted to them via Send for Review (employee).
      const userDept = (await resolveUserDepartment(user, departmentName))?.trim() || null
      const scope = {
        department: userDept,
        designation: designation?.trim() || null,
        reviewerUserId: user.id,
      }
      const list = await loadResultsUnderReviewRowsForDirector(scope)
      setRows(list)
      void refreshRowsAfterStageSync(list, scope)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load results for review')
    } finally {
      setListLoading(false)
    }
  }

  const refreshRowsAfterStageSync = async (
    initialList: TestAllocationRow[],
    scope?: { department: string | null; designation: string | null; reviewerUserId: string },
  ) => {
    const sampleIds = [
      ...new Set(initialList.map((r) => r.sampleId?.trim()).filter(Boolean)),
    ] as string[]
    if (sampleIds.length === 0) return
    const generation = ++stageSyncGenerationRef.current
    try {
      const { toPrep, toReview, changedIds } = await syncSampleReportPreparationStages(sampleIds)
      if (generation !== stageSyncGenerationRef.current) return
      if (changedIds.length === 0) return

      // Samples moved to report prep can be dropped locally — avoid a second full list fetch.
      if (toPrep.length > 0 && toReview.length === 0) {
        const prepSet = new Set(toPrep)
        setRows((prev) => prev.filter((r) => !prepSet.has(r.sampleId?.trim() ?? '')))
        return
      }

      const refreshed = await loadResultsUnderReviewRowsForDirector(scope)
      if (generation !== stageSyncGenerationRef.current) return
      setRows(refreshed)
    } catch {
      /* keep initial list visible */
    }
  }

  useEffect(() => {
    if (!profileReady) return
    void loadRows()
    // pathname omitted — remount already reloads; avoids extra sync on unrelated route noise
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, departmentName, designation, profileReady])

  /** Non-directors only see sections allotted to them as results reviewer. */
  const rowsForAssignmentFilter = useMemo(() => {
    if (isDirector || !user?.id) return rows
    return rows.filter((r) =>
      isSectionAssignedToResultsReviewer(r, user.id, profileName ?? ''),
    )
  }, [rows, isDirector, user?.id, profileName])

  const { pending: pendingRows, reviewed: reviewedRows } = useMemo(
    () => partitionResultsUnderReviewRows(rowsForAssignmentFilter),
    [rowsForAssignmentFilter],
  )

  const filteredPendingRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return pendingRows
    return pendingRows.filter(
      (r) =>
        [
          r.sectionCode,
          r.srfNumber,
          r.isCodeLabel,
          r.testParameterSummary,
          r.results,
          r.sampleDescription,
          r.declaredValue,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
    )
  }, [pendingRows, search])

  const pageCount = Math.max(1, Math.ceil(filteredPendingRows.length / pageSize))
  const pagedRows = useMemo(
    () => filteredPendingRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredPendingRows, page, pageSize],
  )

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount))
  }, [pageCount])

  useEffect(() => {
    setPage(1)
  }, [search, pageSize])

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

  const clearSectionReviewAssignment = async (testAllocationId: string) => {
    const { error } = await supabase
      .from('test_allocation_parameters')
      .update({
        results_reviewer_id: null,
        results_reviewer_name: null,
        results_review_status: null,
      })
      .eq('test_allocation_id', testAllocationId)
    if (error) throw error
  }

  const markSectionResultsApproved = async (testAllocationId: string) => {
    // Keep reviewer id/name; approval goes in results_review_status only
    const { error } = await supabase
      .from('test_allocation_parameters')
      .update({
        results_review_status: RESULTS_REVIEW_STATUS_APPROVED,
      })
      .eq('test_allocation_id', testAllocationId)
    if (error) throw error
  }

  const openReferbackDialog = (row: TestAllocationRow) => {
    setReferbackSubmitError(null)
    setReferbackRow(row)
    setReferbackDialogOpen(true)
  }

  const submitReferbackToUnderTesting = async (employee: {
    id: string
    name: string
    designation: string
  }) => {
    const row = referbackRow
    if (!row) return
    const testAllocationId = row.testAllocationId?.trim()
    const sampleAllocationId = row.sampleAllocationId?.trim()
    const sampleId = row.sampleId?.trim()
    if (!testAllocationId || !sampleAllocationId || !sampleId) {
      setReferbackSubmitError('Missing section data for refer back.')
      return
    }

    setReferbackSubmitLoading(true)
    setReferbackSubmitError(null)
    try {
      const { data: sectionTaRows, error: sectionTaErr } = await supabase
        .from('test_allocations')
        .select('id')
        .eq('sample_allocation_id', sampleAllocationId)
      if (sectionTaErr) throw sectionTaErr

      const sectionTaIds = (Array.isArray(sectionTaRows) ? sectionTaRows : [])
        .map((r) => String((r as { id?: string }).id ?? '').trim())
        .filter(Boolean)

      await ensureTestAllocationParameterRows(testAllocationId)

      if (sectionTaIds.length > 0) {
        const { error: clearErr } = await supabase
          .from('test_allocation_parameters')
          .update({
            results_reviewer_id: null,
            results_reviewer_name: null,
            results_review_status: null,
          })
          .in('test_allocation_id', sectionTaIds)
        if (clearErr) throw clearErr
      }

      const taPatch: Record<string, unknown> = {
        sent_for_testing: true,
        assigned_employee_id: employee.id,
        assigned_employee_name: employee.name,
        referred_back_from_review: true,
      }
      let { error: taErr } = await supabase
        .from('test_allocations')
        .update(taPatch)
        .eq('sample_allocation_id', sampleAllocationId)
      if (taErr && isSupabaseMissingColumnError(taErr, 'referred_back_from_review')) {
        const { referred_back_from_review: _drop, ...fallback } = taPatch
        void _drop
        const retry = await supabase
          .from('test_allocations')
          .update(fallback)
          .eq('sample_allocation_id', sampleAllocationId)
        taErr = retry.error
      }
      if (taErr) throw taErr

      const nextDesignation = employee.designation?.trim()
      if (nextDesignation) {
        const { error: allocErr } = await supabase
          .from('sample_allocations')
          .update({ designation: nextDesignation })
          .eq('id', sampleAllocationId)
        if (allocErr) throw allocErr
      }

      const stillInReviewWorkflow = await sampleStillHasResultsInReview(sampleId)
      if (stillInReviewWorkflow) {
        await syncSampleReportPreparationStage(sampleId)
        const { error: flagErr } = await supabase
          .from('samples')
          .update({ referback_from_allocation: false })
          .eq('id', sampleId)
        if (flagErr) throw flagErr
      } else {
        const { error: stageErr } = await supabase
          .from('samples')
          .update({ stage: 'under_testing', referback_from_allocation: false })
          .eq('id', sampleId)
        if (stageErr) throw stageErr
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

      await ensureTestAllocationParameterRows(testAllocationId)
      await markSectionResultsApproved(testAllocationId)
      await syncSampleReportPreparationStage(sampleId)

      const ready = await isSampleReadyForReportPreparation(sampleId)
      setSaveMessage(
        ready
          ? `Section ${row.sectionCode} approved. All sections reviewed — SRF ready for Test Report Preparation.`
          : `Section ${row.sectionCode} approved. Other section(s) on this SRF are still pending review.`,
      )
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    }
  }

  return (
    <div className={limsPageShellClass}>
      <ResultsUnderReviewHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        assistantRows={filteredPendingRows}
        reviewedRows={reviewedRows}
      />

      <ResultsUnderReviewTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        onReferback={openReferbackDialog}
        onApproved={handleApproved}
        onOpenReviewResults={(row) => {
          setReviewDialogRow(row)
          setReviewDialogOpen(true)
        }}
        onViewSampleDetails={setSampleDescViewRow}
        showSelection={showDelete}
        selectedIds={selectedIds}
        onToggleSelection={toggleRow}
        onToggleAllSelection={toggleAllOnPage}
        groupBySrf
        reviewScopeRows={filteredPendingRows}
        emptyStateMessage={
          reviewedRows.length > 0
            ? 'No sections pending review. Open Results Reviewed in the header to view approved SRFs.'
            : isDirector
              ? 'No sections pending results review. Items appear when testing sends results for review.'
              : 'No sections allotted to you for review. Items appear here after Sample Under Testing sends results to your Department / Designation / Employee.'
        }
      />

      <SectionSampleDescViewDialog
        row={sampleDescViewRow}
        open={sampleDescViewRow !== null}
        onOpenChange={(open) => {
          if (!open) setSampleDescViewRow(null)
        }}
      />

      <SectionResultsEntryDialog
        open={reviewDialogOpen}
        onOpenChange={(open) => {
          setReviewDialogOpen(open)
          if (!open) setReviewDialogRow(null)
        }}
        row={reviewDialogRow}
        readOnly
        readOnlyTitle="Review Results"
        onSave={async () => {}}
        onViewTestParameter={
          reviewDialogRow
            ? (testLabel) => void handleViewTestParameter(reviewDialogRow, testLabel)
            : undefined
        }
      />

      <ResultsUnderReviewFooterBar
        page={page}
        pageCount={pageCount}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJump={() => {
          const n = Number(jumpTo)
          if (Number.isFinite(n) && n > 0) {
            setPage(Math.min(pageCount, Math.max(1, Math.floor(n))))
          }
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

      <TestParameterViewDialog
        open={testParamViewOpen}
        onOpenChange={setTestParamViewOpen}
        label={testParamViewLabel}
        parameters={testParamViewData}
        extras={testParamViewExtras}
        sectionParameters={testParamViewRow?.parameters}
        sectionCode={testParamViewRow?.sectionCode}
      />

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
