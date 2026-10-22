import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, Download, FileUp, Loader2, PenLine, RefreshCw, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { csvCell } from '@/lib/csv'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  limsDarkBarBtnClass,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDateTime } from '@/lib/utils'
import { CsvImportDialog } from './CsvImportDialog'
import { EnvironmentChart } from './EnvironmentChart'
import {
  EnvHeader,
  EnvPanel,
  EnvSelect,
  Field,
  LimitBadge,
  MessageLine,
  MissingMigrationNotice,
  envInputClass,
  envTdClass,
  envThClass,
} from './EnvironmentUi'
import { RaiseNcDialog } from './RaiseNcDialog'
import {
  areaLimitsText,
  dailyMinMax,
  dayBoundIso,
  dueSlots,
  ENV_SOURCE_LABEL,
  envErrorText,
  evaluateReading,
  fmtNum,
  isEnvMissingError,
  localDateKey,
  localInputToIso,
  NC_RECORDS_PATH,
  num,
  otherLimitEntries,
  toLocalInput,
  type EnvironmentReading,
  type EnvironmentSource,
  type LabArea,
} from './shared'

const LIST_LIMIT = 2000
const READING_SELECT = '*, nc:nc_work_records(nc_id, status)'
const AREA_PREF_KEY = 'qirlpl.env.entryArea'

type EquipmentOption = { id: string; asset_code: string | null; equipment_name: string | null }

function readPref(): string {
  try {
    return localStorage.getItem(AREA_PREF_KEY) ?? ''
  } catch {
    return ''
  }
}

function writePref(v: string) {
  try {
    localStorage.setItem(AREA_PREF_KEY, v)
  } catch {
    // ignore (private mode)
  }
}

function daysAgoKey(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localDateKey(d)
}

/** Readings may arrive with the nc embed as an array (older PostgREST) or object. */
function normalise(rows: unknown[]): EnvironmentReading[] {
  return rows.map((r) => {
    const row = r as EnvironmentReading & { nc?: unknown }
    const nc = Array.isArray(row.nc) ? row.nc[0] ?? null : row.nc ?? null
    return { ...row, nc: nc as EnvironmentReading['nc'] }
  })
}

function otherText(r: EnvironmentReading, area: LabArea | undefined): string {
  const other = r.other ?? {}
  const keys = Object.keys(other)
  if (!keys.length) return ''
  const lim = area?.other_limits ?? r.limit_snapshot?.other_limits ?? {}
  return keys
    .map((k) => `${lim[k]?.label || k}: ${String(other[k])}${lim[k]?.unit ? ` ${lim[k]?.unit}` : ''}`)
    .join(', ')
}

// ---------------------------------------------------------------------------
// Quick entry card (one per area)
// ---------------------------------------------------------------------------

function EntryCard({
  area,
  todayCount,
  lastReading,
  onSaved,
  onRaiseNc,
}: {
  area: LabArea
  todayCount: number
  lastReading: EnvironmentReading | undefined
  onSaved: () => void
  onRaiseNc: (r: EnvironmentReading) => void
}) {
  const [temp, setTemp] = useState('')
  const [rh, setRh] = useState('')
  const [other, setOther] = useState<Record<string, string>>({})
  const [remarks, setRemarks] = useState('')
  const [when, setWhen] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<EnvironmentReading | null>(null)

  const others = otherLimitEntries(area.other_limits)
  const otherValues = useMemo(() => {
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(other)) {
      const n = num(v)
      if (n !== null) out[k] = n
    }
    return out
  }, [other])
  const t = num(temp)
  const h = num(rh)
  const preview = evaluateReading(area, t, h, otherValues)
  const slots = dueSlots(area.readings_per_day)
  const hasValue = t !== null || h !== null || Object.keys(otherValues).length > 0
  const bad = (v: number | null, lo: number | null, hi: number | null) =>
    v !== null && ((lo !== null && v < lo) || (hi !== null && v > hi))

  const save = async () => {
    setError(null)
    if (!hasValue) {
      setError('Enter at least one value.')
      return
    }
    if ((temp.trim() && t === null) || (rh.trim() && h === null)) {
      setError('Values must be numbers.')
      return
    }
    if (h !== null && (h < 0 || h > 100)) {
      setError('RH must be between 0 and 100 %.')
      return
    }
    const recordedAt = when ? localInputToIso(when) : new Date().toISOString()
    if (!recordedAt) {
      setError('Check the date and time.')
      return
    }
    setBusy(true)
    try {
      const { data, error: err } = await supabase
        .from('environment_readings')
        .insert({
          area_id: area.id,
          recorded_at: recordedAt,
          temperature: t,
          humidity: h,
          other: otherValues,
          source: 'manual',
          remarks: remarks.trim() || null,
        })
        .select(READING_SELECT)
        .single()
      if (err) throw err
      const row = normalise([data])[0]
      setSaved(row)
      setTemp('')
      setRh('')
      setOther({})
      setRemarks('')
      setWhen('')
      onSaved()
    } catch (err) {
      setError(envErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col border-2 border-stone-400 bg-white">
      <div className="flex items-start justify-between gap-2 border-b border-stone-300 bg-stone-100 px-2.5 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-stone-900">
            <span className="font-mono text-amber-800">{area.code}</span> · {area.name}
          </p>
          <p className="text-[11.5px] text-stone-600">{areaLimitsText(area)}</p>
        </div>
        <span
          className={cn(
            'shrink-0 border px-1.5 py-0.5 text-[11px] font-bold',
            slots.length && todayCount >= slots.length
              ? 'border-emerald-600/50 bg-emerald-100 text-emerald-800'
              : 'border-amber-600/50 bg-amber-100 text-amber-900',
          )}
        >
          {todayCount}/{slots.length || '—'} today
        </span>
      </div>
      <div className="space-y-2 p-2.5">
        {slots.length ? (
          <div className="flex flex-wrap gap-1" aria-label="Readings due today">
            {slots.map((s, i) => (
              <span
                key={s}
                className={cn(
                  'inline-flex items-center gap-0.5 border px-1.5 py-0.5 text-[11px]',
                  i < todayCount ? 'border-emerald-600/40 bg-emerald-50 text-emerald-800' : 'border-stone-300 bg-stone-50 text-stone-600',
                )}
              >
                {i < todayCount ? <Check className="h-3 w-3" /> : null}
                {s}
              </span>
            ))}
          </div>
        ) : null}
        {lastReading ? (
          <p className="text-[11.5px] text-stone-600">
            Last: {formatDateTime(lastReading.recorded_at)} · {fmtNum(lastReading.temperature)} °C · {fmtNum(lastReading.humidity)} %{' '}
            <LimitBadge value={lastReading.within_limits} compact />
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Temp °C" htmlFor={`t-${area.id}`}>
            <Input
              id={`t-${area.id}`}
              inputMode="decimal"
              enterKeyHint="next"
              autoComplete="off"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              className={cn(envInputClass, 'h-12 text-lg font-semibold sm:h-10 sm:text-base', bad(t, area.temp_min, area.temp_max) && 'border-red-600 bg-red-50 text-red-800')}
            />
          </Field>
          <Field label="RH %" htmlFor={`h-${area.id}`}>
            <Input
              id={`h-${area.id}`}
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              value={rh}
              onChange={(e) => setRh(e.target.value)}
              className={cn(envInputClass, 'h-12 text-lg font-semibold sm:h-10 sm:text-base', bad(h, area.rh_min, area.rh_max) && 'border-red-600 bg-red-50 text-red-800')}
            />
          </Field>
          {others.map(([k, lim]) => (
            <Field key={k} label={`${lim.label || k}${lim.unit ? ` (${lim.unit})` : ''}`} htmlFor={`o-${area.id}-${k}`}>
              <Input
                id={`o-${area.id}-${k}`}
                inputMode="decimal"
                autoComplete="off"
                value={other[k] ?? ''}
                onChange={(e) => setOther((o) => ({ ...o, [k]: e.target.value }))}
                className={cn(envInputClass, 'h-12 text-lg sm:h-10 sm:text-base', bad(num(other[k]), num(lim.min), num(lim.max)) && 'border-red-600 bg-red-50 text-red-800')}
              />
            </Field>
          ))}
        </div>
        <details className="text-[12.5px]">
          <summary className="cursor-pointer select-none py-1 text-stone-600">Time / remarks</summary>
          <div className="mt-1 grid grid-cols-1 gap-2">
            <Field label="Reading taken at (blank = now)" htmlFor={`w-${area.id}`}>
              <Input
                id={`w-${area.id}`}
                type="datetime-local"
                value={when}
                max={toLocalInput(new Date())}
                onChange={(e) => setWhen(e.target.value)}
                className={envInputClass}
              />
            </Field>
            <Field label="Remarks" htmlFor={`r-${area.id}`}>
              <Input id={`r-${area.id}`} value={remarks} onChange={(e) => setRemarks(e.target.value)} className={envInputClass} />
            </Field>
          </div>
        </details>
        <div className="flex items-center justify-between gap-2">
          {hasValue ? <LimitBadge value={preview} /> : <span />}
          <Button className={cn(limsPrimaryBtnClass, 'h-11 px-5 sm:h-8')} onClick={() => void save()} disabled={busy || !hasValue}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
        </div>
        <MessageLine tone="error" text={error} />
        {saved ? (
          saved.within_limits === false ? (
            <div className="space-y-1.5 border-2 border-red-600 bg-red-50 p-2 text-[12.5px] text-red-900">
              <p className="flex items-center gap-1 font-semibold">
                <AlertTriangle className="h-4 w-4" /> Saved — out of limits. Inform the Technical Manager.
              </p>
              <Button className="h-10 rounded-none bg-red-700 text-white hover:bg-red-800 sm:h-8" onClick={() => onRaiseNc(saved)}>
                Raise NC
              </Button>
            </div>
          ) : (
            <MessageLine tone="ok" text={`Saved at ${formatDateTime(saved.recorded_at)}.`} />
          )
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Correction: a new reading with remarks (readings are append-only)
// ---------------------------------------------------------------------------

function CorrectionDialog({
  reading,
  area,
  onClose,
  onSaved,
}: {
  reading: EnvironmentReading | null
  area: LabArea | undefined
  onClose: () => void
  onSaved: () => void
}) {
  const [temp, setTemp] = useState('')
  const [rh, setRh] = useState('')
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!reading) return
    setTemp(reading.temperature === null ? '' : String(reading.temperature))
    setRh(reading.humidity === null ? '' : String(reading.humidity))
    setWhy('')
    setError(null)
  }, [reading])

  const save = async () => {
    if (!reading) return
    const t = num(temp)
    const h = num(rh)
    if (!why.trim()) {
      setError('Say why the reading is corrected.')
      return
    }
    if (t === null && h === null) {
      setError('Enter the correct value(s).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { error: err } = await supabase.from('environment_readings').insert({
        area_id: reading.area_id,
        recorded_at: reading.recorded_at,
        temperature: t,
        humidity: h,
        other: reading.other ?? {},
        source: 'manual',
        remarks: `Correction of the reading of ${formatDateTime(reading.recorded_at)} (was ${fmtNum(reading.temperature)} °C / ${fmtNum(
          reading.humidity,
        )} %): ${why.trim()}`,
      })
      if (err) throw err
      onSaved()
      onClose()
    } catch (err) {
      setError(envErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={reading !== null} onOpenChange={(o) => (!o && !busy ? onClose() : undefined)}>
      <DialogContent className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-md flex-col')}>
        <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white">Correct a reading</DialogTitle>
            <DialogDescription className="text-[12px] text-stone-300">
              The original stays on record. A new reading with the same time and your remarks is added.
            </DialogDescription>
          </DialogHeader>
        </div>
        {reading ? (
          <div className="space-y-3 bg-[#f7f3eb] p-3 sm:p-4">
            <p className="text-[12.5px] text-stone-700">
              {area ? `${area.code} — ${area.name}` : ''} · {formatDateTime(reading.recorded_at)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Temp °C" htmlFor="c-t">
                <Input id="c-t" inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} className={envInputClass} />
              </Field>
              <Field label="RH %" htmlFor="c-h">
                <Input id="c-h" inputMode="decimal" value={rh} onChange={(e) => setRh(e.target.value)} className={envInputClass} />
              </Field>
            </div>
            <Field label="Reason *" htmlFor="c-why">
              <Input id="c-why" value={why} placeholder="e.g. digits swapped while entering" onChange={(e) => setWhy(e.target.value)} className={envInputClass} />
            </Field>
            <MessageLine tone="error" text={error} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" className={limsOutlineBtnClass} onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button className={limsPrimaryBtnClass} onClick={() => void save()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save correction
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EnvironmentLogPage() {
  const { designation } = useAuth()
  const isDirector = isLaboratoryDirector(designation)
  const askReason = useReasonForChange()

  const [areas, setAreas] = useState<LabArea[]>([])
  const [equipment, setEquipment] = useState<EquipmentOption[]>([])
  const [today, setToday] = useState<EnvironmentReading[]>([])
  const [rows, setRows] = useState<EnvironmentReading[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [entryArea, setEntryArea] = useState(readPref)
  const [areaFilter, setAreaFilter] = useState('')
  const [from, setFrom] = useState(() => daysAgoKey(6))
  const [to, setTo] = useState(() => daysAgoKey(0))
  const [outOnly, setOutOnly] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<'' | EnvironmentSource>('')

  const [ncFor, setNcFor] = useState<EnvironmentReading | null>(null)
  const [correcting, setCorrecting] = useState<EnvironmentReading | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const loadAreas = useCallback(async () => {
    const [aRes, eRes] = await Promise.all([
      supabase.from('lab_areas').select('*').eq('active', true).order('code'),
      supabase.from('equipment_master').select('id, asset_code, equipment_name'),
    ])
    if (aRes.error) {
      if (isEnvMissingError(aRes.error)) {
        setMissing(true)
        return false
      }
      throw aRes.error
    }
    setMissing(false)
    setAreas((aRes.data ?? []) as LabArea[])
    setEquipment((eRes.data ?? []) as EquipmentOption[])
    return true
  }, [])

  const loadToday = useCallback(async () => {
    const start = dayBoundIso(localDateKey(new Date()))
    const { data, error: err } = await supabase
      .from('environment_readings')
      .select('id, area_id, recorded_at, temperature, humidity, within_limits')
      .gte('recorded_at', start ?? new Date().toISOString())
      .order('recorded_at', { ascending: false })
      .limit(2000)
    if (err) throw err
    setToday(normalise(data ?? []))
  }, [])

  const loadList = useCallback(async () => {
    let query = supabase
      .from('environment_readings')
      .select(READING_SELECT)
      .order('recorded_at', { ascending: false })
      .limit(LIST_LIMIT)
    const f = dayBoundIso(from)
    const t = dayBoundIso(to, true)
    if (f) query = query.gte('recorded_at', f)
    if (t) query = query.lte('recorded_at', t)
    if (areaFilter) query = query.eq('area_id', areaFilter)
    if (outOnly) query = query.eq('within_limits', false)
    if (sourceFilter) query = query.eq('source', sourceFilter)
    const { data, error: err } = await query
    if (err) throw err
    setRows(normalise(data ?? []))
  }, [from, to, areaFilter, outOnly, sourceFilter])

  const reloadReadings = useCallback(async () => {
    try {
      await Promise.all([loadToday(), loadList()])
    } catch (err) {
      setError(envErrorText(err))
    }
  }, [loadToday, loadList])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const ok = await loadAreas()
      if (ok) await Promise.all([loadToday(), loadList()])
    } catch (err) {
      setError(envErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [loadAreas, loadToday, loadList])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas])
  const loggerLabel = (a: LabArea | null | undefined) => {
    const e = a?.logger_equipment_id ? equipment.find((x) => x.id === a.logger_equipment_id) : undefined
    return e ? [e.asset_code, e.equipment_name].filter(Boolean).join(' ') : undefined
  }

  const todayByArea = useMemo(() => {
    const m = new Map<string, EnvironmentReading[]>()
    for (const r of today) {
      const list = m.get(r.area_id) ?? []
      list.push(r)
      m.set(r.area_id, list)
    }
    return m
  }, [today])

  const entryAreas = useMemo(() => {
    const list = entryArea ? areas.filter((a) => a.id === entryArea) : areas
    return list.length ? list : areas
  }, [areas, entryArea])

  const dueSummary = useMemo(() => {
    let due = 0
    let done = 0
    for (const a of areas) {
      const n = dueSlots(a.readings_per_day).length
      due += n
      done += Math.min(n, todayByArea.get(a.id)?.length ?? 0)
    }
    return { due, done }
  }, [areas, todayByArea])

  const chartArea = areaFilter ? areaById.get(areaFilter) : undefined
  const chartRows = useMemo(() => (chartArea ? rows.filter((r) => r.area_id === chartArea.id) : []), [rows, chartArea])
  const tempDaily = useMemo(() => dailyMinMax(chartRows, 'temperature'), [chartRows])
  const rhDaily = useMemo(() => dailyMinMax(chartRows, 'humidity'), [chartRows])
  const outCount = rows.filter((r) => r.within_limits === false).length

  const onLinked = (readingId: string, nc: { id: string; nc_id: string }) => {
    setRows((list) =>
      list.map((r) => (r.id === readingId ? { ...r, nc_record_id: nc.id, nc: { nc_id: nc.nc_id, status: 'Open' } } : r)),
    )
    setMessage(`NC ${nc.nc_id} raised and linked.`)
  }

  const removeReading = async (r: EnvironmentReading) => {
    const area = areaById.get(r.area_id)
    const reason = await askReason({
      title: 'Reason for deleting a reading',
      recordLabel: `${area?.code ?? ''} · ${formatDateTime(r.recorded_at)} · ${fmtNum(r.temperature)} °C / ${fmtNum(r.humidity)} %`,
      description: 'Prefer "Correct" (a new reading with remarks). Delete only a reading entered in error.',
      confirmLabel: 'Delete',
      quickPicks: ['Entered against the wrong area', 'Duplicate entry', 'Test entry'],
    })
    if (!reason) return
    const { data, error: err } = await supabase.from('environment_readings').delete().eq('id', r.id).select('id')
    if (err || !data?.length) {
      setMessage(err ? envErrorText(err) : 'The reading was not deleted (only the Laboratory Director can delete readings).')
      return
    }
    await recordReason('environment_readings', r.id, reason)
    setMessage('Reading deleted.')
    await reloadReadings()
  }

  const exportCsv = () => {
    const header = ['Area', 'Recorded at', 'Temperature °C', 'RH %', 'Other', 'Within limits', 'Limits', 'Source', 'Recorded by', 'Remarks', 'NC']
    const lines = [
      header.map(csvCell).join(','),
      ...rows.map((r) => {
        const area = areaById.get(r.area_id)
        const snap = r.limit_snapshot
        return [
          area?.code ?? snap?.area_code ?? '',
          r.recorded_at,
          r.temperature ?? '',
          r.humidity ?? '',
          otherText(r, area),
          r.within_limits === null ? 'No limit' : r.within_limits ? 'Yes' : 'No',
          snap ? areaLimitsText({ temp_min: snap.temp_min ?? null, temp_max: snap.temp_max ?? null, rh_min: snap.rh_min ?? null, rh_max: snap.rh_max ?? null, other_limits: snap.other_limits ?? null }) : '',
          ENV_SOURCE_LABEL[r.source] ?? r.source,
          r.recorded_by_name ?? '',
          r.remarks ?? '',
          r.nc?.nc_id ?? '',
        ]
          .map(csvCell)
          .join(',')
      }),
    ]
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `environment-log-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const ncCell = (r: EnvironmentReading) => {
    if (r.nc) {
      return (
        <Link to={NC_RECORDS_PATH} className="font-mono text-[12px] font-semibold text-amber-800 underline">
          {r.nc.nc_id}
        </Link>
      )
    }
    if (r.nc_record_id) return <span className="text-[11px] text-stone-500">NC (deleted)</span>
    if (r.within_limits === false) {
      return (
        <Button className="h-9 rounded-none bg-red-700 px-2.5 text-[12px] text-white hover:bg-red-800 sm:h-7" onClick={() => setNcFor(r)}>
          Raise NC
        </Button>
      )
    }
    return <span className="text-stone-400">—</span>
  }

  const rowActions = (r: EnvironmentReading) => (
    <div className="flex justify-center gap-1">
      <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-9 w-9 sm:h-7 sm:w-7')} onClick={() => setCorrecting(r)} aria-label="Correct reading" title="Correct (new reading with remarks)">
        <PenLine className="h-4 w-4" />
      </Button>
      {isDirector ? (
        <Button size="icon" variant="outline" className={cn(limsOutlineBtnClass, 'h-9 w-9 sm:h-7 sm:w-7')} onClick={() => void removeReading(r)} aria-label="Delete reading" title="Delete (Laboratory Director)">
          <Trash2 className="h-4 w-4 text-red-700" />
        </Button>
      ) : null}
    </div>
  )

  const ncArea = ncFor ? areaById.get(ncFor.area_id) ?? null : null

  return (
    <div className={limsPageShellClass}>
      <EnvHeader
        title="Environment Log"
        clause="6.3.3"
        subtitle="Temperature and humidity monitoring of lab areas."
        actions={
          <>
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void loadAll()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {!missing ? (
              <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => setImportOpen(true)} disabled={!areas.length}>
                <FileUp className="h-4 w-4" /> <span className="hidden sm:inline">Import CSV</span>
              </Button>
            ) : null}
          </>
        }
      />

      {missing ? <MissingMigrationNotice /> : null}
      <MessageLine tone="error" text={error} />
      <MessageLine text={message} />

      {!missing ? (
        <>
          <EnvPanel
            title={`Today's readings · ${dueSummary.done}/${dueSummary.due} due done`}
            right={
              <div className="w-full sm:w-64">
                <EnvSelect
                  ariaLabel="Area for quick entry"
                  value={entryArea}
                  onChange={(v) => {
                    setEntryArea(v)
                    writePref(v)
                  }}
                  className="border-amber-500/50 bg-amber-50 text-[#1c1917]"
                >
                  <option value="">All areas</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </EnvSelect>
              </div>
            }
          >
            {areas.length === 0 && !loading ? (
              <p className="p-3 text-center text-[13px] text-stone-600">
                No active areas. Add areas and their limits on the Lab Areas page first.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {entryAreas.map((a) => {
                  const list = todayByArea.get(a.id) ?? []
                  return (
                    <EntryCard
                      key={a.id}
                      area={a}
                      todayCount={list.length}
                      lastReading={list[0]}
                      onSaved={() => void reloadReadings()}
                      onRaiseNc={setNcFor}
                    />
                  )
                })}
              </div>
            )}
          </EnvPanel>

          <EnvPanel
            title={`Readings (${rows.length}${rows.length >= LIST_LIMIT ? '+' : ''}) · ${outCount} out of limits`}
            right={
              <Button variant="outline" className={limsDarkBarBtnClass} onClick={exportCsv} disabled={!rows.length}>
                <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export</span>
              </Button>
            }
          >
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Field label="Area" htmlFor="f-area" className="col-span-2 sm:col-span-1 lg:col-span-2">
                <EnvSelect id="f-area" value={areaFilter} onChange={setAreaFilter}>
                  <option value="">All areas</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </EnvSelect>
              </Field>
              <Field label="From" htmlFor="f-from">
                <Input id="f-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={envInputClass} />
              </Field>
              <Field label="To" htmlFor="f-to">
                <Input id="f-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={envInputClass} />
              </Field>
              <Field label="Source" htmlFor="f-src">
                <EnvSelect id="f-src" value={sourceFilter} onChange={(v) => setSourceFilter(v as '' | EnvironmentSource)}>
                  <option value="">All</option>
                  <option value="manual">Manual</option>
                  <option value="csv">CSV import</option>
                  <option value="logger">Data logger</option>
                </EnvSelect>
              </Field>
              <label className="flex min-h-10 items-end gap-2 pb-1.5 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={outOnly} onChange={(e) => setOutOnly(e.target.checked)} />
                Out of limits only
              </label>
            </div>

            {/* Phone: cards */}
            <div className="space-y-1.5 md:hidden">
              {rows.map((r) => {
                const area = areaById.get(r.area_id)
                return (
                  <div
                    key={r.id}
                    className={cn(
                      'border bg-white p-2 text-[13px]',
                      r.within_limits === false ? 'border-l-4 border-red-600 bg-red-50' : 'border-stone-300',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          <span className="font-mono text-amber-800">{area?.code ?? r.limit_snapshot?.area_code}</span> ·{' '}
                          {formatDateTime(r.recorded_at)}
                        </p>
                        <p className="text-base font-semibold">
                          {fmtNum(r.temperature)} °C · {fmtNum(r.humidity)} %
                        </p>
                        {otherText(r, area) ? <p className="text-[12px]">{otherText(r, area)}</p> : null}
                        <p className="text-[11.5px] text-stone-600">
                          {ENV_SOURCE_LABEL[r.source]} · {r.recorded_by_name ?? '—'}
                        </p>
                        {r.remarks ? <p className="text-[12px] italic text-stone-700">{r.remarks}</p> : null}
                      </div>
                      <LimitBadge value={r.within_limits} compact />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      {ncCell(r)}
                      {rowActions(r)}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop: table */}
            <div className="hidden max-h-[60vh] overflow-auto md:block">
              <table className="w-full min-w-[1000px] border-collapse font-jakarta">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className={envThClass}>Area</th>
                    <th className={envThClass}>Recorded at</th>
                    <th className={envThClass}>Temp °C</th>
                    <th className={envThClass}>RH %</th>
                    <th className={envThClass}>Other</th>
                    <th className={envThClass}>Limits (at the time)</th>
                    <th className={envThClass}>Status</th>
                    <th className={envThClass}>Source / by</th>
                    <th className={envThClass}>Remarks</th>
                    <th className={envThClass}>NC</th>
                    <th className={envThClass}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const area = areaById.get(r.area_id)
                    const snap = r.limit_snapshot
                    const bad = r.within_limits === false
                    return (
                      <tr key={r.id} className={bad ? 'bg-red-50 hover:bg-red-100' : i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                        <td className={cn(envTdClass, 'font-mono font-semibold text-amber-800', bad && 'border-l-4 border-l-red-600')}>
                          {area?.code ?? snap?.area_code}
                        </td>
                        <td className={cn(envTdClass, 'whitespace-nowrap')}>{formatDateTime(r.recorded_at)}</td>
                        <td className={cn(envTdClass, 'text-right font-semibold', bad && 'text-red-800')}>{fmtNum(r.temperature)}</td>
                        <td className={cn(envTdClass, 'text-right font-semibold', bad && 'text-red-800')}>{fmtNum(r.humidity)}</td>
                        <td className={envTdClass}>{otherText(r, area) || '—'}</td>
                        <td className={cn(envTdClass, 'text-[11.5px] text-stone-600')}>
                          {snap
                            ? areaLimitsText({
                                temp_min: snap.temp_min ?? null,
                                temp_max: snap.temp_max ?? null,
                                rh_min: snap.rh_min ?? null,
                                rh_max: snap.rh_max ?? null,
                                other_limits: snap.other_limits ?? null,
                              })
                            : '—'}
                        </td>
                        <td className={cn(envTdClass, 'text-center')}>
                          <LimitBadge value={r.within_limits} compact />
                        </td>
                        <td className={cn(envTdClass, 'text-[11.5px]')}>
                          {ENV_SOURCE_LABEL[r.source]}
                          <br />
                          {r.recorded_by_name ?? '—'}
                        </td>
                        <td className={cn(envTdClass, 'max-w-[220px] text-[11.5px]')}>{r.remarks || '—'}</td>
                        <td className={cn(envTdClass, 'text-center')}>{ncCell(r)}</td>
                        <td className={envTdClass}>{rowActions(r)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {!loading && rows.length === 0 ? (
              <p className="p-4 text-center text-[13px] text-stone-600">No readings for these filters.</p>
            ) : null}
            {rows.length >= LIST_LIMIT ? (
              <p className="mt-1 text-[12px] text-amber-800">Only the latest {LIST_LIMIT} readings are shown. Narrow the dates or pick an area.</p>
            ) : null}
          </EnvPanel>

          <EnvPanel title={chartArea ? `Trend · ${chartArea.code} — ${chartArea.name}` : 'Trend'}>
            {chartArea ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <EnvironmentChart title="Temperature" unit="°C" data={tempDaily} limitMin={num(chartArea.temp_min)} limitMax={num(chartArea.temp_max)} />
                <EnvironmentChart title="Relative humidity" unit="%" data={rhDaily} limitMin={num(chartArea.rh_min)} limitMax={num(chartArea.rh_max)} />
              </div>
            ) : (
              <p className="p-3 text-center text-[13px] text-stone-600">Pick an area in the filters above to see its daily min / max against the limits.</p>
            )}
          </EnvPanel>
        </>
      ) : null}

      <RaiseNcDialog
        reading={ncFor}
        area={ncArea}
        loggerLabel={loggerLabel(ncArea)}
        onClose={() => setNcFor(null)}
        onLinked={onLinked}
      />
      <CorrectionDialog
        reading={correcting}
        area={correcting ? areaById.get(correcting.area_id) : undefined}
        onClose={() => setCorrecting(null)}
        onSaved={() => void reloadReadings()}
      />
      <CsvImportDialog
        open={importOpen}
        areas={areas}
        defaultAreaId={areaFilter || entryArea}
        onClose={() => setImportOpen(false)}
        onImported={() => void reloadReadings()}
      />
    </div>
  )
}
