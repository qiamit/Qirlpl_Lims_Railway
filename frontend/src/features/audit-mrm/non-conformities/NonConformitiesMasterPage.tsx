import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { type AuditType } from '@/features/audit-mrm/audit-plan/types'
import { NonConformitiesDetailsDialog } from './NonConformitiesDetailsDialog'
import { NonConformitiesFooterBar } from './NonConformitiesFooterBar'
import { NonConformitiesHeaderBar } from './NonConformitiesHeaderBar'
import { NonConformitiesTable } from './NonConformitiesTable'
import {
  auditTypeLabel,
  buildNonConformityRows,
  CAPA_STATUS_LABEL,
  deriveCapaStatus,
  formatProposedRange,
  mapChecklistItem,
  mapNcActionForm,
  type CapaStatus,
  type NonConformityRow,
} from './types'

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function toCsv(headers: string[], rows: Array<Record<string, string>>) {
  const escape = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const out: string[] = [headers.map(escape).join(',')]
  for (const r of rows) {
    out.push(headers.map((h) => escape(String(r[h] ?? ''))).join(','))
  }
  return out.join('\n')
}

function hasEvidenceFiles(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  return Object.values(raw as Record<string, unknown>).some(
    (v) => Array.isArray(v) && v.length > 0,
  )
}

export default function NonConformitiesMasterPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<NonConformityRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const [activeRow, setActiveRow] = useState<NonConformityRow | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const handleDetailOpenChange = useFormDialogOpenChange(setShowDetail)

  const loadRows = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const [plansRes, itemsRes, actionsRes] = await Promise.all([
        supabase.from('audit_plans').select('*').order('created_at', { ascending: false }),
        supabase
          .from('audit_checklist_items')
          .select('*')
          .eq('conformity', 'no')
          .order('sort_order', { ascending: true }),
        supabase
          .from('audit_nc_actions')
          .select(
            'checklist_item_id, description_of_nc, immediate_correction, root_cause_analysis, extent_check, corrective_action_plan, corrective_action_implemented, review_of_effectiveness, risk_opportunity_review, changes_to_management_system, objective_evidence, verification_closure, evidence_by_field',
          ),
      ])
      if (plansRes.error) throw plansRes.error
      if (itemsRes.error) throw itemsRes.error
      if (actionsRes.error) throw actionsRes.error

      const plans = (Array.isArray(plansRes.data) ? plansRes.data : []).map((raw) => {
        const r = raw as Record<string, unknown>
        return {
          id: String(r.id),
          audit_id: String(r.audit_id ?? ''),
          audit_type: (r.audit_type === 'external' ? 'external' : 'internal') as AuditType,
          proposed_from: String(r.proposed_from ?? '').slice(0, 10),
          proposed_to: String(r.proposed_to ?? '').slice(0, 10),
          next_audit_date: String(r.next_audit_date ?? '').slice(0, 10),
        }
      })

      const items = (Array.isArray(itemsRes.data) ? itemsRes.data : []).map((raw) =>
        mapChecklistItem(raw as Record<string, unknown>),
      )

      const actionStartedByItemId: Record<string, boolean> = {}
      const capaStatusByItemId: Record<string, CapaStatus> = {}
      for (const raw of Array.isArray(actionsRes.data) ? actionsRes.data : []) {
        const r = raw as Record<string, unknown>
        const id = String(r.checklist_item_id ?? '')
        if (!id) continue
        const form = mapNcActionForm(r)
        const evidenceStarted = hasEvidenceFiles(r.evidence_by_field)
        const status = deriveCapaStatus(form, { hasEvidence: evidenceStarted })
        capaStatusByItemId[id] = status
        actionStartedByItemId[id] = status !== 'not_started'
      }

      setRows(buildNonConformityRows(plans, items, actionStartedByItemId, capaStatusByItemId))
      setSelectedIds(new Set())
    } catch (err) {
      setListError(formatSupabaseError(err))
      setRows([])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const hay = [
        r.auditId,
        auditTypeLabel(r.auditType),
        r.clauseNo,
        r.clauseMatter,
        r.observation,
        r.nonConformity,
        r.proposedFrom,
        r.proposedTo,
        CAPA_STATUS_LABEL[r.capaStatus ?? 'not_started'],
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  useEffect(() => {
    setPage(1)
    setJumpTo('')
  }, [search, pageSize])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(r.id)), [rows, selectedIds])

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
      for (const r of pagedRows) {
        if (checked) next.add(r.id)
        else next.delete(r.id)
      }
      return next
    })
  }

  const handleOpenDetails = (row: NonConformityRow) => {
    setMessage(null)
    setActiveRow(row)
    setShowDetail(true)
  }

  /** CAPA create/edit lives in Non Conforming Work → Corrective Action. */
  const handleOpenCapa = (row: NonConformityRow) => {
    setMessage(null)
    const params = new URLSearchParams({
      source: 'audit',
      checklistItemId: row.checklistItemId,
    })
    navigate(`/nonconforming-work/corrective-action?${params.toString()}`)
  }

  const handleDetailDialogChange = (open: boolean) => {
    handleDetailOpenChange(open)
  }

  useEffect(() => {
    if (!showDetail) setActiveRow(null)
  }, [showDetail])

  const buildExportRows = (source: NonConformityRow[]) =>
    source.map((r) => ({
      audit_id: r.auditId,
      type: auditTypeLabel(r.auditType),
      audit_date: formatProposedRange(r.proposedFrom, r.proposedTo),
      clause_no: r.clauseNo,
      details: r.nonConformity || r.observation || r.clauseMatter,
      capa_status: CAPA_STATUS_LABEL[r.capaStatus ?? 'not_started'],
    }))

  const handleExport = () => {
    try {
      const source = selectedRows.length > 0 ? selectedRows : filteredRows
      const headers = ['audit_id', 'type', 'audit_date', 'clause_no', 'details', 'capa_status']
      const csv = toCsv(headers, buildExportRows(source))
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `non-conformities-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setMessage('Exported')
    } catch (err) {
      setMessage(formatSupabaseError(err))
    }
  }

  const handlePrint = () => {
    try {
      const source = selectedRows.length > 0 ? selectedRows : filteredRows
      const exportRows = buildExportRows(source)
      const html = `<!doctype html><html><head><title>Non Conformities</title>
        <style>
          body{font-family:system-ui,sans-serif;padding:24px;color:#1c1917}
          h1{font-size:18px;margin:0 0 12px}
          table{border-collapse:collapse;width:100%;font-size:11px}
          th,td{border:1px solid #78716c;padding:6px 8px;text-align:left;vertical-align:top}
          th{background:#292524;color:#fde68a}
        </style></head><body>
        <h1>Non Conformities</h1>
        <table><thead><tr>
          <th>Audit ID</th><th>Type</th><th>Audit Date</th><th>Clause</th><th>Details</th><th>CAPA Status</th>
        </tr></thead><tbody>
        ${exportRows
          .map(
            (r) => `<tr>
            <td>${esc(r.audit_id)}</td>
            <td>${esc(r.type)}</td>
            <td>${esc(r.audit_date)}</td>
            <td>${esc(r.clause_no)}</td>
            <td>${esc(r.details)}</td>
            <td>${esc(r.capa_status)}</td>
          </tr>`,
          )
          .join('')}
        </tbody></table></body></html>`
      const w = window.open('', '_blank')
      if (!w) {
        setMessage('Popup blocked — allow popups to print')
        return
      }
      w.document.write(html)
      w.document.close()
      w.focus()
      w.print()
      setMessage('Printed')
    } catch (err) {
      setMessage(formatSupabaseError(err))
    }
  }

  return (
    <div className={limsPageShellClass}>
      <NonConformitiesHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
      />

      <NonConformitiesDetailsDialog
        open={showDetail}
        onOpenChange={handleDetailDialogChange}
        row={activeRow}
      />

      <NonConformitiesTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        searchActive={search.trim().length > 0}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onOpenDetails={handleOpenDetails}
        onOpenCapa={handleOpenCapa}
      />

      <NonConformitiesFooterBar
        message={message}
        loading={listLoading}
        selectedCount={selectedIds.size}
        page={page}
        pageCount={pageCount}
        onExport={handleExport}
        onPrint={handlePrint}
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
    </div>
  )
}
