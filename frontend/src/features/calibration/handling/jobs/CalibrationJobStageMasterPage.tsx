import { useCallback, useEffect, useMemo, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { useAuth } from '@/hooks/useAuth'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  CALIBRATION_JOB_STAGE_LABELS,
  nextCalibrationJobStage,
  previousCalibrationJobStage,
  type CalibrationJobLocation,
  type CalibrationJobRow,
  type CalibrationJobStage,
} from '../types'
import {
  fetchCalibrationEngineerOptions,
  fetchCalibrationJobsByStage,
  fetchUserProfileBrief,
  moveCalibrationJobsToNextStage,
  moveCalibrationJobsToPreviousStage,
  referbackCalibrationJobsToServiceRequest,
  stampRawDataSheetReviewed,
  updateCalibrationJobEngineer,
  updateCalibrationJobLocation,
  type CalibrationEngineerOption,
} from './calibrationJobApi'
import { CalibrationJobStageHeaderBar } from './CalibrationJobStageHeaderBar'
import {
  CalibrationJobStageTable,
  groupCalibrationJobsBySrf,
  type CalibrationSrfGroup,
} from './CalibrationJobStageTable'
import { CalibrationConductTable } from './CalibrationConductTable'
import { CalibrationJobStageFooterBar } from './CalibrationJobStageFooterBar'
import {
  isChecklistCompleted,
  parseConductOutsideChecklist,
  type ConductOutsideChecklistKind,
  type ConductOutsideChecklistPayload,
} from './conductOutsideChecklist'

function formatError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  return (err as { message?: string }).message ?? 'Unknown error'
}

/** Supervisors see all Conduct jobs; engineers see only jobs allocated to them. */
function canViewAllCalibrationConductJobs(designation: string | null | undefined): boolean {
  if (isLaboratoryDirector(designation)) return true
  const d = designation?.trim().toLowerCase() ?? ''
  return (
    d.includes('technical manager') ||
    d.includes('quality manager') ||
    d === 'sample incharge'
  )
}

function jobAssignedToCurrentUser(
  job: CalibrationJobRow,
  userId: string | undefined,
  profileName: string,
): boolean {
  if (userId && job.allocated_engineer_id === userId) return true
  const mine = profileName.trim().toLowerCase()
  const assigned = (job.allocated_engineer_name ?? '').trim().toLowerCase()
  return Boolean(mine && assigned && mine === assigned)
}

export function CalibrationJobStageMasterPage({
  stage,
  locationFilter,
  titleOverride,
}: {
  stage: CalibrationJobStage
  /** When set (Conduct Inside/Outside), only jobs with this location are listed. */
  locationFilter?: CalibrationJobLocation
  titleOverride?: string
}) {
  const { user, designation, profileName, profileReady } = useAuth()
  const [rows, setRows] = useState<CalibrationJobRow[]>([])
  const [engineers, setEngineers] = useState<CalibrationEngineerOption[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedSrfIds, setSelectedSrfIds] = useState<Set<string>>(() => new Set())
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [jumpTo, setJumpTo] = useState('')

  const isConduct = stage === 'calibration_conduct'
  const isReviewData = stage === 'review_data'
  const isCertificatePrep = stage === 'certificate_preparation'
  /** Review Data + Certificate Prep list one row per DUC (not SRF-grouped). */
  const isPerJobStage = isReviewData || isCertificatePrep
  const isOutsideConduct = isConduct && locationFilter === 'On Site'
  const scopeConductToEngineer =
    isConduct && !canViewAllCalibrationConductJobs(designation)

  /** Review Data keeps forwarded jobs visible until Cert Prep referback (or further forward). */
  const listStages = useMemo(
    (): CalibrationJobStage | CalibrationJobStage[] =>
      stage === 'review_data' ? ['review_data', 'certificate_preparation'] : stage,
    [stage],
  )

  const loadRows = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      if (stage === 'calibration_conduct' && !profileReady) {
        setRows([])
        return
      }

      const data = await fetchCalibrationJobsByStage(listStages, {
        ...(scopeConductToEngineer && user?.id
          ? { allocatedEngineerId: user.id }
          : {}),
        ...(locationFilter ? { calibrationLocation: locationFilter } : {}),
      })

      if (scopeConductToEngineer && user?.id) {
        const byId = data.filter((j) => j.allocated_engineer_id === user.id)
        if (byId.length > 0) {
          setRows(byId)
        } else {
          const allInStage = await fetchCalibrationJobsByStage(listStages, {
            ...(locationFilter ? { calibrationLocation: locationFilter } : {}),
          })
          setRows(allInStage.filter((j) => jobAssignedToCurrentUser(j, user.id, profileName)))
        }
      } else {
        setRows(data)
      }
    } catch (err) {
      setListError(formatError(err))
      setRows([])
    } finally {
      setListLoading(false)
    }
  }, [
    stage,
    listStages,
    scopeConductToEngineer,
    user?.id,
    profileName,
    profileReady,
    locationFilter,
  ])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  useEffect(() => {
    if (stage !== 'job_allocation') {
      setEngineers([])
      return
    }
    void fetchCalibrationEngineerOptions()
      .then(setEngineers)
      .catch(() => setEngineers([]))
  }, [stage])

  useEffect(() => {
    setSelectedSrfIds(new Set())
    setSelectedJobIds(new Set())
    setPage(1)
    setSearch('')
    setActionMessage(null)
  }, [stage])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const hay = [
        r.srf_number,
        r.client_name ?? '',
        r.equipment_label,
        r.equipment_detail,
        r.calibration_location,
        r.allocated_engineer_name ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [rows, search])

  const filteredGroups = useMemo(
    () => groupCalibrationJobsBySrf(filteredRows),
    [filteredRows],
  )

  const listTotal = isConduct || isPerJobStage ? filteredRows.length : filteredGroups.length
  const pageCount = Math.max(1, Math.ceil(listTotal / pageSize))
  const safePage = Math.min(page, pageCount)

  const pagedGroups = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredGroups.slice(start, start + pageSize)
  }, [filteredGroups, safePage, pageSize])

  const pagedJobs = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, safePage, pageSize])

  /** Per-job stages list one row per DUC; still pass SRF groups built from the job page. */
  const pagedPerJobGroups = useMemo(
    () => (isPerJobStage ? groupCalibrationJobsBySrf(pagedJobs) : pagedGroups),
    [isPerJobStage, pagedJobs, pagedGroups],
  )

  const nextStage = nextCalibrationJobStage(stage)
  const nextStageLabel = nextStage ? CALIBRATION_JOB_STAGE_LABELS[nextStage] : null
  const prevStage = previousCalibrationJobStage(stage)
  const prevStageLabel = prevStage
    ? CALIBRATION_JOB_STAGE_LABELS[prevStage]
    : stage === 'job_allocation'
      ? 'Service Request'
      : null

  const jobIdsForSrf = (serviceRequestId: string): string[] =>
    filteredGroups.find((g) => g.serviceRequestId === serviceRequestId)?.jobs.map((j) => j.id) ??
    rows.filter((r) => (r.service_request_id || r.srf_number) === serviceRequestId).map((r) => r.id)

  const toggleSrf = (serviceRequestId: string) => {
    setSelectedSrfIds((prev) => {
      const next = new Set(prev)
      if (next.has(serviceRequestId)) next.delete(serviceRequestId)
      else next.add(serviceRequestId)
      return next
    })
  }

  const toggleAllSrfOnPage = (checked: boolean) => {
    const pageGroups = isPerJobStage ? pagedPerJobGroups : pagedGroups
    setSelectedSrfIds((prev) => {
      const next = new Set(prev)
      if (!checked) pageGroups.forEach((g) => next.delete(g.serviceRequestId))
      else pageGroups.forEach((g) => next.add(g.serviceRequestId))
      return next
    })
  }

  const toggleJob = (id: string) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllJobsOnPage = (checked: boolean) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev)
      if (!checked) pagedJobs.forEach((j) => next.delete(j.id))
      else pagedJobs.forEach((j) => next.add(j.id))
      return next
    })
  }

  const assertEngineersAssignedForForward = (jobIds: string[]): string | null => {
    if (stage !== 'job_allocation') return null
    const jobs = rows.filter((r) => jobIds.includes(r.id))
    const missing = jobs.filter((j) => !j.allocated_engineer_id && !j.allocated_engineer_name?.trim())
    if (missing.length === 0) return null
    return `Assign an Engineer to all DUCs before Forward (${missing.length} missing). Open View (DUC) and select engineer.`
  }

  const assertInwardChecklistForOutsideForward = (jobIds: string[]): string | null => {
    if (!isOutsideConduct) return null
    const jobs = rows.filter((r) => jobIds.includes(r.id))
    const incomplete = jobs.filter(
      (j) => !isChecklistCompleted(parseConductOutsideChecklist(j.inward_checklist, 'inward')),
    )
    if (incomplete.length === 0) return null
    return `Complete Inward Checklist before Forward (${incomplete.length} job(s) pending).`
  }

  const moveJobsForward = async (jobIds: string[]) => {
    if (jobIds.length === 0 || !nextStage) return
    // Review: only move jobs still at review_data (already-forwarded stay listed, Forward disabled)
    const idsToMove = isReviewData
      ? jobIds.filter((id) => rows.find((r) => r.id === id)?.stage === 'review_data')
      : jobIds
    if (idsToMove.length === 0) {
      setActionMessage(
        isReviewData
          ? 'Selected job(s) are already forwarded to Certificate Preparation.'
          : 'Nothing forwarded.',
      )
      return
    }
    const blockMsg =
      assertEngineersAssignedForForward(idsToMove) ??
      assertInwardChecklistForOutsideForward(idsToMove)
    if (blockMsg) {
      setActionMessage(blockMsg)
      return
    }
    setActionLoading(true)
    setActionMessage(null)
    try {
      if (isReviewData && user?.id) {
        const profile =
          (await fetchUserProfileBrief(user.id).catch(() => null)) ?? {
            id: user.id,
            name: profileName.trim() || user.email || user.id,
            designation: designation.trim(),
          }
        await Promise.all(
          idsToMove.map((id) =>
            stampRawDataSheetReviewed(id, {
              userId: profile.id,
              name: profile.name,
              designation: profile.designation,
            }).catch(() => undefined),
          ),
        )
      }
      const { moved, skippedTerminal } = await moveCalibrationJobsToNextStage(idsToMove)
      setActionMessage(
        moved > 0
          ? `Forwarded ${moved} DUC job(s) to ${CALIBRATION_JOB_STAGE_LABELS[nextStage]}.${
              stage === 'job_allocation'
                ? ' Assigned engineers can open Calibration Conduct.'
                : ''
            }`
          : skippedTerminal > 0
            ? 'Selected jobs are already at the final stage.'
            : 'Nothing forwarded.',
      )
      setSelectedSrfIds(new Set())
      setSelectedJobIds(new Set())
      await loadRows()
    } catch (err) {
      setActionMessage(formatError(err))
    } finally {
      setActionLoading(false)
    }
  }

  const moveJobsReferback = async (jobIds: string[]) => {
    if (jobIds.length === 0) return
    if (stage === 'job_allocation') {
      setActionLoading(true)
      setActionMessage(null)
      try {
        const { removed, srfReopened } = await referbackCalibrationJobsToServiceRequest(jobIds)
        setActionMessage(
          removed > 0
            ? `Referred back ${removed} DUC job(s) to Service Request.${
                srfReopened > 0
                  ? ` ${srfReopened} SRF(s) set to Under Review.`
                  : ''
              }`
            : 'Nothing referred back.',
        )
        setSelectedSrfIds(new Set())
        setSelectedJobIds(new Set())
        await loadRows()
      } catch (err) {
        setActionMessage(formatError(err))
      } finally {
        setActionLoading(false)
      }
      return
    }

    if (!prevStage) return
    setActionLoading(true)
    setActionMessage(null)
    try {
      const { moved, skippedFirst } = await moveCalibrationJobsToPreviousStage(jobIds)
      setActionMessage(
        moved > 0
          ? `Referred back ${moved} DUC job(s) to ${CALIBRATION_JOB_STAGE_LABELS[prevStage]}.${
              skippedFirst > 0 ? ` ${skippedFirst} already at first stage.` : ''
            }`
          : skippedFirst > 0
            ? 'Selected jobs are already at Job Allocation (first stage).'
            : 'Nothing referred back.',
      )
      setSelectedSrfIds(new Set())
      setSelectedJobIds(new Set())
      await loadRows()
    } catch (err) {
      setActionMessage(formatError(err))
    } finally {
      setActionLoading(false)
    }
  }

  const handleForwardGroup = (group: CalibrationSrfGroup) => {
    void moveJobsForward(group.jobs.map((j) => j.id))
  }

  const handleReferbackGroup = (group: CalibrationSrfGroup) => {
    void moveJobsReferback(group.jobs.map((j) => j.id))
  }

  const handleForwardJob = (job: CalibrationJobRow) => {
    void moveJobsForward([job.id])
  }

  const handleReferbackJob = (job: CalibrationJobRow) => {
    void moveJobsReferback([job.id])
  }

  const handleChecklistSaved = (
    jobId: string,
    kind: ConductOutsideChecklistKind,
    payload: ConductOutsideChecklistPayload,
  ) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== jobId) return r
        if (kind === 'outgoing') return { ...r, outgoing_checklist: payload }
        return { ...r, inward_checklist: payload }
      }),
    )
    setActionMessage(
      kind === 'outgoing'
        ? payload.completed
          ? 'Outgoing Checklist completed. Raw Data Sheet is now available.'
          : 'Outgoing Checklist draft saved.'
        : payload.completed
          ? 'Inward Checklist completed. Forward is now available.'
          : 'Inward Checklist draft saved.',
    )
  }

  const handleLocationOfCalibrationSaved = (
    jobId: string,
    locationOfCalibration: string,
  ) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === jobId ? { ...r, location_of_calibration: locationOfCalibration } : r,
      ),
    )
  }

  const handleBulkForward = async () => {
    if (isConduct) {
      await moveJobsForward([...selectedJobIds])
      return
    }
    const ids = [...selectedSrfIds].flatMap((srfId) => jobIdsForSrf(srfId))
    await moveJobsForward(ids)
  }

  const selectedJobsReadyForOutsideForward =
    !isOutsideConduct ||
    [...selectedJobIds].every((id) => {
      const job = rows.find((r) => r.id === id)
      if (!job) return false
      return isChecklistCompleted(parseConductOutsideChecklist(job.inward_checklist, 'inward'))
    })

  const handleBulkReferback = async () => {
    if (isConduct) {
      await moveJobsReferback([...selectedJobIds])
      return
    }
    const ids = [...selectedSrfIds].flatMap((srfId) => jobIdsForSrf(srfId))
    await moveJobsReferback(ids)
  }

  const handleLocationChange = async (id: string, location: CalibrationJobLocation) => {
    setActionMessage(null)
    try {
      await updateCalibrationJobLocation(id, location)
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, calibration_location: location } : r)),
      )
    } catch (err) {
      setActionMessage(formatError(err))
    }
  }

  const handleEngineerChange = async (
    id: string,
    engineerId: string | null,
    engineerName: string | null,
  ) => {
    setActionMessage(null)
    try {
      await updateCalibrationJobEngineer(id, { id: engineerId, name: engineerName })
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                allocated_engineer_id: engineerId,
                allocated_engineer_name: engineerName,
              }
            : r,
        ),
      )
    } catch (err) {
      setActionMessage(formatError(err))
    }
  }

  return (
    <div className={limsPageShellClass}>
      <CalibrationJobStageHeaderBar
        stage={stage}
        titleOverride={titleOverride}
        search={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
      />
      {isConduct ? (
        <CalibrationConductTable
          rows={pagedJobs}
          loading={listLoading || !profileReady}
          error={listError}
          searchActive={search.trim().length > 0}
          selectedIds={selectedJobIds}
          onToggle={toggleJob}
          onToggleAll={toggleAllJobsOnPage}
          onForward={handleForwardJob}
          onReferback={handleReferbackJob}
          onChecklistSaved={isOutsideConduct ? handleChecklistSaved : undefined}
          onLocationOfCalibrationSaved={handleLocationOfCalibrationSaved}
          actionLoading={actionLoading}
          scopedToEngineer={scopeConductToEngineer}
          showOutsideChecklists={isOutsideConduct}
          locationFilterLabel={
            locationFilter === 'In Lab'
              ? 'Inside'
              : locationFilter === 'On Site'
                ? 'Outside'
                : undefined
          }
        />
      ) : (
        <CalibrationJobStageTable
          stage={stage}
          groups={isPerJobStage ? pagedPerJobGroups : pagedGroups}
          loading={listLoading}
          error={listError}
          searchActive={search.trim().length > 0}
          selectedSrfIds={selectedSrfIds}
          onToggleSrf={toggleSrf}
          onToggleAll={toggleAllSrfOnPage}
          engineers={engineers}
          onLocationChange={stage === 'job_allocation' ? handleLocationChange : undefined}
          onEngineerChange={stage === 'job_allocation' ? handleEngineerChange : undefined}
          onForward={handleForwardGroup}
          onReferback={handleReferbackGroup}
          actionLoading={actionLoading}
          scopedToEngineer={scopeConductToEngineer}
        />
      )}
      <CalibrationJobStageFooterBar
        message={isConduct ? null : actionMessage}
        loading={listLoading || actionLoading}
        selectedCount={isConduct ? selectedJobIds.size : selectedSrfIds.size}
        totalCount={listTotal}
        page={safePage}
        pageCount={pageCount}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        canMoveNext={
          (isConduct ? selectedJobIds.size > 0 : selectedSrfIds.size > 0) &&
          Boolean(nextStage) &&
          selectedJobsReadyForOutsideForward
        }
        nextStageLabel={nextStageLabel}
        onMoveNext={() => void handleBulkForward()}
        showBulkMove={!isPerJobStage && Boolean(nextStage)}
        showBulkActions={!isPerJobStage && !isConduct && stage !== 'certificates'}
        canReferbackBulk={
          !isPerJobStage &&
          stage !== 'certificates' &&
          (isConduct ? selectedJobIds.size > 0 : selectedSrfIds.size > 0) &&
          Boolean(prevStageLabel)
        }
        previousStageLabel={
          isPerJobStage || isConduct || stage === 'certificates' ? null : prevStageLabel
        }
        onReferbackBulk={
          isPerJobStage || isConduct || stage === 'certificates'
            ? undefined
            : () => void handleBulkReferback()
        }
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number.parseInt(jumpTo, 10)
          if (Number.isFinite(n) && n >= 1 && n <= pageCount) setPage(n)
        }}
      />
    </div>
  )
}
