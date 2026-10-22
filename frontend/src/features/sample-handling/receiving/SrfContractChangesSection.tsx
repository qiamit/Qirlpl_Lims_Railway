import { useCallback, useEffect, useState } from 'react'
import { FileDiff, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { limsFieldClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { errorText, isMissingTableError } from '@/lib/missingSchema'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDate, formatDateTime } from '@/lib/utils'

type ChangeType = 'amendment' | 'deviation'
type Method = 'email' | 'phone' | 'letter' | 'in_person' | 'portal' | 'other'

const METHODS: Array<{ value: Method; label: string }> = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'letter', label: 'Letter' },
  { value: 'in_person', label: 'In person' },
  { value: 'portal', label: 'Portal' },
  { value: 'other', label: 'Other' },
]

type ChangeRow = {
  id: string
  change_type: ChangeType
  changed_at: string
  change: string
  reason: string | null
  customer_informed: boolean
  informed_on: string | null
  method_of_communication: Method | null
  customer_contact: string | null
  agreed_by_customer: boolean | null
  customer_response: string | null
  recorded_by_name: string | null
}

type Draft = {
  changeType: ChangeType
  change: string
  reason: string
  customerInformed: boolean
  informedOn: string
  method: Method | ''
  customerContact: string
  agreed: '' | 'yes' | 'no'
  response: string
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const emptyDraft = (): Draft => ({
  changeType: 'amendment',
  change: '',
  reason: '',
  customerInformed: false,
  informedOn: '',
  method: '',
  customerContact: '',
  agreed: '',
  response: '',
})

function agreedLabel(v: boolean | null) {
  if (v === true) return <span className="font-semibold text-emerald-700">Agreed</span>
  if (v === false) return <span className="font-semibold text-red-700">Not agreed</span>
  return <span className="text-amber-800">Awaiting customer</span>
}

/**
 * Contract amendments after work starts and deviations communicated to the
 * customer (ISO/IEC 17025 7.1.4 - 7.1.6, gap P3-9). Table
 * srf_contract_changes (20261031100000); the section is hidden until it
 * exists. The recorded change cannot be rewritten afterwards; only the
 * customer communication can be updated.
 */
export function SrfContractChangesSection({ sampleId, workStarted }: { sampleId: string; workStarted: boolean }) {
  const [available, setAvailable] = useState(false)
  const [rows, setRows] = useState<ChangeRow[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRows = useCallback(
    () =>
      supabase
        .from('srf_contract_changes')
        .select('*')
        .eq('sample_id', sampleId)
        .order('changed_at', { ascending: false }),
    [sampleId],
  )

  const apply = useCallback((res: Awaited<ReturnType<typeof fetchRows>>) => {
    const { data, error: err } = res
    if (err) {
      setAvailable(false)
      if (!isMissingTableError(err)) setError(errorText(err))
      return
    }
    setAvailable(true)
    setRows((data ?? []) as ChangeRow[])
  }, [])

  const load = useCallback(async () => apply(await fetchRows()), [apply, fetchRows])

  useEffect(() => {
    let cancelled = false
    void fetchRows().then((res) => {
      if (!cancelled) apply(res)
    })
    return () => {
      cancelled = true
    }
  }, [apply, fetchRows])

  if (!available) {
    return error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  const startCommUpdate = (r: ChangeRow) => {
    setEditingId(r.id)
    setDraft({
      changeType: r.change_type,
      change: r.change,
      reason: r.reason ?? '',
      customerInformed: r.customer_informed,
      informedOn: r.informed_on ?? (r.customer_informed ? '' : today()),
      method: r.method_of_communication ?? '',
      customerContact: r.customer_contact ?? '',
      agreed: r.agreed_by_customer === true ? 'yes' : r.agreed_by_customer === false ? 'no' : '',
      response: r.customer_response ?? '',
    })
    setError(null)
  }

  const save = async () => {
    if (!draft) return
    if (!editingId && !draft.change.trim()) {
      setError('Describe the change or deviation.')
      return
    }
    if (draft.customerInformed && !draft.informedOn) {
      setError('Enter the date the customer was informed.')
      return
    }
    setSaving(true)
    setError(null)
    const comm = {
      customer_informed: draft.customerInformed,
      informed_on: draft.customerInformed ? draft.informedOn : null,
      method_of_communication: draft.method || null,
      customer_contact: draft.customerContact.trim() || null,
      agreed_by_customer: draft.agreed === 'yes' ? true : draft.agreed === 'no' ? false : null,
      customer_response: draft.response.trim() || null,
    }
    const res = editingId
      ? await supabase.from('srf_contract_changes').update(comm).eq('id', editingId).select('id')
      : await supabase
          .from('srf_contract_changes')
          .insert({
            sample_id: sampleId,
            change_type: draft.changeType,
            change: draft.change.trim(),
            reason: draft.reason.trim() || null,
            ...comm,
          })
          .select('id')
    setSaving(false)
    if (res.error) {
      setError(errorText(res.error))
      return
    }
    setDraft(null)
    setEditingId(null)
    await load()
  }

  return (
    <section className="mt-5 border border-stone-400 bg-white p-3" aria-label="Contract amendments and deviations">
      <div className="flex flex-wrap items-center gap-2">
        <FileDiff size={16} className="text-amber-700" />
        <h3 className="text-sm font-semibold text-stone-900">Contract amendments &amp; deviations</h3>
        <span className="text-xs text-stone-500">ISO/IEC 17025 7.1.4 – 7.1.6</span>
        {!draft ? (
          <Button type="button" className={cn(limsPrimaryBtnClass, 'ml-auto h-7 gap-1 px-3 text-xs')}
            onClick={() => { setEditingId(null); setDraft(emptyDraft()); setError(null) }}>
            <Plus size={13} /> Record change
          </Button>
        ) : null}
      </div>
      {workStarted ? (
        <p className="mt-1 text-xs text-amber-800">
          Work on this sample has started: record any change to the request / contract here and inform the customer.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {draft ? (
        <div className="mt-3 grid gap-2 border border-stone-300 bg-stone-50 p-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="scc-type">Type</Label>
            <select id="scc-type" className={cn(limsFieldClass, 'w-full px-2 text-sm')} value={draft.changeType}
              disabled={Boolean(editingId)} onChange={(e) => set({ changeType: e.target.value as ChangeType })}>
              <option value="amendment">Amendment to the request / contract</option>
              <option value="deviation">Deviation from the contract / method</option>
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="scc-reason">Reason / requested by</Label>
            <Input id="scc-reason" className={limsFieldClass} value={draft.reason} disabled={Boolean(editingId)}
              onChange={(e) => set({ reason: e.target.value })} />
          </div>
          <div className="space-y-1 sm:col-span-3">
            <Label htmlFor="scc-change">What changed</Label>
            <Textarea id="scc-change" rows={2} value={draft.change} disabled={Boolean(editingId)}
              onChange={(e) => set({ change: e.target.value })} />
            {editingId ? (
              <p className="text-[11px] text-stone-500">The recorded change cannot be edited; add a new entry to correct it.</p>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <input type="checkbox" checked={draft.customerInformed}
              onChange={(e) => set({ customerInformed: e.target.checked, informedOn: e.target.checked ? draft.informedOn || today() : '' })} />
            Customer informed
          </label>
          {draft.customerInformed ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="scc-on">Informed on</Label>
                <Input id="scc-on" type="date" className={limsFieldClass} value={draft.informedOn}
                  onChange={(e) => set({ informedOn: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="scc-method">How</Label>
                <select id="scc-method" className={cn(limsFieldClass, 'w-full px-2 text-sm')} value={draft.method}
                  onChange={(e) => set({ method: e.target.value as Method | '' })}>
                  <option value="">—</option>
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="scc-contact">Customer contact</Label>
                <Input id="scc-contact" className={limsFieldClass} value={draft.customerContact}
                  onChange={(e) => set({ customerContact: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="scc-agreed">Customer response</Label>
                <select id="scc-agreed" className={cn(limsFieldClass, 'w-full px-2 text-sm')} value={draft.agreed}
                  onChange={(e) => set({ agreed: e.target.value as Draft['agreed'] })}>
                  <option value="">Awaiting</option>
                  <option value="yes">Agreed</option>
                  <option value="no">Not agreed</option>
                </select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="scc-resp">Customer's reply / reference</Label>
                <Input id="scc-resp" className={limsFieldClass} value={draft.response}
                  onChange={(e) => set({ response: e.target.value })} />
              </div>
            </>
          ) : null}
          <div className="flex justify-end gap-2 sm:col-span-3">
            <Button type="button" variant="outline" className={limsOutlineBtnClass} disabled={saving}
              onClick={() => { setDraft(null); setEditingId(null) }}>
              Cancel
            </Button>
            <Button type="button" className={limsPrimaryBtnClass} disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : editingId ? 'Update communication' : 'Save'}
            </Button>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-stone-500">No amendments or deviations recorded.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-stone-800 text-[10px] uppercase tracking-wide text-amber-200">
                <th className="px-2 py-1 text-left">When</th>
                <th className="px-2 py-1 text-left">Type</th>
                <th className="px-2 py-1 text-left">Change</th>
                <th className="px-2 py-1 text-left">Customer</th>
                <th className="px-2 py-1 text-left">Recorded by</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-stone-200 align-top">
                  <td className="whitespace-nowrap px-2 py-1">{formatDateTime(r.changed_at)}</td>
                  <td className="px-2 py-1">{r.change_type === 'deviation' ? 'Deviation' : 'Amendment'}</td>
                  <td className="px-2 py-1">
                    <div className="whitespace-pre-wrap">{r.change}</div>
                    {r.reason ? <div className="text-stone-500">Reason: {r.reason}</div> : null}
                  </td>
                  <td className="px-2 py-1">
                    {r.customer_informed ? (
                      <>
                        <div>
                          Informed {formatDate(r.informed_on)}
                          {r.method_of_communication
                            ? ` by ${METHODS.find((m) => m.value === r.method_of_communication)?.label.toLowerCase() ?? r.method_of_communication}`
                            : ''}
                        </div>
                        <div>{agreedLabel(r.agreed_by_customer)}</div>
                      </>
                    ) : (
                      <span className="font-semibold text-red-700">Not informed yet</span>
                    )}
                  </td>
                  <td className="px-2 py-1">{r.recorded_by_name ?? '—'}</td>
                  <td className="px-2 py-1 text-right">
                    <button type="button" className="text-amber-800 hover:underline" onClick={() => startCommUpdate(r)}>
                      Update
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
