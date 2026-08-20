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
  localNowInputValue,
  printViaIframe,
  type EmployeeOption,
} from '../shared'
import { FeedbackFormFields } from './FeedbackFormFields'
import { FeedbackTable } from './FeedbackTable'
import {
  emptyFeedbackForm,
  formToPayload,
  nextFeedbackId,
  rowToForm,
  type FeedbackForm,
  type FeedbackRow,
} from './types'

export default function CustomerFeedbackMasterPage({
  evaluationMode = false,
}: {
  evaluationMode?: boolean
}) {
  const [rows, setRows] = useState<FeedbackRow[]>([])
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
  const [form, setForm] = useState<FeedbackForm>(() => emptyFeedbackForm())

  const canSave =
    !saveLoading &&
    form.feedbackId.trim().length > 0 &&
    (evaluationMode
      ? form.evaluationNotes.trim().length > 0 ||
        form.significance.trim().length > 0 ||
        form.actionsDecided.trim().length > 0
      : form.customerName.trim().length > 0 && form.description.trim().length > 0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [fbRes, empRes] = await Promise.all([
        supabase.from('customer_feedback').select('*').order('received_at', { ascending: false }),
        supabase.from('user_profiles').select('id, full_name').order('full_name', { ascending: true }),
      ])
      if (fbRes.error) throw fbRes.error
      setRows((fbRes.data ?? []) as FeedbackRow[])
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
    let list = rows
    if (evaluationMode) {
      list = list.filter((r) => r.status === 'Open' || r.status === 'Under Evaluation')
    }
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((r) =>
      [
        r.feedback_id,
        r.customer_name,
        r.customer_org,
        r.description,
        r.feedback_type,
        r.status,
        r.evaluation_status,
        r.significance,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [rows, search, evaluationMode])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize) || 1)
  const safePage = Math.min(page, pageCount)
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  useEffect(() => {
    setPage(1)
  }, [search, pageSize, evaluationMode])

  const handleNew = () => {
    setMessage(null)
    setEditingId(null)
    setForm(emptyFeedbackForm(nextFeedbackId(rows)))
    setShowForm(true)
  }

  const handleEdit = (row: FeedbackRow) => {
    setMessage(null)
    setEditingId(row.id)
    const next = rowToForm(row)
    if (evaluationMode && !next.evaluatedAt) {
      next.evaluatedAt = localNowInputValue()
      if (next.evaluationStatus === 'Pending') next.evaluationStatus = 'In Progress'
      if (next.status === 'Open') next.status = 'Under Evaluation'
    }
    setForm(next)
    setShowForm(true)
  }

  const handleCopy = (row: FeedbackRow) => {
    setMessage(null)
    setEditingId(null)
    setForm({
      ...rowToForm(row),
      feedbackId: nextFeedbackId(rows),
      status: 'Open',
      evaluationStatus: 'Pending',
      evaluationNotes: '',
      significance: '',
      actionsDecided: '',
      improvementActions: '',
      evaluatedAt: '',
      evaluatedByEmployeeId: '',
      evaluatedByName: '',
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
            .from('customer_feedback')
            .update(payload)
            .eq('id', editingId)
          if (err) throw err
        } else {
          const { error: err } = await supabase.from('customer_feedback').insert(payload)
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
      if (!window.confirm(`Delete ${ids.length} selected feedback record(s)?`)) return
      setSaveLoading(true)
      try {
        const { error: err } = await supabase.from('customer_feedback').delete().in('id', ids)
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
      'Feedback ID',
      'Received',
      'Customer',
      'Type',
      'Description',
      'Status',
      'Evaluation Status',
      'Significance',
      'Actions Decided',
    ]
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      headers.map(esc).join(','),
      ...list.map((r) =>
        [
          r.feedback_id,
          formatDateTimeDisplay(r.received_at),
          r.customer_name,
          r.feedback_type,
          r.description,
          r.status,
          r.evaluation_status,
          r.significance ?? '',
          r.actions_decided ?? '',
        ]
          .map(esc)
          .join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = evaluationMode ? 'feedback_evaluation.csv' : 'customer_feedback.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    const list = selectedRows.length ? selectedRows : filtered
    const body = list
      .map(
        (r) =>
          `<tr><td>${r.feedback_id}</td><td>${r.customer_name}</td><td>${r.feedback_type}</td><td>${r.description}</td><td>${r.evaluation_status}</td></tr>`,
      )
      .join('')
    printViaIframe(`<!doctype html><html><head><title>${evaluationMode ? 'Feedback Evaluation' : 'Customer Feedback'}</title>
<style>body{font-family:sans-serif;font-size:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:4px}th{background:#292524;color:#fde68a}</style>
</head><body><h1>${evaluationMode ? 'Feedback Evaluation' : 'Customer Feedback'}</h1>
<table><thead><tr><th>ID</th><th>Customer</th><th>Type</th><th>Description</th><th>Eval</th></tr></thead>
<tbody>${body}</tbody></table></body></html>`)
  }

  return (
    <div className={cn(limsPageShellClass, 'flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4')}>
      <ComplaintsHeaderBar
        title={evaluationMode ? 'Feedback Evaluation' : 'Customer Feedback'}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={
          evaluationMode ? 'Search feedback for evaluation…' : 'Search feedback ID, customer, type…'
        }
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onNew={evaluationMode ? undefined : handleNew}
        newLabel="Add Feedback"
      />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          portalClassName="!items-stretch !justify-start md:pl-0"
          className={cn(
            limsDialogClass,
            '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
            'left-0 top-0',
            'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white sm:text-lg">
                {evaluationMode
                  ? 'Evaluate Feedback'
                  : editingId
                    ? 'Edit Feedback'
                    : 'Add Feedback'}
              </DialogTitle>
              <p className="mt-0.5 text-xs text-stone-300">
                {evaluationMode
                  ? 'ISO 17025 — evaluate, decide actions, close the loop'
                  : 'Customer Feedback register'}
              </p>
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
            <FeedbackFormFields
              form={form}
              onChange={setForm}
              employees={employees}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={handleSave}
              evaluationFocus={evaluationMode}
            />
          </div>
        </DialogContent>
      </Dialog>

      <FeedbackTable
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
        onCopy={evaluationMode ? undefined : handleCopy}
        evaluationMode={evaluationMode}
      />

      <ComplaintsFooterBar
        message={showForm ? null : message}
        loading={saveLoading || loading}
        selectedCount={selectedIds.size}
        page={safePage}
        pageCount={pageCount}
        onExport={handleExport}
        onPrintSelected={handlePrint}
        onDeleteSelected={evaluationMode ? undefined : handleDelete}
        hideDelete={evaluationMode}
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
