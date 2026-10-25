import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CopyPlus,
  Eye,
  FileUp,
  Loader2,
  Lock,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import {
  limsDarkBarBtnClass,
  limsDarkBarSearchClass,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { assertAllowedUpload, uploadContentType } from '@/lib/validateUpload'
import { ConfirmLoginPasswordDialog } from '@/features/sample-handling/shared/ConfirmLoginPasswordDialog'
import {
  MvField,
  MvHeader,
  MvMessage,
  MvMissingMigrationNotice,
  MvPanel,
  MvSelect,
  MvStatusBadge,
  PassBadge,
} from './MethodValidationUi'
import {
  CONCLUSION_LABEL,
  KIND_LABEL,
  METHOD_TYPE_LABEL,
  METHOD_VALIDATION_BUCKET,
  PERFORMANCE_CHARACTERISTICS,
  STANDARD_STATUS_LABEL,
  STATUS_LABEL,
  approvalProblem,
  canApproveMethodRecords,
  emptyCharacteristic,
  fmtDate,
  isMvMissingError,
  kindForMethodType,
  mvErrorText,
  mvInputClass,
  mvTdClass,
  mvTextareaClass,
  mvThClass,
  normalizeAttachments,
  normalizeCharacteristics,
  type MethodVerification,
  type MvAttachment,
  type MvConclusion,
  type MvMethodType,
  type MvStatus,
  type PerformanceCharacteristic,
  type StandardStatus,
} from './methodValidation'

type TestParameterOption = {
  id: string
  item_name: string
  test_method: string | null
  is_code_id: string | null
  is_code_label: string | null
}

type IsCodeOption = {
  id: string
  is_number: string
  revision_year: string | null
  title: string
  standard_status?: string | null
}

type Draft = {
  methodType: MvMethodType
  testParameterId: string
  isCodeId: string
  methodReference: string
  scopeNote: string
  protocol: string
  characteristics: PerformanceCharacteristic[]
  conclusion: MvConclusion | ''
  performedBy: string
  performedOn: string
  reviewedBy: string
  validUntil: string
  remarks: string
  attachments: MvAttachment[]
}

const EMPTY_DRAFT: Draft = {
  methodType: 'standard',
  testParameterId: '',
  isCodeId: '',
  methodReference: '',
  scopeNote: '',
  protocol: '',
  characteristics: [emptyCharacteristic('repeatability'), emptyCharacteristic('bias')],
  conclusion: '',
  performedBy: '',
  performedOn: '',
  reviewedBy: '',
  validUntil: '',
  remarks: '',
  attachments: [],
}

const MAX_BYTES = 50 * 1024 * 1024

function toDraft(r: MethodVerification): Draft {
  return {
    methodType: r.method_type,
    testParameterId: r.test_parameter_id ?? '',
    isCodeId: r.is_code_id ?? '',
    methodReference: r.method_reference ?? '',
    scopeNote: r.scope_note ?? '',
    protocol: r.protocol ?? '',
    characteristics: normalizeCharacteristics(r.performance_characteristics),
    conclusion: r.conclusion ?? '',
    performedBy: r.performed_by ?? '',
    performedOn: (r.performed_on ?? '').slice(0, 10),
    reviewedBy: r.reviewed_by ?? '',
    validUntil: (r.valid_until ?? '').slice(0, 10),
    remarks: r.remarks ?? '',
    attachments: normalizeAttachments(r.attachments),
  }
}

function toPayload(d: Draft) {
  return {
    kind: kindForMethodType(d.methodType),
    method_type: d.methodType,
    test_parameter_id: d.testParameterId || null,
    is_code_id: d.isCodeId || null,
    method_reference: d.methodReference.trim(),
    scope_note: d.scopeNote.trim() || null,
    protocol: d.protocol.trim() || null,
    performance_characteristics: d.characteristics
      .filter((c) => c.characteristic.trim())
      .map((c) => ({
        characteristic: c.characteristic.trim(),
        acceptance_criterion: c.acceptance_criterion.trim(),
        observed: c.observed.trim(),
        unit: c.unit.trim(),
        pass: c.pass,
      })),
    conclusion: d.conclusion || null,
    performed_by: d.performedBy.trim() || null,
    performed_on: d.performedOn || null,
    reviewed_by: d.reviewedBy.trim() || null,
    valid_until: d.validUntil || null,
    remarks: d.remarks.trim() || null,
    attachments: d.attachments,
  }
}

function validateDraft(d: Draft): string | null {
  if (!d.methodReference.trim()) return 'Enter the method reference (standard number / SOP).'
  if (d.performedOn && d.validUntil && d.validUntil < d.performedOn) return '"Valid until" is before the date performed.'
  return null
}

function isCodeText(ic: IsCodeOption | undefined): string {
  if (!ic) return ''
  return `${ic.is_number}${ic.revision_year ? `:${ic.revision_year}` : ''}`
}

export default function MethodVerificationsPage() {
  const { designation, departmentName } = useAuth()
  const canApprove = canApproveMethodRecords(designation, departmentName)
  const askReason = useReasonForChange()
  const [searchParams, setSearchParams] = useSearchParams()

  const [records, setRecords] = useState<MethodVerification[]>([])
  const [params, setParams] = useState<TestParameterOption[]>([])
  const [isCodes, setIsCodes] = useState<IsCodeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | MvStatus | 'current'>('current')
  const [kindFilter, setKindFilter] = useState('')

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<MethodVerification | null>(null)
  const [supersedes, setSupersedes] = useState<MethodVerification | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [paramFilter, setParamFilter] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const fetchAll = useCallback(async () => {
    const [mRes, pRes, iRes] = await Promise.all([
      supabase.from('method_verifications').select('*').order('record_no', { ascending: false }).order('version', { ascending: false }),
      supabase.from('test_parameters').select('id, item_name, test_method, is_code_id, is_code_label').order('item_name'),
      supabase.from('is_codes').select('id, is_number, revision_year, title, standard_status').order('is_number'),
    ])
    if (mRes.error) {
      if (isMvMissingError(mRes.error)) return { missing: true as const }
      throw mRes.error
    }
    let ic = (iRes.data ?? []) as IsCodeOption[]
    if (iRes.error) {
      const fallback = await supabase.from('is_codes').select('id, is_number, revision_year, title').order('is_number')
      ic = (fallback.data ?? []) as IsCodeOption[]
    }
    return {
      missing: false as const,
      records: (mRes.data ?? []) as MethodVerification[],
      params: (pRes.data ?? []) as TestParameterOption[],
      isCodes: ic,
    }
  }, [])

  const apply = useCallback((res: Awaited<ReturnType<typeof fetchAll>>) => {
    if (res.missing) {
      setMissing(true)
      return
    }
    setMissing(false)
    setRecords(res.records)
    setParams(res.params)
    setIsCodes(res.isCodes)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      apply(await fetchAll())
    } catch (err) {
      setError(mvErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [apply, fetchAll])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetchAll()
        if (!cancelled) apply(res)
      } catch (err) {
        if (!cancelled) setError(mvErrorText(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apply, fetchAll])

  const paramById = useMemo(() => new Map(params.map((p) => [p.id, p])), [params])
  const isCodeById = useMemo(() => new Map(isCodes.map((c) => [c.id, c])), [isCodes])
  const byId = useMemo(() => new Map(records.map((r) => [r.id, r])), [records])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return records.filter((r) => {
      if (statusFilter === 'current' && r.status === 'superseded') return false
      if (statusFilter && statusFilter !== 'current' && r.status !== statusFilter) return false
      if (kindFilter && r.kind !== kindFilter) return false
      if (!q) return true
      const tp = r.test_parameter_id ? paramById.get(r.test_parameter_id) : undefined
      const ic = r.is_code_id ? isCodeById.get(r.is_code_id) : undefined
      return `${r.record_no} ${r.method_reference} ${tp?.item_name ?? ''} ${isCodeText(ic)} ${r.performed_by ?? ''} ${r.remarks ?? ''}`
        .toLowerCase()
        .includes(q)
    })
  }, [records, search, statusFilter, kindFilter, paramById, isCodeById])

  const counts = useMemo(() => {
    const c = { draft: 0, under_review: 0, approved: 0, expired: 0 }
    const today = new Date().toISOString().slice(0, 10)
    for (const r of records) {
      if (r.status === 'draft') c.draft += 1
      if (r.status === 'under_review') c.under_review += 1
      if (r.status === 'approved') {
        c.approved += 1
        if (r.valid_until && r.valid_until.slice(0, 10) < today) c.expired += 1
      }
    }
    return c
  }, [records])

  const readOnly = Boolean(editing && (editing.status === 'approved' || editing.status === 'superseded'))

  const openNew = useCallback((prefill?: Partial<Draft>) => {
    setEditing(null)
    setSupersedes(null)
    setDraft({ ...EMPTY_DRAFT, ...prefill })
    setPendingFiles([])
    setParamFilter('')
    setFormError(null)
    setOpen(true)
  }, [])

  const openRecord = useCallback((r: MethodVerification) => {
    setEditing(r)
    setSupersedes(null)
    setDraft(toDraft(r))
    setPendingFiles([])
    setParamFilter('')
    setFormError(null)
    setOpen(true)
  }, [])

  const openNewVersion = (r: MethodVerification) => {
    setEditing(null)
    setSupersedes(r)
    setDraft({ ...toDraft(r), conclusion: '', attachments: [], performedOn: '', reviewedBy: '', validUntil: '' })
    setPendingFiles([])
    setParamFilter('')
    setFormError(null)
    setOpen(true)
  }

  // Deep links: ?id=<record> opens it; ?method=...&parameter=... starts a new record.
  const deepLinkHandled = useRef(false)
  useEffect(() => {
    if (deepLinkHandled.current || loading || missing) return
    const id = searchParams.get('id')
    const method = searchParams.get('method')
    if (!id && !method) return
    deepLinkHandled.current = true
    const timer = window.setTimeout(() => {
      if (id) {
        const r = byId.get(id)
        if (r) openRecord(r)
      } else if (method) {
        const isStandard = /^\s*(IS|ISO|IEC|ASTM|EN|BS|DIN|IP|API|OIML|DKD|EURAMET)\b/i.test(method)
        openNew({
          methodReference: method,
          methodType: isStandard ? 'standard' : 'non_standard',
          scopeNote: searchParams.get('parameter') ? `NABL scope: ${searchParams.get('parameter')}` : '',
        })
      }
      setSearchParams({}, { replace: true })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [byId, loading, missing, openNew, openRecord, searchParams, setSearchParams])

  const setChar = (i: number, patch: Partial<PerformanceCharacteristic>) => {
    setDraft((d) => ({
      ...d,
      characteristics: d.characteristics.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    }))
  }

  const pickParameter = (id: string) => {
    const tp = id ? paramById.get(id) : undefined
    setDraft((d) => ({
      ...d,
      testParameterId: id,
      methodReference: d.methodReference.trim() || !tp?.test_method ? d.methodReference : tp.test_method,
      isCodeId: d.isCodeId || tp?.is_code_id || '',
    }))
  }

  const filteredParams = useMemo(() => {
    const q = paramFilter.trim().toLowerCase()
    const list = q
      ? params.filter((p) => `${p.item_name} ${p.test_method ?? ''} ${p.is_code_label ?? ''}`.toLowerCase().includes(q))
      : params
    const sel = draft.testParameterId ? paramById.get(draft.testParameterId) : undefined
    const top = list.slice(0, 300)
    return sel && !top.includes(sel) ? [sel, ...top] : top
  }, [params, paramFilter, draft.testParameterId, paramById])

  const getSignedUrl = async (path: string, download?: string) => {
    const { data, error: err } = await supabase.storage
      .from(METHOD_VALIDATION_BUCKET)
      .createSignedUrl(path, 600, download ? { download } : undefined)
    if (err) throw err
    return data.signedUrl
  }

  const viewAttachment = async (a: MvAttachment) => {
    try {
      const url = await getSignedUrl(a.path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setFormError(`Could not open ${a.name}: ${mvErrorText(err)}`)
    }
  }

  const removeAttachment = async (a: MvAttachment) => {
    if (readOnly) return
    setDraft((d) => ({ ...d, attachments: d.attachments.filter((x) => x.path !== a.path) }))
    if (editing) {
      const next = draft.attachments.filter((x) => x.path !== a.path)
      const { error: err } = await supabase.from('method_verifications').update({ attachments: next }).eq('id', editing.id)
      if (err) {
        setFormError(mvErrorText(err))
        return
      }
      await supabase.storage.from(METHOD_VALIDATION_BUCKET).remove([a.path])
    }
  }

  const uploadPending = async (recordId: string, current: MvAttachment[]): Promise<MvAttachment[]> => {
    const out = [...current]
    for (const file of pendingFiles) {
      assertAllowedUpload(file, { maxBytes: MAX_BYTES })
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${recordId}/${crypto.randomUUID()}_${safe}`
      const { error: upErr } = await supabase.storage
        .from(METHOD_VALIDATION_BUCKET)
        .upload(path, file, { upsert: false, contentType: uploadContentType(file) })
      if (upErr) throw upErr
      out.push({ path, name: file.name, uploaded_at: new Date().toISOString() })
    }
    return out
  }

  /**
   * Save the draft. status: keep / 'under_review' / 'approved' (with the
   * password confirmation time). Returns the saved id or null on error.
   */
  const persist = async (target: 'keep' | 'under_review' | 'approved', reauthenticatedAt?: string) => {
    const problem = validateDraft(draft)
    if (problem) {
      setFormError(problem)
      return null
    }
    if (target === 'approved') {
      const ap = approvalProblem(draft.characteristics, draft.conclusion)
      if (ap) {
        setFormError(`Cannot approve: ${ap}`)
        return null
      }
    }

    let reason: string | null = null
    if (editing && editing.status === 'under_review' && target !== 'approved') {
      reason = await askReason({
        title: 'Reason for changing a record under review',
        recordLabel: `${editing.record_no} v${editing.version} — ${editing.method_reference}`,
        quickPicks: ['Reviewer comments addressed', 'Additional data added', 'Entry error corrected'],
      })
      if (!reason) return null
    }

    setSaving(true)
    setFormError(null)
    try {
      const base = toPayload(draft)
      let id = editing?.id ?? null
      if (!id) {
        const insert = {
          ...base,
          status: target === 'under_review' ? 'under_review' : 'draft',
          supersedes_id: supersedes?.id ?? null,
          record_no: supersedes?.record_no ?? 'NEW',
        }
        const { data, error: err } = await supabase.from('method_verifications').insert(insert).select('id').single()
        if (err) throw err
        id = (data as { id: string }).id
      }

      let attachments = base.attachments
      if (pendingFiles.length > 0) {
        try {
          attachments = await uploadPending(id, base.attachments)
          setPendingFiles([])
        } catch (err) {
          setFormError(`Saved, but the file upload failed: ${mvErrorText(err)}`)
        }
      }

      const statusPatch: Record<string, unknown> =
        target === 'approved'
          ? { status: 'approved', approved_reauthenticated_at: reauthenticatedAt ?? new Date().toISOString() }
          : target === 'under_review'
            ? { status: 'under_review' }
            : {}
      const needsUpdate = Boolean(editing) || attachments !== base.attachments || target === 'approved'
      if (needsUpdate) {
        const { error: err } = await supabase
          .from('method_verifications')
          .update({ ...base, attachments, ...statusPatch })
          .eq('id', id)
        if (err) throw err
      }
      if (reason && editing) await recordReason('method_verifications', editing.id, reason)
      return id
    } catch (err) {
      const e = err as { code?: string }
      setFormError(e?.code === '23505' ? 'A new version of this record is already being prepared.' : mvErrorText(err))
      return null
    } finally {
      setSaving(false)
    }
  }

  const save = async (target: 'keep' | 'under_review') => {
    const id = await persist(target)
    if (!id) return
    setOpen(false)
    setMessage(target === 'under_review' ? 'Sent for review.' : 'Saved.')
    await load()
  }

  const startApprove = () => {
    const problem = validateDraft(draft) ?? approvalProblem(draft.characteristics, draft.conclusion)
    if (problem) {
      setFormError(`Cannot approve: ${problem}`)
      return
    }
    setConfirmOpen(true)
  }

  const approve = async (reauthenticatedAt: string) => {
    const id = await persist('approved', reauthenticatedAt)
    if (!id) return
    setOpen(false)
    setMessage(
      supersedes || editing?.supersedes_id
        ? 'Approved. The previous version is now superseded.'
        : 'Approved. The record is now read-only; changes need a new version.',
    )
    await load()
  }

  const retire = async (r: MethodVerification) => {
    const reason = await askReason({
      title: `Retire ${r.record_no} v${r.version}`,
      recordLabel: r.method_reference,
      description: 'The record stays on file as "superseded" and no longer covers the NABL scope.',
      confirmLabel: 'Retire',
      quickPicks: ['Method withdrawn from scope', 'Standard withdrawn', 'Replaced by another record'],
    })
    if (!reason) return
    const { error: err } = await supabase.from('method_verifications').update({ status: 'superseded' }).eq('id', r.id)
    if (err) {
      setMessage(mvErrorText(err))
      return
    }
    await recordReason('method_verifications', r.id, reason)
    setOpen(false)
    setMessage(`${r.record_no} v${r.version} retired.`)
    await load()
  }

  const remove = async (r: MethodVerification) => {
    const reason = await askReason({
      title: `Delete ${r.record_no} v${r.version}`,
      recordLabel: r.method_reference,
      description: 'Only draft and under-review records can be deleted.',
      confirmLabel: 'Delete',
      quickPicks: ['Created by mistake', 'Duplicate record'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('method_verifications').delete().eq('id', r.id).select('id')
    if (err) {
      setMessage(mvErrorText(err))
      return
    }
    if (!data || data.length === 0) {
      setMessage('Not deleted: only the author or an approver can delete a draft.')
      return
    }
    await recordReason('method_verifications', r.id, reason)
    const paths = normalizeAttachments(r.attachments).map((a) => a.path)
    if (paths.length) await supabase.storage.from(METHOD_VALIDATION_BUCKET).remove(paths)
    setOpen(false)
    setMessage(`${r.record_no} v${r.version} deleted.`)
    await load()
  }

  const paramLabel = (id: string | null) => {
    if (!id) return null
    const tp = paramById.get(id)
    return tp ? tp.item_name : 'Removed parameter'
  }

  const icStatus = (id: string | null): StandardStatus | null => {
    if (!id) return null
    const s = isCodeById.get(id)?.standard_status
    return s && s !== 'current' ? (s as StandardStatus) : null
  }

  const today = new Date().toISOString().slice(0, 10)
  const editingStandard = draft.isCodeId ? icStatus(draft.isCodeId) : null
  const failedCount = draft.characteristics.filter((c) => c.characteristic.trim() && c.pass === false).length

  return (
    <div className={limsPageShellClass}>
      <MvHeader
        title="Method Verification & Validation"
        clause="7.2.1.5 · 7.2.2"
        subtitle="Evidence that each method performs as required before it is used for customer work."
        actions={
          <>
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {!missing ? (
              <Button className={limsPrimaryBtnClass} onClick={() => openNew()}>
                <Plus className="h-4 w-4" /> New record
              </Button>
            ) : null}
          </>
        }
      />

      {missing ? <MvMissingMigrationNotice /> : null}
      <MvMessage tone="error" text={error} />
      <MvMessage text={message} />

      {!missing ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Draft', value: counts.draft },
              { label: 'Under review', value: counts.under_review },
              { label: 'Approved', value: counts.approved },
              { label: 'Approved but expired', value: counts.expired, warn: counts.expired > 0 },
            ].map((t) => (
              <div key={t.label} className={cn('border-2 border-stone-500 bg-white px-3 py-2', t.warn && 'border-amber-600 bg-amber-50')}>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-stone-500">{t.label}</p>
                <p className="text-xl font-semibold tabular-nums text-stone-900">{t.value}</p>
              </div>
            ))}
          </div>

          <MvPanel
            title={`Records (${visible.length})`}
            right={
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Status filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="h-8 rounded-none border border-stone-500 bg-stone-900 px-2 text-[12px] text-amber-100"
                >
                  <option value="current">Current (hide superseded)</option>
                  <option value="">All</option>
                  {(Object.keys(STATUS_LABEL) as MvStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Kind filter"
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value)}
                  className="h-8 rounded-none border border-stone-500 bg-stone-900 px-2 text-[12px] text-amber-100"
                >
                  <option value="">Verification + validation</option>
                  <option value="verification">Verification</option>
                  <option value="validation">Validation</option>
                </select>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search method, record, parameter"
                  className={cn(limsDarkBarSearchClass, 'h-8 w-44 sm:w-64')}
                />
              </div>
            }
          >
            {loading && records.length === 0 ? (
              <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
            ) : visible.length === 0 ? (
              <p className="border border-dashed border-stone-400 bg-stone-50 px-3 py-6 text-center text-sm text-stone-600">
                {records.length === 0
                  ? 'No verification or validation records yet. Use "New record" to document the first method.'
                  : 'No records match the filters.'}
              </p>
            ) : (
              <>
                {/* Phone: cards */}
                <div className="space-y-2 md:hidden">
                  {visible.map((r) => {
                    const expired = r.status === 'approved' && r.valid_until && r.valid_until.slice(0, 10) < today
                    return (
                      <button
                        type="button"
                        key={r.id}
                        onClick={() => openRecord(r)}
                        className="block w-full border border-stone-400 bg-white p-2.5 text-left"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-mono text-[12px] font-semibold text-amber-800">
                            {r.record_no} v{r.version}
                          </p>
                          <MvStatusBadge status={r.status} />
                        </div>
                        <p className="mt-0.5 font-semibold text-stone-900">{r.method_reference}</p>
                        <p className="text-[12px] text-stone-600">
                          {KIND_LABEL[r.kind]} · {paramLabel(r.test_parameter_id) ?? 'All parameters'}
                        </p>
                        <p className="text-[12px] text-stone-600">
                          {r.conclusion ? CONCLUSION_LABEL[r.conclusion] : 'No conclusion yet'}
                          {r.valid_until ? ` · valid until ${fmtDate(r.valid_until)}` : ''}
                          {expired ? ' (expired)' : ''}
                        </p>
                      </button>
                    )
                  })}
                </div>

                {/* Desktop: table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[1040px] border-collapse font-jakarta">
                    <thead>
                      <tr>
                        <th className={mvThClass}>Record</th>
                        <th className={mvThClass}>Method</th>
                        <th className={mvThClass}>Parameter</th>
                        <th className={mvThClass}>Type</th>
                        <th className={mvThClass}>Characteristics</th>
                        <th className={mvThClass}>Conclusion</th>
                        <th className={mvThClass}>Performed</th>
                        <th className={mvThClass}>Approved</th>
                        <th className={mvThClass}>Valid until</th>
                        <th className={cn(mvThClass, 'w-28')}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r, i) => {
                        const pcs = normalizeCharacteristics(r.performance_characteristics)
                        const failed = pcs.filter((c) => c.pass === false).length
                        const expired = r.status === 'approved' && r.valid_until && r.valid_until.slice(0, 10) < today
                        const std = icStatus(r.is_code_id)
                        const att = normalizeAttachments(r.attachments).length
                        return (
                          <tr key={r.id} className={cn(i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]', r.status === 'superseded' && 'opacity-60')}>
                            <td className={cn(mvTdClass, 'whitespace-nowrap')}>
                              <p className="font-mono font-semibold text-amber-800">
                                {r.record_no} v{r.version}
                              </p>
                              <MvStatusBadge status={r.status} />
                            </td>
                            <td className={mvTdClass}>
                              <p className="font-semibold">{r.method_reference}</p>
                              {r.is_code_id ? (
                                <p className="text-[11px] text-stone-600">
                                  {isCodeText(isCodeById.get(r.is_code_id))}
                                  {std ? (
                                    <span className="ml-1 font-bold text-red-700">({STANDARD_STATUS_LABEL[std]})</span>
                                  ) : null}
                                </p>
                              ) : null}
                              {att ? (
                                <p className="inline-flex items-center gap-1 text-[11px] text-stone-600">
                                  <Paperclip className="h-3 w-3" /> {att}
                                </p>
                              ) : null}
                            </td>
                            <td className={mvTdClass}>{paramLabel(r.test_parameter_id) ?? <span className="text-stone-500">All</span>}</td>
                            <td className={mvTdClass}>
                              <p>{r.kind === 'verification' ? 'Verification' : 'Validation'}</p>
                              <p className="text-[11px] text-stone-600">{METHOD_TYPE_LABEL[r.method_type]}</p>
                            </td>
                            <td className={cn(mvTdClass, 'text-center')}>
                              {pcs.length}
                              {failed ? <p className="text-[11px] font-bold text-red-700">{failed} failed</p> : null}
                            </td>
                            <td className={mvTdClass}>{r.conclusion ? CONCLUSION_LABEL[r.conclusion] : '—'}</td>
                            <td className={cn(mvTdClass, 'whitespace-nowrap')}>
                              <p>{fmtDate(r.performed_on)}</p>
                              <p className="text-[11px] text-stone-600">{r.performed_by || '—'}</p>
                            </td>
                            <td className={cn(mvTdClass, 'whitespace-nowrap')}>
                              <p>{fmtDate(r.approved_on)}</p>
                              <p className="text-[11px] text-stone-600">{r.approved_by_name || '—'}</p>
                            </td>
                            <td className={cn(mvTdClass, 'whitespace-nowrap', expired && 'font-bold text-red-700')}>
                              {fmtDate(r.valid_until)}
                              {expired ? <p className="text-[11px]">Expired</p> : null}
                            </td>
                            <td className={cn(mvTdClass, 'text-center')}>
                              <div className="flex justify-center gap-1">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className={cn(limsOutlineBtnClass, 'h-8 w-8')}
                                  onClick={() => openRecord(r)}
                                  aria-label={r.status === 'approved' || r.status === 'superseded' ? `View ${r.record_no}` : `Edit ${r.record_no}`}
                                  title={r.status === 'approved' || r.status === 'superseded' ? 'View' : 'Edit'}
                                >
                                  {r.status === 'approved' || r.status === 'superseded' ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                                </Button>
                                {r.status === 'approved' ? (
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className={cn(limsOutlineBtnClass, 'h-8 w-8')}
                                    onClick={() => openNewVersion(r)}
                                    aria-label={`New version of ${r.record_no}`}
                                    title="New version"
                                  >
                                    <CopyPlus className="h-4 w-4" />
                                  </Button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </MvPanel>
        </>
      ) : null}

      <Dialog open={open} onOpenChange={(v) => !saving && setOpen(v)}>
        <DialogContent className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-4xl flex-col')}>
          <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <DialogHeader className="pr-10 text-left">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-semibold text-white">
                {editing
                  ? `${editing.record_no} v${editing.version}`
                  : supersedes
                    ? `New version of ${supersedes.record_no} (v${supersedes.version + 1})`
                    : 'New verification / validation'}
                {editing ? <MvStatusBadge status={editing.status} /> : null}
                {readOnly ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-200">
                    <Lock className="h-3 w-3" /> Read-only
                  </span>
                ) : null}
              </DialogTitle>
              <DialogDescription className="text-[12px] text-stone-300">
                {readOnly
                  ? 'Approved records cannot be changed. Use "New version" to revise the method record.'
                  : 'A standard method used as published is verified (7.2.1.5); a non-standard, lab-developed or modified method is validated (7.2.2).'}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
            <fieldset disabled={readOnly || saving} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <MvField label="Method type" htmlFor="mv-type">
                  <MvSelect
                    id="mv-type"
                    value={draft.methodType}
                    disabled={readOnly || saving || Boolean(supersedes) || Boolean(editing?.supersedes_id)}
                    onChange={(v) => setDraft((d) => ({ ...d, methodType: v as MvMethodType }))}
                  >
                    {(Object.keys(METHOD_TYPE_LABEL) as MvMethodType[]).map((t) => (
                      <option key={t} value={t}>
                        {METHOD_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </MvSelect>
                  <p className="text-[11px] font-semibold text-amber-800">{KIND_LABEL[kindForMethodType(draft.methodType)]}</p>
                </MvField>
                <MvField label="Method reference *" htmlFor="mv-method" className="lg:col-span-2">
                  <Input
                    id="mv-method"
                    value={draft.methodReference}
                    onChange={(e) => setDraft((d) => ({ ...d, methodReference: e.target.value }))}
                    placeholder="e.g. IS 516 (Part 1/Sec 1):2021 or QIRL/SOP/CH/012"
                    className={mvInputClass}
                  />
                </MvField>
                <MvField label="Test parameter" htmlFor="mv-param" className="sm:col-span-2">
                  <div className="flex flex-col gap-1 sm:flex-row">
                    <Input
                      value={paramFilter}
                      onChange={(e) => setParamFilter(e.target.value)}
                      placeholder="Filter…"
                      aria-label="Filter test parameters"
                      className={cn(mvInputClass, 'sm:w-36')}
                    />
                    <MvSelect id="mv-param" value={draft.testParameterId} onChange={pickParameter} disabled={readOnly || saving}>
                      <option value="">— All parameters of the method —</option>
                      {filteredParams.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.item_name}
                          {p.test_method ? ` · ${p.test_method}` : ''}
                        </option>
                      ))}
                    </MvSelect>
                  </div>
                </MvField>
                <MvField label="IS code / standard" htmlFor="mv-iscode">
                  <MvSelect
                    id="mv-iscode"
                    value={draft.isCodeId}
                    onChange={(v) => setDraft((d) => ({ ...d, isCodeId: v }))}
                    disabled={readOnly || saving}
                  >
                    <option value="">—</option>
                    {isCodes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {isCodeText(c)} — {c.title}
                      </option>
                    ))}
                  </MvSelect>
                  {editingStandard ? (
                    <p className="text-[11px] font-bold text-red-700">
                      This standard is marked {STANDARD_STATUS_LABEL[editingStandard]} in the IS code master (7.2.1.4).
                    </p>
                  ) : null}
                </MvField>
                <MvField label="Scope of the study" htmlFor="mv-scope" className="sm:col-span-2 lg:col-span-3">
                  <Input
                    id="mv-scope"
                    value={draft.scopeNote}
                    onChange={(e) => setDraft((d) => ({ ...d, scopeNote: e.target.value }))}
                    placeholder="Matrix / product, range, equipment, conditions covered"
                    className={mvInputClass}
                  />
                </MvField>
                <MvField label="Protocol / plan" htmlFor="mv-protocol" className="sm:col-span-2 lg:col-span-3">
                  <textarea
                    id="mv-protocol"
                    value={draft.protocol}
                    onChange={(e) => setDraft((d) => ({ ...d, protocol: e.target.value }))}
                    placeholder="Samples / reference materials used, number of replicates, statistical treatment…"
                    className={mvTextareaClass}
                  />
                </MvField>
              </div>

              <div className="border-2 border-stone-500 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-stone-500 bg-stone-800 px-3 py-1.5">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    Performance characteristics
                    {failedCount ? <span className="ml-2 text-red-300">({failedCount} failed)</span> : null}
                  </h3>
                  {!readOnly ? (
                    <Button
                      type="button"
                      size="sm"
                      className={cn(limsPrimaryBtnClass, 'h-7 px-2 text-xs')}
                      onClick={() => setDraft((d) => ({ ...d, characteristics: [...d.characteristics, emptyCharacteristic()] }))}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add row
                    </Button>
                  ) : null}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse">
                    <thead>
                      <tr>
                        <th className={cn(mvThClass, 'w-[22%]')}>Characteristic</th>
                        <th className={cn(mvThClass, 'w-[26%]')}>Acceptance criterion</th>
                        <th className={cn(mvThClass, 'w-[18%]')}>Observed</th>
                        <th className={cn(mvThClass, 'w-[10%]')}>Unit</th>
                        <th className={cn(mvThClass, 'w-[16%]')}>Result</th>
                        {!readOnly ? <th className={cn(mvThClass, 'w-[8%]')} aria-label="Remove" /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {draft.characteristics.length === 0 ? (
                        <tr>
                          <td colSpan={6} className={cn(mvTdClass, 'py-4 text-center text-stone-500')}>
                            No characteristics recorded.
                          </td>
                        </tr>
                      ) : null}
                      {draft.characteristics.map((c, i) => {
                        const known = PERFORMANCE_CHARACTERISTICS.some((p) => p.value === c.characteristic)
                        return (
                          <tr key={i} className={c.pass === false ? 'bg-red-50' : c.pass ? 'bg-emerald-50/50' : undefined}>
                            <td className={mvTdClass}>
                              {readOnly ? (
                                <span className="font-semibold">
                                  {PERFORMANCE_CHARACTERISTICS.find((p) => p.value === c.characteristic)?.label ?? c.characteristic}
                                </span>
                              ) : (
                                <>
                                  <MvSelect
                                    ariaLabel={`Characteristic ${i + 1}`}
                                    value={known ? c.characteristic : c.characteristic ? '__other' : ''}
                                    onChange={(v) => setChar(i, { characteristic: v === '__other' ? ' ' : v })}
                                  >
                                    <option value="">— choose —</option>
                                    {PERFORMANCE_CHARACTERISTICS.map((p) => (
                                      <option key={p.value} value={p.value}>
                                        {p.label}
                                      </option>
                                    ))}
                                    <option value="__other">Other…</option>
                                  </MvSelect>
                                  {!known && c.characteristic ? (
                                    <Input
                                      aria-label={`Other characteristic ${i + 1}`}
                                      value={c.characteristic.trimStart()}
                                      onChange={(e) => setChar(i, { characteristic: e.target.value || ' ' })}
                                      placeholder="Name"
                                      className={cn(mvInputClass, 'mt-1')}
                                    />
                                  ) : null}
                                </>
                              )}
                            </td>
                            <td className={mvTdClass}>
                              {readOnly ? (
                                c.acceptance_criterion || '—'
                              ) : (
                                <Input
                                  aria-label={`Acceptance criterion ${i + 1}`}
                                  value={c.acceptance_criterion}
                                  onChange={(e) => setChar(i, { acceptance_criterion: e.target.value })}
                                  placeholder="e.g. RSD ≤ 2 %"
                                  className={mvInputClass}
                                />
                              )}
                            </td>
                            <td className={mvTdClass}>
                              {readOnly ? (
                                c.observed || '—'
                              ) : (
                                <Input
                                  aria-label={`Observed ${i + 1}`}
                                  value={c.observed}
                                  onChange={(e) => setChar(i, { observed: e.target.value })}
                                  className={mvInputClass}
                                />
                              )}
                            </td>
                            <td className={mvTdClass}>
                              {readOnly ? (
                                c.unit || '—'
                              ) : (
                                <Input
                                  aria-label={`Unit ${i + 1}`}
                                  value={c.unit}
                                  onChange={(e) => setChar(i, { unit: e.target.value })}
                                  className={mvInputClass}
                                />
                              )}
                            </td>
                            <td className={cn(mvTdClass, 'text-center')}>
                              {readOnly ? (
                                <PassBadge pass={c.pass} />
                              ) : (
                                <MvSelect
                                  ariaLabel={`Result ${i + 1}`}
                                  value={c.pass === null ? '' : c.pass ? 'pass' : 'fail'}
                                  onChange={(v) => setChar(i, { pass: v === '' ? null : v === 'pass' })}
                                  className={cn(c.pass === false && 'border-red-600 text-red-800', c.pass && 'border-emerald-600 text-emerald-800')}
                                >
                                  <option value="">—</option>
                                  <option value="pass">Pass</option>
                                  <option value="fail">Fail</option>
                                </MvSelect>
                              )}
                            </td>
                            {!readOnly ? (
                              <td className={cn(mvTdClass, 'text-center')}>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className={cn(limsOutlineBtnClass, 'h-8 w-8')}
                                  aria-label={`Remove row ${i + 1}`}
                                  onClick={() =>
                                    setDraft((d) => ({ ...d, characteristics: d.characteristics.filter((_, j) => j !== i) }))
                                  }
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </td>
                            ) : null}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MvField label="Conclusion" htmlFor="mv-conclusion">
                  <MvSelect
                    id="mv-conclusion"
                    value={draft.conclusion}
                    onChange={(v) => setDraft((d) => ({ ...d, conclusion: v as MvConclusion | '' }))}
                    disabled={readOnly || saving}
                  >
                    <option value="">— not yet —</option>
                    {(Object.keys(CONCLUSION_LABEL) as MvConclusion[]).map((c) => (
                      <option key={c} value={c}>
                        {CONCLUSION_LABEL[c]}
                      </option>
                    ))}
                  </MvSelect>
                </MvField>
                <MvField label="Performed by" htmlFor="mv-by">
                  <Input id="mv-by" value={draft.performedBy} onChange={(e) => setDraft((d) => ({ ...d, performedBy: e.target.value }))} className={mvInputClass} />
                </MvField>
                <MvField label="Performed on" htmlFor="mv-on">
                  <Input id="mv-on" type="date" value={draft.performedOn} onChange={(e) => setDraft((d) => ({ ...d, performedOn: e.target.value }))} className={mvInputClass} />
                </MvField>
                <MvField label="Reviewed by" htmlFor="mv-rev">
                  <Input id="mv-rev" value={draft.reviewedBy} onChange={(e) => setDraft((d) => ({ ...d, reviewedBy: e.target.value }))} className={mvInputClass} />
                </MvField>
                <MvField label="Valid until (re-verify by)" htmlFor="mv-valid">
                  <Input id="mv-valid" type="date" value={draft.validUntil} onChange={(e) => setDraft((d) => ({ ...d, validUntil: e.target.value }))} className={mvInputClass} />
                </MvField>
                <MvField label="Remarks" htmlFor="mv-remarks" className="sm:col-span-2 lg:col-span-3">
                  <Input id="mv-remarks" value={draft.remarks} onChange={(e) => setDraft((d) => ({ ...d, remarks: e.target.value }))} className={mvInputClass} />
                </MvField>
              </div>
            </fieldset>

            {editing && (editing.status === 'approved' || editing.status === 'superseded') ? (
              <p className="border border-emerald-700/40 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-900">
                Approved on {fmtDate(editing.approved_on)} by {editing.approved_by_name || '—'}
                {editing.approved_reauthenticated_at ? ' (password confirmed)' : ''}.
              </p>
            ) : null}

            <div className="border-2 border-stone-500 bg-white p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">Attachments (raw data, reports, certificates)</p>
                {!readOnly ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={cn(limsOutlineBtnClass, 'h-8 gap-1 px-2 text-xs')}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={saving}
                    >
                      <FileUp className="h-4 w-4" /> Add files
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv"
                      onChange={(e) => {
                        const list = Array.from(e.target.files ?? [])
                        e.target.value = ''
                        try {
                          list.forEach((f) => assertAllowedUpload(f, { maxBytes: MAX_BYTES }))
                          setPendingFiles((p) => [...p, ...list])
                        } catch (err) {
                          setFormError(mvErrorText(err))
                        }
                      }}
                    />
                  </>
                ) : null}
              </div>
              {draft.attachments.length === 0 && pendingFiles.length === 0 ? (
                <p className="mt-1 text-[12px] text-stone-500">No files.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {draft.attachments.map((a) => (
                    <li key={a.path} className="flex items-center justify-between gap-2 border border-stone-300 bg-stone-50 px-2 py-1 text-[12.5px]">
                      <span className="min-w-0 truncate" title={a.name}>
                        {a.name}
                      </span>
                      <span className="flex shrink-0 gap-1">
                        <Button type="button" size="sm" variant="outline" className={cn(limsOutlineBtnClass, 'h-7 px-2 text-xs')} onClick={() => void viewAttachment(a)}>
                          <Eye className="h-3.5 w-3.5" /> View
                        </Button>
                        {!readOnly ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn(limsOutlineBtnClass, 'h-7 px-2 text-xs text-red-700')}
                            onClick={() => void removeAttachment(a)}
                            aria-label={`Remove ${a.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                  {pendingFiles.map((f, i) => (
                    <li key={`p${i}`} className="flex items-center justify-between gap-2 border border-dashed border-amber-600 bg-amber-50 px-2 py-1 text-[12.5px]">
                      <span className="min-w-0 truncate">{f.name} (uploads on save)</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(limsOutlineBtnClass, 'h-7 px-2 text-xs')}
                        onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                        aria-label={`Remove ${f.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <MvMessage tone="error" text={formError} />
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5">
            <div className="flex flex-wrap gap-2">
              {editing && (editing.status === 'draft' || editing.status === 'under_review') ? (
                <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={() => void remove(editing)} disabled={saving}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              ) : null}
              {editing && editing.status === 'approved' && canApprove ? (
                <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={() => void retire(editing)} disabled={saving}>
                  Retire
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={() => setOpen(false)} disabled={saving}>
                Close
              </Button>
              {editing && editing.status === 'approved' ? (
                <Button type="button" className={limsPrimaryBtnClass} onClick={() => openNewVersion(editing)}>
                  <CopyPlus className="h-4 w-4" /> New version
                </Button>
              ) : null}
              {!readOnly ? (
                <>
                  <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={() => void save('keep')} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
                  </Button>
                  {!editing || editing.status === 'draft' ? (
                    <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={() => void save('under_review')} disabled={saving}>
                      <Send className="h-4 w-4" /> Send for review
                    </Button>
                  ) : null}
                  {canApprove ? (
                    <Button type="button" className={limsPrimaryBtnClass} onClick={startApprove} disabled={saving}>
                      <ShieldCheck className="h-4 w-4" /> Approve
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          {!readOnly && !canApprove ? (
            <p className="bg-stone-900 px-3 pb-2 text-[11px] text-stone-300">
              Approval: Laboratory Director, Quality Manager or a Technical Manager.
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmLoginPasswordDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Approve method record"
        confirmLabel="Approve"
        statement={`I approve this ${kindForMethodType(draft.methodType)}: the method is ${
          draft.conclusion ? CONCLUSION_LABEL[draft.conclusion as MvConclusion].toLowerCase() : '—'
        }.`}
        onConfirmed={({ reauthenticatedAt }) => void approve(reauthenticatedAt)}
      >
        <p className="text-sm text-stone-800">
          <span className="font-semibold">{draft.methodReference || '—'}</span>
          {draft.testParameterId ? ` · ${paramLabel(draft.testParameterId)}` : ''}
        </p>
        <p className="text-[12px] text-stone-600">After approval the record is read-only (ISO/IEC 17025 7.2.1.5 / 7.2.2.4).</p>
      </ConfirmLoginPasswordDialog>
    </div>
  )
}
