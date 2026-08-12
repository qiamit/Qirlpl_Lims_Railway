import { useCallback, useEffect, useMemo, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { useAuth } from '@/hooks/useAuth'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  nextCalibrationJobStage,
  previousCalibrationJobStage,
  type CalibrationJobLocation,
  type CalibrationJobRow,
  type CalibrationJobStage,
} from '../types'
import {
  deleteCalibrationJobs,
  fetchCalibrationEngineerOptions,
  fetchCalibrationJobsByStage,
  fetchUserProfileBrief,
  moveCalibrationJobsToNextStage,
  moveCalibrationJobsToPreviousStage,
  referbackCalibrationJobsToServiceRequest,
  stampRawDataSheetReviewed,
  updateCalibrationJobDesignation,
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
  const [actionLoading, setActionLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedSrfIds, setSelectedSrfIds] = useState<Set<string>>(() => new Set())
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')

  const isConduct = stage === 'calibration_conduct'
  const isReviewData = stage === 'review_data'
  const isCertificatePrep = stage === 'certificate_preparation'
  /** Review Data + Certificate Prep list one row per DUC (not SRF-grouped). */
  const isPerJobStage = isReviewData || isCertificatePrep
  const isOutsideConduct = isConduct && locationFilter === 'On Site'
  const scopeConductToEngineer =
    isConduct && !canViewAllCalibrationConductJobs(designation)

  const loadRows = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      if (stage === 'calibration_conduct' && !profileReady) {
        setRows([])
        return
      }

      const data = await fetchCalibrationJobsByStage(stage, {
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
          const allInStage = await fetchCalibrationJobsByStage(stage, {
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
  }, [stage])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const hay = [
        r.srf_number,
        r.srf_date ?? '',
        r.required_completion_date ?? '',
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
  const prevStage = previousCalibrationJobStage(stage)

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
    // Review: only move jobs still at review_data
    const idsToMove = isReviewData
      ? jobIds.filter((id) => rows.find((r) => r.id === id)?.stage === 'review_data')
      : jobIds
    if (idsToMove.length === 0) {
      return
    }
    const blockMsg =
      assertEngineersAssignedForForward(idsToMove) ??
      assertInwardChecklistForOutsideForward(idsToMove)
    if (blockMsg) {
      window.alert(blockMsg)
      return
    }
    setActionLoading(true)
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
      const { moved } = await moveCalibrationJobsToNextStage(idsToMove)
      if (moved > 0) {
        const movedSet = new Set(idsToMove)
        setRows((prev) => prev.filter((r) => !movedSet.has(r.id)))
      }
      setSelectedSrfIds(new Set())
      setSelectedJobIds(new Set())
      await loadRows()
    } catch (err) {
      window.alert(formatError(err))
    } finally {
      setActionLoading(false)
    }
  }

  const moveJobsReferback = async (jobIds: string[]) => {
    if (jobIds.length === 0) return
    if (stage === 'job_allocation') {
      setActionLoading(true)
      try {
        await referbackCalibrationJobsToServiceRequest(jobIds)
        setSelectedSrfIds(new Set())
        setSelectedJobIds(new Set())
        await loadRows()
      } catch (err) {
        window.alert(formatError(err))
      } finally {
        setActionLoading(false)
      }
      return
    }

    if (!prevStage) return
    setActionLoading(true)
    try {
      await moveCalibrationJobsToPreviousStage(jobIds)
      setSelectedSrfIds(new Set())
      setSelectedJobIds(new Set())
      await loadRows()
    } catch (err) {
      window.alert(formatError(err))
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

  const selectedActionJobIds = (): string[] => {
    if (isConduct || isPerJobStage) return [...selectedJobIds]
    return [...selectedSrfIds].flatMap((srfId) => jobIdsForSrf(srfId))
  }

  const handlePrintSelected = () => {
    const jobIds = selectedActionJobIds()
    const source = jobIds.length > 0 ? filteredRows.filter((r) => jobIds.includes(r.id)) : filteredRows
    if (source.length === 0) return
    const esc = (v: string) =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const cards = source
      .map(
        (r) => `
        <section style="border:1px solid #e7eaf0;border-radius:12px;padding:14px;margin-bottom:12px">
          <h2 style="margin:0 0 8px">${esc(r.srf_number || '—')}</h2>
          <p><b>Client:</b> ${esc(r.client_name || '—')}</p>
          <p><b>Equipment:</b> ${esc(r.equipment_label || '—')}</p>
          <p><b>Location:</b> ${esc(r.calibration_location || '—')}</p>
          <p><b>Engineer:</b> ${esc(r.allocated_engineer_name || '—')}</p>
        </section>`,
      )
      .join('')
    const w = window.open('', '_blank')
    if (!w) return
    w.document.open()
    w.document.write(
      `<!doctype html><html><head><title>Calibration Jobs</title></head><body style="font-family:sans-serif;padding:24px">${cards}<script>window.onload=function(){setTimeout(function(){window.print()},200)}</script></body></html>`,
    )
    w.document.close()
  }

  const handleDeleteSelected = async () => {
    const ids = selectedActionJobIds()
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} selected job(s)?`)) return
    setActionLoading(true)
    try {
      if (stage === 'job_allocation') {
        await referbackCalibrationJobsToServiceRequest(ids)
      } else {
        await deleteCalibrationJobs(ids)
      }
      setSelectedSrfIds(new Set())
      setSelectedJobIds(new Set())
      await loadRows()
    } catch (err) {
      window.alert(formatError(err))
    } finally {
      setActionLoading(false)
    }
  }

  const handleLocationChange = async (id: string, location: CalibrationJobLocation) => {
    try {
      await updateCalibrationJobLocation(id, location)
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, calibration_location: location } : r)),
      )
    } catch (err) {
      window.alert(formatError(err))
    }
  }

  const handleEngineerChange = async (
    id: string,
    engineerId: string | null,
    engineerName: string | null,
  ) => {
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
      window.alert(formatError(err))
    }
  }

  const handleDesignationChange = async (id: string, designation: string) => {
    try {
      await updateCalibrationJobDesignation(id, designation)
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, allocated_engineer_designation: designation.trim() || null } : r,
        ),
      )
    } catch (err) {
      window.alert(formatError(err))
    }
  }

  return (
    <div className={limsPageShellClass}>
      <CalibrationJobStageHeaderBar
        stage={stage}
        titleOverride={titleOverride}
        locationFilter={locationFilter}
        search={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onForwardedChanged={() => {
          void loadRows()
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
          onDesignationChange={stage === 'job_allocation' ? handleDesignationChange : undefined}
          onForward={handleForwardGroup}
          onReferback={handleReferbackGroup}
          actionLoading={actionLoading}
          scopedToEngineer={scopeConductToEngineer}
        />
      )}
      <CalibrationJobStageFooterBar
        loading={listLoading || actionLoading}
        selectedCount={isConduct || isPerJobStage ? selectedJobIds.size : selectedSrfIds.size}
        page={safePage}
        pageCount={pageCount}
        onPrintSelected={handlePrintSelected}
        onDeleteSelected={() => void handleDeleteSelected()}
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
