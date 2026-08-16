import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { limsDarkBarGlowStyle, limsDialogClass, limsPageShellClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { ComplaintsFooterBar } from '../ComplaintsFooterBar'
import { ComplaintsHeaderBar } from '../ComplaintsHeaderBar'
import {
  formatDateTimeDisplay,
  formatSupabaseError,
  printViaIframe,
  type EmployeeOption,
} from '../shared'
import { ComplaintFormFields } from './ComplaintFormFields'
import { ComplaintsTable } from './ComplaintsTable'
import {
  emptyComplaintForm,
  formToPayload,
  nextComplaintId,
  rowToForm,
  type ComplaintForm,
  type ComplaintRow,
} from './types'

export default function CustomerComplaintsMasterPage() {
  const [rows, setRows] = useState<ComplaintRow[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [loading, setLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ComplaintForm>(() => emptyComplaintForm())

  const canSave =
    !saveLoading &&
    form.complaintId.trim().length > 0 &&
    form.complainantName.trim().length > 0 &&
    form.description.trim().length > 0

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cmpRes, empRes] = await Promise.all([
        supabase.from('customer_complaints').select('*').order('received_at', { ascending: false }),
        supabase.from('user_profiles').select('id, full_name').order('full_name', { ascending: true }),
      ])
      if (cmpRes.error) throw cmpRes.error
      setRows((cmpRes.data ?? []) as ComplaintRow[])
      if (!empRes.error) {
        setEmployees(
          ((empRes.data ?? []) as Array<{ id: string; full_name: string | null }>).map((e) => ({
            id: e.id,
            full_name: e.full_name?.trim() || 'Unnamed',
          })),
        )
      }
    } catch (err) {
      setError(formatSupabaseError(err))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [
        r.complaint_id,
        r.complainant_name,
        r.complainant_org,
        r.description,
        r.related_activity,
        r.status,
        r.decision_outcome,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize) || 1)
  const safePage = Math.min(page, pageCount)
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  useEffect(() => {
    setPage(1)
  }, [search, pageSize])

  const handleNew = () => {
    setMessage(null)
    setEditingId(null)
    setForm(emptyComplaintForm(nextComplaintId(rows)))
    setShowForm(true)
  }

  const handleEdit = (row: ComplaintRow) => {
    setMessage(null)
    setEditingId(row.id)
    setForm(rowToForm(row))
    setShowForm(true)
  }

  const handleCopy = (row: ComplaintRow) => {
    setMessage(null)
    setEditingId(null)
    setForm({
      ...rowToForm(row),
      complaintId: nextComplaintId(rows),
      status: 'Received',
      closedAt: '',
      formalClosureNoticeSent: false,
    })
    setShowForm(true)
  }

  const handleSave = () => {
    void (async () => {
      if (!canSave) return
      setSaveLoading(true)
      setMessage(null)
      try {
        const payload = formToPayload(form)
        if (editingId) {
          const { error: err } = await supabase
            .from('customer_complaints')
            .update(payload)
            .eq('id', editingId)
          if (err) throw err
        } else {
          const { error: err } = await supabase.from('customer_complaints').insert(payload)
          if (err) throw err
        }
        setMessage('Saved successfully.')
        setShowForm(false)
        setEditingId(null)
        await load()
      } catch (err) {
        setMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const selectedRows = filtered.filter((r) => selectedIds.has(r.id))

  const handleDelete = () => {
    void (async () => {
      const ids = Array.from(selectedIds)
      if (!ids.length) return
      if (!window.confirm(`Delete ${ids.length} selected complaint(s)?`)) return
      setSaveLoading(true)
      try {
        const { error: err } = await supabase.from('customer_complaints').delete().in('id', ids)
        if (err) throw err
        setSelectedIds(new Set())
        setMessage('Deleted successfully.')
        await load()
      } catch (err) {
        setMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleExport = () => {
    const list = selectedRows.length ? selectedRows : filtered
    const headers = [
      'Complaint ID',
      'Received',
      'Complainant',
      'Org',
      'Description',
      'Validated',
      'Status',
      'Outcome',
    ]
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      headers.map(esc).join(','),
      ...list.map((r) =>
        [
          r.complaint_id,
          formatDateTimeDisplay(r.received_at),
          r.complainant_name,
          r.complainant_org ?? '',
          r.description,
          r.validated ? 'Yes' : 'No',
          r.status,
          r.decision_outcome ?? '',
        ]
          .map(esc)
          .join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'customer_complaints.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    const list = selectedRows.length ? selectedRows : filtered
    const body = list
      .map(
        (r) =>
          `<tr><td>${r.complaint_id}</td><td>${r.complainant_name}</td><td>${r.description}</td><td>${r.status}</td><td>${r.validated ? 'Yes' : 'No'}</td></tr>`,
      )
      .join('')
    printViaIframe(`<!doctype html><html><head><title>Customer Complaints</title>
<style>body{font-family:sans-serif;font-size:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:4px}th{background:#292524;color:#fde68a}</style>
</head><body><h1>Customer Complaints Records</h1>
<table><thead><tr><th>ID</th><th>Complainant</th><th>Description</th><th>Status</th><th>Validated</th></tr></thead>
<tbody>${body}</tbody></table></body></html>`)
  }

  return (
    <div className={cn(limsPageShellClass, 'flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4')}>
      <ComplaintsHeaderBar
        title="Customer Complaints Records"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search complaint ID, name, status…"
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onNew={handleNew}
        newLabel="Add Complaint"
      />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
          portalClassName="!items-stretch !justify-start md:pl-0"
          className={cn(
            limsDialogClass,
            '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
            'left-0 top-0',
            'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white sm:text-lg">
                {editingId ? 'Edit Complaint' : 'Add Complaint'}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5">
            {message && showForm ? (
              <p
                className={cn(
                  'mb-3 text-sm',
                  message.toLowerCase().includes('saved') ? 'text-emerald-700' : 'text-destructive',
                )}
              >
                {message}
              </p>
            ) : null}
            <ComplaintFormFields
              form={form}
              onChange={setForm}
              employees={employees}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={handleSave}
            />
          </div>
        </DialogContent>
      </Dialog>

      <ComplaintsTable
        rows={pageRows}
        loading={loading}
        error={error}
        searchActive={search.trim().length > 0}
        selectedIds={selectedIds}
        onToggle={(id) => {
          setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
          })
        }}
        onToggleAll={(checked) => {
          setSelectedIds((prev) => {
            const next = new Set(prev)
            pageRows.forEach((r) => (checked ? next.add(r.id) : next.delete(r.id)))
            return next
          })
        }}
        onEdit={handleEdit}
        onCopy={handleCopy}
      />

      <ComplaintsFooterBar
        message={showForm ? null : message}
        loading={saveLoading || loading}
        selectedCount={selectedIds.size}
        page={safePage}
        pageCount={pageCount}
        onExport={handleExport}
        onPrintSelected={handlePrint}
        onDeleteSelected={handleDelete}
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
