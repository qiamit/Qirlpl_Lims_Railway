import { useCallback, useEffect, useMemo, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { isSupabaseMissingColumnError } from '@/lib/supabaseErrors'
import { SampleSrfViewDialog } from '@/features/sample-handling/shared/SampleSrfViewDialog'
import { RetainDisposedFooterBar } from './RetainDisposedFooterBar'
import { RetainDisposedHeaderBar } from './RetainDisposedHeaderBar'
import { RetainDisposedQuantityDialog } from './RetainDisposedQuantityDialog'
import { RetainDisposedRecordDialog } from './RetainDisposedRecordDialog'
import { RetainDisposedTable } from './RetainDisposedTable'
import {
  computeRetentionDueDate,
  compareRetainDisposedRows,
  deriveRetentionStatus,
  type SampleDisposalOutcome,
} from './sampleRetention'
import { fetchIsCodeLabelMap } from './isCodeLabel'
import type { RetainDisposedFilter, RetainDisposedListRow } from './types'

function mapRow(r: Record<string, unknown>, isMap: Map<string, string>): RetainDisposedListRow {
  const issuedAt = (r.test_report_issued_at as string) ?? null
  const retentionDueDate =
    (r.sample_retention_due_date as string) ?? computeRetentionDueDate(issuedAt)
  const disposedAt = (r.sample_disposed_at as string) ?? null
  const disposalOutcome = (r.sample_disposal_outcome as SampleDisposalOutcome | null) ?? null
  const storedStatus = (r.sample_retention_status as string) ?? null
  const isId = (r.test_report_is_code_id as string) ?? null

  return {
    id: r.id as string,
    srfNumber: (r.srf_number as string) ?? null,
    isCodeId: isId,
    isCodeLabel: isId ? (isMap.get(isId) ?? null) : null,
    sampleQuantity: (r.sample_quantity as string) ?? null,
    issuedAt,
    retentionDueDate,
    quantityRetained: (r.quantity_retained as string) ?? null,
    quantityDisposed: (r.quantity_disposed as string) ?? null,
    disposedAt,
    disposalOutcome,
    retentionStatus: deriveRetentionStatus({
      issuedAt,
      disposedAt,
      disposalOutcome,
      retentionDueDate,
      storedStatus,
    }),
  }
}

export default function RetainDisposedMasterPage() {
  const [rows, setRows] = useState<RetainDisposedListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<RetainDisposedFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const [srfViewOpen, setSrfViewOpen] = useState(false)
  const [srfViewRow, setSrfViewRow] = useState<RetainDisposedListRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editRow, setEditRow] = useState<RetainDisposedListRow | null>(null)
  const [quantityViewOpen, setQuantityViewOpen] = useState(false)
  const [quantityViewRow, setQuantityViewRow] = useState<RetainDisposedListRow | null>(null)

  const loadList = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const selectFields =
        'id, srf_number, sample_quantity, test_report_is_code_id, test_report_issued_at, sample_retention_due_date, quantity_retained, quantity_disposed, sample_disposed_at, sample_disposal_outcome, sample_retention_status'

      const mapSamples = async (list: Record<string, unknown>[]) => {
        const isIds = [
          ...new Set(
            list
              .map((r) => r.test_report_is_code_id as string | null)
              .filter(Boolean),
          ),
        ] as string[]
        const isMap = await fetchIsCodeLabelMap(isIds)
        const mapped = list.map((r) => mapRow(r, isMap))
        mapped.sort(compareRetainDisposedRows)
        return mapped
      }

      const { data, error: qErr } = await supabase
        .from('samples')
        .select(selectFields)
        .eq('stage', 'completed')
        .not('test_report_issued_at', 'is', null)
        .order('sample_retention_due_date', { ascending: true, nullsFirst: false })

      if (qErr && isSupabaseMissingColumnError(qErr, 'sample_retention_due_date')) {
        const { data: fallback, error: fbErr } = await supabase
          .from('samples')
          .select('id, srf_number, sample_quantity, test_report_is_code_id, test_report_issued_at')
          .eq('stage', 'completed')
          .not('test_report_issued_at', 'is', null)
          .order('test_report_issued_at', { ascending: false, nullsFirst: false })
        if (fbErr) throw fbErr
        setRows(await mapSamples(Array.isArray(fallback) ? fallback : []))
        setError(
          'Retention columns not found. Run migration 20260618000006_sample_retention_disposal.sql on Supabase.',
        )
        return
      }

      if (qErr) throw qErr
      setRows(await mapSamples(Array.isArray(data) ? data : []))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load retention records')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const filtered = useMemo(() => {
    let list = rows
    if (filter === 'retained') {
      list = list.filter((r) => r.retentionStatus === 'retained')
    } else if (filter === 'due') {
      list = list.filter((r) => r.retentionStatus === 'due')
    } else if (filter === 'closed') {
      list = list.filter((r) => r.retentionStatus === 'disposed' || r.retentionStatus === 'returned')
    }

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((r) =>
        [r.srfNumber, r.isCodeLabel, r.quantityRetained, r.quantityDisposed]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    }

    return [...list].sort(compareRetainDisposedRows)
  }, [rows, search, filter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  )

  const selectedCount = useMemo(
    () => filtered.filter((r) => selectedIds.has(r.id)).length,
    [filtered, selectedIds],
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
  }, [search, pageSize, filter])

  const openViewSrf = (row: RetainDisposedListRow) => {
    setSrfViewRow(row)
    setSrfViewOpen(true)
  }

  const openEdit = (row: RetainDisposedListRow) => {
    setEditRow(row)
    setEditOpen(true)
  }

  const openViewQuantity = (row: RetainDisposedListRow) => {
    setQuantityViewRow(row)
    setQuantityViewOpen(true)
  }

  const handleSaveRecord = async (payload: {
    quantityRetained: string
    quantityDisposed: string
    disposedAt: string
    disposalOutcome: SampleDisposalOutcome | ''
  }) => {
    if (!editRow) return
    setSaving(true)
    setSaveMessage(null)
    try {
      const closing = Boolean(payload.disposedAt && payload.disposalOutcome)
      const retentionStatus = closing
        ? payload.disposalOutcome === 'returned_to_customer'
          ? 'returned'
          : 'disposed'
        : deriveRetentionStatus({
            issuedAt: editRow.issuedAt,
            disposedAt: null,
            disposalOutcome: null,
            retentionDueDate: editRow.retentionDueDate,
          })

      const updatePayload: Record<string, string | null> = {
        quantity_retained: payload.quantityRetained || null,
        quantity_disposed: payload.quantityDisposed || null,
        sample_disposed_at: payload.disposedAt || null,
        sample_disposal_outcome: payload.disposalOutcome || null,
        sample_retention_status: retentionStatus,
      }

      const { error: uErr } = await supabase
        .from('samples')
        .update(updatePayload)
        .eq('id', editRow.id)
      if (uErr) throw uErr

      await loadList()
      setSaveMessage(`Retention record saved for ${editRow.srfNumber ?? 'SRF'}.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={limsPageShellClass}>
      <RetainDisposedHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        filter={filter}
        onFilterChange={setFilter}
      />

      <RetainDisposedTable
        rows={paged}
        loading={loading}
        error={error}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onViewSrf={openViewSrf}
        onViewQuantity={openViewQuantity}
        onEdit={openEdit}
      />

      <RetainDisposedFooterBar
        loading={loading}
        message={saveMessage}
        selectedCount={selectedCount}
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

      <SampleSrfViewDialog
        open={srfViewOpen}
        onOpenChange={(o) => {
          if (!o) setSrfViewRow(null)
          setSrfViewOpen(o)
        }}
        sampleId={srfViewRow?.id ?? null}
        fallbackSrf={srfViewRow?.srfNumber}
        fallbackIsLabel={srfViewRow?.isCodeLabel}
      />

      <RetainDisposedQuantityDialog
        open={quantityViewOpen}
        onOpenChange={(o) => {
          if (!o) setQuantityViewRow(null)
          setQuantityViewOpen(o)
        }}
        row={quantityViewRow}
      />

      <RetainDisposedRecordDialog
        open={editOpen}
        onOpenChange={(o) => {
          if (!o) setEditRow(null)
          setEditOpen(o)
        }}
        row={editRow}
        saving={saving}
        onSave={handleSaveRecord}
      />
    </div>
  )
}
