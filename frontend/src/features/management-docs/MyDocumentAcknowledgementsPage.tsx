import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock, Eye, FileText, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { limsDarkBarBtnClass, limsDarkBarGlowStyle, limsPageShellClass, limsPanelClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { ManagementDocumentA4PreviewDialog } from './ManagementDocumentA4PreviewDialog'
import {
  acknowledgeDocument,
  docControlErrorText,
  fetchReadingList,
  formatDateTime,
  formatDay,
  isDocControlMissingError,
  probeDocumentControl,
  type ReadingListRow,
} from './documentControl'
import { MANAGEMENT_DOCS_BUCKET, type ManagementDocumentRow } from './types'

type Filter = 'to_read' | 'all'

const th = 'border border-stone-300 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-amber-100'
const td = 'border border-stone-200 px-2 py-1.5 align-top text-[13px]'

/**
 * "My documents to read" (ISO/IEC 17025 8.3.2 c): the active controlled
 * documents distributed to the signed-in person, with a read-and-understood
 * acknowledgement for the current version.
 */
export default function MyDocumentAcknowledgementsPage() {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [rows, setRows] = useState<ReadingListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('to_read')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [previewRow, setPreviewRow] = useState<ManagementDocumentRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const on = await probeDocumentControl()
    setAvailable(on)
    if (!on) {
      setRows([])
      setLoading(false)
      return
    }
    try {
      setRows(await fetchReadingList())
    } catch (err) {
      if (isDocControlMissingError(err as { code?: string; message?: string })) setAvailable(false)
      else setError(docControlErrorText(err))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toRead = rows.filter((r) => !r.acknowledged_at).length
  const shown = useMemo(() => (filter === 'to_read' ? rows.filter((r) => !r.acknowledged_at) : rows), [rows, filter])

  const view = async (r: ReadingListRow) => {
    setError(null)
    const { data, error: e } = await supabase.from('management_documents').select('*').eq('id', r.document_id).single()
    if (e) {
      setError(docControlErrorText(e))
      return
    }
    setPreviewRow(data as ManagementDocumentRow)
  }

  const openFile = async (r: ReadingListRow) => {
    if (!r.file_path) return
    setError(null)
    const { data, error: e } = await supabase.storage.from(MANAGEMENT_DOCS_BUCKET).createSignedUrl(r.file_path, 300)
    if (e || !data?.signedUrl) {
      setError(docControlErrorText(e) || 'Could not open the file.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const acknowledge = async (r: ReadingListRow) => {
    if (
      !window.confirm(
        `I confirm that I have read and understood ${r.doc_number} - ${r.title} (${r.version}) and will follow it.`,
      )
    ) {
      return
    }
    setBusyId(r.document_id)
    setError(null)
    setMessage(null)
    try {
      const ack = await acknowledgeDocument(r.document_id)
      setRows((prev) =>
        prev.map((x) => (x.document_id === r.document_id ? { ...x, acknowledged_at: ack?.acknowledged_at ?? new Date().toISOString() } : x)),
      )
      setMessage(`Acknowledged ${r.doc_number} (${r.version}).`)
    } catch (err) {
      setError(docControlErrorText(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={limsPageShellClass}>
      <div className={limsPanelClass}>
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">ISO/IEC 17025 · 8.3.2 c</p>
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">My documents to read</h1>
              <p className="text-[11px] text-stone-300">
                Controlled documents issued to you. Read each one and acknowledge it.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                aria-label="Show"
                className="h-8 border border-stone-500 bg-stone-800 px-2 text-xs text-white"
                value={filter}
                onChange={(e) => setFilter(e.target.value as Filter)}
              >
                <option value="to_read">To read ({toRead})</option>
                <option value="all">All ({rows.length})</option>
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn('h-8 gap-1.5 text-xs', limsDarkBarBtnClass)}
                onClick={() => void load()}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {available === false ? (
        <div className="border-2 border-amber-600 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Document distribution is not set up on this database yet.</p>
          <p className="mt-1 text-[13px]">
            Ask the administrator to apply migration <code>20261028100000_document_control_and_retention.sql</code>.
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="border border-red-600/50 bg-red-50 px-3 py-2 text-[13px] text-red-900">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="border border-emerald-600/50 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">
          {message}
        </p>
      ) : null}

      {available !== false ? (
        <section className={cn(limsPanelClass, 'overflow-x-auto bg-white')}>
          {loading ? (
            <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-stone-600">
              {filter === 'to_read' ? 'Nothing to read. You are up to date.' : 'No documents are distributed to you.'}
            </p>
          ) : (
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  <th className={th}>Document</th>
                  <th className={th}>Version</th>
                  <th className={th}>Effective</th>
                  <th className={th}>Status</th>
                  <th className={cn(th, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.document_id} className={r.acknowledged_at ? undefined : 'bg-amber-50/50'}>
                    <td className={td}>
                      <p className="font-semibold text-stone-900">{r.doc_number}</p>
                      <p className="text-stone-700">{r.title}</p>
                      <p className="text-[11px] text-stone-500">
                        Level {r.level} · {r.doc_type}
                        {r.distribute_to_all ? ' · all staff' : ''}
                      </p>
                    </td>
                    <td className={cn(td, 'whitespace-nowrap font-mono text-[12px]')}>{r.version}</td>
                    <td className={cn(td, 'whitespace-nowrap')}>
                      {formatDay(r.issue_date)}
                      {r.approved_by ? <p className="text-[11px] text-stone-500">Approved by {r.approved_by}</p> : null}
                    </td>
                    <td className={cn(td, 'whitespace-nowrap')}>
                      {r.acknowledged_at ? (
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Read {formatDateTime(r.acknowledged_at)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-800">
                          <Clock className="h-3.5 w-3.5" aria-hidden /> To read
                        </span>
                      )}
                    </td>
                    <td className={cn(td, 'text-right')}>
                      <div className="inline-flex flex-wrap justify-end gap-1">
                        <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => void view(r)}>
                          <Eye size={14} /> View
                        </Button>
                        {r.file_path ? (
                          <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => void openFile(r)}>
                            <FileText size={14} /> File
                          </Button>
                        ) : null}
                        {!r.acknowledged_at ? (
                          <Button
                            type="button"
                            size="sm"
                            className={cn('h-8 text-xs', limsPrimaryBtnClass)}
                            disabled={busyId === r.document_id}
                            onClick={() => void acknowledge(r)}
                          >
                            {busyId === r.document_id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                            I have read it
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      <ManagementDocumentA4PreviewDialog
        open={previewRow != null}
        row={previewRow}
        readOnly
        onOpenChange={(open) => {
          if (!open) setPreviewRow(null)
        }}
      />
    </div>
  )
}
