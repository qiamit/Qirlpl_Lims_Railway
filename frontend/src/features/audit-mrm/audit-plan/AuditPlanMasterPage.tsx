import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  LAB_NAME_STORAGE_KEY,
  LAB_NAME_CHANGED_EVENT,
} from '@/features/settings/lab-settings/brandMark'
import { LAB_SETTINGS_SINGLETON_ID } from '@/features/settings/lab-settings/labSettingsDb'
import { AuditPlanForm } from './AuditPlanForm'
import { AuditPlanFooterBar } from './AuditPlanFooterBar'
import { AuditPlanHeaderBar } from './AuditPlanHeaderBar'
import { AuditPlanTable } from './AuditPlanTable'
import {
  auditTypeLabel,
  emptyAuditPlanForm,
  formTeamToPayload,
  formatDate,
  formatProposedRange,
  formatTeamAuditee,
  formatTeamAuditor,
  formatTeamCriteria,
  getAuditFirmInitials,
  nextAuditPlanId,
  normalizeTeamRows,
  rowToForm,
  type AuditPlanForm as AuditPlanFormType,
  type AuditPlanRow,
  type AuditType,
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

export default function AuditPlanMasterPage() {
  const [rows, setRows] = useState<AuditPlanRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')

  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AuditPlanFormType>(() => emptyAuditPlanForm())
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [firmInitials, setFirmInitials] = useState('QI')

  const dateRangeValid =
    form.proposedFrom.length > 0 &&
    form.proposedTo.length > 0 &&
    form.proposedFrom <= form.proposedTo

  const canSave =
    !saveLoading &&
    Boolean(form.auditType) &&
    dateRangeValid &&
    form.nextAuditDate.trim().length > 0 &&
    form.auditId.trim().length > 0

  const resolveFirmInitials = useCallback(async () => {
    let labName = ''
    try {
      if (typeof window !== 'undefined') {
        labName = window.localStorage.getItem(LAB_NAME_STORAGE_KEY)?.trim() ?? ''
      }
    } catch {
      // ignore
    }
    try {
      const { data } = await supabase
        .from('lab_settings')
        .select('lab_name')
        .eq('id', LAB_SETTINGS_SINGLETON_ID)
        .maybeSingle()
      const fromDb = String((data as { lab_name?: string } | null)?.lab_name ?? '').trim()
      if (fromDb) labName = fromDb
    } catch {
      // keep localStorage / fallback
    }
    const initials = getAuditFirmInitials(labName, 'QI')
    setFirmInitials(initials)
    return initials
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
    } catch (err) {
      setListError(formatSupabaseError(err))
      setRows([])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void resolveFirmInitials()
    void loadRows()
  }, [resolveFirmInitials, loadRows])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LAB_NAME_STORAGE_KEY) return
      void resolveFirmInitials()
    }
    const onLabNameChanged = () => {
      void resolveFirmInitials()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(LAB_NAME_CHANGED_EVENT, onLabNameChanged)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(LAB_NAME_CHANGED_EVENT, onLabNameChanged)
    }
  }, [resolveFirmInitials])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const teamBlob = r.team_rows
        .map((t) =>
          [
            formatTeamAuditee(t),
            formatTeamAuditor(t),
            formatTeamCriteria(t),
            t.auditeeDivision,
            t.auditeeDepartment,
            t.auditeeDesignation,
            t.auditorDivision,
            t.auditorDepartment,
            t.auditorDesignation,
            ...(t.criteriaClauseNos ?? []),
          ].join(' '),
        )
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

  const allocateAuditId = useCallback(
    async (initials?: string) => {
      const fi = initials ?? (await resolveFirmInitials())
      return nextAuditPlanId(
        fi,
        rows.map((r) => r.audit_id),
      )
    },
    [resolveFirmInitials, rows],
  )

  const handleNew = () => {
    void (async () => {
      setSaveMessage(null)
      setEditingId(null)
      const auditId = await allocateAuditId(firmInitials)
      setForm(emptyAuditPlanForm(auditId))
      setShowForm(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })()
  }

  const handleEdit = (row: AuditPlanRow) => {
    setSaveMessage(null)
    setEditingId(row.id)
    setForm(rowToForm(row, false))
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCopy = (row: AuditPlanRow) => {
    void (async () => {
      setSaveMessage(null)
      setEditingId(null)
      const nextId = await allocateAuditId(firmInitials)
      setForm(rowToForm(row, true, nextId))
      setShowForm(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })()
  }

  const handleSave = () => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        if (!dateRangeValid) {
          setSaveMessage('Proposed From date must be on or before Proposed To date.')
          return
        }
        if (!form.nextAuditDate.trim()) {
          setSaveMessage('Next Audit Date is required.')
          return
        }

        let auditId = form.auditId.trim()
        if (!editingId) {
          auditId = await allocateAuditId()
        }

        const payload = {
          ...(editingId ? { id: editingId } : null),
          audit_type: form.auditType,
          proposed_from: form.proposedFrom,
          proposed_to: form.proposedTo,
          audit_id: auditId,
          next_audit_date: form.nextAuditDate,
          team_rows: formTeamToPayload(form.teamRows),
        }

        const { error } = await supabase.from('audit_plans').upsert(payload, {
          onConflict: editingId ? 'id' : 'audit_id',
        })
        if (error) throw error

        setSaveMessage('Saved successfully.')
        setForm(emptyAuditPlanForm())
        setEditingId(null)
        setShowForm(false)
        await loadRows()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
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

  const handleDeleteSelected = () => {
    void (async () => {
      if (selectedRows.length === 0) return
      const ok = window.confirm(`Delete ${selectedRows.length} selected audit plan(s)?`)
      if (!ok) return
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const ids = selectedRows.map((r) => r.id)
        const { error } = await supabase.from('audit_plans').delete().in('id', ids)
        if (error) throw error
        setSaveMessage('Deleted successfully.')
        setSelectedIds(new Set())
        await loadRows()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleExport = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows
    const headers = [
      'audit_id',
      'audit_type',
      'proposed_from',
      'proposed_to',
      'next_audit_date',
      'team_rows',
      'created_at',
    ]
    const lines = exportRows.map((r) => ({
      audit_id: r.audit_id,
      audit_type: r.audit_type,
      proposed_from: formatDate(r.proposed_from),
      proposed_to: formatDate(r.proposed_to),
      next_audit_date: formatDate(r.next_audit_date),
      team_rows: JSON.stringify(r.team_rows),
      created_at: r.created_at ?? '',
    }))
    const csv = toCsv(headers, lines)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'audit_plans.csv'
    a.click()
    URL.revokeObjectURL(url)
    setSaveMessage('Exported.')
  }

  const handlePrintSelected = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows
    if (exportRows.length === 0) return

    const cards = exportRows
      .map((r) => {
        const teamHtml =
          r.team_rows.length === 0
            ? '<tr><td colspan="3">—</td></tr>'
            : r.team_rows
                .map(
                  (t) =>
                    `<tr><td>${esc(formatTeamAuditee(t) || '—')}</td><td>${esc(formatTeamAuditor(t) || '—')}</td><td>${esc(formatTeamCriteria(t) || '—')}</td></tr>`,
                )
                .join('')
        return `
          <section class="card">
            <div class="card-header">
              <div>
                <div class="title">${esc(r.audit_id)}</div>
                <div class="subtitle">${esc(auditTypeLabel(r.audit_type))} · Next: ${esc(formatDate(r.next_audit_date))}</div>
              </div>
              <div class="badge">${esc(formatProposedRange(r.proposed_from, r.proposed_to))}</div>
            </div>
            <table class="team">
              <thead><tr><th>Auditee</th><th>Auditor</th><th>Criteria</th></tr></thead>
              <tbody>${teamHtml}</tbody>
            </table>
          </section>`
      })
      .join('')

    const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Audit Plans</title>
<style>
  body{margin:24px;font-family:ui-sans-serif,system-ui,sans-serif;color:#0b1220}
  .card{border:1px solid #e7eaf0;border-radius:12px;margin-bottom:16px;overflow:hidden;break-inside:avoid}
  .card-header{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;background:#0f172a;color:#fff}
  .title{font-size:18px;font-weight:700}.subtitle{font-size:12px;opacity:.85;margin-top:2px}
  .badge{font-size:12px;background:rgba(255,255,255,.1);padding:6px 10px;border-radius:999px}
  .team{width:100%;border-collapse:collapse;font-size:13px}
  .team th,.team td{border:1px solid #e7eaf0;padding:8px 10px;text-align:left}
  .team th{background:#f5f7fb;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
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
      setSaveMessage('Unable to open print preview.')
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
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-3 sm:space-y-5 sm:p-4 md:p-6">
      <AuditPlanHeaderBar search={search} onSearchChange={setSearch} onNew={handleNew} />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-5xl gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:w-full sm:rounded-lg [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/10 [&>button]:hover:opacity-100"
          aria-describedby={undefined}
        >
          <div className="relative bg-slate-900 px-4 py-4 text-white sm:px-6 sm:py-5">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.12]"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(45,212,191,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.35) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
            <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
            <DialogHeader className="relative pr-8 text-left">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                {editingId ? 'Audit Plan · Edit Entry' : 'Audit Plan · New Entry'}
              </p>
              <DialogTitle className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {editingId ? 'Edit Audit Plan' : 'Add New Audit Plan'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="max-h-[min(72vh,720px)] overflow-y-auto overflow-x-hidden bg-[#fafbfc] px-4 py-4 sm:px-6 sm:py-5">
            {saveMessage && showForm ? (
              <p className="mb-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {saveMessage}
              </p>
            ) : null}
            <AuditPlanForm
              form={form}
              onChange={setForm}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={handleSave}
            />
          </div>
        </DialogContent>
      </Dialog>

      <AuditPlanTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        searchActive={search.trim().length > 0}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onEdit={handleEdit}
        onCopy={handleCopy}
      />

      <AuditPlanFooterBar
        message={showForm ? null : saveMessage}
        loading={saveLoading}
        selectedCount={selectedIds.size}
        totalCount={filteredRows.length}
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onExport={handleExport}
        onPrintSelected={handlePrintSelected}
        onDeleteSelected={handleDeleteSelected}
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
