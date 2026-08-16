import { useCallback, useEffect, useMemo, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { useAuth } from '@/hooks/useAuth'
import { canDeleteSampleHandlingRecords } from '@/lib/isLaboratoryDirector'
import {
  confirmDestructiveDelete,
  deleteSamplesByIds,
} from '@/features/sample-handling/shared/deleteSampleRecords'
import { supabase } from '@/lib/supabaseClient'
import { SampleSrfViewDialog } from '@/features/sample-handling/shared/SampleSrfViewDialog'
import type { ReportScopeKind } from '@/features/sample-handling/report-preparation/reportScope'
import { CompletedResultsFooterBar } from './CompletedResultsFooterBar'
import { CompletedResultsHeaderBar } from './CompletedResultsHeaderBar'
import { CompletedResultsTable } from './CompletedResultsTable'
import { printIssuedTestReport } from './printIssuedTestReport'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import {
  referbackIssuedTestReportToPreparation,
  referbackIssuedTestReportToResultsReview,
} from './referbackIssuedTestReport'
import type { IssuedTestReportListRow } from './types'

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

  const [srfViewOpen, setSrfViewOpen] = useState(false)
  const [srfViewRow, setSrfViewRow] = useState<IssuedTestReportListRow | null>(null)

  const labName = useMemo(() => {
    if (typeof window === 'undefined') return 'Laboratory'
    return window.localStorage.getItem('labSettings.labName') || 'Quality International Research & Laboratories Pvt. Ltd.'
  }, [])

  const loadList = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const { data, error: qErr } = await supabase
        .from('samples')
        .select(
          'id, srf_number, date_of_sample_receiving, test_report_is_code_id, test_report_number, test_report_issued_at, test_report_nabl_issued_at, test_report_non_nabl_issued_at, test_report_nabl_ulr_number, clients(company_name)',
        )
        .eq('stage', 'completed')
        .order('test_report_issued_at', { ascending: false, nullsFirst: false })
      if (qErr) throw qErr
      const list = Array.isArray(data) ? data : []

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
          const clients = r.clients as { company_name?: string } | null
          const isId = r.test_report_is_code_id as string | null
          return {
            id: r.id as string,
            srfNumber: (r.srf_number as string) ?? null,
            dateReceiving: (r.date_of_sample_receiving as string) ?? null,
            clientName: clients?.company_name ?? null,
            isCodeId: isId,
            isCodeLabel: isId ? (isMap.get(isId) ?? null) : null,
            reportNumberBase: (r.test_report_number as string) ?? null,
            nablIssuedAt: (r.test_report_nabl_issued_at as string) ?? null,
            nonNablIssuedAt: (r.test_report_non_nabl_issued_at as string) ?? null,
            issuedAt: (r.test_report_issued_at as string) ?? null,
            nablUlrNumber: (r.test_report_nabl_ulr_number as string) ?? null,
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
    try {
      await printIssuedTestReport(row, scope, labName)
      setSaveMessage(
        scope === 'nabl'
          ? `Accredited report sent to print (${row.srfNumber ?? 'SRF'}).`
          : `Non Accredited report sent to print (${row.srfNumber ?? 'SRF'}).`,
      )
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : 'Print failed')
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
        onReferbackToPreparation={(row) => void handleReferbackToPreparation(row)}
        onReferbackToResultsReview={(row) => void handleReferbackToResultsReview(row)}
        canReferbackToResultsReview={Boolean(user?.id)}
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
