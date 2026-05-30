import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TestParameterHeaderBar } from './TestParameterHeaderBar'
import { TestParameterForm } from './TestParameterForm'
import { TestParameterTable } from './TestParameterTable'
import { TestParameterTableFooterBar } from './TestParameterFooterBar'
import { IsCodesForm } from '@/features/masters/is-codes/IsCodesForm'
import { emptyIsCodeForm, normalizeText as normalizeIsText, type IsCodeForm, type IsAspect } from '@/features/masters/is-codes/types'
import { EquipmentMasterForm } from '@/features/masters/equipment-master/EquipmentMasterForm'
import { emptyEquipmentForm, normalizeText as normalizeEqText, type EquipmentForm, type EquipmentStatus } from '@/features/masters/equipment-master/types'
import {
  emptyTestParameterForm,
  normalizeText,
  normalizeNumberString,
  type AccreditationBodyRow,
  type UnitRow,
  type TestParameterForm as TestParameterFormType,
  type TestParameterRow,
} from './types'

const TEST_METHOD_NOTE_BUCKET = 'test-method-notes'

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

export default function TestParameterMasterPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)

  const importInputRef = useRef<HTMLInputElement | null>(null)
  const testMethodNotePopupRef = useRef<{ win: Window; rowId: string; title: string } | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')

  const [rows, setRows] = useState<TestParameterRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')

  const [form, setForm] = useState<TestParameterFormType>(() => emptyTestParameterForm())

  const [isCodes, setIsCodes] = useState<Array<{ id: string; displayCode: string; searchLabel: string; defaultTestMethod: string }>>([])
  const [equipments, setEquipments] = useState<Array<{ id: string; label: string }>>([])

  const [accreditationBodies, setAccreditationBodies] = useState<AccreditationBodyRow[]>([])
  const [units, setUnits] = useState<UnitRow[]>([])
  const [accreditationDialogOpen, setAccreditationDialogOpen] = useState(false)
  const [newAccreditationBody, setNewAccreditationBody] = useState('')
  const [unitDialogOpen, setUnitDialogOpen] = useState(false)
  const [newUnitName, setNewUnitName] = useState('')

  const [isCodeDialogOpen, setIsCodeDialogOpen] = useState(false)
  const [isCodeForm, setIsCodeForm] = useState<IsCodeForm>(() => emptyIsCodeForm())
  const [isCodeSaveLoading, setIsCodeSaveLoading] = useState(false)
  const [isCodeAspects, setIsCodeAspects] = useState<Array<{ id: string; label: string }>>([
    { id: 'default-spec', label: 'Specification' },
  ])
  const [isCodeAspectDialogOpen, setIsCodeAspectDialogOpen] = useState(false)
  const [isCodeNewAspect, setIsCodeNewAspect] = useState('')

  const [equipmentDialogOpen, setEquipmentDialogOpen] = useState(false)
  const [equipmentForm, setEquipmentForm] = useState<EquipmentForm>(() => emptyEquipmentForm())
  const [equipmentSaveLoading, setEquipmentSaveLoading] = useState(false)

  const [departments, setDepartments] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem('userManagement.departments')
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed.filter((v) => typeof v === 'string') as string[]) : []
  })
  const [designations, setDesignations] = useState<string[]>([])
  const [testMethodNoteDownloadUrl, setTestMethodNoteDownloadUrl] = useState<string | null>(null)

  useEffect(() => {
    if (searchParams.get('openAdd') === '1') {
      setSaveMessage(null)
      setForm(emptyTestParameterForm())
      setEditingId(null)
      setShowForm(true)
      const next = new URLSearchParams(searchParams)
      next.delete('openAdd')
      setSearchParams(next, { replace: true })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [searchParams, setSearchParams])

  const canSave =
    !saveLoading &&
    normalizeText(form.itemName).length > 0

  useEffect(() => {
    if (!form.testMethodNotePath?.trim()) {
      setTestMethodNoteDownloadUrl(null)
      return
    }
    let canceled = false
    ;(async () => {
      const { data, error } = await supabase.storage
        .from(TEST_METHOD_NOTE_BUCKET)
        .createSignedUrl(form.testMethodNotePath, 60 * 60)
      if (canceled) return
      if (!error && data?.signedUrl) setTestMethodNoteDownloadUrl(data.signedUrl)
      else setTestMethodNoteDownloadUrl(null)
    })()
    return () => {
      canceled = true
    }
  }, [form.testMethodNotePath])

  const handleUploadTestMethodNote = async (file: File): Promise<string | null> => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
    const path = `${crypto.randomUUID()}_${safeName}`
    const { error } = await supabase.storage.from(TEST_METHOD_NOTE_BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type,
    })
    if (error) return null
    return path
  }

  const getTestMethodNoteSignedUrl = async (storagePath: string): Promise<string | undefined> => {
    try {
      const { data, error } = await supabase.storage
        .from(TEST_METHOD_NOTE_BUCKET)
        .createSignedUrl(storagePath, 60 * 10)
      if (error) throw error
      return data?.signedUrl
    } catch {
      return undefined
    }
  }

  const buildTestMethodNoteLoadingHtml = (title: string) =>
    `<!doctype html><html><head><meta charset="utf-8"/><title>Test Method Note</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;margin:16px;}.muted{color:#64748b;font-size:12px;margin-top:8px;}</style></head><body><h1>Test Method Note</h1><div class="muted">${title}</div><div class="muted">Loading…</div></body></html>`

  const buildTestMethodNotePopupHtml = (
    title: string,
    file: { file_name: string; storage_path: string; url?: string; error?: string } | null,
    rowId: string,
  ) => {
    const esc = (s: string) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    if (!file) {
      return `<!doctype html><html><head><meta charset="utf-8"/><title>Test Method Note</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;margin:16px;}h1{font-size:18px;}.muted{color:#64748b;font-size:12px;}.empty{padding:18px;border:1px dashed #cbd5e1;border-radius:8px;color:#64748b;}</style></head><body><h1>Test Method Note</h1><div class="muted">${esc(title)}</div><div class="empty">No file.</div></body></html>`
    }
    const viewButton = file.url
      ? `<a class="btn" href="${esc(file.url)}" target="_blank" rel="noreferrer">View</a>`
      : `<span class="muted">${esc(file.error || 'Unable to load')}</span>`
    return `<!doctype html>
<html><head><meta charset="utf-8"/><title>Test Method Note</title><style>
body{font-family:ui-sans-serif,system-ui,sans-serif;margin:16px;}h1{font-size:18px;}.muted{color:#64748b;font-size:12px;margin-bottom:12px;}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;margin-bottom:8px;}
.name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.actions{display:flex;gap:8px;}
.btn{border:1px solid #94a3b8;background:white;padding:6px 10px;border-radius:8px;cursor:pointer;text-decoration:none;color:#0f172a;font-size:12px;}
.btn:hover{background:#f8fafc;}.danger{border-color:#fecaca;color:#991b1b;}.danger:hover{background:#fef2f2;}
</style></head><body>
<h1>Test Method Note</h1><div class="muted">${esc(title)}</div>
<div class="row"><div class="name">${esc(file.file_name)}</div><div class="actions">${viewButton}
<button class="btn danger" data-delete="1" data-row-id="${esc(rowId)}" data-name="${esc(file.file_name)}" data-path="${esc(file.storage_path)}">Delete</button></div></div>
<script>
window.addEventListener('click',function(e){
  var el=e.target;if(!el||!el.getAttribute)return;
  if(el.getAttribute('data-delete')!=='1')return;
  var name=el.getAttribute('data-name')||'';
  if(!window.confirm('Delete file '+name+'?'))return;
  var rowId=el.getAttribute('data-row-id');
  var path=el.getAttribute('data-path');
  if(window.opener&&window.opener.postMessage) window.opener.postMessage({type:'test-parameter-note:delete',rowId:rowId,storagePath:path},'*');
});
</script></body></html>`
  }

  const openTestMethodNotePopup = async (row: TestParameterRow) => {
    setSaveMessage(null)
    const title = row.item_name || row.is_code_label || 'Test Parameter'
    const win = window.open('', '_blank', 'width=900,height=600')
    if (!win) {
      setSaveMessage('Popup blocked. Please allow popups for this site.')
      return
    }
    testMethodNotePopupRef.current = { win, rowId: row.id, title }
    win.document.open()
    win.document.write(buildTestMethodNoteLoadingHtml(title))
    win.document.close()

    const path = row.test_method_note_path?.trim()
    if (!path) {
      win.document.open()
      win.document.write(buildTestMethodNotePopupHtml(title, null, row.id))
      win.document.close()
      return
    }

    void (async () => {
      try {
        const url = await getTestMethodNoteSignedUrl(path)
        const file_name = path.split('/').pop() || path
        const file = {
          file_name,
          storage_path: path,
          ...(url ? { url } : { error: 'Unable to get link' }),
        }
        win.document.open()
        win.document.write(buildTestMethodNotePopupHtml(title, file, row.id))
        win.document.close()
      } catch (err) {
        win.document.open()
        win.document.write(
          buildTestMethodNotePopupHtml(title, {
            file_name: path.split('/').pop() || path,
            storage_path: path,
            error: formatSupabaseError(err),
          }, row.id),
        )
        win.document.close()
        setSaveMessage(formatSupabaseError(err))
      }
    })()
  }

  const loadRows = async () => {
    setListError(null)
    setListLoading(true)
    try {
      const { data, error } = await supabase
        .from('test_parameters')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      const list = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []

      setRows(
        list.map((r) => ({
          id: String(r.id ?? ''),
          is_code_id: (r.is_code_id ? String(r.is_code_id) : null) as string | null,
          is_code_label: (r.is_code_label ? String(r.is_code_label) : null) as string | null,
          clause_no: (r.clause_no ? String(r.clause_no) : null) as string | null,
          unit_value: (r.unit_value ? String(r.unit_value) : null) as string | null,
          test_method: (r.test_method ? String(r.test_method) : null) as string | null,
          item_name: String(r.item_name ?? ''),
          specific_requirement: (r.specific_requirement ? String(r.specific_requirement) : null) as string | null,
          under_accreditation_ids: Array.isArray(r.under_accreditation_ids)
            ? (r.under_accreditation_ids as string[])
            : [],
          uncertainty_mu: (r.uncertainty_mu ? String(r.uncertainty_mu) : null) as string | null,
          testing_charges: typeof r.testing_charges === 'number' ? (r.testing_charges as number) : null,
          conformity: (String(r.conformity ?? 'Yes') as 'Yes' | 'No') ?? 'Yes',
          department: (r.department ? String(r.department) : null) as string | null,
          designation: (r.designation ? String(r.designation) : null) as string | null,
          equipment_ids: Array.isArray(r.equipment_ids) ? (r.equipment_ids as string[]) : [],
          temperature_of_test: (r.temperature_of_test ? String(r.temperature_of_test) : null) as string | null,
          humidity_of_test: (r.humidity_of_test ? String(r.humidity_of_test) : null) as string | null,
          testing_time: (r.testing_time ? String(r.testing_time) : null) as string | null,
          test_method_note_path: (r.test_method_note_path ? String(r.test_method_note_path) : null) as string | null,
          acceptance_criteria: (r.acceptance_criteria ? String(r.acceptance_criteria) : null) as string | null,
          created_at: (r.created_at ? String(r.created_at) : undefined) as string | undefined,
        }))
          .filter((x) => x.id),
      )
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load test parameters')
    } finally {
      setListLoading(false)
    }
  }

  const loadMasters = async () => {
    try {
      const { data: isData, error: isErr } = await supabase
        .from('is_codes')
        .select('id, is_number, title, revision_year')
        .order('created_at', { ascending: false })

      if (isErr) throw isErr

      const isList = Array.isArray(isData) ? (isData as Array<{ id: string; is_number: string; title: string; revision_year: string | null }>) : []

      setIsCodes(
        isList
          .map((r) => {
            const rev = r.revision_year ? String(r.revision_year).trim() : ''
            const base = r.is_number?.trim() ?? ''
            const displayCode = `${base}${rev ? `: ${rev}` : ''}`
            const searchLabel = r.title ? `${displayCode} — ${r.title}` : displayCode
            return {
              id: r.id,
              displayCode,
              searchLabel,
              defaultTestMethod: displayCode,
            }
          })
          .sort((a, b) => a.searchLabel.localeCompare(b.searchLabel)),
      )

      const { data: eqData, error: eqErr } = await supabase
        .from('equipment_master')
        .select('id, equipment_name, range_of_instrument')
        .order('equipment_name', { ascending: true })

      if (eqErr) throw eqErr

      const eqList = Array.isArray(eqData)
        ? (eqData as Array<{ id: string; equipment_name: string; range_of_instrument: string | null }>)
        : []

      setEquipments(
        eqList
          .map((e) => ({
            id: e.id,
            label: `${e.equipment_name}${e.range_of_instrument ? ` (${e.range_of_instrument})` : ''}`,
          }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      )

      const { data: abData, error: abErr } = await supabase
        .from('accreditation_bodies')
        .select('id, name, created_at')
        .order('name', { ascending: true })

      if (abErr) throw abErr
      setAccreditationBodies(Array.isArray(abData) ? (abData as AccreditationBodyRow[]) : [])

      const { data: unitData, error: unitErr } = await supabase
        .from('test_parameter_units')
        .select('id, name, created_at')
        .order('name', { ascending: true })

      if (unitErr) throw unitErr
      setUnits(Array.isArray(unitData) ? (unitData as UnitRow[]) : [])
    } catch (err) {
      setSaveMessage((prev) => prev ?? (err instanceof Error ? err.message : 'Unable to load masters'))
    }
  }

  const loadIsCodeAspects = async () => {
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
      setIsCodeAspects(Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label)))
    } catch {
      setIsCodeAspects([{ id: 'default-spec', label: 'Specification' }])
    }
  }

  const loadUserOptions = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token
      if (!accessToken) return

      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-users`
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          'x-user-jwt': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      if (!response.ok) return

      const payload = (await response.json().catch(() => null)) as unknown
      const rows =
        typeof payload === 'object' && payload && 'users' in payload
          ? ((payload as { users?: unknown }).users as unknown)
          : []

      const list = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []

      const designationsFromUsers = Array.from(
        new Set(
          list
            .map((u) => String(u.designation ?? '').trim())
            .filter((d) => d.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b))

      setDesignations(designationsFromUsers)

      const departmentsFromUsers = Array.from(
        new Set(
          list
            .map((u) => String((u as { department_name?: unknown }).department_name ?? '').trim())
            .filter((d) => d.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b))

      setDepartments((prev) => {
        const merged = Array.from(new Set([...(prev ?? []), ...departmentsFromUsers]))
          .map((d) => d.trim())
          .filter((d) => d.length > 0)
          .sort((a, b) => a.localeCompare(b))
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('userManagement.departments', JSON.stringify(merged))
        }
        return merged
      })
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadRows()
    void loadMasters()
    void loadUserOptions()
    void loadIsCodeAspects()
  }, [])

  useEffect(() => {
    if (form.underAccreditationIds?.length) return
    if (!accreditationBodies.length) return
    const defaultNabl = accreditationBodies.find((body) => body.name.trim().toLowerCase() === 'nabl')
    if (defaultNabl) {
      setForm((prev) => ({
        ...prev,
        underAccreditationIds: [defaultNabl.id],
      }))
    }
  }, [accreditationBodies, form.underAccreditationIds?.length])

  useEffect(() => {
    setPage(1)
    setJumpTo('')
  }, [search, pageSize])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; rowId?: string; storagePath?: string }
      if (!data || data?.type !== 'test-parameter-note:delete' || !data.rowId || !data.storagePath) return
      void (async () => {
        try {
          const { error: stErr } = await supabase.storage
            .from(TEST_METHOD_NOTE_BUCKET)
            .remove([data.storagePath!])
          if (stErr) throw stErr
          const { error: dbErr } = await supabase
            .from('test_parameters')
            .update({ test_method_note_path: null })
            .eq('id', data.rowId!)
          if (dbErr) throw dbErr
          await loadRows()
          const pop = testMethodNotePopupRef.current
          if (pop && pop.win && !pop.win.closed && pop.rowId === data.rowId) {
            pop.win.document.open()
            pop.win.document.write(buildTestMethodNotePopupHtml(pop.title, null, pop.rowId))
            pop.win.document.close()
          }
        } catch (err) {
          setSaveMessage(formatSupabaseError(err))
        }
      })()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows

    return rows.filter((r) => {
      const blob = [
        r.is_code_label ?? '',
        r.test_method ?? '',
        r.clause_no ?? '',
        r.unit_value ?? '',
        r.item_name ?? '',
        r.specific_requirement ?? '',
        r.uncertainty_mu ?? '',
        String(r.testing_charges ?? ''),
        r.conformity ?? '',
        r.department ?? '',
        r.designation ?? '',
        r.temperature_of_test ?? '',
        r.humidity_of_test ?? '',
        r.testing_time ?? '',
        r.test_method_note_path ?? '',
      ]
        .join(' ')
        .toLowerCase()

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

  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(r.id)), [rows, selectedIds])

  const handleNew = () => {
    setSaveMessage(null)
    setForm(emptyTestParameterForm())
    setEditingId(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleClear = () => {
    setSaveMessage(null)
    setForm(emptyTestParameterForm())
    setTestMethodNoteDownloadUrl(null)
  }

  const handleEdit = (row: TestParameterRow) => {
    setSaveMessage(null)
    setEditingId(row.id)
    setForm({
      isCodeId: row.is_code_id ?? '',
      isCodeLabel: row.is_code_label ?? '',
      clauseNo: row.clause_no ?? '',
      unitValue: row.unit_value ?? '',
      testMethod: row.test_method ?? '',
      itemName: row.item_name ?? '',
      specificRequirement: row.specific_requirement ?? '',
      underAccreditationIds: row.under_accreditation_ids ?? [],
      uncertaintyMu: row.uncertainty_mu ?? '',
      testingCharges: row.testing_charges != null ? String(row.testing_charges) : '',
      conformity: row.conformity ?? 'Yes',
      department: row.department ?? '',
      designation: row.designation ?? '',
      equipmentIds: row.equipment_ids ?? [],
      temperatureOfTest: row.temperature_of_test ?? '',
      humidityOfTest: row.humidity_of_test ?? '',
      testingTimeHr: (() => {
        const t = row.testing_time ?? ''
        const [hr] = t.split(':')
        return hr ?? ''
      })(),
      testingTimeMin: (() => {
        const t = row.testing_time ?? ''
        const [, min] = t.split(':')
        return min ?? ''
      })(),
      testMethodNotePath: row.test_method_note_path ?? '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCopy = (row: TestParameterRow) => {
    setSaveMessage(null)
    setEditingId(null)
    setForm({
      isCodeId: row.is_code_id ?? '',
      isCodeLabel: row.is_code_label ?? '',
      clauseNo: row.clause_no ?? '',
      unitValue: row.unit_value ?? '',
      testMethod: row.test_method ?? '',
      itemName: `${row.item_name ?? ''} - Copy`,
      specificRequirement: row.specific_requirement ?? '',
      underAccreditationIds: row.under_accreditation_ids ?? [],
      uncertaintyMu: row.uncertainty_mu ?? '',
      testingCharges: row.testing_charges != null ? String(row.testing_charges) : '',
      conformity: row.conformity ?? 'Yes',
      department: row.department ?? '',
      designation: row.designation ?? '',
      equipmentIds: row.equipment_ids ?? [],
      temperatureOfTest: row.temperature_of_test ?? '',
      humidityOfTest: row.humidity_of_test ?? '',
      testingTimeHr: (() => {
        const t = row.testing_time ?? ''
        const [hr] = t.split(':')
        return hr ?? ''
      })(),
      testingTimeMin: (() => {
        const t = row.testing_time ?? ''
        const [, min] = t.split(':')
        return min ?? ''
      })(),
      testMethodNotePath: row.test_method_note_path ?? '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSave = () => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const isRow = isCodes.find((x) => x.id === form.isCodeId)

        const payload = {
          ...(editingId ? { id: editingId } : {}),
          is_code_id: form.isCodeId || null,
          is_code_label: normalizeText(form.isCodeLabel) || (isRow?.displayCode ?? null),
          clause_no: normalizeText(form.clauseNo) || null,
          unit_value: normalizeText(form.unitValue) || null,
          test_method: normalizeText(form.testMethod) || (isRow?.defaultTestMethod ?? null),
          item_name: normalizeText(form.itemName),
          specific_requirement: normalizeText(form.specificRequirement) || null,
          under_accreditation_ids: form.underAccreditationIds ?? [],
          uncertainty_mu: normalizeText(form.uncertaintyMu) || null,
          testing_charges: form.testingCharges.trim() ? Number(normalizeNumberString(form.testingCharges)) : null,
          conformity: form.conformity,
          department: normalizeText(form.department) || null,
          designation: normalizeText(form.designation) || null,
          equipment_ids: form.equipmentIds ?? [],
          temperature_of_test: normalizeText(form.temperatureOfTest) || null,
          humidity_of_test: normalizeText(form.humidityOfTest) || null,
          testing_time:
            [form.testingTimeHr.trim(), form.testingTimeMin.trim()].filter(Boolean).length > 0
              ? [form.testingTimeHr.trim() || '0', form.testingTimeMin.trim() || '0'].join(':')
              : null,
          test_method_note_path: normalizeText(form.testMethodNotePath) || null,
        }

        if (editingId) {
          const { id: _id, ...updatePayload } = payload as { id: string; [k: string]: unknown }
          const { error } = await supabase.from('test_parameters').update(updatePayload).eq('id', editingId)
          if (error) throw error
        } else {
          const { id: _id, ...insertPayload } = payload as { id?: string; [k: string]: unknown }
          const { error } = await supabase.from('test_parameters').insert(insertPayload)
          if (error) throw error
        }

        setSaveMessage('Saved successfully.')
        setForm(emptyTestParameterForm())
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

  const openAddIsCodeForm = (typed: string) => {
    const raw = (typed ?? '').trim()
    if (raw.includes(':')) {
      const [numberPart, rest] = raw.split(':')
      setIsCodeForm({
        ...emptyIsCodeForm(),
        isNumber: numberPart.trim(),
        revisionYear: (rest ?? '').trim().replace(/[^0-9]/g, '').slice(0, 4),
      })
    } else {
      setIsCodeForm({
        ...emptyIsCodeForm(),
        isNumber: raw,
      })
    }
    setIsCodeDialogOpen(true)
  }

  const openAddEquipmentForm = (typed: string) => {
    const name = normalizeEqText(typed ?? '')
    const base = emptyEquipmentForm()
    setEquipmentForm({
      ...base,
      equipmentName: name,
      location: 'Mechanical',
      equipmentCode: '',
    })
    setEquipmentDialogOpen(true)
  }

  const canSaveEquipment =
    !equipmentSaveLoading && normalizeEqText(equipmentForm.equipmentName).length > 0

  const handleSaveEquipment = () => {
    void (async () => {
      setSaveMessage(null)
      setEquipmentSaveLoading(true)
      try {
        const payload = {
          equipment_name: normalizeEqText(equipmentForm.equipmentName),
          equipment_code: normalizeEqText(equipmentForm.equipmentCode) || null,
          status: (equipmentForm.status ?? 'Active') as EquipmentStatus,
          make: normalizeEqText(equipmentForm.make) || null,
          model_serial_no: normalizeEqText(equipmentForm.modelSerialNo) || null,
          least_count: normalizeEqText(equipmentForm.leastCount) || null,
          range_of_instrument: normalizeEqText(equipmentForm.rangeOfInstrument) || null,
          location: normalizeEqText(equipmentForm.location) || null,
          placed_date: equipmentForm.placedDate.trim() ? equipmentForm.placedDate : null,
          uncertainty_mu: equipmentForm.uncertaintyMu.trim() ? Number(equipmentForm.uncertaintyMu) : null,
          acceptance_criteria: equipmentForm.acceptanceCriteria.trim() ? Number(equipmentForm.acceptanceCriteria) : null,
          remarks: normalizeEqText(equipmentForm.remarks) || null,
        }

        if (!payload.equipment_name) throw new Error('Name of the Equipment is required.')

        // generate a simple code if not provided (keeps Equipment Master page logic intact)
        const code = payload.equipment_code || `EQ${String(Date.now()).slice(-6)}`
        payload.equipment_code = code

        const { data, error } = await supabase
          .from('equipment_master')
          .insert(payload)
          .select('id, equipment_name, range_of_instrument')
          .single()
        if (error) throw error

        const row = data as { id: string; equipment_name: string; range_of_instrument: string | null }
        const label = `${row.equipment_name}${row.range_of_instrument ? ` (${row.range_of_instrument})` : ''}`

        setEquipmentDialogOpen(false)
        setEquipmentForm(emptyEquipmentForm())
        await loadMasters()

        setForm((prev) => ({
          ...prev,
          equipmentIds: Array.from(new Set([...(prev.equipmentIds ?? []), row.id])),
        }))

        setSaveMessage(`Equipment added: ${label}`)
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setEquipmentSaveLoading(false)
      }
    })()
  }

  const handleClearEquipment = () => {
    setSaveMessage(null)
    setEquipmentForm(emptyEquipmentForm())
  }

  const handlePickIsFiles = (files: File[]) => {
    setIsCodeForm((prev) => ({ ...prev, files }))
  }

  const handleAddIsAspect = () => {
    const name = normalizeIsText(isCodeNewAspect)
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
        setIsCodeAspects((prev) => {
          const merged = [...prev, { id, label: name }]
          const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
          return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
        })
        setIsCodeForm((prev) => ({ ...prev, aspect: name as IsAspect }))
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setIsCodeNewAspect('')
        setIsCodeAspectDialogOpen(false)
      }
    })()
  }

  const handleDeleteIsAspect = (id: string) => {
    void (async () => {
      try {
        if (!id || id.startsWith('default-')) return
        const { error } = await supabase.from('is_code_master_options').delete().eq('id', id)
        if (error) throw error
        setIsCodeAspects((prev) => prev.filter((x) => x.id !== id))
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      }
    })()
  }

  const canSaveIsCode =
    !isCodeSaveLoading && normalizeIsText(isCodeForm.isNumber).length > 0 && normalizeIsText(isCodeForm.title).length > 0

  const handleSaveIsCode = () => {
    void (async () => {
      setSaveMessage(null)
      setIsCodeSaveLoading(true)
      try {
        const payload = {
          is_number: normalizeIsText(isCodeForm.isNumber),
          revision_year: normalizeIsText(isCodeForm.revisionYear) || null,
          reaffirmation_year: normalizeIsText(isCodeForm.reaffirmationYear) || null,
          amendment_number: normalizeIsText(isCodeForm.amendmentNumber) || null,
          title: normalizeIsText(isCodeForm.title),
          aspect: isCodeForm.aspect,
          testing_charges: isCodeForm.testingCharges ? Number(isCodeForm.testingCharges) : null,
          remarks: normalizeIsText(isCodeForm.remarks) || null,
        }

        const { data, error } = await supabase
          .from('is_codes')
          .upsert(payload, { onConflict: 'is_number' })
          .select('id, is_number, revision_year, title')
          .single()
        if (error) throw error

        const row = data as { id: string; is_number: string; revision_year: string | null; title: string }
        const displayCode = `${row.is_number}${row.revision_year ? `: ${row.revision_year}` : ''}`

        setIsCodeDialogOpen(false)
        setIsCodeForm(emptyIsCodeForm())

        await loadMasters()

        setForm((prev) => ({
          ...prev,
          isCodeId: row.id,
          isCodeLabel: displayCode,
          testMethod: displayCode,
        }))
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setIsCodeSaveLoading(false)
      }
    })()
  }

  const handleClearIsCode = () => {
    setSaveMessage(null)
    setIsCodeForm(emptyIsCodeForm())
  }

  const handleDeleteSelected = () => {
    void (async () => {
      if (selectedRows.length === 0) return
      const ok = window.confirm(`Delete ${selectedRows.length} selected record(s)?`)
      if (!ok) return
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const ids = selectedRows.map((r) => r.id)
        const { error } = await supabase.from('test_parameters').delete().in('id', ids)
        if (error) throw error
        setSaveMessage('Deleted successfully.')
        setSelectedIds(new Set())
        await loadRows()
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to delete')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleExport = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows

    const headers = [
      'id',
      'is_code_label',
      'clause_no',
      'unit_value',
      'test_method',
      'item_name',
      'specific_requirement',
      'under_accreditation_ids',
      'uncertainty_mu',
      'testing_charges',
      'conformity',
      'department',
      'designation',
      'equipment_ids',
      'temperature_of_test',
      'humidity_of_test',
      'testing_time',
      'test_method_note_path',
      'created_at',
    ]

    const lines = exportRows.map((r) => ({
      id: r.id,
      is_code_label: r.is_code_label ?? '',
      clause_no: r.clause_no ?? '',
      unit_value: r.unit_value ?? '',
      test_method: r.test_method ?? '',
      item_name: r.item_name ?? '',
      specific_requirement: r.specific_requirement ?? '',
      under_accreditation_ids: (r.under_accreditation_ids ?? []).join('|'),
      uncertainty_mu: r.uncertainty_mu ?? '',
      testing_charges: String(r.testing_charges ?? ''),
      conformity: r.conformity ?? 'Yes',
      department: r.department ?? '',
      designation: r.designation ?? '',
      equipment_ids: (r.equipment_ids ?? []).join('|'),
      temperature_of_test: r.temperature_of_test ?? '',
      humidity_of_test: r.humidity_of_test ?? '',
      testing_time: r.testing_time ?? '',
      test_method_note_path: r.test_method_note_path ?? '',
      created_at: r.created_at ?? '',
    }))

    const csv = toCsv(headers, lines)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'test_parameters.csv'
    a.click()
    URL.revokeObjectURL(url)
    setSaveMessage('Exported.')
  }

  const handlePrintSelected = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows
    if (exportRows.length === 0) return

    const esc = (s: string | null | undefined) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const fmtMoney = (v: number | null | undefined) =>
      typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Test Parameters</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;padding:16px}table{width:100%;border-collapse:collapse;table-layout:auto}th,td{border:1px solid #ccc;padding:6px;vertical-align:top}th{background:#f5f5f5;font-weight:600}</style>
      </head><body><h2>Test Parameters</h2>
      <table><thead><tr>
        <th>IS Code</th><th>Name of the Test Parameter</th><th>Test Method</th><th>Specific Requirements</th><th>Uncertainty &amp; Acceptance Criteria</th><th>Testing Condition</th>
      </tr><tr>
        <th>IS Code · Testing Charges · View File</th><th>Test Parameter</th><th>Test Method · Clause No · Unit</th><th>Specific Requirements</th><th>Uncertainty · Acceptance Criteria · Conformity</th><th>Temperature · Humidity · Time · Under Accreditation</th>
      </tr></thead><tbody>
      ${exportRows
        .map(
          (r) =>
            `<tr><td>${esc(r.is_code_label)}<br/><small>₹ ${fmtMoney(r.testing_charges)}</small><br/><small>View File</small></td><td>${esc(r.item_name)}</td><td>${esc(r.test_method)}<br/><small>Clause: ${esc(r.clause_no)}</small><br/><small>Unit: ${esc(r.unit_value)}</small></td><td>${esc(r.specific_requirement)}</td><td>Uncertainty: ${esc(r.uncertainty_mu)}<br/><small>Acceptance Criteria: ${esc(r.acceptance_criteria ?? '-')}</small><br/><small>Conformity: ${r.conformity ?? 'Yes'}</small></td><td>Temperature: ${esc(r.temperature_of_test) || '-'}<br/><small>Humidity: ${esc(r.humidity_of_test) || '-'}</small><br/><small>Time: ${esc(r.testing_time) || '-'}</small><br/><small>Under Accreditation: —</small></td></tr>`,
        )
        .join('')}
      </tbody></table></body></html>`

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

        const get = (cells: string[], key: string) => {
          const idx = header.indexOf(key)
          return idx >= 0 ? (cells[idx] ?? '') : ''
        }

        const payloads = rowsData.map((cells) => ({
          is_code_id: null,
          is_code_label: normalizeText(get(cells, 'is_code_label')) || null,
          clause_no: normalizeText(get(cells, 'clause_no')) || null,
          unit_value: normalizeText(get(cells, 'unit_value')) || null,
          test_method: normalizeText(get(cells, 'test_method')) || null,
          item_name: normalizeText(get(cells, 'item_name')),
          specific_requirement: normalizeText(get(cells, 'specific_requirement')) || null,
          under_accreditation_ids: normalizeText(get(cells, 'under_accreditation_ids'))
            ? normalizeText(get(cells, 'under_accreditation_ids')).split('|').filter(Boolean)
            : [],
          uncertainty_mu: normalizeText(get(cells, 'uncertainty_mu')) || null,
          testing_charges: normalizeText(get(cells, 'testing_charges'))
            ? Number(normalizeNumberString(get(cells, 'testing_charges')))
            : null,
          conformity: (normalizeText(get(cells, 'conformity')) === 'No' ? 'No' : 'Yes') as 'Yes' | 'No',
          department: normalizeText(get(cells, 'department')) || null,
          designation: normalizeText(get(cells, 'designation')) || null,
          equipment_ids: normalizeText(get(cells, 'equipment_ids'))
            ? normalizeText(get(cells, 'equipment_ids')).split('|').filter(Boolean)
            : [],
          temperature_of_test: normalizeText(get(cells, 'temperature_of_test')) || null,
          humidity_of_test: normalizeText(get(cells, 'humidity_of_test')) || null,
          testing_time: normalizeText(get(cells, 'testing_time')) || null,
          test_method_note_path: normalizeText(get(cells, 'test_method_note_path')) || null,
        }))

        const clean = payloads.filter((p) => p.item_name.trim().length > 0)
        if (clean.length === 0) {
          setSaveMessage('No valid rows found (item_name missing).')
          return
        }

        const { error } = await supabase.from('test_parameters').upsert(clean, { onConflict: 'item_name' })
        if (error) throw error

        setSaveMessage(`Imported ${clean.length} record(s).`)
        await loadRows()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleAddAccreditationBody = () => {
    const name = normalizeText(newAccreditationBody)
    if (!name) return
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('accreditation_bodies')
          .insert({ name })
          .select('id, name, created_at')
          .single()

        if (error) throw error

        const row = data as AccreditationBodyRow

        setAccreditationBodies((prev) => {
          const merged = [...prev, row]
          const uniq = new Map(merged.map((x) => [x.name.toLowerCase(), x]))
          return Array.from(uniq.values()).sort((a, b) => a.name.localeCompare(b.name))
        })

        setForm((prev) => ({
          ...prev,
          underAccreditationIds: Array.from(new Set([...(prev.underAccreditationIds ?? []), row.id])),
        }))
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to add accreditation body')
      } finally {
        setNewAccreditationBody('')
        setAccreditationDialogOpen(false)
      }
    })()
  }

  const handleDeleteAccreditationBody = (id: string) => {
    void (async () => {
      try {
        const { error } = await supabase.from('accreditation_bodies').delete().eq('id', id)
        if (error) throw error

        setAccreditationBodies((prev) => prev.filter((b) => b.id !== id))
        setForm((prev) => ({
          ...prev,
          underAccreditationIds: (prev.underAccreditationIds ?? []).filter((x) => x !== id),
        }))
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to delete accreditation body')
      }
    })()
  }

  const handleAddUnit = () => {
    const name = normalizeText(newUnitName)
    if (!name) return

    void (async () => {
      setSaveMessage(null)
      try {
        const { data, error } = await supabase
          .from('test_parameter_units')
          .insert({ name })
          .select('id, name, created_at')
          .single()

        if (error) throw error
        const row = data as UnitRow
        setUnits((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)))
        setForm((prev) => ({ ...prev, unitValue: row.name }))
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to add measurement unit')
      } finally {
        setNewUnitName('')
        setUnitDialogOpen(false)
      }
    })()
  }

  const handleDeleteUnit = (id: string) => {
    const target = units.find((unit) => unit.id === id)
    void (async () => {
      try {
        const { error } = await supabase.from('test_parameter_units').delete().eq('id', id)
        if (error) throw error

        setUnits((prev) => prev.filter((unit) => unit.id !== id))
        if (target) {
          setForm((prev) => ({
            ...prev,
            unitValue: prev.unitValue === target.name ? '' : prev.unitValue,
          }))
        }
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to delete measurement unit')
      }
    })()
  }

  return (
    <div className="p-6 space-y-5">
      <TestParameterHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onNew={handleNew}
      />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Add New Test Parameter</DialogTitle>
          </DialogHeader>

          {saveMessage && (
            <div className="text-sm text-destructive">
              {saveMessage}
            </div>
          )}

          <TestParameterForm
            form={form}
            onChange={setForm}
            canSave={canSave}
            saveLoading={saveLoading}
            onSave={handleSave}
            onClear={handleClear}
            isCodes={isCodes}
            accreditationBodies={accreditationBodies}
            accreditationDialogOpen={accreditationDialogOpen}
            setAccreditationDialogOpen={setAccreditationDialogOpen}
            newAccreditationBody={newAccreditationBody}
            setNewAccreditationBody={setNewAccreditationBody}
            onAddAccreditationBody={handleAddAccreditationBody}
            onDeleteAccreditationBody={handleDeleteAccreditationBody}
            units={units}
            unitDialogOpen={unitDialogOpen}
            setUnitDialogOpen={setUnitDialogOpen}
            newUnitName={newUnitName}
            setNewUnitName={setNewUnitName}
            onAddUnit={handleAddUnit}
            onDeleteUnit={handleDeleteUnit}
            onOpenAddIsCodeForm={openAddIsCodeForm}
            onOpenAddEquipmentForm={openAddEquipmentForm}
            departments={departments}
            designations={designations}
            equipments={equipments}
            onUploadTestMethodNote={handleUploadTestMethodNote}
            testMethodNoteDownloadUrl={testMethodNoteDownloadUrl}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isCodeDialogOpen} onOpenChange={setIsCodeDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Add New IS Code</DialogTitle>
          </DialogHeader>
          {saveMessage && <div className="text-sm text-destructive">{saveMessage}</div>}
          <IsCodesForm
            form={isCodeForm}
            onChange={setIsCodeForm}
            canSave={canSaveIsCode}
            saveLoading={isCodeSaveLoading}
            onSave={handleSaveIsCode}
            onClear={handleClearIsCode}
            onPickFiles={handlePickIsFiles}
            aspectOptions={isCodeAspects}
            aspectDialogOpen={isCodeAspectDialogOpen}
            setAspectDialogOpen={setIsCodeAspectDialogOpen}
            newAspect={isCodeNewAspect}
            setNewAspect={setIsCodeNewAspect}
            onAddAspect={handleAddIsAspect}
            onDeleteAspect={handleDeleteIsAspect}
            onOpenFiles={() => {
              setSaveMessage('Please save the IS Code in IS Code Master to manage files.')
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={equipmentDialogOpen} onOpenChange={setEquipmentDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Add New Test Equipment</DialogTitle>
          </DialogHeader>
          {saveMessage && <div className="text-sm text-destructive">{saveMessage}</div>}
          <EquipmentMasterForm
            form={equipmentForm}
            onChange={setEquipmentForm}
            canSave={canSaveEquipment}
            saveLoading={equipmentSaveLoading}
            onSave={handleSaveEquipment}
            onClear={handleClearEquipment}
            locations={departments.length ? departments : ['Mechanical']}
          />
        </DialogContent>
      </Dialog>

      <TestParameterTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onEdit={handleEdit}
        onCopy={handleCopy}
        onViewFile={(row) => void openTestMethodNotePopup(row)}
        accreditationBodies={accreditationBodies}
      />

      <TestParameterTableFooterBar
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
          setPage(Math.min(pageCount, Math.max(1, n)))
        }}
      />

      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImportFile(f)
          e.currentTarget.value = ''
        }}
      />
    </div>
  )
}
