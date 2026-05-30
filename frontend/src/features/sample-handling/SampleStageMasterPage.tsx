import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Copy, Pencil } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, ChevronRight, Download, FileUp, Printer, Trash2 } from 'lucide-react'
import type { SampleRow, SampleStage } from './types'

const formatSupabaseError = (err: unknown) => {
  if (!err || typeof err !== 'object') return 'Unknown error'
  return (err as { message?: string }).message ?? 'Unknown error'
}

function toCsv(headers: string[], rows: Array<Record<string, string>>) {
  const esc = (v: string) => (/[",\n\r]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''))
  return [headers.map(esc).join(','), ...rows.map((r) => headers.map((h) => esc(r[h] ?? '')).join(','))].join('\n')
}

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : '-')

type Props = {
  stage: SampleStage
  title: string
  /** Optional: next stage to move samples to (e.g. allocation from receiving) */
  nextStage?: SampleStage
}

export default function SampleStageMasterPage({ stage, title, nextStage }: Props) {
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [rows, setRows] = useState<SampleRow[]>([])
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')

  const loadRows = async () => {
    setListError(null)
    setListLoading(true)
    try {
      const { data, error } = await supabase
        .from('samples')
        .select('*, clients(company_name)')
        .eq('stage', stage)
        .order('created_at', { ascending: false })
      if (error) throw error
      const list = (Array.isArray(data) ? data : []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        sample_code: (r.sample_code as string) ?? null,
        client_id: (r.client_id as string) ?? null,
        client_name: (r.clients as { company_name?: string } | null)?.company_name ?? null,
        description: (r.description as string) ?? null,
        matrix: (r.matrix as string) ?? null,
        received_at: r.received_at != null ? new Date(r.received_at as string).toISOString().slice(0, 16) : null,
        received_by: (r.received_by as string) ?? null,
        collection_date: (r.collection_date as string) ?? null,
        collection_location: (r.collection_location as string) ?? null,
        storage_conditions: (r.storage_conditions as string) ?? null,
        storage_location: (r.storage_location as string) ?? null,
        status: (r.status as string) ?? null,
        stage: (r.stage as SampleRow['stage']) ?? null,
        quantity: typeof r.quantity === 'number' ? r.quantity : null,
        quantity_unit: (r.quantity_unit as string) ?? null,
        condition_on_receipt: (r.condition_on_receipt as SampleRow['condition_on_receipt']) ?? null,
        condition_notes: (r.condition_notes as string) ?? null,
        test_request_ids: Array.isArray(r.test_request_ids) ? (r.test_request_ids as string[]) : [],
        created_at: (r.created_at as string) ?? undefined,
        updated_at: (r.updated_at as string) ?? undefined,
      }))
      setRows(list)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load samples')
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => { void loadRows() }, [stage])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => [r.sample_code, r.client_name, r.description, r.matrix].filter(Boolean).join(' ').toLowerCase().includes(q))
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pagedRows = useMemo(() => filteredRows.slice((page - 1) * pageSize, page * pageSize), [filteredRows, page, pageSize])
  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(r.id)), [rows, selectedIds])

  const toggleRow = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleAll = (checked: boolean) => setSelectedIds((prev) => { const n = new Set(prev); pagedRows.forEach((r) => (checked ? n.add(r.id) : n.delete(r.id))); return n })

  const handleMoveToNextStage = () => {
    if (!nextStage || selectedRows.length === 0) return
    void (async () => {
      setSaveMessage(null)
      try {
        const { error } = await supabase.from('samples').update({ stage: nextStage }).in('id', selectedRows.map((r) => r.id))
        if (error) throw error
        setSaveMessage(`Moved ${selectedRows.length} sample(s) to next stage.`)
        setSelectedIds(new Set())
        await loadRows()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      }
    })()
  }

  const handleDeleteSelected = () => {
    if (selectedRows.length === 0) return
    if (!window.confirm(`Delete ${selectedRows.length} selected sample(s)?`)) return
    void (async () => {
      setSaveMessage(null)
      setListLoading(true)
      try {
        const { error } = await supabase.from('samples').delete().in('id', selectedRows.map((r) => r.id))
        if (error) throw error
        setSaveMessage('Deleted successfully.')
        setSelectedIds(new Set())
        await loadRows()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setListLoading(false)
      }
    })()
  }

  const handleExport = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows
    const headers = ['id', 'sample_code', 'client_name', 'description', 'matrix', 'received_at', 'stage']
    const lines = exportRows.map((r) => ({ id: r.id, sample_code: r.sample_code ?? '', client_name: r.client_name ?? '', description: r.description ?? '', matrix: r.matrix ?? '', received_at: r.received_at ?? '', stage: r.stage ?? '' }))
    const blob = new Blob([toCsv(headers, lines)], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `samples_${stage}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    setSaveMessage('Exported.')
  }

  const allChecked = rows.length > 0 && pagedRows.every((r) => selectedIds.has(r.id))
  const someChecked = pagedRows.some((r) => selectedIds.has(r.id))

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-md border bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <h1 className="text-2xl font-semibold text-foreground whitespace-nowrap">{title}</h1>
          <div className="md:w-[40%]">
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="w-28">
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 / page</SelectItem>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="20">20 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {nextStage && (
          <Button type="button" onClick={handleMoveToNextStage} disabled={selectedIds.size === 0}>
            Move selected to next stage
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          {listError && <p className="text-sm text-destructive">{listError}</p>}
          {listLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No samples in this stage yet.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <div className="w-full">
                <div className="grid grid-cols-[44px_1.2fr_1.5fr_1fr_1fr_96px] bg-muted/50 text-xs font-semibold divide-x divide-border">
                  <div className="p-3 flex items-center justify-center">
                    <input type="checkbox" aria-label="Select all" checked={allChecked} ref={(el) => { if (el) el.indeterminate = !allChecked && someChecked }} onChange={(e) => toggleAll(e.target.checked)} />
                  </div>
                  <div className="p-3">Sample Code</div>
                  <div className="p-3 text-center">Client / Description</div>
                  <div className="p-3 text-center">Matrix</div>
                  <div className="p-3 text-center">Received</div>
                  <div className="p-3 text-center">Action</div>
                </div>
                {pagedRows.map((r) => (
                  <div key={r.id} className="grid grid-cols-[44px_1.2fr_1.5fr_1fr_1fr_96px] border-t text-sm divide-x divide-border">
                    <div className="p-3 flex items-center justify-center">
                      <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleRow(r.id)} />
                    </div>
                    <div className="p-3 font-medium">{fmt(r.sample_code)}</div>
                    <div className="p-3 text-center"><div className="text-xs">{fmt(r.client_name)}</div><div className="text-xs text-muted-foreground">{fmt(r.description)}</div></div>
                    <div className="p-3 text-center text-xs">{fmt(r.matrix)}</div>
                    <div className="p-3 text-center text-xs">{fmt(r.received_at)}</div>
                    <div className="p-3 flex items-center justify-center gap-1">
                      <Button type="button" size="icon" variant="ghost" aria-label="Edit" disabled><Pencil size={16} /></Button>
                      <Button type="button" size="icon" variant="ghost" aria-label="Copy" disabled><Copy size={16} /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-md border bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled><FileUp size={16} /> Import</Button>
            <Button type="button" variant="outline" onClick={handleExport} disabled={listLoading}><Download size={16} /> Export</Button>
            <Button type="button" variant="outline" disabled><Printer size={16} /> Print</Button>
            <Button type="button" variant="destructive" onClick={handleDeleteSelected} disabled={listLoading || selectedIds.size === 0}><Trash2 size={16} /> Delete</Button>
          </div>
          <div className="flex items-center gap-2">
            {saveMessage && <p className="text-sm text-emerald-700">{saveMessage}</p>}
            <span className="text-xs text-muted-foreground">Selected: {selectedIds.size}</span>
            <Input className="h-9 w-20" placeholder="Page" value={jumpTo} onChange={(e) => setJumpTo(e.target.value.replace(/[^0-9]/g, ''))} />
            <Button type="button" variant="outline" size="sm" onClick={() => { const n = Number(jumpTo); if (Number.isFinite(n) && n > 0) setPage(Math.min(pageCount, Math.max(1, Math.floor(n)))); setJumpTo('') }}>Jump</Button>
            <Button type="button" variant="outline" size="icon" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={16} /></Button>
            <span className="text-xs text-muted-foreground">Page {page} / {pageCount}</span>
            <Button type="button" variant="outline" size="icon" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}><ChevronRight size={16} /></Button>
          </div>
        </div>
      </div>
    </div>
  )
}
