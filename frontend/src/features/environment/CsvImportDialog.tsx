import { useEffect, useMemo, useState } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDialogClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDateTime } from '@/lib/utils'
import {
  dropDuplicates,
  guessMapping,
  mapRows,
  parseCsv,
  type CsvMapping,
  type DateOrder,
  type MappedReading,
} from './csvImport'
import { EnvSelect, Field, LimitBadge, MessageLine, envTdClass, envThClass } from './EnvironmentUi'
import { envErrorText, evaluateReading, fmtNum, type EnvironmentSource, type LabArea } from './shared'

const CHUNK = 500
const MAX_FILE_BYTES = 5 * 1024 * 1024

type Existing = { key: string; keys: string[] } | null

/**
 * Import a data logger / hygrometer export for one area: preview the file,
 * map its columns, see which rows are out of limits or already stored, then
 * insert the new readings (source 'logger' or 'csv').
 */
export function CsvImportDialog({
  open,
  areas,
  defaultAreaId,
  onClose,
  onImported,
}: {
  open: boolean
  areas: LabArea[]
  defaultAreaId: string
  onClose: () => void
  onImported: (count: number) => void
}) {
  const [areaId, setAreaId] = useState('')
  const [source, setSource] = useState<EnvironmentSource>('logger')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<CsvMapping | null>(null)
  const [existing, setExisting] = useState<Existing>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setAreaId(defaultAreaId || areas[0]?.id || '')
    setSource('logger')
    setFileName('')
    setRows([])
    setMapping(null)
    setExisting(null)
    setError(null)
    setDone(null)
  }, [open, defaultAreaId, areas])

  const area = areas.find((a) => a.id === areaId) ?? null
  const result = useMemo(() => (mapping ? mapRows(rows, mapping) : null), [rows, mapping])

  const tooLate = useMemo(() => {
    const limit = Date.now() + 60 * 60 * 1000
    return (result?.readings ?? []).filter((r) => r.recordedAt.getTime() > limit)
  }, [result])

  const range = useMemo(() => {
    const list = result?.readings ?? []
    if (!list.length) return null
    let lo = list[0].recordedAt.getTime()
    let hi = lo
    for (const r of list) {
      lo = Math.min(lo, r.recordedAt.getTime())
      hi = Math.max(hi, r.recordedAt.getTime())
    }
    return { from: new Date(lo - 60_000).toISOString(), to: new Date(hi + 60_000).toISOString() }
  }, [result])

  const existingKey = `${areaId}|${range?.from ?? ''}|${range?.to ?? ''}`

  // Readings already stored for this area in the file's time range (duplicates).
  useEffect(() => {
    if (!open || !areaId || !range) return
    let cancelled = false
    void supabase
      .from('environment_readings')
      .select('recorded_at')
      .eq('area_id', areaId)
      .gte('recorded_at', range.from)
      .lte('recorded_at', range.to)
      .limit(20000)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(`Could not check for readings already stored: ${envErrorText(err)}`)
          return
        }
        setExisting({ key: `${areaId}|${range.from}|${range.to}`, keys: (data ?? []).map((r) => String(r.recorded_at)) })
      })
    return () => {
      cancelled = true
    }
  }, [open, areaId, range])

  const ready = existing !== null && existing.key === existingKey
  const plan = useMemo(() => {
    if (!result) return null
    const late = new Set(tooLate)
    const usable = result.readings.filter((r) => !late.has(r))
    const { fresh, duplicates } = dropDuplicates(usable, ready && existing ? existing.keys : [])
    const out = area ? fresh.filter((r) => evaluateReading(area, r.temperature, r.humidity) === false).length : 0
    return { fresh, duplicates, out }
  }, [result, tooLate, existing, ready, area])

  const onFile = async (file: File | undefined) => {
    setError(null)
    setDone(null)
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setError('The file is larger than 5 MB. Split the export into smaller periods.')
      return
    }
    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      if (parsed.length < 2) {
        setError('The file has no data rows.')
        return
      }
      setFileName(file.name)
      setRows(parsed)
      setMapping(guessMapping(parsed))
      setExisting(null)
    } catch (err) {
      setError(`Could not read the file: ${envErrorText(err)}`)
    }
  }

  const doImport = async () => {
    if (!plan || !area || busy) return
    if (!plan.fresh.length) {
      setError('Nothing new to import.')
      return
    }
    setBusy(true)
    setError(null)
    let inserted = 0
    try {
      const remark = `Imported from ${fileName}`.slice(0, 200)
      for (let i = 0; i < plan.fresh.length; i += CHUNK) {
        const chunk = plan.fresh.slice(i, i + CHUNK).map((r: MappedReading) => ({
          area_id: area.id,
          recorded_at: r.recordedAt.toISOString(),
          temperature: r.temperature,
          humidity: r.humidity,
          source,
          remarks: remark,
        }))
        const { error: err } = await supabase.from('environment_readings').insert(chunk)
        if (err) throw err
        inserted += chunk.length
      }
      setDone(`${inserted} reading(s) imported into ${area.code}.`)
      onImported(inserted)
    } catch (err) {
      setError(
        `${inserted ? `${inserted} reading(s) were imported, then the import stopped: ` : 'Import failed: '}${envErrorText(err)}`,
      )
      if (inserted) onImported(inserted)
    } finally {
      setBusy(false)
    }
  }

  const header = mapping ? rows[mapping.headerRow] ?? [] : []
  const colOptions = (allowNone: boolean) => (
    <>
      {allowNone ? <option value="-1">— none —</option> : null}
      {header.map((h, i) => (
        <option key={i} value={i}>
          {h || `Column ${i + 1}`}
        </option>
      ))}
    </>
  )
  const setMap = (patch: Partial<CsvMapping>) => setMapping((m) => (m ? { ...m, ...patch } : m))

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !busy ? onClose() : undefined)}>
      <DialogContent className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-4xl flex-col')}>
        <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white">Import data logger readings (CSV)</DialogTitle>
            <DialogDescription className="text-[12px] text-stone-300">
              Readings already stored at the same minute are skipped. Limits are checked by the database.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f3eb] p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Area" htmlFor="imp-area">
              <EnvSelect id="imp-area" value={areaId} onChange={setAreaId}>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </EnvSelect>
            </Field>
            <Field label="Source" htmlFor="imp-src">
              <EnvSelect id="imp-src" value={source} onChange={(v) => setSource(v as EnvironmentSource)}>
                <option value="logger">Data logger export</option>
                <option value="csv">Other CSV (manual sheet)</option>
              </EnvSelect>
            </Field>
            <Field label="File (.csv / .txt)" htmlFor="imp-file">
              <label
                htmlFor="imp-file"
                className="flex h-10 cursor-pointer items-center gap-2 border border-dashed border-stone-500 bg-white px-2 text-sm text-stone-700 hover:bg-amber-50 sm:h-8"
              >
                <FileUp className="h-4 w-4 shrink-0" />
                <span className="truncate">{fileName || 'Choose file'}</span>
              </label>
              <input
                id="imp-file"
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="sr-only"
                onChange={(e) => {
                  void onFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </Field>
          </div>

          {mapping ? (
            <fieldset className="border border-stone-400 bg-white p-2.5">
              <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-stone-700">Column mapping</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Header row" htmlFor="map-header">
                  <EnvSelect
                    id="map-header"
                    value={String(mapping.headerRow)}
                    onChange={(v) => setMapping(guessMapping(rows, Number(v)))}
                  >
                    {rows.slice(0, 15).map((r, i) => (
                      <option key={i} value={i}>
                        Row {i + 1}: {r.join(' | ').slice(0, 60)}
                      </option>
                    ))}
                  </EnvSelect>
                </Field>
                <Field label="Date / date-time column" htmlFor="map-date">
                  <EnvSelect id="map-date" value={String(mapping.dateCol)} onChange={(v) => setMap({ dateCol: Number(v) })}>
                    {colOptions(true)}
                  </EnvSelect>
                </Field>
                <Field label="Separate time column" htmlFor="map-time">
                  <EnvSelect id="map-time" value={String(mapping.timeCol)} onChange={(v) => setMap({ timeCol: Number(v) })}>
                    {colOptions(true)}
                  </EnvSelect>
                </Field>
                <Field label="Temperature (°C)" htmlFor="map-temp">
                  <EnvSelect id="map-temp" value={String(mapping.tempCol)} onChange={(v) => setMap({ tempCol: Number(v) })}>
                    {colOptions(true)}
                  </EnvSelect>
                </Field>
                <Field label="Humidity (% RH)" htmlFor="map-rh">
                  <EnvSelect id="map-rh" value={String(mapping.rhCol)} onChange={(v) => setMap({ rhCol: Number(v) })}>
                    {colOptions(true)}
                  </EnvSelect>
                </Field>
                <Field label="Date order" htmlFor="map-order">
                  <EnvSelect id="map-order" value={mapping.dateOrder} onChange={(v) => setMap({ dateOrder: v as DateOrder })}>
                    <option value="auto">Automatic (day first)</option>
                    <option value="DMY">Day / Month / Year</option>
                    <option value="MDY">Month / Day / Year</option>
                    <option value="YMD">Year-Month-Day only</option>
                  </EnvSelect>
                </Field>
              </div>
            </fieldset>
          ) : null}

          {result && plan ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 text-[12.5px]">
                <Stat label="Rows read" value={result.readings.length + result.errors.length} />
                <Stat label="New readings" value={plan.fresh.length} tone="ok" />
                <Stat label="Already stored" value={ready ? plan.duplicates : '…'} />
                <Stat label="Out of limits" value={plan.out} tone={plan.out ? 'bad' : undefined} />
                <Stat label="Rows with errors" value={result.errors.length + tooLate.length} tone={result.errors.length + tooLate.length ? 'bad' : undefined} />
              </div>
              {result.errors.length || tooLate.length ? (
                <details className="border border-red-300 bg-red-50 p-2 text-[12px] text-red-900">
                  <summary className="cursor-pointer font-semibold">Rows that will not be imported</summary>
                  <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5">
                    {result.errors.slice(0, 50).map((e) => (
                      <li key={`e${e.line}`}>
                        {e.line ? `Line ${e.line}: ` : ''}
                        {e.message}
                      </li>
                    ))}
                    {tooLate.slice(0, 20).map((r) => (
                      <li key={`l${r.line}`}>Line {r.line}: time is in the future (check the logger clock)</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse font-jakarta">
                  <thead>
                    <tr>
                      <th className={envThClass}>Line</th>
                      <th className={envThClass}>Date &amp; time</th>
                      <th className={envThClass}>Temp °C</th>
                      <th className={envThClass}>RH %</th>
                      <th className={envThClass}>Limits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.fresh.slice(0, 25).map((r) => {
                      const verdict = area ? evaluateReading(area, r.temperature, r.humidity) : null
                      return (
                        <tr key={r.line} className={verdict === false ? 'bg-red-50' : 'bg-white'}>
                          <td className={cn(envTdClass, 'text-center font-mono')}>{r.line}</td>
                          <td className={envTdClass}>{formatDateTime(r.recordedAt.toISOString())}</td>
                          <td className={cn(envTdClass, 'text-right')}>{fmtNum(r.temperature)}</td>
                          <td className={cn(envTdClass, 'text-right')}>{fmtNum(r.humidity)}</td>
                          <td className={cn(envTdClass, 'text-center')}>
                            <LimitBadge value={verdict} compact />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {plan.fresh.length > 25 ? (
                  <p className="mt-1 text-[12px] text-stone-600">Showing 25 of {plan.fresh.length} new readings.</p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-stone-600">
              Export the readings from the logger software as CSV, then choose the file. Preamble lines (logger serial,
              units) are skipped automatically; check the header row and columns before importing.
            </p>
          )}

          <MessageLine tone="error" text={error} />
          <MessageLine tone="ok" text={done} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" className={limsOutlineBtnClass} onClick={onClose} disabled={busy}>
              {done ? 'Close' : 'Cancel'}
            </Button>
            {!done ? (
              <Button
                className={limsPrimaryBtnClass}
                onClick={() => void doImport()}
                disabled={busy || !plan || !ready || !plan.fresh.length || !area}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Import {plan?.fresh.length ? plan.fresh.length : ''} reading(s)
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'bad' }) {
  return (
    <span
      className={cn(
        'border px-2 py-1',
        tone === 'ok' && 'border-emerald-600/40 bg-emerald-50 text-emerald-900',
        tone === 'bad' && 'border-red-600/40 bg-red-50 text-red-900',
        !tone && 'border-stone-400 bg-white text-stone-800',
      )}
    >
      {label}: <b>{value}</b>
    </span>
  )
}
