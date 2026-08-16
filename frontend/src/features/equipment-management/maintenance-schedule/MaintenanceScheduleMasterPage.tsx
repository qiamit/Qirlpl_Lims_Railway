import { useCallback, useEffect, useMemo, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { parseMaintenanceChecklistFromDb } from '@/features/masters/equipment-master/maintenanceChecklist'
import { parseMaintenanceHistoryFromDb } from '@/features/masters/equipment-master/maintenanceHistory'
import {
  LastMaintenanceDetailsDialog,
  type LastMaintenanceDetails,
} from './LastMaintenanceDetailsDialog'
import { MaintenanceScheduleFooterBar } from './MaintenanceScheduleFooterBar'
import { MaintenanceScheduleHeaderBar } from './MaintenanceScheduleHeaderBar'
import { MaintenanceScheduleTable } from './MaintenanceScheduleTable'
import {
  dueLabel,
  formatDateDisplay,
  mapEquipmentToScheduleRow,
  MAINTENANCE_SOURCE_LABELS,
  type DueBucket,
  type MaintenanceScheduleRow,
  type MaintenanceSource,
} from './types'

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

const SELECT_COLS =
  'id, asset_code, equipment_name, current_location, equipment_status, maintenance_schedule_frequency, last_maintenance_date, next_maintenance_date'

const DETAIL_COLS =
  'id, asset_code, equipment_name, current_location, maintenance_schedule_frequency, last_maintenance_date, next_maintenance_date, maintenance_done_by, maintenance_checklist, maintenance_history'

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  )
}

async function resolveDoneByName(raw: string | null | undefined): Promise<string> {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  if (!isUuidLike(value)) return value
  const { data } = await supabase
    .from('user_profiles')
    .select('full_name')
    .eq('id', value)
    .maybeSingle()
  return String(data?.full_name ?? '').trim() || value
}

function tableForSource(
  source: MaintenanceSource,
): 'equipment_master' | 'equipment_for_calibration' | 'iqc_masters' {
  if (source === 'testing_master') return 'equipment_master'
  if (source === 'testing_iqc') return 'iqc_masters'
  return 'equipment_for_calibration'
}

function printViaIframe(html: string) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
  })
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  if (!doc) {
    document.body.removeChild(iframe)
    return
  }
  doc.open()
  doc.write(html)
  doc.close()
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe)
      }, 1000)
    }
  }
}

function sortScheduleRows(a: MaintenanceScheduleRow, b: MaintenanceScheduleRow) {
  const rank = (bucket: DueBucket) =>
    bucket === 'overdue' ? 0 : bucket === 'due_soon' ? 1 : bucket === 'ok' ? 2 : 3
  const byDue = rank(a.dueBucket) - rank(b.dueBucket)
  if (byDue !== 0) return byDue
  const aNext = a.nextMaintenanceDate || '9999-99-99'
  const bNext = b.nextMaintenanceDate || '9999-99-99'
  if (aNext !== bNext) return aNext.localeCompare(bNext)
  return a.equipmentName.localeCompare(b.equipmentName)
}

export default function MaintenanceScheduleMasterPage() {
  const [rows, setRows] = useState<MaintenanceScheduleRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | MaintenanceSource>('all')
  const [dueFilter, setDueFilter] = useState<'all' | DueBucket>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [jumpTo, setJumpTo] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [details, setDetails] = useState<LastMaintenanceDetails | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [testingRes, calibRes, iqcRes] = await Promise.all([
        supabase.from('equipment_master').select(SELECT_COLS).order('equipment_name'),
        supabase
          .from('equipment_for_calibration')
          .select(`${SELECT_COLS}, is_iqc_master`)
          .order('equipment_name'),
        supabase.from('iqc_masters').select(SELECT_COLS).order('equipment_name'),
      ])

      if (testingRes.error) throw testingRes.error
      if (calibRes.error) throw calibRes.error
      if (iqcRes.error) throw iqcRes.error

      const testing = (testingRes.data ?? []).map((r) =>
        mapEquipmentToScheduleRow({ ...r, source: 'testing_master' }),
      )
      const calibAll = calibRes.data ?? []
      const calibMaster = calibAll
        .filter((r) => !r.is_iqc_master)
        .map((r) => mapEquipmentToScheduleRow({ ...r, source: 'calibration_master' }))
      const calibIqc = calibAll
        .filter((r) => Boolean(r.is_iqc_master))
        .map((r) => mapEquipmentToScheduleRow({ ...r, source: 'calibration_iqc' }))
      const testingIqc = (iqcRes.data ?? []).map((r) =>
        mapEquipmentToScheduleRow({ ...r, source: 'testing_iqc' }),
      )

      setRows([...testing, ...calibMaster, ...testingIqc, ...calibIqc].sort(sortScheduleRows))
      setSelectedKeys(new Set())
    } catch (err) {
      setError(formatSupabaseError(err))
      setRows([])
      setSelectedKeys(new Set())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false
      if (dueFilter !== 'all' && r.dueBucket !== dueFilter) return false
      if (!q) return true
      return [r.assetCode, r.equipmentName, r.location, r.frequency, r.status, MAINTENANCE_SOURCE_LABELS[r.source]]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [rows, search, sourceFilter, dueFilter])

  const counts = useMemo(() => {
    let overdue = 0
    let dueSoon = 0
    for (const r of rows) {
      if (r.dueBucket === 'overdue') overdue += 1
      if (r.dueBucket === 'due_soon') dueSoon += 1
    }
    return { total: rows.length, overdue, dueSoon }
  }, [rows])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize) || 1)
  const safePage = Math.min(page, pageCount)
  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, safePage, pageSize])

  useEffect(() => {
    setPage(1)
  }, [search, sourceFilter, dueFilter, pageSize])

  const exportRows = useMemo(() => {
    if (selectedKeys.size === 0) return filtered
    return filtered.filter((r) => selectedKeys.has(r.key))
  }, [filtered, selectedKeys])

  const handleToggle = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleToggleAll = (checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      for (const r of paged) {
        if (checked) next.add(r.key)
        else next.delete(r.key)
      }
      return next
    })
  }

  const handleViewLastMaintenance = (row: MaintenanceScheduleRow) => {
    void (async () => {
      setDetailsOpen(true)
      setDetailsLoading(true)
      setDetailsError(null)
      setDetails(null)
      try {
        const table = tableForSource(row.source)
        const { data, error: fetchError } = await supabase
          .from(table)
          .select(DETAIL_COLS)
          .eq('id', row.equipmentId)
          .maybeSingle()
        if (fetchError) throw fetchError
        if (!data) throw new Error('Equipment record not found.')

        const doneByName = await resolveDoneByName(
          (data as { maintenance_done_by?: string | null }).maintenance_done_by,
        )
        const mapped = mapEquipmentToScheduleRow({
          ...data,
          source: row.source,
        })
        setDetails({
          source: row.source,
          assetCode: mapped.assetCode || row.assetCode,
          equipmentName: mapped.equipmentName || row.equipmentName,
          location: mapped.location || row.location,
          frequency: mapped.frequency || row.frequency,
          lastMaintenanceDate: mapped.lastMaintenanceDate || row.lastMaintenanceDate,
          nextMaintenanceDate: mapped.nextMaintenanceDate || row.nextMaintenanceDate,
          doneByName,
          checklist: parseMaintenanceChecklistFromDb(
            (data as { maintenance_checklist?: unknown }).maintenance_checklist,
          ),
          history: parseMaintenanceHistoryFromDb(
            (data as { maintenance_history?: unknown }).maintenance_history,
          ),
        })
      } catch (err) {
        setDetailsError(formatSupabaseError(err))
      } finally {
        setDetailsLoading(false)
      }
    })()
  }

  const handleExport = () => {
    const headers = [
      'Equipment Name',
      'Asset Code',
      'Source',
      'Location',
      'Status',
      'Frequency',
      'Last Maintenance',
      'Next Due',
      'Schedule Status',
    ]
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      headers.map(esc).join(','),
      ...exportRows.map((r) =>
        [
          r.equipmentName,
          r.assetCode,
          MAINTENANCE_SOURCE_LABELS[r.source],
          r.location,
          r.status,
          r.frequency,
          r.lastMaintenanceDate,
          r.nextMaintenanceDate,
          dueLabel(r),
        ]
          .map(esc)
          .join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'maintenance_schedule.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    const rowsHtml = exportRows
      .map(
        (r) => `<tr>
<td>${r.equipmentName}<br/>${r.assetCode}</td>
<td>${MAINTENANCE_SOURCE_LABELS[r.source]}</td>
<td>${r.location || '—'}</td>
<td>${r.frequency || '—'}</td>
<td>${formatDateDisplay(r.lastMaintenanceDate)}</td>
<td>${formatDateDisplay(r.nextMaintenanceDate)}</td>
<td>${dueLabel(r)}</td>
</tr>`,
      )
      .join('')
    printViaIframe(`<!doctype html><html><head><title>Maintenance Schedule</title>
<style>
@page{size:A4 landscape;margin:10mm}
body{font-family:Segoe UI,sans-serif;font-size:9pt}
h1{font-size:14pt;margin:0 0 8px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #444;padding:4px;vertical-align:top}
th{background:#1c1917;color:#fde68a}
</style></head><body>
<h1>Maintenance Schedule</h1>
<p>Testing · Calibration · IQC — ${exportRows.length} row(s)</p>
<table><thead><tr>
<th>Equipment</th><th>Source</th><th>Location</th><th>Frequency</th><th>Last</th><th>Next Due</th><th>Schedule Status</th>
</tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`)
  }

  return (
    <div className={cn(limsPageShellClass, 'space-y-4 sm:space-y-5')}>
      <MaintenanceScheduleHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
        dueFilter={dueFilter}
        onDueFilterChange={setDueFilter}
        counts={counts}
      />

      <MaintenanceScheduleTable
        rows={paged}
        loading={loading}
        error={error}
        searchActive={
          search.trim().length > 0 || sourceFilter !== 'all' || dueFilter !== 'all'
        }
        selectedKeys={selectedKeys}
        onToggle={handleToggle}
        onToggleAll={handleToggleAll}
        onViewLastMaintenance={handleViewLastMaintenance}
      />

      <LastMaintenanceDetailsDialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open)
          if (!open) {
            setDetails(null)
            setDetailsError(null)
          }
        }}
        details={details}
        loading={detailsLoading}
        error={detailsError}
      />

      <MaintenanceScheduleFooterBar
        message={
          counts.overdue > 0
            ? `${counts.overdue} overdue · ${counts.dueSoon} due soon`
            : counts.dueSoon > 0
              ? `${counts.dueSoon} due within 14 days`
              : null
        }
        selectedCount={selectedKeys.size}
        loading={loading}
        page={safePage}
        pageCount={pageCount}
        onExport={handleExport}
        onPrint={handlePrint}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number(jumpTo)
          if (Number.isInteger(n) && n >= 1 && n <= pageCount) setPage(n)
        }}
      />
    </div>
  )
}
