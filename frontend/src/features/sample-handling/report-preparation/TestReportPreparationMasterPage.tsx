import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { canDeleteSampleHandlingRecords } from '@/lib/isLaboratoryDirector'
import {
  confirmDestructiveDelete,
  deleteSamplesByIds,
} from '@/features/sample-handling/shared/deleteSampleRecords'
import { supabase } from '@/lib/supabaseClient'
import {
  TestReportReferbackToReviewDialog,
  type TestReportReferbackSubmitPayload,
} from './TestReportReferbackToReviewDialog'
import { referbackSectionFromReportPreparation } from './referbackFromReportPreparation'
import { getSampleWorkflowStatusLabel } from '@/features/sample-handling/sampleWorkflowStatus'
import type { SampleStage } from '@/features/sample-handling/types'
import { isSupabaseMissingColumnError } from '@/lib/supabaseErrors'
import { formatDate } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SampleSrfViewDialog } from '@/features/sample-handling/shared/SampleSrfViewDialog'
import { isSampleReadyForReportPreparation } from './sampleReportReadiness'
import { ReportResultsTable } from './ReportResultsTable'
import { TestReportPreparationFooterBar } from './TestReportPreparationFooterBar'
import { TestReportPreparationHeaderBar } from './TestReportPreparationHeaderBar'
import { TestReportPreparationTable } from './TestReportPreparationTable'
import { TestReportPrepareDialog } from './TestReportPrepareDialog'
import {
  buildScopedTestReportPrintHtml,
} from './buildScopedTestReportPrintHtml'
import { outputTestReportDocument } from './outputTestReportDocument'
import { fetchTestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsConfig'
import {
  fetchTestReportCoverDetails,
  formatSectionReportLine,
  type TestReportCoverDetails,
} from './fetchTestReportCoverDetails'
import { partBDetailsToSampleUpdate, type TestReportPartBDetails } from './testReportPartB'
import {
  fetchReportPrepLetterheads,
  LETTERHEAD_NOT_APPLICABLE,
  letterheadsToSampleUpdate,
  type LetterheadTemplateOptions,
  type ReportPrepLetterheadsByScope,
} from './reportPrepLetterhead'

const DEFAULT_SCOPE_LETTERHEADS = {
  headerName: LETTERHEAD_NOT_APPLICABLE,
  footerName: LETTERHEAD_NOT_APPLICABLE,
  watermarkName: LETTERHEAD_NOT_APPLICABLE,
}
import {
  fetchReportResultRowsForSample,
  filterReportRowsByScope,
  getApplicableReportScopes,
  saveReportResultRemarks,
  type ReportResultRow,
} from './reportResultRows'
import {
  appendReportScopeSuffix,
  REPORT_SCOPE_TITLE,
  stripReportScopeSuffix,
  type ReportScopeKind,
} from './reportScope'
import { resolveReportScopeTemplate } from './reportScopeConfig'
import {
  fetchNextNablUlrNumber,
  fetchUlrPrefix,
  isValidNablUlrFormat,
  sanitizeNablUlrInput,
} from './nablUlrNumber'
import { fetchNextTestReportNumber, toCanonicalReportNumber } from './formattedTestReportNumber'
import { fetchTestReportPrefix } from './testReportNumberPrefix'
import type { ReportPreparationListRow } from './buildTestReportPreparationAssistantContext'
import {
  sortTestReportPreparationRows,
  type TestReportPreparationSortKey,
} from './sortTestReportPreparationRows'
type ListRow = ReportPreparationListRow

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default function TestReportPreparationMasterPage() {
  const { user, profileName, designation, departmentName } = useAuth()
  const showDelete = canDeleteSampleHandlingRecords(designation)
  const [rows, setRows] = useState<ListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<TestReportPreparationSortKey>('dateReceiving')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const [dialogOpen, setDialogOpen] = useState(false)
  const [active, setActive] = useState<ListRow | null>(null)
  const [reportNumber, setReportNumber] = useState('')
  const [testReportPrefix, setTestReportPrefix] = useState('')
  const [reportNumberLoading, setReportNumberLoading] = useState(false)
  const [draftNotes, setDraftNotes] = useState('')
  const [nablUlrNumber, setNablUlrNumber] = useState('')
  const [ulrPrefix, setUlrPrefix] = useState('')
  const [ulrPrefixLoading, setUlrPrefixLoading] = useState(false)
  const [prepareResultRows, setPrepareResultRows] = useState<ReportResultRow[]>([])
  const [prepareResultsLoading, setPrepareResultsLoading] = useState(false)
  const [coverDetails, setCoverDetails] = useState<TestReportCoverDetails | null>(null)
  const [partBDetails, setPartBDetails] = useState<TestReportPartBDetails | null>(null)
  const [letterheadOptions, setLetterheadOptions] = useState<LetterheadTemplateOptions>({
    headers: [],
    footers: [],
    watermarks: [],
  })
  const [letterheadsByScope, setLetterheadsByScope] = useState<ReportPrepLetterheadsByScope>({
    nabl: { ...DEFAULT_SCOPE_LETTERHEADS },
    non_nabl: { ...DEFAULT_SCOPE_LETTERHEADS },
  })
  const [coverLoading, setCoverLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [issueLoading, setIssueLoading] = useState(false)
  const [referbackBusyId, setReferbackBusyId] = useState<string | null>(null)
  const [referbackDialogOpen, setReferbackDialogOpen] = useState(false)
  const [referbackRow, setReferbackRow] = useState<ListRow | null>(null)
  const [referbackSubmitError, setReferbackSubmitError] = useState<string | null>(null)

  const [resultsViewOpen, setResultsViewOpen] = useState(false)
  const [resultsViewRow, setResultsViewRow] = useState<ListRow | null>(null)
  const [resultsViewRows, setResultsViewRows] = useState<ReportResultRow[]>([])
  const [resultsViewLoading, setResultsViewLoading] = useState(false)

  const [srfViewOpen, setSrfViewOpen] = useState(false)
  const [srfViewRow, setSrfViewRow] = useState<ListRow | null>(null)

  const labName = useMemo(() => {
    if (typeof window === 'undefined') return 'Laboratory'
    return window.localStorage.getItem('labSettings.labName') || 'Quality International Research & Laboratories Pvt. Ltd.'
  }, [])

  const fullReportNumber = useMemo(() => toCanonicalReportNumber(reportNumber), [reportNumber])

  const mapSamplesToRows = (
    list: Record<string, unknown>[],
    isMap: Map<string, string>,
  ): ListRow[] =>
    list.map((r) => {
      const clients = r.clients as { company_name?: string } | null
      const isId = r.test_report_is_code_id as string | null
      return {
        id: r.id as string,
        srfNumber: (r.srf_number as string) ?? null,
        dateReceiving: (r.date_of_sample_receiving as string) ?? null,
        clientName: clients?.company_name ?? null,
        isCodeId: isId,
        isCodeLabel: isId ? (isMap.get(isId) ?? null) : null,
        reportNumber: (r.test_report_number as string) ?? null,
        draftNotes: (r.test_report_draft_notes as string) ?? null,
        nablUlrNumber: (r.test_report_nabl_ulr_number as string) ?? null,
      }
    })

  const loadList = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const { data, error: qErr } = await supabase
        .from('samples')
        .select(
          'id, srf_number, date_of_sample_receiving, test_report_is_code_id, test_report_number, test_report_draft_notes, test_report_nabl_ulr_number, stage, clients(company_name)',
        )
        .in('stage', ['report_preparation', 'results_review', 'under_testing'])
        .order('updated_at', { ascending: false })
      if (qErr) throw qErr
      const candidates = Array.isArray(data) ? data : []

      const readySamples: Record<string, unknown>[] = []
      const syncStageIds: string[] = []

      for (const row of candidates) {
        const sampleId = String((row as { id?: string }).id ?? '').trim()
        const stage = String((row as { stage?: string }).stage ?? '').trim()
        if (!sampleId) continue

        const ready = await isSampleReadyForReportPreparation(sampleId)
        if (ready) {
          readySamples.push(row as Record<string, unknown>)
          if (stage !== 'report_preparation') {
            syncStageIds.push(sampleId)
          }
        }
      }

      if (syncStageIds.length > 0) {
        const { error: syncErr } = await supabase
          .from('samples')
          .update({ stage: 'report_preparation' })
          .in('id', syncStageIds)
        if (syncErr) throw syncErr
      }

      const isIds = [
        ...new Set(
          readySamples
            .map((r) => r.test_report_is_code_id as string | null)
            .filter(Boolean),
        ),
      ] as string[]
      let isMap = new Map<string, string>()
      if (isIds.length > 0) {
        const { data: isData } = await supabase
          .from('is_codes')
          .select('id, is_number, revision_year')
          .in('id', isIds)
        for (const c of Array.isArray(isData) ? isData : []) {
          const row = c as { id: string; is_number?: string; revision_year?: string | null }
          const label = row.revision_year
            ? `${row.is_number ?? ''} : ${row.revision_year}`
            : (row.is_number ?? row.id)
          isMap.set(row.id, label)
        }
      }
      setRows(mapSamplesToRows(readySamples, isMap))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load samples')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const applicableScopesKey = useMemo(
    () => getApplicableReportScopes(prepareResultRows).sort().join('|'),
    [prepareResultRows],
  )

  useEffect(() => {
    if (!dialogOpen || !active) return
    setCoverLoading(true)
    void fetchTestReportCoverDetails(active.id, {
      applicableScopes: getApplicableReportScopes(prepareResultRows),
      fallbacks: {
        clientName: active.clientName,
        isCodeLabel: active.isCodeLabel,
      },
    })
      .then((coverData) => {
        setCoverDetails(coverData)
        setPartBDetails((prev) => prev ?? coverData.partB)
      })
      .catch(() => {
        setCoverDetails(null)
        setPartBDetails(null)
      })
      .finally(() => setCoverLoading(false))
  }, [dialogOpen, active?.id, active?.clientName, active?.isCodeLabel])

  useEffect(() => {
    if (!dialogOpen || !active || !applicableScopesKey) return
    const scopes = getApplicableReportScopes(prepareResultRows)
    void fetchReportPrepLetterheads(active.id, scopes)
      .then((letterheadData) => {
        setLetterheadOptions(letterheadData.options)
        setLetterheadsByScope((prev) => {
          const hasUserSelection =
            prev.nabl.headerName.trim() ||
            prev.nabl.footerName.trim() ||
            prev.non_nabl.headerName.trim() ||
            prev.non_nabl.footerName.trim()
          return hasUserSelection ? prev : letterheadData.letterheads
        })
      })
      .catch(() => {})
  }, [dialogOpen, active?.id, applicableScopesKey])

  const openViewSrf = (r: ListRow) => {
    setSrfViewRow(r)
    setSrfViewOpen(true)
  }

  const openViewResults = (r: ListRow) => {
    setResultsViewRow(r)
    setResultsViewOpen(true)
    setResultsViewRows([])
    setResultsViewLoading(true)
    void fetchReportResultRowsForSample(r.id)
      .then(setResultsViewRows)
      .catch(() => setResultsViewRows([]))
      .finally(() => setResultsViewLoading(false))
  }

  const openPrepare = (r: ListRow) => {
    setActive(r)
    setDraftNotes(r.draftNotes ?? '')
    setNablUlrNumber('')
    setReportNumber('')
    setUlrPrefix('')
    setDialogOpen(true)
    setSaveMessage(null)
    setPrepareResultRows([])
    setCoverDetails(null)
    setPartBDetails(null)
    setLetterheadOptions({ headers: [], footers: [], watermarks: [] })
    setLetterheadsByScope({
      nabl: { ...DEFAULT_SCOPE_LETTERHEADS },
      non_nabl: { ...DEFAULT_SCOPE_LETTERHEADS },
    })
    setPrepareResultsLoading(true)
    setCoverLoading(true)
    void fetchReportResultRowsForSample(r.id)
      .then(setPrepareResultRows)
      .catch(() => setPrepareResultRows([]))
      .finally(() => setPrepareResultsLoading(false))
    setUlrPrefixLoading(true)
    setReportNumberLoading(true)

    void (async () => {
      try {
        const [trPrefix, ulrPref] = await Promise.all([fetchTestReportPrefix(), fetchUlrPrefix()])
        setTestReportPrefix(trPrefix)
        setUlrPrefix(ulrPref)

        const storedReport = toCanonicalReportNumber(r.reportNumber ?? '')
        if (storedReport.length > 0) {
          setReportNumber(storedReport)
        } else {
          const { prefix, number } = await fetchNextTestReportNumber(r.id)
          setTestReportPrefix(prefix)
          setReportNumber(number)
        }

        const stored = sanitizeNablUlrInput(r.nablUlrNumber ?? '')
        if (stored.length > 0 && isValidNablUlrFormat(stored, ulrPref)) {
          setNablUlrNumber(stored)
        } else {
          const { ulr } = await fetchNextNablUlrNumber(r.id)
          setNablUlrNumber(ulr)
        }
      } finally {
        setUlrPrefixLoading(false)
        setReportNumberLoading(false)
      }
    })()
  }

  const handlePrintScope = async (scope: ReportScopeKind) => {
    if (!active) return
    const base = fullReportNumber.trim()
    const scopedRows = filterReportRowsByScope(prepareResultRows, scope)
    if (scopedRows.length === 0) return
    try {
      const lh = letterheadsByScope[scope]
      const template = await resolveReportScopeTemplate(scope, undefined, {
        headerName: lh.headerName,
        footerName: lh.footerName,
        watermarkName: lh.watermarkName,
      })
      const printCover = coverDetails
        ? {
            ...coverDetails,
            partB: partBDetails ?? coverDetails.partB,
            sectionReportLine: formatSectionReportLine(
              coverDetails.sectionCodes,
              coverDetails.sectionReportNo,
              coverDetails.reportType,
            ),
          }
        : null
      const printSettings = await fetchTestReportPrintSettings()
      const html = buildScopedTestReportPrintHtml({
        scope,
        labName,
        srf: active.srfNumber ?? active.id,
        client: active.clientName ?? '—',
        isStandard: active.isCodeLabel ?? '—',
        dateReceiving: formatDate(active.dateReceiving ?? ''),
        reportNumber: appendReportScopeSuffix(base, scope),
        ulrNumber: scope === 'nabl' ? nablUlrNumber : undefined,
        notes: draftNotes,
        rows: scopedRows,
        template,
        coverDetails: printCover,
        printSettings,
      })
      const srf = active.srfNumber ?? active.id
      await outputTestReportDocument(html, `${REPORT_SCOPE_TITLE[scope]}-${srf}`)
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : 'Print failed')
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.srfNumber, r.clientName, r.isCodeLabel, r.reportNumber].filter(Boolean).join(' ').toLowerCase().includes(q),
    )
  }, [rows, search])

  const sorted = useMemo(
    () => sortTestReportPreparationRows(filtered, sortKey, sortDir),
    [filtered, sortKey, sortDir],
  )

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paged = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize],
  )

  const handleSort = (key: TestReportPreparationSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
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

  const buildListPrintHtml = (list: ListRow[]) => {
    const rowsHtml = list
      .map(
        (r) => `
      <tr>
        <td>${escapeHtml(fmt(r.srfNumber))}</td>
        <td>${escapeHtml(fmt(r.clientName))}</td>
        <td>${escapeHtml(fmt(r.isCodeLabel))}</td>
        <td>${escapeHtml(formatDate(r.dateReceiving ?? ''))}</td>
      </tr>`,
      )
      .join('')
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Test Report Preparation</title>
<style>
  body{font-family:system-ui,sans-serif;margin:24px;color:#0f172a}
  h1{font-size:18px;margin:0 0 16px;text-align:center}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border:1px solid #e2e8f0;padding:8px;text-align:center}
  th{background:#f8fafc;font-weight:600}
</style></head><body>
  <h1>Test Report Preparation — SRFs ready for reporting</h1>
  <table><thead><tr>
    <th>SRF</th><th>Client</th><th>IS Code</th><th>Received Date</th>
  </tr></thead><tbody>${rowsHtml}</tbody></table>
</body></html>`
  }

  const handlePrintSelected = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : sorted
    if (exportRows.length === 0) return
    const html = buildListPrintHtml(exportRows)
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.setAttribute('aria-hidden', 'true')
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) {
      document.body.removeChild(iframe)
      return
    }
    doc.open()
    doc.write(html)
    doc.close()
    iframe.onload = () => {
      try {
        win.focus()
        win.print()
      } finally {
        window.setTimeout(() => {
          try {
            document.body.removeChild(iframe)
          } catch {
            /* ignore */
          }
        }, 500)
      }
    }
  }

  const handleDeleteSelected = () => {
    const ids = selectedRows.map((r) => r.id)
    if (!confirmDestructiveDelete(ids.length, 'SRF')) return
    void (async () => {
      setLoading(true)
      setSaveMessage(null)
      try {
        const count = await deleteSamplesByIds(ids)
        setSelectedIds(new Set())
        if (active && ids.includes(active.id)) {
          setDialogOpen(false)
          setActive(null)
        }
        await loadList()
        setSaveMessage(`Deleted ${count} SRF(s) from Test Report Preparation.`)
      } catch (e) {
        setSaveMessage(e instanceof Error ? e.message : 'Delete failed')
      } finally {
        setLoading(false)
      }
    })()
  }

  useEffect(() => {
    setPage(1)
  }, [search, pageSize, sortKey, sortDir])

  const handleSaveDraft = async () => {
    if (!active) return
    setSaveLoading(true)
    setSaveMessage(null)
    try {
      const scopes = getApplicableReportScopes(prepareResultRows)
      const partBUpdate = partBDetails ? partBDetailsToSampleUpdate(partBDetails) : {}
      const letterheadUpdate = letterheadsToSampleUpdate(letterheadsByScope, scopes)
      const draftPayload = {
        test_report_number: toCanonicalReportNumber(fullReportNumber) || null,
        test_report_draft_notes: draftNotes.trim() || null,
        test_report_nabl_ulr_number: sanitizeNablUlrInput(nablUlrNumber) || null,
        ...partBUpdate,
        ...letterheadUpdate,
      }
      let { error: uErr } = await supabase.from('samples').update(draftPayload).eq('id', active.id)
      if (uErr && isSupabaseMissingColumnError(uErr, 'test_report_nabl_required')) {
        const { test_report_nabl_required: _n, ...withoutNabl } = partBUpdate
        ;({ error: uErr } = await supabase
          .from('samples')
          .update({
            test_report_number: draftPayload.test_report_number,
            test_report_draft_notes: draftPayload.test_report_draft_notes,
            test_report_nabl_ulr_number: draftPayload.test_report_nabl_ulr_number,
            ...withoutNabl,
          })
          .eq('id', active.id))
      }
      if (uErr) throw uErr
      await saveReportResultRemarks(prepareResultRows)
      const savedReportNumber = draftPayload.test_report_number
      setActive((prev) =>
        prev && prev.id === active.id
          ? {
              ...prev,
              reportNumber: savedReportNumber,
              draftNotes: draftPayload.test_report_draft_notes,
              nablUlrNumber: draftPayload.test_report_nabl_ulr_number,
            }
          : prev,
      )
      setSaveMessage('Draft saved.')
      await loadList()
    } catch (e) {
      setSaveMessage(
        e instanceof Error
          ? `${e.message} If columns are missing, run the migration: web/supabase/migrations/20260327120000_samples_report_preparation.sql`
          : 'Save failed',
      )
    } finally {
      setSaveLoading(false)
    }
  }

  const handleIssueReport = async () => {
    if (!active) return
    const scopes = getApplicableReportScopes(prepareResultRows)
    if (scopes.length === 0) return
    const scopeLabel = scopes.map((s) => (s === 'nabl' ? 'NABL (A)' : 'Non-NABL (B)')).join(' & ')
    if (
      !window.confirm(
        `Issue ${scopeLabel} test report(s) for this SRF and move to Issued Test Report?`,
      )
    ) {
      return
    }
    setIssueLoading(true)
    setSaveMessage(null)
    try {
      const now = new Date().toISOString()
      const partBUpdate = partBDetails ? partBDetailsToSampleUpdate(partBDetails) : {}
      const letterheadUpdate = letterheadsToSampleUpdate(letterheadsByScope, scopes)
      const issuePayload: Record<string, string | boolean | null> = {
        stage: 'completed',
        test_report_number: toCanonicalReportNumber(fullReportNumber) || null,
        test_report_draft_notes: draftNotes.trim() || null,
        test_report_nabl_ulr_number: sanitizeNablUlrInput(nablUlrNumber) || null,
        test_report_issued_at: now,
        test_report_nabl_issued_at: scopes.includes('nabl') ? now : null,
        test_report_non_nabl_issued_at: scopes.includes('non_nabl') ? now : null,
        ...partBUpdate,
        ...letterheadUpdate,
      }
      let { error: uErr } = await supabase.from('samples').update(issuePayload).eq('id', active.id)
      if (uErr && isSupabaseMissingColumnError(uErr, 'test_report_nabl_required')) {
        const { test_report_nabl_required: _n, ...withoutNabl } = partBUpdate
        const retry: Record<string, string | boolean | null> = {
          stage: issuePayload.stage,
          test_report_number: issuePayload.test_report_number,
          test_report_draft_notes: issuePayload.test_report_draft_notes,
          test_report_nabl_ulr_number: issuePayload.test_report_nabl_ulr_number,
          test_report_issued_at: issuePayload.test_report_issued_at,
          test_report_nabl_issued_at: issuePayload.test_report_nabl_issued_at,
          test_report_non_nabl_issued_at: issuePayload.test_report_non_nabl_issued_at,
          ...withoutNabl,
        }
        ;({ error: uErr } = await supabase.from('samples').update(retry).eq('id', active.id))
      }
      if (uErr) throw uErr
      await saveReportResultRemarks(prepareResultRows)
      setDialogOpen(false)
      setActive(null)
      await loadList()
      setSaveMessage('Test report(s) issued. SRF moved to Issued Test Report.')
    } catch (e) {
      setSaveMessage(
        e instanceof Error
          ? `${e.message} If columns are missing, run migration 20260531230000_report_scope_dual_templates.sql`
          : 'Issue failed',
      )
    } finally {
      setIssueLoading(false)
    }
  }

  const openReferbackToReviewDialog = (row: ListRow) => {
    if (!user?.id) {
      setSaveMessage('Sign in to refer back to Results Under Review.')
      return
    }
    setReferbackSubmitError(null)
    setReferbackRow(row)
    setReferbackDialogOpen(true)
  }

  const targetStageLabel = (stage: SampleStage | 'report_preparation') =>
    getSampleWorkflowStatusLabel({
      stage: stage === 'report_preparation' ? 'report_preparation' : stage,
      sample_receiving_status: null,
      status: null,
    })

  const submitReferback = async (payload: TestReportReferbackSubmitPayload) => {
    const row = referbackRow
    if (!row?.id) return
    const label = row.srfNumber?.trim() || 'this SRF'
    setReferbackBusyId(row.id)
    setReferbackSubmitError(null)
    try {
      const { sampleStage } = await referbackSectionFromReportPreparation({
        sampleId: row.id,
        sampleAllocationId: payload.sampleAllocationId,
        testAllocationId: payload.testAllocationId,
        targetStage: payload.targetStage,
        remark: payload.remark,
        assignee: payload.assignee,
      })
      setReferbackDialogOpen(false)
      setReferbackRow(null)
      const leftReportPrep = sampleStage !== 'report_preparation'
      if (active?.id === row.id && leftReportPrep) {
        setDialogOpen(false)
        setActive(null)
      }
      if (leftReportPrep) {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(row.id)
          return next
        })
      }
      await loadList()
      setSaveMessage(
        leftReportPrep
          ? `${label} — section referred back to ${targetStageLabel(sampleStage)}.`
          : `${label} — section referred back. SRF remains in Test Report Preparation for other sections.`,
      )
    } catch (e) {
      setReferbackSubmitError(e instanceof Error ? e.message : 'Referback failed')
    } finally {
      setReferbackBusyId(null)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <TestReportPreparationHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        assistantRows={sorted}
      />

      <TestReportPreparationTable
        rows={paged}
        loading={loading}
        error={error}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onViewSrf={openViewSrf}
        onViewResults={openViewResults}
        onPrepare={openPrepare}
        onReferback={openReferbackToReviewDialog}
        referbackBusyId={referbackBusyId}
        canReferback={Boolean(user?.id)}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
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

      <TestReportPreparationFooterBar
        message={!dialogOpen ? saveMessage : null}
        loading={loading}
        selectedCount={selectedIds.size}
        onPrintSelected={handlePrintSelected}
        showDelete={showDelete}
        onDeleteSelected={handleDeleteSelected}
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
      />

      <TestReportPrepareDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) setActive(null)
          setDialogOpen(o)
        }}
        active={active}
        reportNumber={reportNumber}
        onReportNumberChange={setReportNumber}
        testReportPrefix={testReportPrefix}
        reportNumberLoading={reportNumberLoading}
        draftNotes={draftNotes}
        onDraftNotesChange={setDraftNotes}
        nablUlrNumber={nablUlrNumber}
        onNablUlrNumberChange={setNablUlrNumber}
        ulrPrefix={ulrPrefix}
        ulrPrefixLoading={ulrPrefixLoading}
        letterheadOptions={letterheadOptions}
        letterheadsByScope={letterheadsByScope}
        onLetterheadChange={(scope, field, value) => {
          setLetterheadsByScope((prev) => ({
            ...prev,
            [scope]: { ...prev[scope], [field]: value },
          }))
        }}
        coverDetails={coverDetails}
        partBDetails={partBDetails}
        onPartBDetailsChange={setPartBDetails}
        coverLoading={coverLoading}
        resultRows={prepareResultRows}
        resultsLoading={prepareResultsLoading}
        saveMessage={dialogOpen ? saveMessage : null}
        saveLoading={saveLoading}
        issueLoading={issueLoading}
        onSaveDraft={() => void handleSaveDraft()}
        onIssueReports={() => void handleIssueReport()}
        onPrintScope={(scope) => void handlePrintScope(scope)}
        onRemarkChange={(rowKey, remark) => {
          setPrepareResultRows((rows) =>
            rows.map((r) => (r.rowKey === rowKey ? { ...r, remark } : r)),
          )
        }}
      />

      <Dialog
        open={resultsViewOpen}
        onOpenChange={(o) => {
          if (!o) setResultsViewRow(null)
          setResultsViewOpen(o)
        }}
      >
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Test Results — {resultsViewRow ? fmt(resultsViewRow.srfNumber) : '—'}
            </DialogTitle>
          </DialogHeader>
          {resultsViewRow && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Client: <span className="font-medium text-foreground">{fmt(resultsViewRow.clientName)}</span>
                {' · '}
                IS Code: <span className="font-medium text-foreground">{fmt(resultsViewRow.isCodeLabel)}</span>
              </p>
              {resultsViewLoading ? (
                <p className="text-muted-foreground">Loading completed test results…</p>
              ) : resultsViewRows.length === 0 ? (
                <p className="text-muted-foreground">No completed test parameter results for this SRF.</p>
              ) : (
                <ReportResultsTable rows={resultsViewRows} showScope />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <TestReportReferbackToReviewDialog
        open={referbackDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setReferbackRow(null)
            setReferbackSubmitError(null)
          }
          setReferbackDialogOpen(open)
        }}
        sampleId={referbackRow?.id ?? null}
        srfNumber={referbackRow?.srfNumber}
        onSubmit={submitReferback}
        submitLoading={referbackBusyId === referbackRow?.id}
        submitError={referbackSubmitError}
      />
    </div>
  )
}
