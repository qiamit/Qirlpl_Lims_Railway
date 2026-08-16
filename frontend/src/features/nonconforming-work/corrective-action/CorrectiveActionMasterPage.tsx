import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { auditTypeLabel, type AuditType } from '@/features/audit-mrm/audit-plan/types'
import { NonConformitiesDetailsDialog } from '@/features/audit-mrm/non-conformities/NonConformitiesDetailsDialog'
import { NonConformitiesDialog } from '@/features/audit-mrm/non-conformities/NonConformitiesDialog'
import {
  buildNonConformityRows,
  mapChecklistItem,
  type NonConformityRow,
} from '@/features/audit-mrm/non-conformities/types'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { supabase } from '@/lib/supabaseClient'
import { limsOutlineBtnClass, limsPageShellClass, limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { NcWorkFooterBar } from '../NcWorkFooterBar'
import { NcWorkHeaderBar } from '../NcWorkHeaderBar'
import {
  formatDateTimeDisplay,
  formatSupabaseError,
  printViaIframe,
} from '../shared'
import type { NcWorkRecordRow } from '../records/types'
import { NcWorkCapaDialog } from './NcWorkCapaDialog'
import { NcWorkDetailsDialog } from './NcWorkDetailsDialog'

type SourceFilter = 'all' | 'audit' | 'ncw'

type HubRow = {
  id: string
  source: 'audit' | 'ncw'
  primary: string
  secondary: string
  meta: string
  auditId: string
  auditType: string
  actionStarted: boolean
  auditRow?: NonConformityRow
  ncwRow?: NcWorkRecordRow
}

const GRID_TABLE =
  'table-fixed min-w-[1100px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm]'
const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'
const primaryLineClass = 'break-words text-[12.5px] font-semibold tracking-tight text-[#292524]'
const metaLineClass = 'break-words font-mono text-[11px] font-medium text-[#b45309]'
const secondaryLineClass = 'break-words text-[11px] font-medium leading-snug text-[#78716c]'
const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'
const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

export default function CorrectiveActionMasterPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialSource = (searchParams.get('source') as SourceFilter) || 'all'
  const [source, setSource] = useState<SourceFilter>(
    initialSource === 'audit' || initialSource === 'ncw' ? initialSource : 'all',
  )

  const [hubRows, setHubRows] = useState<HubRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')

  const [auditActive, setAuditActive] = useState<NonConformityRow | null>(null)
  const [showAuditDetail, setShowAuditDetail] = useState(false)
  const [showAuditAction, setShowAuditAction] = useState(false)
  const handleAuditDetail = useFormDialogOpenChange(setShowAuditDetail)
  const handleAuditAction = useFormDialogOpenChange(setShowAuditAction)

  const [ncwActive, setNcwActive] = useState<NcWorkRecordRow | null>(null)
  const [showNcwCapa, setShowNcwCapa] = useState(false)
  const handleNcwCapa = useFormDialogOpenChange(setShowNcwCapa)
  const [showNcwDetail, setShowNcwDetail] = useState(false)
  const handleNcwDetail = useFormDialogOpenChange(setShowNcwDetail)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [plansRes, itemsRes, actionsRes, ncwRes, ncwCapaRes] = await Promise.all([
        supabase.from('audit_plans').select('*').order('created_at', { ascending: false }),
        supabase
          .from('audit_checklist_items')
          .select('*')
          .eq('conformity', 'no')
          .order('sort_order', { ascending: true }),
        supabase.from('audit_nc_actions').select('checklist_item_id, immediate_correction'),
        supabase
          .from('nc_work_records')
          .select('*')
          .eq('corrective_action_required', true)
          .order('detected_at', { ascending: false }),
        supabase.from('nc_work_corrective_actions').select('nc_work_record_id, immediate_correction'),
      ])
      if (plansRes.error) throw plansRes.error
      if (itemsRes.error) throw itemsRes.error
      if (actionsRes.error) throw actionsRes.error
      if (ncwRes.error) throw ncwRes.error
      if (ncwCapaRes.error) throw ncwCapaRes.error

      const plans = (plansRes.data ?? []).map((raw) => {
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
      const items = (itemsRes.data ?? []).map((raw) =>
        mapChecklistItem(raw as Record<string, unknown>),
      )
      const actionStartedByItemId: Record<string, boolean> = {}
      for (const raw of actionsRes.data ?? []) {
        const r = raw as Record<string, unknown>
        const id = String(r.checklist_item_id ?? '')
        if (id && String(r.immediate_correction ?? '').trim()) actionStartedByItemId[id] = true
      }
      const auditRows = buildNonConformityRows(plans, items, actionStartedByItemId)

      const capaStarted: Record<string, boolean> = {}
      for (const raw of ncwCapaRes.data ?? []) {
        const r = raw as Record<string, unknown>
        const id = String(r.nc_work_record_id ?? '')
        if (id && String(r.immediate_correction ?? '').trim()) capaStarted[id] = true
      }

      const auditHub: HubRow[] = auditRows.map((r) => ({
        id: `audit:${r.id}`,
        source: 'audit' as const,
        primary: `Clause ${r.clauseNo}`,
        secondary: r.nonConformity || r.observation || '—',
        meta: '',
        auditId: r.auditId || '—',
        auditType: r.auditType || '',
        actionStarted: Boolean(r.actionStarted),
        auditRow: r,
      }))

      const ncwHub: HubRow[] = ((ncwRes.data ?? []) as NcWorkRecordRow[]).map((r) => ({
        id: `ncw:${r.id}`,
        source: 'ncw' as const,
        primary: r.nc_id,
        secondary: r.description || '—',
        meta: `${r.source_area} · ${formatDateTimeDisplay(r.detected_at)}`,
        auditId: '—',
        auditType: '',
        actionStarted: Boolean(capaStarted[r.id]),
        ncwRow: r,
      }))

      setHubRows([...auditHub, ...ncwHub])
    } catch (err) {
      setError(formatSupabaseError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const raw = searchParams.get('source')
    const next: SourceFilter =
      raw === 'audit' || raw === 'ncw' ? raw : 'all'
    setSource((prev) => (prev === next ? prev : next))
  }, [searchParams])

  // Deep-link from Audit Non Conformities list: open CAPA for a checklist item.
  useEffect(() => {
    const checklistItemId = searchParams.get('checklistItemId')?.trim()
    if (!checklistItemId || loading || hubRows.length === 0) return
    const match = hubRows.find(
      (r) => r.source === 'audit' && r.auditRow?.checklistItemId === checklistItemId,
    )
    if (!match?.auditRow) return
    setAuditActive(match.auditRow)
    setShowAuditAction(true)
    const next = new URLSearchParams(searchParams)
    next.delete('checklistItemId')
    if (!next.get('source')) next.set('source', 'audit')
    setSearchParams(next, { replace: true })
  }, [hubRows, loading, searchParams, setSearchParams])

  const filtered = useMemo(() => {
    let list = hubRows
    if (source === 'audit') list = list.filter((r) => r.source === 'audit')
    if (source === 'ncw') list = list.filter((r) => r.source === 'ncw')
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((r) =>
      `${r.primary} ${r.secondary} ${r.meta} ${r.auditId} ${r.auditType} ${r.source}`
        .toLowerCase()
        .includes(q),
    )
  }, [hubRows, source, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const selectedRows = filtered.filter((r) => selectedIds.has(r.id))

  const handleExport = () => {
    const list = selectedRows.length ? selectedRows : filtered
    const headers = ['Source', 'Reference', 'Audit ID', 'Audit Type', 'Details', 'Meta', 'CAPA Started']
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      headers.map(esc).join(','),
      ...list.map((r) =>
        [
          r.source === 'audit' ? 'Audit' : 'Lab NCW',
          r.primary,
          r.auditId,
          r.auditType,
          r.secondary,
          r.meta,
          r.actionStarted ? 'Yes' : 'No',
        ]
          .map(esc)
          .join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'corrective_actions.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    const list = selectedRows.length ? selectedRows : filtered
    const rowsHtml = list
      .map(
        (r) =>
          `<tr><td>${r.source === 'audit' ? 'Audit' : 'Lab NCW'}</td><td>${r.primary}</td><td>${r.auditId}</td><td>${r.actionStarted ? 'Yes' : 'No'}</td></tr>`,
      )
      .join('')
    printViaIframe(`<!doctype html><html><head><title>Corrective Action</title>
<style>body{font-family:sans-serif;font-size:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:4px}th{background:#444;color:#fff}</style>
</head><body><h1>Corrective Action Hub</h1>
<table><thead><tr><th>Source</th><th>Reference</th><th>Audit ID</th><th>Started</th></tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`)
  }

  return (
    <div className={cn(limsPageShellClass, 'flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4')}>
      <NcWorkHeaderBar
        title="Corrective Action"
        search={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        searchPlaceholder="Search CAPA / NC / clause…"
        pageSize={pageSize}
        onPageSizeChange={(s) => {
          setPageSize(s)
          setPage(1)
        }}
        sourceFilter={source}
        onSourceFilterChange={(v) => {
          const next = v as SourceFilter
          setSource(next)
          setPage(1)
          setSearchParams(next === 'all' ? {} : { source: next })
        }}
      />

      <div className={cn(limsPanelClass, 'min-h-0 flex-1 overflow-auto bg-[#f7f3eb]')}>
        {error ? <p className="px-3 pt-3 text-sm text-red-600">{error}</p> : null}
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-[#78716c]">Loading…</p>
        ) : pageRows.length === 0 ? (
          <div className="m-4 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-6 text-center text-sm text-[#57534e]">
            No corrective action items for this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className={GRID_TABLE}>
              <TableHeader>
                <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                  <TableHead className={cn('w-10', thBase)}>
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label="Select all"
                      checked={pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id))}
                      onChange={(e) => {
                        const next = new Set(selectedIds)
                        pageRows.forEach((r) =>
                          e.target.checked ? next.add(r.id) : next.delete(r.id),
                        )
                        setSelectedIds(next)
                      }}
                    />
                  </TableHead>
                  <TableHead className={thBase}>Audit ID</TableHead>
                  <TableHead className={thBase}>Audit Type</TableHead>
                  <TableHead className={thBase}>Source</TableHead>
                  <TableHead className={thBase}>Reference</TableHead>
                  <TableHead className={thBase}>Non Conformity</TableHead>
                  <TableHead className={thBase}>CAPA</TableHead>
                  <TableHead className={cn('w-24', thBase)}>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r, index) => {
                  const selected = selectedIds.has(r.id)
                  return (
                    <TableRow
                      key={r.id}
                      className={cn(
                        selected
                          ? rowSelectedClass
                          : index % 2 === 0
                            ? rowEvenClass
                            : rowOddClass,
                      )}
                    >
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          checked={selected}
                          onChange={() => {
                            const next = new Set(selectedIds)
                            if (next.has(r.id)) next.delete(r.id)
                            else next.add(r.id)
                            setSelectedIds(next)
                          }}
                          aria-label={`Select ${r.primary}`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <p className={metaLineClass}>{r.auditId || '—'}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <p className={metaLineClass}>
                          {r.auditType ? auditTypeLabel(r.auditType) : '—'}
                        </p>
                      </TableCell>
                      <TableCell className="text-center">
                        <p className={primaryLineClass}>
                          {r.source === 'audit' ? 'Audit' : 'Lab NCW'}
                        </p>
                      </TableCell>
                      <TableCell className="text-center">
                        <p className={metaLineClass}>{r.primary}</p>
                        {r.meta ? <p className={secondaryLineClass}>{r.meta}</p> : null}
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        <div className="flex items-center justify-center">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn(limsOutlineBtnClass, 'h-7 px-2 text-[11px]')}
                            aria-label={`View full details for ${r.primary}`}
                            onClick={() => {
                              if (r.source === 'audit' && r.auditRow) {
                                setAuditActive(r.auditRow)
                                setShowAuditDetail(true)
                              } else if (r.ncwRow) {
                                setNcwActive(r.ncwRow)
                                setShowNcwDetail(true)
                              }
                            }}
                          >
                            View
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <p className={primaryLineClass}>
                          {r.actionStarted ? 'Started' : 'Not started'}
                        </p>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="inline-flex gap-0.5">
                          {r.source === 'audit' && r.auditRow ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="rounded-none text-[#92400e]"
                              aria-label="Open CAPA"
                              onClick={() => {
                                setAuditActive(r.auditRow!)
                                setShowAuditAction(true)
                              }}
                            >
                              <Pencil size={16} />
                            </Button>
                          ) : r.ncwRow ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="rounded-none text-[#92400e]"
                              aria-label="Open CAPA"
                              onClick={() => {
                                setNcwActive(r.ncwRow!)
                                setShowNcwCapa(true)
                              }}
                            >
                              <Pencil size={16} />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <NcWorkFooterBar
        message={message}
        loading={loading}
        selectedCount={selectedIds.size}
        page={page}
        pageCount={pageCount}
        onExport={handleExport}
        onPrintSelected={handlePrint}
        hideDelete
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number(jumpTo)
          if (Number.isFinite(n) && n >= 1 && n <= pageCount) setPage(n)
        }}
      />

      <NonConformitiesDetailsDialog
        open={showAuditDetail}
        onOpenChange={handleAuditDetail}
        row={auditActive}
      />
      <NcWorkDetailsDialog
        open={showNcwDetail}
        onOpenChange={handleNcwDetail}
        row={ncwActive}
      />
      <NonConformitiesDialog
        open={showAuditAction}
        onOpenChange={handleAuditAction}
        row={auditActive}
        onSaved={() => {
          setMessage('Audit CAPA saved.')
          void load()
        }}
      />
      <NcWorkCapaDialog
        open={showNcwCapa}
        onOpenChange={handleNcwCapa}
        record={ncwActive}
        onSaved={() => {
          setMessage('Lab NCW CAPA saved.')
          void load()
        }}
      />
    </div>
  )
}
