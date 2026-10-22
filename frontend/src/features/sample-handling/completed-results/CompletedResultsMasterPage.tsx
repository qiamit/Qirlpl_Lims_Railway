import { useCallback, useEffect, useMemo, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { useAuth } from '@/hooks/useAuth'
import { canDeleteSampleHandlingRecords } from '@/lib/isLaboratoryDirector'
import {
  confirmDestructiveDelete,
  deleteSamplesByIds,
} from '@/features/sample-handling/shared/deleteSampleRecords'
import { supabase } from '@/lib/supabaseClient'
import { isSupabaseMissingColumnError } from '@/lib/supabaseErrors'
import { SampleSrfViewDialog } from '@/features/sample-handling/shared/SampleSrfViewDialog'
import type { ReportScopeKind } from '@/features/sample-handling/report-preparation/reportScope'
import { CompletedResultsFooterBar } from './CompletedResultsFooterBar'
import { CompletedResultsHeaderBar } from './CompletedResultsHeaderBar'
import { CompletedResultsTable } from './CompletedResultsTable'
import {
  ARCHIVE_INTEGRITY_FAILED_MESSAGE,
  IssuedReportIntegrityError,
  printIssuedTestReport,
  downloadIssuedTestReports,
  emailIssuedTestReports,
  type IssuedReportCopySource,
} from './printIssuedTestReport'
import { checkIssuedReportArchive, fetchIssuedReportArchivePresence } from './issuedReportArchive'
import type { IssuedReportArchiveStatus } from './IssuedReportArchiveBadge'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import {
  referbackIssuedTestReportToPreparation,
  referbackIssuedTestReportToResultsReview,
} from './referbackIssuedTestReport'
import { issueAndReferbackIssuedReport } from './issueAndReferbackIssuedReport'
import {
  IssuedReportAmendmentDialog,
  type IssuedReportAmendmentSubmitPayload,
} from './IssuedReportAmendmentDialog'
import { receivingReportTypeForIssueKind, type IssuedTestReportListRow } from './types'

export default function CompletedResultsMasterPage() {
  const { user, profileName, departmentName, designation } = useAuth()
  const showDelete = canDeleteSampleHandlingRecords(designation)
  const [rows, setRows] = useState<IssuedTestReportListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [archiveStatuses, setArchiveStatuses] = useState<
    Record<string, IssuedReportArchiveStatus | undefined>
  >({})

  const [srfViewOpen, setSrfViewOpen] = useState(false)
  const [srfViewRow, setSrfViewRow] = useState<IssuedTestReportListRow | null>(null)
  const [amendmentOpen, setAmendmentOpen] = useState(false)
  const [amendmentRow, setAmendmentRow] = useState<IssuedTestReportListRow | null>(null)
  const [amendmentError, setAmendmentError] = useState<string | null>(null)
  const [amendmentLoading, setAmendmentLoading] = useState(false)

  const labName = useMemo(() => {
    if (typeof window === 'undefined') return 'Laboratory'
    return window.localStorage.getItem('labSettings.labName') || 'Quality International Research & Laboratories Pvt. Ltd.'
  }, [])

  const loadList = useCallback(async () => {
    setError(null)
    setLoading(true)
    setArchiveStatuses({})
    try {
      const baseColumns =
        'id, srf_number, date_of_sample_receiving, test_report_is_code_id, test_report_number, test_report_issued_at, test_report_nabl_issued_at, test_report_non_nabl_issued_at, test_report_nabl_ulr_number, clients(company_name, email)'
      const fetchIssued = (columns: string) =>
        supabase
          .from('samples')
          .select(columns)
          .eq('stage', 'completed')
          .order('test_report_issued_at', { ascending: false, nullsFirst: false })
      // issued_by_name comes with migration 20261024100300; list without it until then.
      let { data, error: qErr } = await fetchIssued(`${baseColumns}, issued_by_name`)
      if (qErr && isSupabaseMissingColumnError(qErr, 'issued_by_name')) {
        ;({ data, error: qErr } = await fetchIssued(baseColumns))
      }
      if (qErr) throw qErr
      const list = (Array.isArray(data) ? data : []) as unknown as Array<Record<string, unknown>>

      const isIds = [
        ...new Set(
          list
            .map((r: { test_report_is_code_id?: string | null }) => r.test_report_is_code_id)
            .filter(Boolean),
        ),
      ] as string[]
      const isMap = new Map<string, string>()
      if (isIds.length > 0) {
        const { data: isData } = await supabase
          .from('is_codes')
          .select('id, is_number, revision_year')
          .in('id', isIds)
        for (const c of Array.isArray(isData) ? isData : []) {
          const row = c as { id: string; is_number?: string; revision_year?: string | null }
          const label =
            formatIsCodeLabelFromParts(row.is_number, row.revision_year) ||
            row.is_number ||
            row.id
          isMap.set(row.id, label)
        }
      }

      setRows(
        list.map((r: Record<string, unknown>) => {
          const clientsRaw = r.clients as
            | { company_name?: string; email?: string | null }
            | Array<{ company_name?: string; email?: string | null }>
            | null
          const clients = Array.isArray(clientsRaw) ? (clientsRaw[0] ?? null) : clientsRaw
          const isId = r.test_report_is_code_id as string | null
          return {
            id: r.id as string,
            srfNumber: (r.srf_number as string) ?? null,
            dateReceiving: (r.date_of_sample_receiving as string) ?? null,
            clientName: clients?.company_name ?? null,
            clientEmail: clients?.email?.trim() || null,
            isCodeId: isId,
            isCodeLabel: isId ? (isMap.get(isId) ?? null) : null,
            reportNumberBase: (r.test_report_number as string) ?? null,
            nablIssuedAt: (r.test_report_nabl_issued_at as string) ?? null,
            nonNablIssuedAt: (r.test_report_non_nabl_issued_at as string) ?? null,
            issuedAt: (r.test_report_issued_at as string) ?? null,
            nablUlrNumber: (r.test_report_nabl_ulr_number as string) ?? null,
            issuedByName: (r.issued_by_name as string | null | undefined) ?? null,
          }
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load completed results')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.srfNumber, r.clientName, r.isCodeLabel, r.reportNumberBase, r.nablUlrNumber]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  )

  // Archive badge: one cheap lookup (ids + timestamps, no snapshots) for the
  // visible page; hashing happens only on print / download / email / verify.
  useEffect(() => {
    const unknown = paged.filter((r) => archiveStatuses[r.id] === undefined)
    if (unknown.length === 0) return
    let cancelled = false
    void fetchIssuedReportArchivePresence(unknown)
      .then((presence) => {
        if (cancelled) return
        setArchiveStatuses((prev) => {
          const next = { ...prev }
          for (const r of unknown) {
            if (next[r.id] === undefined) next[r.id] = presence?.get(r.id) ? 'archived' : 'none'
          }
          return next
        })
      })
      .catch(() => {
        /* badge stays empty; print still checks the archive */
      })
    return () => {
      cancelled = true
    }
  }, [paged, archiveStatuses])

  const setArchiveStatus = (id: string, status: IssuedReportArchiveStatus) =>
    setArchiveStatuses((prev) => ({ ...prev, [id]: status }))

  const archiveStatusForSource = (source: IssuedReportCopySource): IssuedReportArchiveStatus =>
    source === 'archive' ? 'verified' : source === 'live_integrity_failed' ? 'failed' : 'none'

  const sourceNote = (source: IssuedReportCopySource) =>
    source === 'archive'
      ? ' Printed from the archived issued copy.'
      : source === 'live_no_archive'
        ? ' No archived copy on file; regenerated from current records.'
        : ' NOT THE ISSUED COPY – regenerated from current records.'

  const confirmRegenerate = (row: IssuedTestReportListRow, action: string) =>
    window.confirm(
      `${ARCHIVE_INTEGRITY_FAILED_MESSAGE} for ${row.srfNumber?.trim() || 'this SRF'}.\n\n` +
        'The stored copy of this issued report does not match its SHA-256 fingerprint, so it cannot be ' +
        'reproduced as issued. Report this to the Quality Manager.\n\n' +
        `${action} from current records instead? Every page will be marked ` +
        `"NOT THE ISSUED COPY – regenerated <date>".`,
    )

  const handleVerifyArchive = async (row: IssuedTestReportListRow) => {
    setArchiveStatus(row.id, 'checking')
    try {
      const check = await checkIssuedReportArchive(row.id, row.issuedAt)
      setArchiveStatus(
        row.id,
        check.status === 'verified' ? 'verified' : check.status === 'integrity_failed' ? 'failed' : 'none',
      )
      setSaveMessage(
        check.status === 'verified'
          ? `Archived copy of ${row.srfNumber ?? 'SRF'} matches its SHA-256 fingerprint.`
          : check.status === 'integrity_failed'
            ? `${ARCHIVE_INTEGRITY_FAILED_MESSAGE} (${row.srfNumber ?? 'SRF'}): ${check.reason}`
            : `No archived copy on file for ${row.srfNumber ?? 'SRF'}.`,
      )
    } catch (e) {
      setArchiveStatus(row.id, 'archived')
      setSaveMessage(e instanceof Error ? e.message : 'Archive check failed')
    }
  }

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.id)),
    [rows, selectedIds],
  )

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllOnPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      paged.forEach((r) => {
        if (checked) next.add(r.id)
        else next.delete(r.id)
      })
      return next
    })
  }

  useEffect(() => {
    setPage(1)
  }, [search, pageSize])

  const openViewSrf = (row: IssuedTestReportListRow) => {
    setSrfViewRow(row)
    setSrfViewOpen(true)
  }

  const handlePrintReport = async (row: IssuedTestReportListRow, scope: ReportScopeKind) => {
    setActionBusyId(row.id)
    setSaveMessage(null)
    const sentToPrint = (source: IssuedReportCopySource) =>
      setSaveMessage(
        (scope === 'nabl'
          ? `Accredited report sent to print (${row.srfNumber ?? 'SRF'}).`
          : `Non Accredited report sent to print (${row.srfNumber ?? 'SRF'}).`) + sourceNote(source),
      )
    try {
      const { source } = await printIssuedTestReport(row, scope, labName)
      setArchiveStatus(row.id, archiveStatusForSource(source))
      sentToPrint(source)
    } catch (e) {
      if (e instanceof IssuedReportIntegrityError) {
        setArchiveStatus(row.id, 'failed')
        setSaveMessage(`${ARCHIVE_INTEGRITY_FAILED_MESSAGE} (${row.srfNumber ?? 'SRF'}). Nothing was printed.`)
        if (!confirmRegenerate(row, 'Print')) return
        try {
          const { source } = await printIssuedTestReport(row, scope, labName, { allowRegenerated: true })
          sentToPrint(source)
        } catch (e2) {
          setSaveMessage(e2 instanceof Error ? e2.message : 'Print failed')
        }
        return
      }
      setSaveMessage(e instanceof Error ? e.message : 'Print failed')
    } finally {
      setActionBusyId(null)
    }
  }

  const handleDownloadPdfs = async (row: IssuedTestReportListRow) => {
    setActionBusyId(row.id)
    setSaveMessage(null)
    const downloaded = (labels: string[], source: IssuedReportCopySource) =>
      setSaveMessage(
        `Downloaded ${labels.join(' & ')} PDF${labels.length > 1 ? 's' : ''} (${row.srfNumber ?? 'SRF'}).` +
          sourceNote(source),
      )
    try {
      const { labels, source } = await downloadIssuedTestReports(row, labName)
      setArchiveStatus(row.id, archiveStatusForSource(source))
      downloaded(labels, source)
    } catch (e) {
      if (e instanceof IssuedReportIntegrityError) {
        setArchiveStatus(row.id, 'failed')
        setSaveMessage(`${ARCHIVE_INTEGRITY_FAILED_MESSAGE} (${row.srfNumber ?? 'SRF'}). Nothing was downloaded.`)
        if (!confirmRegenerate(row, 'Download')) return
        try {
          const r = await downloadIssuedTestReports(row, labName, { allowRegenerated: true })
          downloaded(r.labels, r.source)
        } catch (e2) {
          setSaveMessage(e2 instanceof Error ? e2.message : 'PDF download failed')
        }
        return
      }
      setSaveMessage(e instanceof Error ? e.message : 'PDF download failed')
    } finally {
      setActionBusyId(null)
    }
  }

  const handleEmailToClient = async (row: IssuedTestReportListRow) => {
    const email = row.clientEmail?.trim()
    if (!email) {
      setSaveMessage('Client email is not set in Client Master.')
      return
    }
    const label = row.srfNumber?.trim() || 'this SRF'
    if (
      !window.confirm(
        `Send Accredited and Non Accredited PDF reports for ${label} to ${email}?`,
      )
    ) {
      return
    }
    setActionBusyId(row.id)
    setSaveMessage(null)
    try {
      const sent = await emailIssuedTestReports(row, labName)
      setArchiveStatus(row.id, archiveStatusForSource(sent.source))
      setSaveMessage(
        `${sent.labels.join(' & ')} report${sent.labels.length > 1 ? 's' : ''} emailed to ${sent.email}.` +
          (sent.source === 'archive' ? ' Sent from the archived issued copy.' : sourceNote(sent.source)),
      )
    } catch (e) {
      if (e instanceof IssuedReportIntegrityError) {
        setArchiveStatus(row.id, 'failed')
        setSaveMessage(
          `${ARCHIVE_INTEGRITY_FAILED_MESSAGE} (${row.srfNumber ?? 'SRF'}). The report was not emailed; report this to the Quality Manager.`,
        )
        return
      }
      setSaveMessage(e instanceof Error ? e.message : 'Email failed')
    } finally {
      setActionBusyId(null)
    }
  }

  const removeRowFromSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const handleDeleteSelected = () => {
    const ids = selectedRows.map((r) => r.id)
    if (!confirmDestructiveDelete(ids.length, 'issued SRF')) return
    void (async () => {
      setLoading(true)
      setSaveMessage(null)
      try {
        const count = await deleteSamplesByIds(ids)
        setSelectedIds(new Set())
        await loadList()
        setSaveMessage(`Deleted ${count} issued SRF record(s).`)
      } catch (e) {
        setSaveMessage(e instanceof Error ? e.message : 'Delete failed')
      } finally {
        setLoading(false)
      }
    })()
  }

  const openAmendmentDialog = (row: IssuedTestReportListRow) => {
    setAmendmentError(null)
    setAmendmentRow(row)
    setAmendmentOpen(true)
  }

  const submitAmendmentReferback = async (payload: IssuedReportAmendmentSubmitPayload) => {
    const row = amendmentRow
    if (!row) return
    const label = row.srfNumber?.trim() || 'this SRF'
    setAmendmentLoading(true)
    setAmendmentError(null)
    setActionBusyId(row.id)
    setSaveMessage(null)
    try {
      const result = await issueAndReferbackIssuedReport({
        sampleId: row.id,
        srfNumber: row.srfNumber,
        issueKind: payload.issueKind,
        sections: payload.sections.map((item) => ({
          sampleAllocationId: item.section.sampleAllocationId,
          testAllocationId: item.section.testAllocationId,
          sectionCode: item.section.sectionCode,
          department: item.department,
          designation: item.designation,
          employee: item.employee,
          targetStage: item.targetStage,
        })),
        remark: payload.remark,
        createdBy: user?.id ?? null,
      })
      setAmendmentOpen(false)
      setAmendmentRow(null)
      removeRowFromSelection(row.id)
      await loadList()
      const sectionLabel =
        payload.sections.length > 1
          ? 'Both Section Code'
          : payload.sections[0]?.section.sectionCode || 'section'
      const employeeNames = [...new Set(payload.sections.map((item) => item.employee.name))].join(', ')
      setSaveMessage(
        `${receivingReportTypeForIssueKind(payload.issueKind)} ${result.newSrfNumber} created from ${label} (${sectionLabel}). Assigned to ${employeeNames} in ${result.targetLabel}. Original issued SRF is unchanged.`,
      )
    } catch (e) {
      setAmendmentError(e instanceof Error ? e.message : 'Referback failed')
    } finally {
      setAmendmentLoading(false)
      setActionBusyId(null)
    }
  }

  const handleReferbackToPreparation = async (row: IssuedTestReportListRow) => {
    const label = row.srfNumber?.trim() || 'this SRF'
    if (
      !window.confirm(
        `Refer back ${label} to Test Report Preparation for modification?\n\nIssued timestamps will be cleared; report number and draft content are kept.`,
      )
    ) {
      return
    }
    setActionBusyId(row.id)
    setSaveMessage(null)
    try {
      await referbackIssuedTestReportToPreparation(row.id)
      removeRowFromSelection(row.id)
      await loadList()
      setSaveMessage(`${label} moved to Test Report Preparation.`)
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : 'Referback failed')
    } finally {
      setActionBusyId(null)
    }
  }

  const handleReferbackToResultsReview = async (row: IssuedTestReportListRow) => {
    if (!user?.id) {
      setSaveMessage('Sign in to refer back to Results Under Review.')
      return
    }
    const label = row.srfNumber?.trim() || 'this SRF'
    const reviewerName = profileName?.trim() || user.email || 'You'
    if (
      !window.confirm(
        `Refer back ${label} to Results Under Review?\n\nAll tested sections will be assigned to you (${reviewerName}) for re-review. Issued timestamps will be cleared.`,
      )
    ) {
      return
    }
    setActionBusyId(row.id)
    setSaveMessage(null)
    try {
      await referbackIssuedTestReportToResultsReview(row.id, {
        id: user.id,
        name: profileName?.trim() || null,
        department: departmentName,
      })
      removeRowFromSelection(row.id)
      await loadList()
      setSaveMessage(`${label} moved to Results Under Review (assigned to you).`)
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : 'Referback failed')
    } finally {
      setActionBusyId(null)
    }
  }

  return (
    <div className={limsPageShellClass}>
      <CompletedResultsHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        assistantRows={filtered}
      />

      <CompletedResultsTable
        rows={paged}
        loading={loading}
        error={error}
        selectedIds={selectedIds}
        actionBusyId={actionBusyId}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onViewSrf={openViewSrf}
        onPrintNabl={(row) => void handlePrintReport(row, 'nabl')}
        onPrintNonNabl={(row) => void handlePrintReport(row, 'non_nabl')}
        onDownloadPdfs={(row) => void handleDownloadPdfs(row)}
        onEmailToClient={(row) => void handleEmailToClient(row)}
        onReferbackToPreparation={(row) => void handleReferbackToPreparation(row)}
        onReferbackToResultsReview={(row) => void handleReferbackToResultsReview(row)}
        onIssueAmendment={openAmendmentDialog}
        canReferbackToResultsReview={Boolean(user?.id)}
        archiveStatuses={archiveStatuses}
        onVerifyArchive={(row) => void handleVerifyArchive(row)}
      />

      <CompletedResultsFooterBar
        loading={loading}
        message={saveMessage}
        selectedCount={selectedRows.length}
        totalCount={filtered.length}
        page={page}
        pageCount={pageCount}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number(jumpTo)
          if (!Number.isFinite(n) || n <= 0) return
          setPage(Math.min(pageCount, Math.max(1, n)))
        }}
        showDelete={showDelete}
        onDeleteSelected={handleDeleteSelected}
      />

      <IssuedReportAmendmentDialog
        open={amendmentOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAmendmentRow(null)
            setAmendmentError(null)
          }
          setAmendmentOpen(open)
        }}
        row={amendmentRow}
        onSubmit={submitAmendmentReferback}
        submitLoading={amendmentLoading}
        submitError={amendmentError}
      />

      <SampleSrfViewDialog
        open={srfViewOpen}
        onOpenChange={(o) => {
          if (!o) setSrfViewRow(null)
          setSrfViewOpen(o)
        }}
        sampleId={srfViewRow?.id ?? null}
        fallbackSrf={srfViewRow?.srfNumber}
        fallbackClient={srfViewRow?.clientName}
        fallbackIsLabel={srfViewRow?.isCodeLabel}
      />
    </div>
  )
}
