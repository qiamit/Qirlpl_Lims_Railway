import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Camera,
  ExternalLink,
  Loader2,
  LocateFixed,
  MapPin,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  limsDarkBarBtnClass,
  limsDarkBarSearchClass,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDateTime } from '@/lib/utils'
import { assertAllowedUpload, uploadContentType } from '@/lib/validateUpload'
import {
  EnvHeader,
  EnvPanel,
  EnvSelect,
  Field,
  MessageLine,
  envInputClass,
  envTdClass,
  envThClass,
} from '@/features/environment/EnvironmentUi'
import { SamplingGate } from './SamplingUi'
import { canRecordSampling, useSamplingSwitch } from './samplingAccess'
import { samplingConditionsText } from './samplingForSample'
import { samplingDeviationText } from './samplingReportBlock'
import {
  SAMPLING_BUCKET,
  gpsText,
  localInputToIso,
  num,
  planLabel,
  samplingErrorText,
  statisticalBasisText,
  toLocalInput,
  type CustodyStep,
  type SamplingAttachment,
  type SamplingPlan,
  type SamplingRecord,
} from './shared'

type ClientOption = { id: string; company_name: string }
type SampleOption = { id: string; srf_number: string | null; sample_code: string | null }

type CustodyDraft = { at: string; from: string; to: string; condition: string; sealIntact: boolean; remarks: string }

type RecordForm = {
  planId: string
  clientId: string
  customerName: string
  sampleId: string
  sampledAt: string
  location: string
  latitude: string
  longitude: string
  accuracy: string
  locationSource: 'gps' | 'manual' | ''
  environmentalConditions: string
  temperature: string
  humidity: string
  sampleIdentification: string
  sampleDescription: string
  quantity: string
  containers: string
  preservation: string
  custody: CustodyDraft[]
  deviations: string
  customerInformed: boolean
  customerAgreed: boolean
  remarks: string
}

const ATTACHMENT_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf'])

function emptyForm(): RecordForm {
  return {
    planId: '',
    clientId: '',
    customerName: '',
    sampleId: '',
    sampledAt: toLocalInput(new Date()),
    location: '',
    latitude: '',
    longitude: '',
    accuracy: '',
    locationSource: '',
    environmentalConditions: '',
    temperature: '',
    humidity: '',
    sampleIdentification: '',
    sampleDescription: '',
    quantity: '',
    containers: '',
    preservation: '',
    custody: [],
    deviations: '',
    customerInformed: false,
    customerAgreed: false,
    remarks: '',
  }
}

const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))
const blank = (s: string) => s.trim() || null

function recordToForm(r: SamplingRecord): RecordForm {
  return {
    planId: r.plan_id ?? '',
    clientId: r.client_id ?? '',
    customerName: r.customer_name ?? '',
    sampleId: r.sample_id ?? '',
    sampledAt: toLocalInput(new Date(r.sampled_at)),
    location: r.location,
    latitude: str(r.latitude),
    longitude: str(r.longitude),
    accuracy: str(r.gps_accuracy_m),
    locationSource: r.location_source ?? '',
    environmentalConditions: r.environmental_conditions ?? '',
    temperature: str(r.ambient_temperature),
    humidity: str(r.ambient_humidity),
    sampleIdentification: r.sample_identification,
    sampleDescription: r.sample_description ?? '',
    quantity: r.quantity ?? '',
    containers: r.containers ?? '',
    preservation: r.preservation ?? '',
    custody: (r.chain_of_custody ?? []).map((c) => ({
      at: c.at ? toLocalInput(new Date(c.at)) : '',
      from: c.from ?? '',
      to: c.to ?? '',
      condition: c.condition ?? '',
      sealIntact: c.seal_intact !== false,
      remarks: c.remarks ?? '',
    })),
    deviations: r.deviations ?? '',
    customerInformed: r.customer_informed,
    customerAgreed: r.customer_agreed,
    remarks: r.remarks ?? '',
  }
}

function formToPayload(f: RecordForm) {
  const lat = num(f.latitude)
  const lng = num(f.longitude)
  const custody: CustodyStep[] = f.custody
    .filter((c) => c.from.trim() || c.to.trim())
    .map((c) => ({
      at: localInputToIso(c.at) ?? new Date().toISOString(),
      from: c.from.trim(),
      to: c.to.trim(),
      condition: c.condition.trim(),
      seal_intact: c.sealIntact,
      remarks: c.remarks.trim(),
    }))
  return {
    plan_id: f.planId || null,
    client_id: f.clientId || null,
    customer_name: blank(f.customerName),
    sample_id: f.sampleId || null,
    sampled_at: localInputToIso(f.sampledAt),
    location: f.location.trim(),
    latitude: lat,
    longitude: lng,
    gps_accuracy_m: lat !== null && lng !== null ? num(f.accuracy) : null,
    location_source: lat !== null && lng !== null ? f.locationSource || 'manual' : null,
    environmental_conditions: blank(f.environmentalConditions),
    ambient_temperature: num(f.temperature),
    ambient_humidity: num(f.humidity),
    sample_identification: f.sampleIdentification.trim(),
    sample_description: blank(f.sampleDescription),
    quantity: blank(f.quantity),
    containers: blank(f.containers),
    preservation: blank(f.preservation),
    chain_of_custody: custody,
    deviations: blank(f.deviations),
    customer_informed: f.customerInformed || f.customerAgreed,
    customer_agreed: f.customerAgreed,
    remarks: blank(f.remarks),
  }
}

function validate(f: RecordForm): string | null {
  if (!f.location.trim()) return 'Location is required.'
  if (!f.sampleIdentification.trim()) return 'Sample identification is required.'
  const at = localInputToIso(f.sampledAt)
  if (!at) return 'Date and time of sampling are required.'
  if (new Date(at).getTime() > Date.now() + 60 * 60 * 1000) return 'Sampling cannot be in the future.'
  const lat = num(f.latitude)
  const lng = num(f.longitude)
  if ((f.latitude.trim() && lat === null) || (f.longitude.trim() && lng === null)) return 'Latitude and longitude must be numbers.'
  if ((lat === null) !== (lng === null)) return 'Enter both latitude and longitude, or neither.'
  if (lat !== null && (lat < -90 || lat > 90)) return 'Latitude must be between -90 and 90.'
  if (lng !== null && (lng < -180 || lng > 180)) return 'Longitude must be between -180 and 180.'
  if (f.temperature.trim() && num(f.temperature) === null) return 'Temperature must be a number.'
  const rh = num(f.humidity)
  if (f.humidity.trim() && (rh === null || rh < 0 || rh > 100)) return 'RH must be a number between 0 and 100.'
  for (const c of f.custody) {
    if ((c.from.trim() || c.to.trim()) && (!c.from.trim() || !c.to.trim())) return 'Each custody step needs "from" and "to".'
  }
  return null
}

function geolocationErrorText(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) return 'Location permission was denied.'
  if (err.code === err.POSITION_UNAVAILABLE) return 'The position is not available here.'
  if (err.code === err.TIMEOUT) return 'Getting the position took too long.'
  return err.message || 'The position could not be read.'
}

function mapsUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
}

export default function SamplingRecordsPage() {
  const { designation, departmentName, profileName } = useAuth()
  const askReason = useReasonForChange()
  const isDirector = isLaboratoryDirector(designation)
  const canRecord = canRecordSampling(designation, departmentName, isDirector)
  const switchState = useSamplingSwitch()

  const [records, setRecords] = useState<SamplingRecord[]>([])
  const [plans, setPlans] = useState<SamplingPlan[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [samples, setSamples] = useState<SampleOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SamplingRecord | null>(null)
  const [form, setForm] = useState<RecordForm>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [gpsMessage, setGpsMessage] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rRes, pRes, cRes, sRes] = await Promise.all([
        supabase.from('sampling_records').select('*').order('sampled_at', { ascending: false }).limit(500),
        supabase.from('sampling_plans').select('*').order('plan_no').order('version'),
        supabase.from('clients').select('id, company_name').order('company_name'),
        supabase.from('samples').select('id, srf_number, sample_code').order('created_at', { ascending: false }).limit(500),
      ])
      if (rRes.error) throw rRes.error
      setRecords((rRes.data ?? []) as SamplingRecord[])
      setPlans((pRes.data ?? []) as SamplingPlan[])
      setClients((cRes.data ?? []) as ClientOption[])
      setSamples((sRes.data ?? []) as SampleOption[])
    } catch (err) {
      setError(samplingErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (switchState === 'on') void load()
  }, [switchState, load])

  const planById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans])
  const sampleById = useMemo(() => new Map(samples.map((s) => [s.id, s])), [samples])
  const approvedPlans = useMemo(() => plans.filter((p) => p.status === 'approved'), [plans])
  const sampleLabel = (id: string | null) => {
    if (!id) return '—'
    const s = sampleById.get(id)
    return s ? [s.srf_number, s.sample_code].filter(Boolean).join(' · ') || 'Sample' : 'Linked sample'
  }
  const planText = (id: string | null) => {
    if (!id) return '—'
    const p = planById.get(id)
    return p ? `${planLabel(p)} · ${p.title}` : 'Plan'
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return records
    return records.filter((r) =>
      `${r.record_no} ${r.customer_name ?? ''} ${r.location} ${r.sample_identification} ${r.sampler_name ?? ''}`
        .toLowerCase()
        .includes(q),
    )
  }, [records, search])

  const selectedPlan = form.planId ? planById.get(form.planId) ?? null : null

  const openNew = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormError(null)
    setGpsMessage(null)
    setPendingFiles([])
    setFormOpen(true)
  }
  const openEdit = (r: SamplingRecord) => {
    setEditing(r)
    setForm(recordToForm(r))
    setFormError(null)
    setGpsMessage(null)
    setPendingFiles([])
    setFormOpen(true)
  }

  const set = (patch: Partial<RecordForm>) => setForm((f) => ({ ...f, ...patch }))
  const setStep = (i: number, patch: Partial<CustodyDraft>) =>
    setForm((f) => ({ ...f, custody: f.custody.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))
  const addStep = () =>
    setForm((f) => {
      const last = f.custody[f.custody.length - 1]
      return {
        ...f,
        custody: [
          ...f.custody,
          {
            at: toLocalInput(new Date()),
            from: last?.to ?? (profileName || ''),
            to: '',
            condition: '',
            sealIntact: true,
            remarks: '',
          },
        ],
      }
    })

  const captureGps = () => {
    setGpsMessage(null)
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsMessage('This device cannot share its location. Enter latitude and longitude manually.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        set({
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
          accuracy: String(Math.round(pos.coords.accuracy)),
          locationSource: 'gps',
        })
        setGpsMessage(`Position captured (±${Math.round(pos.coords.accuracy)} m).`)
      },
      (err) => {
        setLocating(false)
        setGpsMessage(`${geolocationErrorText(err)} Enter latitude and longitude manually.`)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  const uploadFiles = async (recordId: string, current: SamplingAttachment[], files: File[]) => {
    const added: SamplingAttachment[] = []
    for (const file of files) {
      assertAllowedUpload(file, { extensions: ATTACHMENT_EXTENSIONS })
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${recordId}/${crypto.randomUUID()}_${safe}`
      const { error: upErr } = await supabase.storage
        .from(SAMPLING_BUCKET)
        .upload(path, file, { upsert: false, contentType: uploadContentType(file) })
      if (upErr) throw upErr
      added.push({ path, name: file.name, uploaded_at: new Date().toISOString() })
    }
    if (added.length === 0) return
    const { error: updErr } = await supabase
      .from('sampling_records')
      .update({ attachments: [...current, ...added] })
      .eq('id', recordId)
    if (updErr) {
      await supabase.storage.from(SAMPLING_BUCKET).remove(added.map((a) => a.path))
      throw updErr
    }
  }

  const save = async () => {
    const problem = validate(form)
    if (problem) {
      setFormError(problem)
      return
    }
    let reason: string | null = null
    if (editing) {
      reason = await askReason({
        title: `Reason for changing ${editing.record_no}`,
        recordLabel: `${editing.record_no} · ${editing.sample_identification}`,
        confirmLabel: 'Save changes',
        quickPicks: ['Custody step added', 'Sample received in the lab', 'Entry error corrected', 'Customer communication recorded'],
      })
      if (!reason) return
    }
    setSaving(true)
    setFormError(null)
    try {
      const payload = formToPayload(form)
      let id: string
      let recordNo: string
      let current: SamplingAttachment[] = []
      if (editing) {
        const { error: err } = await supabase.from('sampling_records').update(payload).eq('id', editing.id)
        if (err) throw err
        id = editing.id
        recordNo = editing.record_no
        current = editing.attachments ?? []
        if (reason) await recordReason('sampling_records', id, reason)
      } else {
        const { data, error: err } = await supabase.from('sampling_records').insert(payload).select('id, record_no').single()
        if (err) throw err
        id = String((data as { id: string }).id)
        recordNo = String((data as { record_no: string }).record_no)
      }
      if (pendingFiles.length) {
        try {
          await uploadFiles(id, current, pendingFiles)
        } catch (err) {
          setMessage(`${recordNo} saved, but the attachments could not be uploaded: ${samplingErrorText(err)}`)
          setFormOpen(false)
          await load()
          return
        }
      }
      setFormOpen(false)
      setMessage(`${recordNo} saved.`)
      await load()
    } catch (err) {
      const e = err as { code?: string; message?: string }
      setFormError(
        e?.code === '23505' && (e.message ?? '').includes('sample')
          ? 'This lab sample is already linked to another sampling record.'
          : samplingErrorText(err),
      )
    } finally {
      setSaving(false)
    }
  }

  const openAttachment = async (a: SamplingAttachment) => {
    const { data, error: err } = await supabase.storage.from(SAMPLING_BUCKET).createSignedUrl(a.path, 600)
    if (err || !data?.signedUrl) {
      setMessage(err ? samplingErrorText(err) : 'Could not open the file.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const remove = async (r: SamplingRecord) => {
    const reason = await askReason({
      title: `Reason for deleting ${r.record_no}`,
      recordLabel: `${r.record_no} · ${r.sample_identification}`,
      description: 'The deletion stays in the audit trail.',
      confirmLabel: 'Delete',
      quickPicks: ['Created by mistake', 'Duplicate record'],
    })
    if (!reason) return
    const { error: err } = await supabase.from('sampling_records').delete().eq('id', r.id)
    if (err) {
      setMessage(samplingErrorText(err))
      return
    }
    await recordReason('sampling_records', r.id, reason)
    setMessage(`${r.record_no} deleted.`)
    await load()
  }

  const gpsCell = (r: SamplingRecord) => {
    const text = gpsText(r.latitude, r.longitude)
    if (!text || r.latitude == null || r.longitude == null) return null
    return (
      <a
        href={mapsUrl(r.latitude, r.longitude)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] text-amber-800 underline"
      >
        <MapPin className="h-3 w-3" /> {text}
        {r.location_source === 'manual' ? ' (manual)' : ''}
      </a>
    )
  }

  const rowActions = (r: SamplingRecord) => (
    <div className="flex justify-center gap-1">
      {canRecord ? (
        <Button size="icon" variant="outline" className={limsOutlineBtnClass} onClick={() => openEdit(r)} aria-label={`Edit ${r.record_no}`}>
          <Pencil className="h-4 w-4" />
        </Button>
      ) : null}
      {isDirector ? (
        <Button size="icon" variant="outline" className={limsOutlineBtnClass} onClick={() => void remove(r)} aria-label={`Delete ${r.record_no}`}>
          <Trash2 className="h-4 w-4 text-red-700" />
        </Button>
      ) : null}
    </div>
  )

  const attachmentsList = (r: SamplingRecord) =>
    (r.attachments ?? []).length ? (
      <div className="mt-1 flex flex-wrap gap-1">
        {(r.attachments ?? []).map((a) => (
          <button
            key={a.path}
            type="button"
            onClick={() => void openAttachment(a)}
            className="inline-flex max-w-[12rem] items-center gap-1 truncate border border-stone-400 bg-stone-50 px-1.5 py-0.5 text-[11px] text-stone-800 hover:bg-white"
          >
            <Paperclip className="h-3 w-3 shrink-0" /> <span className="truncate">{a.name}</span>
          </button>
        ))}
      </div>
    ) : null

  const textareaClass = 'rounded-none border-stone-500 bg-stone-50 text-base sm:text-sm'

  return (
    <div className={limsPageShellClass}>
      <EnvHeader
        title="Sampling Records"
        clause="7.3.3 · 7.8.5"
        subtitle="Who sampled what, where and when, under which plan; custody until the sample reaches the lab."
        actions={
          switchState === 'on' ? (
            <>
              <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              {canRecord ? (
                <Button className={limsPrimaryBtnClass} onClick={openNew}>
                  <Plus className="h-4 w-4" /> Record sampling
                </Button>
              ) : null}
            </>
          ) : null
        }
      />

      <SamplingGate state={switchState}>
        <MessageLine tone="error" text={error} />
        <MessageLine text={message} />
        <EnvPanel
          title={`Records (${visible.length})`}
          right={
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search records"
              className={cn(limsDarkBarSearchClass, 'h-8 w-40 sm:w-56')}
            />
          }
        >
          {!canRecord ? (
            <p className="mb-2 text-[12px] text-stone-600">
              Sampling is recorded by samplers, a Technical Manager, the Quality Manager or the Laboratory Director.
            </p>
          ) : null}

          {/* Phone: cards */}
          <div className="space-y-2 md:hidden">
            {visible.map((r) => (
              <div key={r.id} className="border border-stone-400 bg-white p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[12px] font-semibold text-amber-800">{r.record_no}</p>
                    <p className="font-semibold text-stone-900">{r.sample_identification}</p>
                    <p className="text-[12px] text-stone-600">{formatDateTime(r.sampled_at)} · {r.sampler_name || '—'}</p>
                  </div>
                  {rowActions(r)}
                </div>
                <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-[12.5px]">
                  <dt className="text-stone-500">Customer</dt>
                  <dd>{r.customer_name || '—'}</dd>
                  <dt className="text-stone-500">Location</dt>
                  <dd className="break-words">
                    {r.location}
                    <div>{gpsCell(r)}</div>
                  </dd>
                  <dt className="text-stone-500">Plan</dt>
                  <dd className="break-words">{planText(r.plan_id)}</dd>
                  <dt className="text-stone-500">Lab sample</dt>
                  <dd>{sampleLabel(r.sample_id)}</dd>
                  <dt className="text-stone-500">Deviations</dt>
                  <dd>{samplingDeviationText({ deviations: r.deviations ?? '', customerInformed: r.customer_informed, customerAgreed: r.customer_agreed })}</dd>
                  <dt className="text-stone-500">Custody</dt>
                  <dd>{(r.chain_of_custody ?? []).length} step(s)</dd>
                </dl>
                {attachmentsList(r)}
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1100px] border-collapse font-jakarta">
              <thead>
                <tr>
                  <th className={envThClass}>Record</th>
                  <th className={envThClass}>Sampled</th>
                  <th className={envThClass}>Sample</th>
                  <th className={envThClass}>Customer</th>
                  <th className={envThClass}>Location</th>
                  <th className={envThClass}>Plan</th>
                  <th className={envThClass}>Conditions</th>
                  <th className={envThClass}>Custody</th>
                  <th className={envThClass}>Deviations</th>
                  <th className={cn(envThClass, 'w-24')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => (
                  <tr key={r.id} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                    <td className={cn(envTdClass, 'whitespace-nowrap font-mono font-semibold text-amber-800')}>
                      {r.record_no}
                      <p className="font-sans text-[11px] font-normal text-stone-600">{sampleLabel(r.sample_id)}</p>
                    </td>
                    <td className={envTdClass}>
                      <p className="whitespace-nowrap">{formatDateTime(r.sampled_at)}</p>
                      <p className="text-[11px] text-stone-600">{r.sampler_name || '—'}</p>
                    </td>
                    <td className={envTdClass}>
                      <p className="font-semibold">{r.sample_identification}</p>
                      <p className="text-[11px] text-stone-600">
                        {[r.quantity, r.containers, r.preservation].filter(Boolean).join(' · ') || '—'}
                      </p>
                      {attachmentsList(r)}
                    </td>
                    <td className={envTdClass}>{r.customer_name || '—'}</td>
                    <td className={envTdClass}>
                      <p>{r.location}</p>
                      {gpsCell(r)}
                    </td>
                    <td className={envTdClass}>{planText(r.plan_id)}</td>
                    <td className={envTdClass}>{samplingConditionsText(r) || '—'}</td>
                    <td className={envTdClass}>
                      {(r.chain_of_custody ?? []).length === 0
                        ? '—'
                        : (r.chain_of_custody ?? []).map((c, j) => (
                            <p key={j} className="text-[11.5px]">
                              {c.from} <ArrowRight className="inline h-3 w-3" /> {c.to}
                              <span className="text-stone-500"> · {formatDateTime(c.at)}</span>
                              {c.seal_intact === false ? <span className="font-semibold text-red-700"> · seal broken</span> : null}
                            </p>
                          ))}
                    </td>
                    <td className={envTdClass}>
                      {samplingDeviationText({ deviations: r.deviations ?? '', customerInformed: r.customer_informed, customerAgreed: r.customer_agreed })}
                    </td>
                    <td className={cn(envTdClass, 'text-center')}>{rowActions(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && visible.length === 0 ? (
            <p className="p-4 text-center text-[13px] text-stone-600">No sampling records yet.</p>
          ) : null}
        </EnvPanel>
      </SamplingGate>

      <Dialog open={formOpen} onOpenChange={(o) => (!o && !saving ? setFormOpen(false) : undefined)}>
        <DialogContent className={cn(limsDialogClass, 'flex max-h-[100dvh] w-[calc(100vw-0.5rem)] max-w-3xl flex-col sm:max-h-[95dvh]')}>
          <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <DialogHeader className="pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white">
                {editing ? `Edit ${editing.record_no}` : 'Record sampling'}
              </DialogTitle>
              <DialogDescription className="text-[12px] text-stone-300">
                The record number and the sampler's name are set by the system.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
            {/* Plan and customer */}
            <fieldset className="border border-stone-400 bg-white p-2.5">
              <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-stone-700">Plan and customer</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Sampling plan (approved)" htmlFor="sr-plan" className="sm:col-span-2">
                  <EnvSelect id="sr-plan" value={form.planId} onChange={(v) => set({ planId: v })}>
                    <option value="">— No plan (customer-specified sampling) —</option>
                    {approvedPlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {planLabel(p)} · {p.title}
                      </option>
                    ))}
                    {selectedPlan && selectedPlan.status !== 'approved' ? (
                      <option value={selectedPlan.id}>
                        {planLabel(selectedPlan)} · {selectedPlan.title} ({selectedPlan.status})
                      </option>
                    ) : null}
                  </EnvSelect>
                  {selectedPlan ? (
                    <p className="mt-1 text-[12px] text-stone-600">
                      {[selectedPlan.method_reference, statisticalBasisText(selectedPlan), selectedPlan.frequency]
                        .filter(Boolean)
                        .join(' · ')}
                      {selectedPlan.factors_to_control ? (
                        <>
                          <br />
                          <span className="font-semibold">Control:</span> {selectedPlan.factors_to_control}
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </Field>
                <Field label="Customer" htmlFor="sr-client">
                  <EnvSelect
                    id="sr-client"
                    value={form.clientId}
                    onChange={(v) => set({ clientId: v, customerName: v ? '' : form.customerName })}
                  >
                    <option value="">— Not in the client list —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name}
                      </option>
                    ))}
                  </EnvSelect>
                </Field>
                {!form.clientId ? (
                  <Field label="Customer name" htmlFor="sr-cname">
                    <Input id="sr-cname" className={envInputClass} value={form.customerName}
                      onChange={(e) => set({ customerName: e.target.value })} />
                  </Field>
                ) : null}
              </div>
            </fieldset>

            {/* When and where */}
            <fieldset className="border border-stone-400 bg-white p-2.5">
              <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-stone-700">When and where</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Date and time of sampling *" htmlFor="sr-at">
                  <Input id="sr-at" type="datetime-local" className={envInputClass} value={form.sampledAt}
                    onChange={(e) => set({ sampledAt: e.target.value })} />
                </Field>
                <Field label="Location *" htmlFor="sr-loc">
                  <Input id="sr-loc" className={envInputClass} value={form.location} placeholder="Site / point sampled"
                    list="sr-plan-locations" onChange={(e) => set({ location: e.target.value })} />
                  <datalist id="sr-plan-locations">
                    {(selectedPlan?.locations ?? []).map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'h-10')} onClick={captureGps} disabled={locating}>
                  {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />} Use my location (GPS)
                </Button>
                <Field label="Latitude" htmlFor="sr-lat" className="w-32">
                  <Input id="sr-lat" inputMode="decimal" className={envInputClass} value={form.latitude} placeholder="21.251400"
                    onChange={(e) => set({ latitude: e.target.value, locationSource: 'manual' })} />
                </Field>
                <Field label="Longitude" htmlFor="sr-lng" className="w-32">
                  <Input id="sr-lng" inputMode="decimal" className={envInputClass} value={form.longitude} placeholder="81.629600"
                    onChange={(e) => set({ longitude: e.target.value, locationSource: 'manual' })} />
                </Field>
                {form.latitude || form.longitude ? (
                  <Button type="button" size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-10 w-10')}
                    aria-label="Clear position" onClick={() => set({ latitude: '', longitude: '', accuracy: '', locationSource: '' })}>
                    <X className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
              {gpsMessage ? <p className="mt-1 text-[12px] text-stone-700">{gpsMessage}</p> : null}
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Conditions during sampling" htmlFor="sr-env" className="col-span-2">
                  <Input id="sr-env" className={envInputClass} value={form.environmentalConditions} placeholder="Sunny, light wind"
                    onChange={(e) => set({ environmentalConditions: e.target.value })} />
                </Field>
                <Field label="Temp °C" htmlFor="sr-temp">
                  <Input id="sr-temp" inputMode="decimal" className={envInputClass} value={form.temperature}
                    onChange={(e) => set({ temperature: e.target.value })} />
                </Field>
                <Field label="RH %" htmlFor="sr-rh">
                  <Input id="sr-rh" inputMode="decimal" className={envInputClass} value={form.humidity}
                    onChange={(e) => set({ humidity: e.target.value })} />
                </Field>
              </div>
            </fieldset>

            {/* Sample */}
            <fieldset className="border border-stone-400 bg-white p-2.5">
              <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-stone-700">Sample</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Sample identification (marks / labels) *" htmlFor="sr-id">
                  <Input id="sr-id" className={envInputClass} value={form.sampleIdentification} placeholder="Cubes C1–C6, tag 4471"
                    onChange={(e) => set({ sampleIdentification: e.target.value })} />
                </Field>
                <Field label="Description" htmlFor="sr-desc">
                  <Input id="sr-desc" className={envInputClass} value={form.sampleDescription}
                    onChange={(e) => set({ sampleDescription: e.target.value })} />
                </Field>
                <Field label="Quantity" htmlFor="sr-qty">
                  <Input id="sr-qty" className={envInputClass} value={form.quantity} placeholder="6 cubes / 2 L"
                    onChange={(e) => set({ quantity: e.target.value })} />
                </Field>
                <Field label="Containers" htmlFor="sr-cont">
                  <Input id="sr-cont" className={envInputClass} value={form.containers} placeholder="Steel moulds / amber glass"
                    onChange={(e) => set({ containers: e.target.value })} />
                </Field>
                <Field label="Preservation" htmlFor="sr-pres">
                  <Input id="sr-pres" className={envInputClass} value={form.preservation} placeholder="Ice box 4 °C"
                    onChange={(e) => set({ preservation: e.target.value })} />
                </Field>
                <Field label="Lab sample (once received)" htmlFor="sr-sample">
                  <EnvSelect id="sr-sample" value={form.sampleId} onChange={(v) => set({ sampleId: v })}>
                    <option value="">— Not received yet —</option>
                    {form.sampleId && !sampleById.has(form.sampleId) ? <option value={form.sampleId}>Linked sample</option> : null}
                    {samples.map((s) => (
                      <option key={s.id} value={s.id}>
                        {[s.srf_number, s.sample_code].filter(Boolean).join(' · ') || s.id}
                      </option>
                    ))}
                  </EnvSelect>
                </Field>
              </div>
            </fieldset>

            {/* Chain of custody */}
            <fieldset className="border border-stone-400 bg-white p-2.5">
              <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-stone-700">Chain of custody</legend>
              {form.custody.length === 0 ? (
                <p className="text-[12px] text-stone-600">No handovers yet. Add a step each time the sample changes hands.</p>
              ) : null}
              <ol className="space-y-2">
                {form.custody.map((c, i) => (
                  <li key={i} className="border border-stone-300 bg-stone-50 p-2">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-stone-600">Step {i + 1}</span>
                      <Button type="button" size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-8 w-8')}
                        aria-label={`Remove step ${i + 1}`}
                        onClick={() => setForm((f) => ({ ...f, custody: f.custody.filter((_, j) => j !== i) }))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <Field label="When">
                        <Input type="datetime-local" className={envInputClass} value={c.at} onChange={(e) => setStep(i, { at: e.target.value })} />
                      </Field>
                      <Field label="From">
                        <Input className={envInputClass} value={c.from} onChange={(e) => setStep(i, { from: e.target.value })} />
                      </Field>
                      <Field label="To">
                        <Input className={envInputClass} value={c.to} placeholder="Courier / Sample Cell" onChange={(e) => setStep(i, { to: e.target.value })} />
                      </Field>
                      <Field label="Condition" className="sm:col-span-2">
                        <Input className={envInputClass} value={c.condition} placeholder="Sealed, 4 °C" onChange={(e) => setStep(i, { condition: e.target.value })} />
                      </Field>
                      <label className="flex min-h-10 items-center gap-2 text-sm">
                        <input type="checkbox" className="h-5 w-5" checked={c.sealIntact} onChange={(e) => setStep(i, { sealIntact: e.target.checked })} />
                        Seal intact
                      </label>
                      <Field label="Remarks" className="sm:col-span-3">
                        <Input className={envInputClass} value={c.remarks} onChange={(e) => setStep(i, { remarks: e.target.value })} />
                      </Field>
                    </div>
                  </li>
                ))}
              </ol>
              <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'mt-2 h-10')} onClick={addStep}>
                <Plus className="h-4 w-4" /> Add handover
              </Button>
            </fieldset>

            {/* Deviations */}
            <fieldset className="border border-stone-400 bg-white p-2.5">
              <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-stone-700">Deviations from the plan</legend>
              <Textarea rows={2} className={textareaClass} value={form.deviations} placeholder="Leave empty when sampling followed the plan"
                onChange={(e) => set({ deviations: e.target.value })} />
              <div className="mt-2 flex flex-wrap gap-4">
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <input type="checkbox" className="h-5 w-5" checked={form.customerInformed || form.customerAgreed}
                    disabled={form.customerAgreed}
                    onChange={(e) => set({ customerInformed: e.target.checked })} />
                  Customer informed
                </label>
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <input type="checkbox" className="h-5 w-5" checked={form.customerAgreed}
                    onChange={(e) => set({ customerAgreed: e.target.checked, customerInformed: e.target.checked || form.customerInformed })} />
                  Customer agreed
                </label>
              </div>
            </fieldset>

            {/* Photos / attachments */}
            <fieldset className="border border-stone-400 bg-white p-2.5">
              <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-stone-700">Photos and attachments</legend>
              {editing && (editing.attachments ?? []).length ? (
                <ul className="mb-2 space-y-1">
                  {(editing.attachments ?? []).map((a) => (
                    <li key={a.path}>
                      <button type="button" className="inline-flex items-center gap-1 text-[12.5px] text-amber-800 underline"
                        onClick={() => void openAttachment(a)}>
                        <ExternalLink className="h-3.5 w-3.5" /> {a.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {pendingFiles.length ? (
                <ul className="mb-2 space-y-1 text-[12.5px]">
                  {pendingFiles.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5" /> {f.name}
                      <button type="button" className="text-red-700" aria-label={`Remove ${f.name}`}
                        onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  if (fileRef.current) fileRef.current.value = ''
                  try {
                    files.forEach((f) => assertAllowedUpload(f, { extensions: ATTACHMENT_EXTENSIONS }))
                    setPendingFiles((p) => [...p, ...files])
                  } catch (err) {
                    setFormError(samplingErrorText(err))
                  }
                }}
              />
              <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'h-10')} onClick={() => fileRef.current?.click()}>
                <Camera className="h-4 w-4" /> Add photo / file
              </Button>
              <p className="mt-1 text-[11px] text-stone-500">JPG, PNG, WebP or PDF, up to 25 MB each. Uploaded when you save.</p>
            </fieldset>

            <Field label="Remarks" htmlFor="sr-remarks">
              <Input id="sr-remarks" className={envInputClass} value={form.remarks} onChange={(e) => set({ remarks: e.target.value })} />
            </Field>
            <MessageLine tone="error" text={formError} />
            <div className="sticky bottom-0 -mx-3 flex flex-wrap justify-end gap-2 border-t border-stone-300 bg-[#f7f3eb] px-3 py-2 sm:-mx-4 sm:px-4">
              <Button variant="outline" className={cn(limsOutlineBtnClass, 'h-10')} onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button className={cn(limsPrimaryBtnClass, 'h-10')} onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
