import { useCallback, useEffect, useMemo, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { normalizeTeamRows, type AuditPlanRow, type AuditType } from '@/features/audit-mrm/audit-plan/types'
import { AuditSummaryDialog } from './AuditSummaryDialog'
import { AuditSummaryFooterBar } from './AuditSummaryFooterBar'
import { AuditSummaryHeaderBar } from './AuditSummaryHeaderBar'
import { AuditSummaryTable } from './AuditSummaryTable'
import {
  auditTypeLabel,
  computeSummaryStats,
  emptySummaryStats,
  formatDate,
  formatProposedRange,
  summaryStatus,
  summaryStatusLabel,
  type AuditSummaryStats,
  type SummaryFindingsTab,
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

export default function AuditSummaryMasterPage() {
  const [rows, setRows] = useState<AuditPlanRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [statsByPlanId, setStatsByPlanId] = useState<Record<string, AuditSummaryStats>>({})

  const [activePlan, setActivePlan] = useState<AuditPlanRow | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const [summaryTab, setSummaryTab] = useState<SummaryFindingsTab>('nc')
  const handleSummaryOpenChange = useFormDialogOpenChange(setShowSummary)

  const loadStats = useCallback(async (planIds: string[]) => {
    if (planIds.length === 0) {
      setStatsByPlanId({})
      return
    }
    try {
      const { data, error } = await supabase
        .from('audit_checklist_items')
        .select('audit_plan_id, conformity, remark, non_conformity')
        .in('audit_plan_id', planIds)
      if (error) throw error

      const byPlan = new Map<string, Array<Record<string, unknown>>>()
      for (const id of planIds) byPlan.set(id, [])
      for (const raw of Array.isArray(data) ? data : []) {
        const r = raw as Record<string, unknown>
        const pid = String(r.audit_plan_id ?? '')
        if (!pid || !byPlan.has(pid)) continue
        byPlan.get(pid)!.push(r)
      }

      const map: Record<string, AuditSummaryStats> = {}
      for (const id of planIds) {
        map[id] = computeSummaryStats(byPlan.get(id) ?? [])
      }
      setStatsByPlanId(map)
    } catch {
      const map: Record<string, AuditSummaryStats> = {}
      for (const id of planIds) map[id] = emptySummaryStats()
      setStatsByPlanId(map)
    }
  }, [])

  const loadRows = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const { data, error } = await supabase
        .from('audit_plans')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error

      const list = (Array.isArray(data) ? data : []).map((raw) => {
        const r = raw as Record<string, unknown>
        return {
          id: String(r.id),
          audit_type: (r.audit_type === 'external' ? 'external' : 'internal') as AuditType,
          proposed_from: String(r.proposed_from ?? '').slice(0, 10),
          proposed_to: String(r.proposed_to ?? '').slice(0, 10),
          audit_id: String(r.audit_id ?? ''),
          next_audit_date: String(r.next_audit_date ?? '').slice(0, 10),
          team_rows: normalizeTeamRows(r.team_rows),
          created_by: (r.created_by as string | null) ?? null,
          created_at: r.created_at ? String(r.created_at) : undefined,
          updated_at: r.updated_at ? String(r.updated_at) : undefined,
        } satisfies AuditPlanRow
      })
      setRows(list)
      await loadStats(list.map((r) => r.id))
    } catch (err) {
      setListError(formatSupabaseError(err))
      setRows([])
      setStatsByPlanId({})
    } finally {
      setListLoading(false)
    }
  }, [loadStats])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const stats = statsByPlanId[r.id]
      const status = stats ? summaryStatusLabel(summaryStatus(stats)) : ''
      const hay = [
        r.audit_id,
        auditTypeLabel(r.audit_type),
        r.proposed_from,
        r.proposed_to,
        r.next_audit_date,
        status,
        stats ? String(stats.nonConformities) : '',
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [rows, search, statsByPlanId])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  useEffect(() => {
    setPage(1)
    setJumpTo('')
  }, [search, pageSize])

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

  const handleOpenSummary = (row: AuditPlanRow, tab: SummaryFindingsTab = 'nc') => {
    setMessage(null)
    setSummaryTab(tab)
    setActivePlan(row)
    setShowSummary(true)
  }

  const handleSummaryDialogChange = (open: boolean) => {
    handleSummaryOpenChange(open)
    if (!open) {
      setActivePlan(null)
      setSummaryTab('nc')
      void loadStats(rows.map((r) => r.id))
    }
  }

  const buildExportRows = (source: AuditPlanRow[]) =>
    source.map((r) => {
      const stats = statsByPlanId[r.id] ?? emptySummaryStats()
      const status = summaryStatus(stats)
      return {
        audit_id: r.audit_id,
        type: auditTypeLabel(r.audit_type),
        proposed_from_to: formatProposedRange(r.proposed_from, r.proposed_to),
        next_audit_date: formatDate(r.next_audit_date),
        progress: `${stats.answered}/${stats.total}`,
        yes: String(stats.yes),
        nc: String(stats.nonConformities),
        na: String(stats.na),
        observations: String(stats.observations),
        status: summaryStatusLabel(status),
      }
    })

  const handleExport = () => {
    try {
      const source = selectedRows.length > 0 ? selectedRows : filteredRows
      const headers = [
        'audit_id',
        'type',
        'proposed_from_to',
        'next_audit_date',
        'progress',
        'yes',
        'nc',
        'na',
        'observations',
        'status',
      ]
      const csv = toCsv(headers, buildExportRows(source))
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-summary-${new Date().toISOString().slice(0, 10)}.csv`
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
      const html = `<!doctype html><html><head><title>Audit Summary</title>
        <style>
          body{font-family:system-ui,sans-serif;padding:24px;color:#1c1917}
          h1{font-size:18px;margin:0 0 12px}
          table{border-collapse:collapse;width:100%;font-size:12px}
          th,td{border:1px solid #78716c;padding:6px 8px;text-align:left}
          th{background:#292524;color:#fde68a}
        </style></head><body>
        <h1>Audit Summary</h1>
        <table><thead><tr>
          <th>Audit ID</th><th>Type</th><th>Proposed</th><th>Progress</th>
          <th>Yes</th><th>NC</th><th>N/A</th><th>Status</th>
        </tr></thead><tbody>
        ${exportRows
          .map(
            (r) => `<tr>
            <td>${esc(r.audit_id)}</td>
            <td>${esc(r.type)}</td>
            <td>${esc(r.proposed_from_to)}</td>
            <td>${esc(r.progress)}</td>
            <td>${esc(r.yes)}</td>
            <td>${esc(r.nc)}</td>
            <td>${esc(r.na)}</td>
            <td>${esc(r.status)}</td>
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
      <AuditSummaryHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
      />

      <AuditSummaryDialog
        open={showSummary}
        onOpenChange={handleSummaryDialogChange}
        plan={activePlan}
        listStats={activePlan ? statsByPlanId[activePlan.id] : null}
        initialTab={summaryTab}
      />

      <AuditSummaryTable
        rows={pagedRows}
        statsByPlanId={statsByPlanId}
        loading={listLoading}
        error={listError}
        searchActive={search.trim().length > 0}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onOpenSummary={handleOpenSummary}
      />

      <AuditSummaryFooterBar
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
