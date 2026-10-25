import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { csvCell } from '@/lib/csv'
import { limsDarkBarGlowStyle, limsDialogClass, limsPageShellClass, limsRegistryFormClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { assertAllowedUpload, uploadContentType } from '@/lib/validateUpload'
import { useAuth } from '@/hooks/useAuth'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { X } from 'lucide-react'
import { ManagementDocumentsHeaderBar, type StatusCounts } from './ManagementDocumentsHeaderBar'
import { ManagementDocumentsTable } from './ManagementDocumentsTable'
import { ManagementDocumentsFooterBar } from './ManagementDocumentsFooterBar'
import { ManagementDocumentsForm, type EmployeeOption } from './ManagementDocumentsForm'
import { ManagementDocumentA4PreviewDialog } from './ManagementDocumentA4PreviewDialog'
import { fetchActiveUserProfiles } from '@/features/sample-handling/shared/fetchActiveUserProfiles'
import { DocumentWorkflowPanel } from './DocumentWorkflowPanel'
import { DocumentDistributionDialog } from './DocumentDistributionDialog'
import {
  buildMasterListCsv,
  docControlErrorText,
  downloadCsv,
  isDocControlMissingError,
  isDocumentApprover,
  isLockedStatus,
  probeDocumentControl,
  reviewDueState,
  startDocumentChange,
  workflowStage,
  writeManagementDocument,
} from './documentControl'
import {
  defaultDocTypeForLevel,
  emptyManagementDocumentForm,
  formToDbPayload,
  levelPageTitle,
  MANAGEMENT_DOCS_BUCKET,
  nextControlNumber,
  rowToForm,
  rowToVersionSnapshot,
  todayIsoDate,
  type ManagementDocChangeType,
  type ManagementDocLevel,
  type ManagementDocStatus,
  type ManagementDocumentForm,
  type ManagementDocumentRow,
} from './types'

function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function toCsv(headers: string[], rows: Array<Record<string, string>>) {
  const esc = (v: string) => csvCell(v)
  const lines = [headers.map(esc).join(',')]
  for (const r of rows) {
    lines.push(headers.map((h) => esc(r[h] ?? '')).join(','))
  }
  return lines.join('\n')
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const flushCell = () => {
    row.push(cell)
    cell = ''
  }
  const flushRow = () => {
    flushCell()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      flushCell()
      continue
    }
    if (ch === '\n') {
      flushRow()
      continue
    }
    if (ch === '\r') continue
    cell += ch
  }
  if (cell.length || row.length) flushRow()
  return rows.filter((r) => r.some((c) => c.trim().length > 0))
}

export default function ManagementDocumentsMasterPage({ level }: { level: ManagementDocLevel }) {
  const { profileName, user, designation, departmentName } = useAuth()
  const currentUserName = profileName.trim() || user?.email?.split('@')[0] || 'User'
  const isApprover = isDocumentApprover(designation, departmentName)
  /** Migration 20261028100000 applied: e-approval workflow, review, distribution. */
  const [docControl, setDocControl] = useState(false)
  const [editingRow, setEditingRow] = useState<ManagementDocumentRow | null>(null)
  const [distributionRow, setDistributionRow] = useState<ManagementDocumentRow | null>(null)

  const [rows, setRows] = useState<ManagementDocumentRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ManagementDocStatus | 'all'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ManagementDocumentForm>(() => ({
    ...emptyManagementDocumentForm(),
    docType: defaultDocTypeForLevel(level),
  }))
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const importInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const uploadTargetRef = useRef<ManagementDocumentRow | null>(null)

  const [uploadBusy, setUploadBusy] = useState(false)
  const [previewRow, setPreviewRow] = useState<ManagementDocumentRow | null>(null)
  const [showA4Preview, setShowA4Preview] = useState(false)
  const [previewAutoPrint, setPreviewAutoPrint] = useState(false)

  const title = levelPageTitle(level)

  useEffect(() => {
    let cancelled = false
    void probeDocumentControl().then((on) => {
      if (!cancelled) setDocControl(on)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const profiles = await fetchActiveUserProfiles()
        setEmployees(
          profiles.map((p) => ({ id: p.id, name: p.name, designation: p.designation })),
        )
      } catch {
        setEmployees([])
      }
    })()
  }, [])

  const loadRows = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    const { data, error } = await supabase
      .from('management_documents')
      .select('*')
      .eq('level', level)
      .order('doc_number', { ascending: true })

    if (error) {
      setListError(formatSupabaseError(error))
      setRows([])
    } else {
      setRows((data ?? []) as ManagementDocumentRow[])
    }
    setListLoading(false)
  }, [level])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  useEffect(() => {
    setSearch('')
    setStatusFilter('all')
    setSelectedIds(new Set())
    setPage(1)
    setShowForm(false)
    setEditingId(null)
    setForm({
      ...emptyManagementDocumentForm(),
      docType: defaultDocTypeForLevel(level),
      ownerName: currentUserName,
    })
  }, [level, currentUserName])

  const statusCounts = useMemo<StatusCounts>(() => {
    const counts: StatusCounts = {
      all: rows.length,
      draft: 0,
      under_review: 0,
      active: 0,
      obsolete: 0,
    }
    for (const r of rows) {
      counts[r.status] = (counts[r.status] ?? 0) + 1
    }
    return counts
  }, [rows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (!q) return true
      return (
        r.doc_number.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.doc_type.toLowerCase().includes(q) ||
        (r.owner_name ?? '').toLowerCase().includes(q) ||
        (r.remark ?? '').toLowerCase().includes(q)
      )
    })
  }, [rows, search, statusFilter])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, pageSize])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

  const canSave =
    form.docNumber.trim().length > 0 && form.title.trim().length > 0 && !saveLoading

  const assistantContext = useMemo(() => {
    const sample = filteredRows
      .slice(0, 12)
      .map((r) => `${r.doc_number} | ${r.title} | ${r.status} | Rev ${r.revision_no}`)
      .join('\n')
    return `Level ${level} documents (${filteredRows.length} shown).\n${sample || 'No documents.'}`
  }, [filteredRows, level])

  const handleNew = () => {
    setSaveMessage(null)
    setEditingId(null)
    setEditingRow(null)
    setForm({
      ...emptyManagementDocumentForm(),
      docType: defaultDocTypeForLevel(level),
      ownerName: currentUserName,
    })
    setShowForm(true)
  }

  const handleEdit = (row: ManagementDocumentRow) => {
    setSaveMessage(null)
    setEditingId(row.id)
    setEditingRow(row)
    setForm(rowToForm(row))
    setShowForm(true)
  }

  /** A workflow step or distribution change returned the updated row. */
  const applyUpdatedRow = (updated: ManagementDocumentRow) => {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
    if (editingId === updated.id) {
      setEditingRow(updated)
      setForm(rowToForm(updated))
    }
  }

  const handleViewDocument = (row: ManagementDocumentRow) => {
    setPreviewAutoPrint(false)
    setPreviewRow(row)
    setShowA4Preview(true)
  }

  const handlePrintDocument = (row: ManagementDocumentRow) => {
    setPreviewAutoPrint(true)
    setPreviewRow(row)
    setShowA4Preview(true)
  }

  const handleStatusChange = async (row: ManagementDocumentRow, status: ManagementDocStatus) => {
    if (row.status === status) return
    setStatusUpdatingId(row.id)
    setMessage(null)
    const previous = row.status
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)))
    try {
      const { error } = await supabase
        .from('management_documents')
        .update({ status })
        .eq('id', row.id)
      if (error) throw error
    } catch (err) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: previous } : r)))
      setMessage(formatSupabaseError(err))
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const handleUploadDocument = (row: ManagementDocumentRow) => {
    uploadTargetRef.current = row
    uploadInputRef.current?.click()
  }

  const handleUploadFileSelected = async (file: File) => {
    const row = uploadTargetRef.current
    uploadTargetRef.current = null
    if (!row) return

    setUploadBusy(true)
    setMessage(null)
    try {
      assertAllowedUpload(file, { maxBytes: 50 * 1024 * 1024 })
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-')
      const objectPath = `level-${row.level}/${row.id}/${Date.now()}-${safeName}`
      const { error: uploadError } = await supabase.storage
        .from(MANAGEMENT_DOCS_BUCKET)
        .upload(objectPath, file, { upsert: false, contentType: uploadContentType(file) })
      if (uploadError) throw uploadError

      const { error: updateError } = await supabase
        .from('management_documents')
        .update({ file_path: objectPath })
        .eq('id', row.id)
      if (updateError) throw updateError

      setMessage(`Document uploaded for ${row.doc_number}.`)
      await loadRows()
    } catch (err) {
      setMessage(formatSupabaseError(err))
    } finally {
      setUploadBusy(false)
    }
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaveLoading(true)
    setSaveMessage(null)

    const payload = formToDbPayload(
      {
        ...form,
        // Owner = logged-in user (set on create; keep existing on edit if already stored)
        ownerName: editingId ? form.ownerName.trim() || currentUserName : currentUserName,
      },
      level,
    )

    try {
      const { error } = await writeManagementDocument(payload, editingId)
      if (error) throw error
      setShowForm(false)
      setEditingId(null)
      setEditingRow(null)
      setMessage('Document saved.')
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    } finally {
      setSaveLoading(false)
    }
  }

  const archiveAndAdvance = async (changeType: ManagementDocChangeType) => {
    if (!editingId) {
      setSaveMessage('Save the document first, then use New Revision / Issue / Amendment.')
      return
    }

    setSaveLoading(true)
    setSaveMessage(null)

    if (docControl && changeType !== 'manual_save') {
      // Document control: the database archives the version (with content and
      // signatures) and starts the change as a Draft in one transaction.
      try {
        const locked = editingRow ? isLockedStatus(editingRow.status) : false
        if (!locked) {
          const { error: saveErr } = await writeManagementDocument(formToDbPayload(form, level), editingId)
          if (saveErr) throw saveErr
        }
        const updated = await startDocumentChange(editingId, changeType)
        applyUpdatedRow(updated)
        setEditingRow(updated)
        setForm(rowToForm(updated))
        setMessage(
          `${changeType === 'revision' ? 'New revision' : changeType === 'issue' ? 'New issue' : 'New amendment'} started as Draft (previous version archived). Submit it for review when ready.`,
        )
        await loadRows()
        setSaveLoading(false)
        return
      } catch (err) {
        const e = err as { code?: string; message?: string }
        if (!isDocControlMissingError(e)) {
          setSaveMessage(docControlErrorText(err))
          setSaveLoading(false)
          return
        }
        // RPC not on this database: fall back to the original flow below.
      }
    }

    try {
      // Persist unsaved form edits first so history snapshot matches UI
      const payload = formToDbPayload(form, level)
      const { error: saveErr } = await supabase
        .from('management_documents')
        .update(payload)
        .eq('id', editingId)
      if (saveErr) throw saveErr

      const { data: current, error: fetchErr } = await supabase
        .from('management_documents')
        .select('*')
        .eq('id', editingId)
        .single()
      if (fetchErr) throw fetchErr

      const currentRow = current as ManagementDocumentRow
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const { error: histErr } = await supabase
        .from('management_document_versions')
        .insert(rowToVersionSnapshot(currentRow, changeType, user?.id ?? null))
      if (histErr) throw histErr

      const today = todayIsoDate()
      let nextForm = rowToForm(currentRow)

      if (changeType === 'revision') {
        nextForm = {
          ...nextForm,
          revisionNo: nextControlNumber(currentRow.revision_no),
          revisionDate: today,
          issueNo: '00',
          issueDate: '',
          amendmentNo: '00',
          amendmentDate: '',
          preparedBy: '',
          reviewedBy: '',
          approvedBy: '',
          status: 'draft',
          filePath: '',
        }
      } else if (changeType === 'issue') {
        nextForm = {
          ...nextForm,
          issueNo: nextControlNumber(currentRow.issue_no),
          issueDate: today,
        }
      } else if (changeType === 'amendment') {
        nextForm = {
          ...nextForm,
          amendmentNo: nextControlNumber(currentRow.amendment_no),
          amendmentDate: today,
        }
      }

      const { error: advErr } = await supabase
        .from('management_documents')
        .update(formToDbPayload(nextForm, level))
        .eq('id', editingId)
      if (advErr) throw advErr

      setForm(nextForm)
      setMessage(
        changeType === 'revision'
          ? 'New revision started (previous version archived).'
          : changeType === 'issue'
            ? 'New issue started (previous version archived).'
            : 'New amendment started (previous version archived).',
      )
      await loadRows()
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    } finally {
      setSaveLoading(false)
    }
  }

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(pagedRows.map((r) => r.id)))
  }

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} selected document(s)?`)) return

    const { error } = await supabase.from('management_documents').delete().in('id', ids)
    if (error) {
      setMessage(formatSupabaseError(error))
      return
    }
    setSelectedIds(new Set())
    setMessage('Deleted selected documents.')
    await loadRows()
  }

  const handleExportMasterList = async () => {
    setMessage(null)
    const { data, error } = await supabase
      .from('management_documents')
      .select('*')
      .order('level', { ascending: true })
      .order('doc_number', { ascending: true })
    if (error) {
      setMessage(formatSupabaseError(error))
      return
    }
    const names = new Map(employees.map((e) => [e.id, e.name]))
    downloadCsv(
      `master-list-of-documents-${todayIsoDate()}.csv`,
      buildMasterListCsv((data ?? []) as ManagementDocumentRow[], names),
    )
    setMessage(`Master list exported (${(data ?? []).length} documents).`)
  }

  const controlCounts = useMemo(() => {
    let review = 0
    let approve = 0
    let overdue = 0
    for (const r of rows) {
      const stage = workflowStage(r)
      if (stage === 'review') review += 1
      if (stage === 'approve') approve += 1
      if (reviewDueState(r) === 'overdue') overdue += 1
    }
    return { review, approve, overdue }
  }, [rows])

  const editingLocked = docControl && editingRow != null && isLockedStatus(editingRow.status)
  const signaturesLocked =
    docControl && !(!editingId && isApprover && (form.status === 'active' || form.status === 'obsolete'))
  const allowedStatuses: ManagementDocStatus[] | undefined = !docControl
    ? undefined
    : editingId
      ? []
      : isApprover
        ? ['draft', 'under_review', 'active', 'obsolete']
        : ['draft', 'under_review']
  const changeButtonsDisabled =
    editingLocked &&
    !isApprover &&
    !(editingRow?.prepared_by_id && user?.id && editingRow.prepared_by_id === user.id)

  const handleExport = () => {
    const source = selectedIds.size > 0 ? rows.filter((r) => selectedIds.has(r.id)) : filteredRows
    const headers = [
      'doc_number',
      'title',
      'doc_type',
      'revision_no',
      'revision_date',
      'issue_no',
      'issue_date',
      'amendment_no',
      'amendment_date',
      'prepared_by',
      'reviewed_by',
      'approved_by',
      'status',
      'owner_name',
      'remark',
    ]
    const csvRows = source.map((r) => ({
      doc_number: r.doc_number,
      title: r.title,
      doc_type: r.doc_type,
      revision_no: r.revision_no ?? '',
      revision_date: r.revision_date ?? '',
      issue_no: r.issue_no ?? '',
      issue_date: r.issue_date ?? '',
      amendment_no: r.amendment_no ?? '',
      amendment_date: r.amendment_date ?? '',
      prepared_by: r.prepared_by ?? '',
      reviewed_by: r.reviewed_by ?? '',
      approved_by: r.approved_by ?? '',
      status: r.status,
      owner_name: r.owner_name ?? '',
      remark: r.remark ?? '',
    }))
    const blob = new Blob([toCsv(headers, csvRows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `level-${level}-documents.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => importInputRef.current?.click()

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      if (parsed.length < 2) {
        setMessage('Import file has no data rows.')
        return
      }
      const headers = parsed[0].map((h) => h.trim().toLowerCase())
      const idx = (name: string) => headers.indexOf(name)
      const payloads = parsed.slice(1).map((cells) => {
        const get = (name: string) => {
          const i = idx(name)
          return i >= 0 ? (cells[i] ?? '').trim() : ''
        }
        const statusRaw = get('status').toLowerCase().replace(/\s+/g, '_')
        const status: ManagementDocStatus =
          statusRaw === 'active' ||
          statusRaw === 'obsolete' ||
          statusRaw === 'under_review' ||
          statusRaw === 'draft'
            ? statusRaw
            : 'draft'
        return {
          level,
          doc_number: get('doc_number'),
          title: get('title'),
          doc_type: get('doc_type') || defaultDocTypeForLevel(level),
          revision_no: get('revision_no') || get('revision') || '00',
          revision_date: get('revision_date') || get('effective_date') || null,
          issue_no: get('issue_no') || '00',
          issue_date: get('issue_date') || null,
          amendment_no: get('amendment_no') || '00',
          amendment_date: get('amendment_date') || null,
          prepared_by: get('prepared_by') || null,
          reviewed_by: get('reviewed_by') || null,
          approved_by: get('approved_by') || null,
          status,
          owner_name: get('owner_name') || null,
          remark: get('remark') || null,
        }
      }).filter((p) => p.doc_number && p.title)

      if (payloads.length === 0) {
        setMessage('No valid rows found (need doc_number and title).')
        return
      }

      const { error } = await supabase
        .from('management_documents')
        .upsert(payloads, { onConflict: 'level,doc_number' })
      if (error) throw error
      setMessage(`Imported ${payloads.length} document(s).`)
      await loadRows()
    } catch (err) {
      setMessage(formatSupabaseError(err))
    }
  }

  const handlePrintSelected = () => {
    const source = selectedIds.size > 0 ? rows.filter((r) => selectedIds.has(r.id)) : filteredRows
    const html = `
      <html><head><title>${title}</title>
      <style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ccc;padding:6px 8px;font-size:12px;text-align:left}th{background:#f3f4f6}</style>
      </head><body>
      <h1>${title}</h1>
      <table><thead><tr>
        <th>Doc No</th><th>Title</th><th>Type</th><th>Rev</th><th>Issue</th><th>Status</th>
      </tr></thead><tbody>
      ${source
        .map(
          (r) =>
            `<tr><td>${r.doc_number}</td><td>${r.title}</td><td>${r.doc_type}</td><td>${r.revision_no}</td><td>${r.issue_no ?? ''}</td><td>${r.status}</td></tr>`,
        )
        .join('')}
      </tbody></table></body></html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <div className={limsPageShellClass}>
      <ManagementDocumentsHeaderBar
        level={level}
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onNew={handleNew}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusCounts={statusCounts}
        assistantContext={assistantContext}
        onAssistantDataChanged={() => void loadRows()}
      />

      {docControl ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-2 border-stone-500 bg-[#fffcf7] px-3 py-1.5 text-[12px] text-stone-700">
          <span className="font-semibold uppercase tracking-wide text-amber-800">Document control</span>
          <span>Awaiting review: {controlCounts.review}</span>
          <span>Awaiting approval: {controlCounts.approve}</span>
          <span className={controlCounts.overdue ? 'font-semibold text-red-700' : undefined}>
            Periodic review overdue: {controlCounts.overdue}
          </span>
          <Link to="/management-docs/my-acknowledgements" className="ml-auto font-semibold text-amber-800 underline">
            My documents to read
          </Link>
        </div>
      ) : null}

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          showCloseButton={false}
          aria-describedby={undefined}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          className={cn(
            limsDialogClass,
            'max-h-[92vh] w-[calc(100vw-1rem)] max-w-3xl',
            '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
            'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 lg:w-[min(48rem,calc(100vw-268px-2rem))] lg:max-w-[min(48rem,calc(100vw-268px-2rem))] md:!-translate-x-1/2 md:!-translate-y-1/2',
          )}
        >
          <div className="relative flex items-center gap-3 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative min-w-0 flex-1 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {editingId ? 'Edit Document' : 'Add Document'}
              </DialogTitle>
            </DialogHeader>
            <DialogClose
              className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-none border !border-red-600 !bg-red-600 !text-white shadow-sm transition-colors hover:!border-red-700 hover:!bg-red-700 hover:!text-white focus:outline-none focus:ring-2 focus:!ring-red-500 focus:ring-offset-2"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5 !text-white" strokeWidth={2.75} aria-hidden />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>

          <div
            className={cn(
              limsRegistryFormClass,
              'max-h-[min(72vh,720px)] overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5',
            )}
          >
            {saveMessage ? (
              <p className="mb-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {saveMessage}
              </p>
            ) : null}
            <ManagementDocumentsForm
              form={form}
              onChange={setForm}
              canSave={canSave}
              saveLoading={saveLoading}
              onSave={() => void handleSave()}
              editingId={editingId}
              employees={employees}
              onNewRevision={() => void archiveAndAdvance('revision')}
              onNewIssue={() => void archiveAndAdvance('issue')}
              onNewAmendment={() => void archiveAndAdvance('amendment')}
              readOnly={editingLocked}
              signaturesLocked={signaturesLocked}
              allowedStatuses={allowedStatuses}
              changeButtonsDisabled={changeButtonsDisabled}
            >
              {docControl && editingLocked ? (
                <p className="mt-4 border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-[13px] text-amber-950">
                  {editingRow?.status === 'obsolete'
                    ? 'This document is obsolete and read-only.'
                    : 'This document is approved and read-only. Use New Revision, New Issue or New Amendment to change it; the change goes through review and approval again.'}
                </p>
              ) : null}
              {docControl && !editingId ? (
                <p className="mt-4 text-[12px] text-stone-600">
                  Save as Draft, then open the document again and use Submit for review. Prepared / Reviewed /
                  Approved are filled from the signed-in people.
                </p>
              ) : null}
              {docControl && editingRow ? (
                <div className="mt-4">
                  <DocumentWorkflowPanel
                    row={editingRow}
                    currentUserId={user?.id ?? null}
                    isApprover={isApprover}
                    onChanged={(updated, msg) => {
                      applyUpdatedRow(updated)
                      setMessage(msg)
                    }}
                  />
                </div>
              ) : null}
            </ManagementDocumentsForm>
          </div>
        </DialogContent>
      </Dialog>

      <ManagementDocumentsTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        searchActive={search.trim().length > 0 || statusFilter !== 'all'}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAll}
        onPrint={handlePrintDocument}
        onView={handleViewDocument}
        onEdit={handleEdit}
        onUpload={handleUploadDocument}
        onStatusChange={(row, status) => void handleStatusChange(row, status)}
        statusUpdatingId={statusUpdatingId}
        docControl={docControl}
        onDistribution={(row) => setDistributionRow(row)}
      />

      <DocumentDistributionDialog
        open={distributionRow != null}
        row={distributionRow}
        users={employees}
        canEdit={distributionRow != null && (!isLockedStatus(distributionRow.status) || isApprover)}
        onOpenChange={(open) => {
          if (!open) setDistributionRow(null)
        }}
        onSaved={(updated) => {
          applyUpdatedRow(updated)
          setDistributionRow(null)
          setMessage(`Distribution of ${updated.doc_number} saved.`)
        }}
      />

      <ManagementDocumentA4PreviewDialog
        open={showA4Preview}
        row={previewRow}
        autoPrint={previewAutoPrint}
        readOnly={docControl && previewRow != null && isLockedStatus(previewRow.status)}
        onOpenChange={(open) => {
          setShowA4Preview(open)
          if (!open) {
            setPreviewRow(null)
            setPreviewAutoPrint(false)
          }
        }}
        onDraftUpdated={(updated) => {
          setPreviewRow(updated)
          setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
        }}
      />

      <input
        ref={uploadInputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void handleUploadFileSelected(file)
        }}
      />

      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void onImportFile(file)
        }}
      />

      <ManagementDocumentsFooterBar
        message={message}
        loading={listLoading || saveLoading || uploadBusy}
        selectedCount={selectedIds.size}
        page={page}
        pageCount={pageCount}
        onImport={handleImport}
        onExport={handleExport}
        onPrintSelected={handlePrintSelected}
        onDeleteSelected={() => void handleDeleteSelected()}
        onExportMasterList={() => void handleExportMasterList()}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number(jumpTo)
          if (!Number.isFinite(n) || n < 1) return
          setPage(Math.min(pageCount, Math.max(1, Math.floor(n))))
        }}
      />
    </div>
  )
}
