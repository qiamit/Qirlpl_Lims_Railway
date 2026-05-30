import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { IsCodesHeaderBar } from './IsCodesHeaderBar'
import { IsCodesForm } from './IsCodesForm'
import { IsCodesTable } from './IsCodesTable'
import { IsCodesTableFooterBar } from './IsCodesFooterBar'
import { emptyIsCodeForm, normalizeText, type IsCodeFileRow, type IsCodeForm, type IsCodeRow } from './types'

const BUCKET = 'is-code-files'

const formatSupabaseError = (err: unknown) => {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function toCsv(headers: string[], rows: Array<Record<string, string>>) {
  const esc = (v: string) => {
    const s = String(v ?? '')
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const lines = [headers.map(esc).join(',')]
  for (const r of rows) {
    lines.push(headers.map((h) => esc(r[h] ?? '')).join(','))
  }
  return lines.join('\n')
}

function parseCsv(text: string) {
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
        const next = text[i + 1]
        if (next === '"') {
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

  if (cell.length > 0 || row.length > 0) flushRow()

  return rows.map((r) => r.map((c) => c.trim()))
}

export default function IsCodesMasterPage() {
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const filesPopupRef = useRef<Window | null>(null)

  const importInputRef = useRef<HTMLInputElement | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')

  const [rows, setRows] = useState<IsCodeRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')

  const [form, setForm] = useState<IsCodeForm>(() => emptyIsCodeForm())

  const [aspects, setAspects] = useState<Array<{ id: string; label: string }>>([
    { id: 'default-spec', label: 'Specification' },
  ])
  const [aspectDialogOpen, setAspectDialogOpen] = useState(false)
  const [newAspect, setNewAspect] = useState('')

  const loadAspects = async () => {
    try {
      const { data, error } = await supabase
        .from('is_code_master_options')
        .select('id, label')
        .eq('category', 'aspect')
        .order('label', { ascending: true })
      if (error) throw error
      const db = (Array.isArray(data) ? data : []) as Array<{ id: string; label: string }>
      const merged = [{ id: 'default-spec', label: 'Specification' }, ...db]
      const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
      setAspects(Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label)))
    } catch {
      setAspects([{ id: 'default-spec', label: 'Specification' }])
    }
  }

  const loadIsCodes = async () => {
    setListLoading(true)
    setListError(null)
    try {
      const { data, error } = await supabase.from('is_codes').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setRows((Array.isArray(data) ? (data as IsCodeRow[]) : []).map((r) => ({
        ...r,
        is_number: r.is_number ?? '',
        title: r.title ?? '',
        aspect: (r.aspect ?? 'Specification') as IsCodeRow['aspect'],
      })))
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load IS codes')
    } finally {
      setListLoading(false)
    }
  }

  const loadFiles = async (isCodeId: string) => {
    try {
      const { error } = await supabase.from('is_code_files').select('*').eq('is_code_id', isCodeId).order('created_at', { ascending: false })
      if (error) throw error
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadIsCodes()
    void loadAspects()
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as any
      if (!data || typeof data !== 'object') return
      if (data.type === 'is-code-files:delete') {
        const file = data.file as IsCodeFileRow | undefined
        if (!file?.id || !file.storage_path) return
        void (async () => {
          try {
            const { error: stErr } = await supabase.storage.from(BUCKET).remove([file.storage_path])
            if (stErr) throw stErr
            const { error: dbErr } = await supabase.from('is_code_files').delete().eq('id', file.id)
            if (dbErr) throw dbErr
            if (editingId) await loadFiles(editingId)
            if (editingId) await refreshFilesPopup(editingId)
          } catch (err) {
            setSaveMessage(formatSupabaseError(err))
          }
        })()
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [editingId])

  useEffect(() => {
    setPage(1)
    setJumpTo('')
  }, [search, pageSize])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const blob = [
        r.is_number,
        r.revision_year ?? '',
        r.reaffirmation_year ?? '',
        r.amendment_number ?? '',
        r.title,
        r.aspect,
        String(r.testing_charges ?? ''),
        r.remarks ?? '',
      ].join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = pagedRows.length > 0 && pagedRows.every((r) => next.has(r.id))
      if (allSelected) pagedRows.forEach((r) => next.delete(r.id))
      else pagedRows.forEach((r) => next.add(r.id))
      return next
    })
  }

  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(r.id)), [rows, selectedIds])

  const canSave = !saveLoading && normalizeText(form.isNumber).length > 0 && normalizeText(form.title).length > 0

  const handleClear = () => {
    setSaveMessage(null)
    setForm(emptyIsCodeForm())
  }

  const handleNew = () => {
    setSaveMessage(null)
    setForm(emptyIsCodeForm())
    setEditingId(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleEdit = (row: IsCodeRow) => {
    setSaveMessage(null)
    setEditingId(row.id)
    setForm({
      isNumber: row.is_number,
      revisionYear: row.revision_year ?? '',
      reaffirmationYear: row.reaffirmation_year ?? 'RA',
      amendmentNumber: row.amendment_number ?? '',
      title: row.title,
      aspect: row.aspect,
      testingCharges: String(row.testing_charges ?? ''),
      remarks: row.remarks ?? '',
      files: [],
    })
    setShowForm(true)
    void loadFiles(row.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCopy = (row: IsCodeRow) => {
    setSaveMessage(null)
    setEditingId(null)
    setForm({
      isNumber: `${row.is_number} - Copy`,
      revisionYear: row.revision_year ?? '',
      reaffirmationYear: row.reaffirmation_year ?? 'RA',
      amendmentNumber: row.amendment_number ?? '',
      title: row.title,
      aspect: row.aspect,
      testingCharges: String(row.testing_charges ?? ''),
      remarks: row.remarks ?? '',
      files: [],
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePickFiles = (files: File[]) => {
    setForm((prev) => ({ ...prev, files }))
  }

  const handleAddAspect = () => {
    const name = normalizeText(newAspect)
    if (!name) return
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('is_code_master_options')
          .insert({ category: 'aspect', label: name, value: name })
          .select('id')
          .single()
        if (error) throw error
        const id = (data as { id: string } | null)?.id ?? `tmp-${name}`
        setAspects((prev) => {
          const merged = [...prev, { id, label: name }]
          const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
          return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
        })
        setForm((prev) => ({ ...prev, aspect: name }))
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setNewAspect('')
        setAspectDialogOpen(false)
      }
    })()
  }

  const handleDeleteAspect = (id: string) => {
    void (async () => {
      try {
        if (!id || id.startsWith('default-')) return
        const { error } = await supabase.from('is_code_master_options').delete().eq('id', id)
        if (error) throw error
        setAspects((prev) => prev.filter((x) => x.id !== id))
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      }
    })()
  }

  const uploadFiles = async (isCodeId: string, files: File[]) => {
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${isCodeId}/${crypto.randomUUID()}_${safeName}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (upErr) throw upErr

      const { error: metaErr } = await supabase.from('is_code_files').insert({
        is_code_id: isCodeId,
        file_name: file.name,
        storage_path: path,
      })
      if (metaErr) throw metaErr
    }
  }

  const getSignedUrl = async (storagePath: string): Promise<string | undefined> => {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10)
      if (error) throw error
      return data.signedUrl
    } catch {
      return undefined
    }
  }

  type PopupFile = { id: string; file_name: string; storage_path: string; url?: string; error?: string }

  const buildPopupFilesForIsCode = async (row: IsCodeRow): Promise<PopupFile[]> => {
    const { data, error } = await supabase
      .from('is_code_files')
      .select('*')
      .eq('is_code_id', row.id)
      .order('created_at', { ascending: false })
    if (error) throw error

    const dbList = (Array.isArray(data) ? (data as IsCodeFileRow[]) : [])
    if (dbList.length > 0) {
      const withUrls: PopupFile[] = []
      for (const f of dbList) {
        const url = await getSignedUrl(f.storage_path)
        withUrls.push({
          id: f.id,
          file_name: f.file_name,
          storage_path: f.storage_path,
          ...(url ? { url } : { error: 'Signed URL blocked by storage policy' }),
        })
      }
      return withUrls
    }

    const { data: objects, error: listErr } = await supabase.storage.from(BUCKET).list(row.id, {
      limit: 100,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (listErr) throw listErr
    const objList = Array.isArray(objects) ? objects : []
    const fromStorage: PopupFile[] = []
    for (const obj of objList) {
      const name = (obj as any)?.name as string | undefined
      if (!name) continue
      const storagePath = `${row.id}/${name}`
      const url = await getSignedUrl(storagePath)
      fromStorage.push({
        id: `storage:${storagePath}`,
        file_name: name,
        storage_path: storagePath,
        ...(url ? { url } : { error: 'Signed URL blocked by storage policy' }),
      })
    }
    return fromStorage
  }

  const buildLoadingPopupHtml = (title: string) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>IS Code Files</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial; margin:16px;}
    .muted{color:#64748b; font-size:12px; margin-top:8px;}
  </style>
</head>
<body>
  <h1>IS Code Files</h1>
  <div class="muted">${title}</div>
  <div class="muted">Loading…</div>
</body>
</html>`

  const buildFilesPopupHtml = (
    isCodeNumber: string,
    files: PopupFile[],
  ) => {
    const esc = (s: string) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

    const items = files
      .map((f) => {
        const viewButton = f.url
          ? `<a class="btn" href="${esc(f.url)}" target="_blank" rel="noreferrer">View</a>`
          : `<span class="muted">${esc(f.error || 'Missing storage policy for signed URL')}</span>`
        return `
<div class="row">
  <div class="name">${esc(f.file_name)}</div>
  <div class="actions">
    ${viewButton}
    <button class="btn danger" data-delete="1" data-id="${esc(f.id)}" data-name="${esc(f.file_name)}" data-path="${esc(f.storage_path)}">Delete</button>
  </div>
</div>`
      })
      .join('')

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>IS Code Files</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial; margin:16px;}
    h1{font-size:18px; margin:0 0 12px 0;}
    .muted{color:#64748b; font-size:12px; margin-bottom:12px;}
    .row{display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px; margin-bottom:8px;}
    .name{flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
    .actions{display:flex; gap:8px;}
    .btn{border:1px solid #94a3b8; background:white; padding:6px 10px; border-radius:8px; cursor:pointer; text-decoration:none; color:#0f172a; font-size:12px;}
    .btn:hover{background:#f8fafc;}
    .danger{border-color:#fecaca; color:#991b1b;}
    .danger:hover{background:#fef2f2;}
    .empty{padding:18px; border:1px dashed #cbd5e1; border-radius:8px; color:#64748b;}
  </style>
</head>
<body>
  <h1>IS Code Files</h1>
  <div class="muted">${esc(isCodeNumber)}</div>
  ${files.length ? items : '<div class="empty">No files.</div>'}

  <script>
    window.addEventListener('click', function(e){
      var el = e.target;
      if (!el || !el.getAttribute) return;
      if (el.getAttribute('data-delete') !== '1') return;
      var name = el.getAttribute('data-name') || '';
      var ok = window.confirm('Delete file ' + name + '?');
      if (!ok) return;
      var file = {
        id: el.getAttribute('data-id'),
        file_name: name,
        storage_path: el.getAttribute('data-path')
      };
      if (window.opener && window.opener.postMessage) {
        window.opener.postMessage({ type: 'is-code-files:delete', file: file }, '*');
      }
    });
  </script>
</body>
</html>`
  }

  const refreshFilesPopup = async (isCodeId: string) => {
    const win = filesPopupRef.current
    if (!win || win.closed) return
    const { data, error } = await supabase
      .from('is_code_files')
      .select('*')
      .eq('is_code_id', isCodeId)
      .order('created_at', { ascending: false })
    if (error) return
    const list = (Array.isArray(data) ? (data as IsCodeFileRow[]) : [])
    const withUrls: PopupFile[] = []
    for (const f of list) {
      try {
        const url = await getSignedUrl(f.storage_path)
        withUrls.push({ id: f.id, file_name: f.file_name, storage_path: f.storage_path, url })
      } catch (err) {
        withUrls.push({
          id: f.id,
          file_name: f.file_name,
          storage_path: f.storage_path,
          error: formatSupabaseError(err),
        })
      }
    }
    const title = normalizeText(form.isNumber) || 'IS Code'
    win.document.open()
    win.document.write(buildFilesPopupHtml(title, withUrls))
    win.document.close()
  }

  const openFilesPopup = async (row: IsCodeRow) => {
    setSaveMessage(null)
    setEditingId(row.id)

    const win = window.open('', '_blank', 'width=900,height=600')
    if (!win) {
      setSaveMessage('Popup blocked. Please allow popups for this site.')
      return
    }
    filesPopupRef.current = win

    win.document.open()
    win.document.write(buildLoadingPopupHtml(row.is_number))
    win.document.close()

    void (async () => {
      try {
        const files = await buildPopupFilesForIsCode(row)
        win.document.open()
        win.document.write(buildFilesPopupHtml(row.is_number, files))
        win.document.close()
      } catch (err) {
        const msg = formatSupabaseError(err)
        win.document.open()
        win.document.write(
          buildFilesPopupHtml(row.is_number, [
            { id: 'err', file_name: 'Unable to load files', storage_path: '', error: msg },
          ]),
        )
        win.document.close()
        setSaveMessage(msg)
      }
    })()
  }

  const handleSave = () => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const payload = {
          ...(editingId ? { id: editingId } : null),
          is_number: normalizeText(form.isNumber),
          revision_year: normalizeText(form.revisionYear) || null,
          reaffirmation_year: normalizeText(form.reaffirmationYear) || null,
          amendment_number: normalizeText(form.amendmentNumber) || null,
          title: normalizeText(form.title),
          aspect: form.aspect,
          testing_charges: form.testingCharges ? Number(form.testingCharges) : null,
          remarks: normalizeText(form.remarks) || null,
        }

        const { data, error } = await supabase
          .from('is_codes')
          .upsert(payload, { onConflict: editingId ? 'id' : 'is_number' })
          .select('id')
          .single()
        if (error) throw error

        const id = (data as { id: string } | null)?.id ?? editingId
        if (!id) throw new Error('Unable to determine record id')

        if (form.files.length > 0) {
          try {
            await uploadFiles(id, form.files)
          } catch (err) {
            const msg = formatSupabaseError(err)
            const extra = msg.toLowerCase().includes('bucket') ? `\n\nCreate Supabase Storage bucket: ${BUCKET}` : ''
            setSaveMessage(`Saved record, but file upload failed: ${msg}${extra}`)
            setEditingId(id)
            setShowForm(true)
            await loadIsCodes()
            await loadFiles(id)
            return
          }
        }

        setSaveMessage('Saved successfully.')
        setForm(emptyIsCodeForm())
        setEditingId(null)
        setShowForm(false)
        await loadIsCodes()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleDeleteSelected = () => {
    void (async () => {
      if (selectedRows.length === 0) return
      const ok = window.confirm(`Delete ${selectedRows.length} selected IS code(s)?`)
      if (!ok) return
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const ids = selectedRows.map((r) => r.id)
        const { data: fileRows, error: fileErr } = await supabase
          .from('is_code_files')
          .select('storage_path')
          .in('is_code_id', ids)
        if (fileErr) throw fileErr
        const paths = (Array.isArray(fileRows) ? fileRows : []).map((x: any) => x.storage_path).filter(Boolean)
        if (paths.length > 0) {
          const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths)
          if (rmErr) throw rmErr
        }
        const { error: dbFileErr } = await supabase.from('is_code_files').delete().in('is_code_id', ids)
        if (dbFileErr) throw dbFileErr
        const { error: dbErr } = await supabase.from('is_codes').delete().in('id', ids)
        if (dbErr) throw dbErr

        setSelectedIds(new Set())
        setSaveMessage('Deleted.')
        await loadIsCodes()
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
      'id',
      'is_number',
      'revision_year',
      'reaffirmation_year',
      'amendment_number',
      'title',
      'aspect',
      'testing_charges',
      'remarks',
      'created_at',
    ]
    const lines = exportRows.map((r) => ({
      id: r.id,
      is_number: r.is_number,
      revision_year: r.revision_year ?? '',
      reaffirmation_year: r.reaffirmation_year ?? '',
      amendment_number: r.amendment_number ?? '',
      title: r.title,
      aspect: r.aspect,
      testing_charges: String(r.testing_charges ?? ''),
      remarks: r.remarks ?? '',
      created_at: r.created_at ?? '',
    }))
    const csv = toCsv(headers, lines)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'is_codes.csv'
    a.click()
    URL.revokeObjectURL(url)
    setSaveMessage('Exported.')
  }

  const handleImport = () => {
    setSaveMessage(null)
    importInputRef.current?.click()
  }

  const handleImportFile = (file: File) => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const text = await file.text()
        const records = parseCsv(text)
        if (records.length === 0) {
          setSaveMessage('No rows found in CSV.')
          return
        }
        const header = records[0].map((h) => h.trim())
        const rowsData = records.slice(1).filter((r) => r.some((c) => String(c ?? '').trim().length > 0))

        const payloads = rowsData.map((cells) => {
          const get = (key: string) => {
            const idx = header.indexOf(key)
            return idx >= 0 ? (cells[idx] ?? '') : ''
          }
          return {
            is_number: normalizeText(get('is_number')),
            revision_year: normalizeText(get('revision_year')) || null,
            reaffirmation_year: normalizeText(get('reaffirmation_year')) || null,
            amendment_number: normalizeText(get('amendment_number')) || null,
            title: normalizeText(get('title')),
            aspect: (normalizeText(get('aspect')) || 'Specification') as IsCodeRow['aspect'],
            testing_charges: get('testing_charges') ? Number(get('testing_charges')) : null,
            remarks: normalizeText(get('remarks')) || null,
          }
        })

        const cleanPayloads = payloads.filter((p) => p.is_number.trim().length > 0 && p.title.trim().length > 0)
        if (cleanPayloads.length === 0) {
          setSaveMessage('No valid rows found (is_number/title missing).')
          return
        }

        const { error } = await supabase.from('is_codes').upsert(cleanPayloads, { onConflict: 'is_number' })
        if (error) throw error

        setSaveMessage(`Imported ${cleanPayloads.length} record(s).`)
        await loadIsCodes()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handlePrintSelected = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows
    if (exportRows.length === 0) return
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>IS Codes</title></head><body><pre>${exportRows
      .map((r) => `${r.is_number} | ${r.title}`)
      .join('\n')}</pre></body></html>`

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
    <div className="p-6 space-y-5">
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImportFile(f)
          if (e.target) e.target.value = ''
        }}
      />

      <IsCodesHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onNew={handleNew}
        onOpenBIS={() => window.open('https://standards.bis.gov.in', '_blank', 'noreferrer')}
      />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New IS Code</DialogTitle>
            <DialogDescription>Enter IS code details and save.</DialogDescription>
          </DialogHeader>
          {saveMessage && <div className="text-sm text-destructive">{saveMessage}</div>}
          <IsCodesForm
            form={form}
            onChange={setForm}
            canSave={canSave}
            saveLoading={saveLoading}
            onSave={handleSave}
            onClear={handleClear}
            onPickFiles={handlePickFiles}
            aspectOptions={aspects}
            aspectDialogOpen={aspectDialogOpen}
            setAspectDialogOpen={setAspectDialogOpen}
            newAspect={newAspect}
            setNewAspect={setNewAspect}
            onAddAspect={handleAddAspect}
            onDeleteAspect={handleDeleteAspect}
            onOpenFiles={() => {
              const id = editingId
              if (!id) {
                setSaveMessage('Please save the IS Code first, then upload and view files.')
                return
              }
              const row = rows.find((r) => r.id === id)
              if (!row) return
              void openFilesPopup(row)
            }}
          />
        </DialogContent>
      </Dialog>

      <IsCodesTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onEdit={handleEdit}
        onCopy={handleCopy}
        onViewFiles={(row) => {
          void openFilesPopup(row)
        }}
      />

      <IsCodesTableFooterBar
        message={saveMessage}
        loading={saveLoading}
        selectedCount={selectedIds.size}
        onImport={handleImport}
        onExport={handleExport}
        onPrintSelected={handlePrintSelected}
        onDeleteSelected={handleDeleteSelected}
        page={page}
        pageCount={pageCount}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number(jumpTo)
          if (!Number.isFinite(n) || n <= 0) return
          setPage(Math.min(pageCount, Math.max(1, Math.floor(n))))
          setJumpTo('')
        }}
      />
    </div>
  )
}
