import { useCallback, useEffect, useMemo, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { normalizeTeamRows, type AuditPlanRow, type AuditType } from '@/features/audit-mrm/audit-plan/types'
import { AuditChecklistDialog } from './AuditChecklistDialog'
import { AuditChecklistFooterBar } from './AuditChecklistFooterBar'
import { AuditChecklistHeaderBar } from './AuditChecklistHeaderBar'
import { AuditChecklistTable } from './AuditChecklistTable'
import { ISO_17025_AUDIT_CLAUSE_COUNT } from './iso17025Clauses'
import {
  auditTypeLabel,
  formatDate,
  formatProposedRange,
  type ChecklistProgress,
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

export default function AuditChecklistMasterPage() {
  const [rows, setRows] = useState<AuditPlanRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [progressByPlanId, setProgressByPlanId] = useState<Record<string, ChecklistProgress>>({})

  const [activePlan, setActivePlan] = useState<AuditPlanRow | null>(null)
  const [showChecklist, setShowChecklist] = useState(false)
  const handleChecklistOpenChange = useFormDialogOpenChange(setShowChecklist)

  const loadProgress = useCallback(async (planIds: string[]) => {
    if (planIds.length === 0) {
      setProgressByPlanId({})
      return
    }
    try {
      const { data, error } = await supabase
        .from('audit_checklist_items')
        .select('audit_plan_id, conformity')
        .in('audit_plan_id', planIds)
      if (error) throw error

      const map: Record<string, ChecklistProgress> = {}
      for (const id of planIds) {
        map[id] = { total: 0, answered: 0 }
      }
      for (const raw of Array.isArray(data) ? data : []) {
        const r = raw as { audit_plan_id?: string; conformity?: string }
        const pid = String(r.audit_plan_id ?? '')
        if (!pid || !map[pid]) continue
        map[pid].total += 1
        const c = String(r.conformity ?? '').toLowerCase()
        if (c === 'yes' || c === 'no' || c === 'na') map[pid].answered += 1
      }
      setProgressByPlanId(map)
    } catch {
      // Progress is optional; keep list usable
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
      await loadProgress(list.map((r) => r.id))
    } catch (err) {
      setListError(formatSupabaseError(err))
      setRows([])
      setProgressByPlanId({})
    } finally {
      setListLoading(false)
    }
  }, [loadProgress])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const teamBlob = r.team_rows
        .map((t) => [t.auditee, t.auditor, t.criteria].join(' '))
        .join(' ')
      const hay = [
        r.audit_id,
        auditTypeLabel(r.audit_type),
        r.proposed_from,
        r.proposed_to,
        r.next_audit_date,
        teamBlob,
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

  const handleOpenChecklist = (row: AuditPlanRow) => {
    setMessage(null)
    setActivePlan(row)
    setShowChecklist(true)
  }

  const handleChecklistDialogChange = (open: boolean) => {
    handleChecklistOpenChange(open)
    if (!open) {
      setActivePlan(null)
      void loadProgress(rows.map((r) => r.id))
    }
  }

  const handleProgressChange = useCallback((planId: string, answered: number, total: number) => {
    setProgressByPlanId((prev) => ({
      ...prev,
      [planId]: { answered, total: total || ISO_17025_AUDIT_CLAUSE_COUNT },
    }))
  }, [])

  const handleExport = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows
    const headers = [
      'audit_id',
      'audit_type',
      'proposed_from',
      'proposed_to',
      'next_audit_date',
      'checklist_answered',
      'checklist_total',
    ]
    const lines = exportRows.map((r) => {
      const p = progressByPlanId[r.id]
      return {
        audit_id: r.audit_id,
        audit_type: r.audit_type,
        proposed_from: r.proposed_from,
        proposed_to: r.proposed_to,
        next_audit_date: r.next_audit_date,
        checklist_answered: p ? String(p.answered) : '0',
        checklist_total: p && p.total > 0 ? String(p.total) : String(ISO_17025_AUDIT_CLAUSE_COUNT),
      }
    })
    const csv = toCsv(headers, lines)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'audit_checklists.csv'
    a.click()
    URL.revokeObjectURL(url)
    setMessage('Exported.')
  }

  const handlePrint = () => {
    const printRows = selectedRows.length > 0 ? selectedRows : filteredRows
    if (printRows.length === 0) return
    const cards = printRows
      .map((r) => {
        const p = progressByPlanId[r.id]
        const progress =
          p && p.total > 0 ? `${p.answered}/${p.total}` : `0/${ISO_17025_AUDIT_CLAUSE_COUNT} (not started)`
        return `
          <section class="card">
            <div class="card-header">
              <div>
                <div class="title">${esc(r.audit_id)}</div>
                <div class="subtitle">${esc(auditTypeLabel(r.audit_type))} · Next: ${esc(formatDate(r.next_audit_date))}</div>
              </div>
              <div class="badge">${esc(formatProposedRange(r.proposed_from, r.proposed_to))}</div>
            </div>
            <p class="body">Checklist progress: ${esc(progress)}</p>
          </section>`
      })
      .join('')

    const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Audit Checklists</title>
<style>
  body{margin:24px;font-family:ui-sans-serif,system-ui,sans-serif;color:#0b1220}
  .card{border:1px solid #e7eaf0;border-radius:12px;margin-bottom:16px;overflow:hidden;break-inside:avoid}
  .card-header{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;background:#0f172a;color:#fff}
  .title{font-size:18px;font-weight:700}.subtitle{font-size:12px;opacity:.85;margin-top:2px}
  .badge{font-size:12px;background:rgba(255,255,255,.1);padding:6px 10px;border-radius:999px}
  .body{padding:12px 16px;font-size:13px}
</style></head><body>${cards}
<script>window.addEventListener('load',function(){setTimeout(function(){try{window.focus();window.print()}catch(e){}},250)})</script>
</body></html>`

    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.setAttribute('aria-hidden', 'true')
    document.body.appendChild(iframe)

    const cleanup = () => {
      try {
        document.body.removeChild(iframe)
      } catch {
        // ignore
      }
    }

    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) {
      cleanup()
      setMessage('Unable to open print preview.')
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
        window.setTimeout(cleanup, 500)
      }
    }
  }

  return (
    <div className={limsPageShellClass}>
      <AuditChecklistHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
      />

      <AuditChecklistDialog
        open={showChecklist}
        onOpenChange={handleChecklistDialogChange}
        plan={activePlan}
        onProgressChange={handleProgressChange}
      />

      <AuditChecklistTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        searchActive={search.trim().length > 0}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        progressByPlanId={progressByPlanId}
        onOpenChecklist={handleOpenChecklist}
      />

      <AuditChecklistFooterBar
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
