import { useMemo, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type {
  RawDataSheetColumn,
  RawDataSheetPayloadRow,
} from '@/features/calibration/rawDataSheetTypes'

type TypeBRow = {
  id: string
  name: string
  value: string
  /** Divisor for rectangular (√3), triangular (√6), or normal (k). */
  distribution: 'rectangular' | 'triangular' | 'normal'
  /** Used when distribution = normal (coverage factor of the source). */
  sourceK: string
}

const STEPS = [
  { id: 1, title: 'Type A — Repeatability' },
  { id: 2, title: 'Type B — Contributions' },
  { id: 3, title: 'Coverage Factor' },
  { id: 4, title: 'Result' },
] as const

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function parseNum(raw: string): number | null {
  const t = String(raw).trim()
  // Number('') === 0 in JS — blank cells must not count toward n / Type A.
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function fmt(n: number, dp: number): string {
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(dp)
}

function sampleStdDev(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function typeBStandardUncertainty(row: TypeBRow): number | null {
  const v = parseNum(row.value)
  if (v == null || v < 0) return null
  if (row.distribution === 'rectangular') return v / Math.sqrt(3)
  if (row.distribution === 'triangular') return v / Math.sqrt(6)
  const k = parseNum(row.sourceK) ?? 2
  if (k <= 0) return null
  return v / k
}

function emptyTypeBRows(): TypeBRow[] {
  return [
    {
      id: newId('tb'),
      name: 'Resolution (half digit)',
      value: '',
      distribution: 'rectangular',
      sourceK: '2',
    },
    {
      id: newId('tb'),
      name: 'Reference / Master uncertainty',
      value: '',
      distribution: 'normal',
      sourceK: '2',
    },
    {
      id: newId('tb'),
      name: 'Other (optional)',
      value: '',
      distribution: 'rectangular',
      sourceK: '2',
    },
  ]
}

export function UncertaintyStepByStepDialog({
  open,
  onOpenChange,
  columns,
  rows,
  decimalPlaces,
  onApplyUncertainty,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  columns: RawDataSheetColumn[]
  rows: RawDataSheetPayloadRow[]
  decimalPlaces: number
  /** Optional: push expanded U into Generate Report uncertainty field. */
  onApplyUncertainty?: (expandedU: string) => void
}) {
  const [step, setStep] = useState(1)
  const [rowId, setRowId] = useState('')
  const [readingKeys, setReadingKeys] = useState<string[]>([])
  const [typeBRows, setTypeBRows] = useState<TypeBRow[]>(() => emptyTypeBRows())
  const [coverageK, setCoverageK] = useState('2')

  const inputColumns = useMemo(
    () => columns.filter((c) => c.type !== 'formula'),
    [columns],
  )

  const readingCandidateColumns = useMemo(
    () =>
      inputColumns.filter((c) =>
        /reading|indicator|obs|observed|as\s*found|as\s*left/i.test(c.label),
      ),
    [inputColumns],
  )

  useEffect(() => {
    if (!open) return
    const firstRow = rows[0]
    const guessKeys = (
      readingCandidateColumns.length > 0 ? readingCandidateColumns : inputColumns.slice(1)
    ).map((c) => c.key)
    setStep(1)
    setRowId(firstRow?.id ?? '')
    setReadingKeys(guessKeys)
    setTypeBRows(emptyTypeBRows())
    setCoverageK('2')
  }, [open, rows, readingCandidateColumns, inputColumns])

  const typeAByRow = useMemo(() => {
    const map = new Map<
      string,
      { n: number; s: number | null; mean: number | null; uA: number | null; values: number[] }
    >()
    for (const row of rows) {
      const values = readingKeys
        .map((key) => parseNum(String(row.values[key] ?? '')))
        .filter((n): n is number => n != null)
      const n = values.length
      const s = sampleStdDev(values)
      const mean = n > 0 ? values.reduce((a, b) => a + b, 0) / n : null
      const uA = s != null && n > 0 ? s / Math.sqrt(n) : null
      map.set(row.id, { n, s, mean, uA, values })
    }
    return map
  }, [rows, readingKeys])

  const selectedRow = rows.find((r) => r.id === rowId) ?? rows[0] ?? null
  const typeA = selectedRow
    ? (typeAByRow.get(selectedRow.id) ?? { n: 0, s: null, mean: null, uA: null, values: [] })
    : { n: 0, s: null, mean: null, uA: null, values: [] }
  const readingValues = typeA.values

  const typeBComputed = useMemo(() => {
    return typeBRows.map((row) => ({
      ...row,
      u: typeBStandardUncertainty(row),
    }))
  }, [typeBRows])

  const combined = useMemo(() => {
    const parts: number[] = []
    if (typeA.uA != null) parts.push(typeA.uA)
    for (const row of typeBComputed) {
      if (row.u != null && row.u > 0) parts.push(row.u)
    }
    const uc = parts.length > 0 ? Math.sqrt(parts.reduce((a, b) => a + b * b, 0)) : null
    const k = parseNum(coverageK) ?? 2
    const U = uc != null && k > 0 ? k * uc : null
    return { uc, k, U, parts }
  }, [typeA.uA, typeBComputed, coverageK])

  const dp = Math.max(2, decimalPlaces)

  const toggleReadingKey = (key: string) => {
    setReadingKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  const patchTypeB = (id: string, patch: Partial<TypeBRow>) => {
    setTypeBRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const canNext =
    step === 1
      ? readingValues.length >= 2
      : step === 2
        ? true
        : step === 3
          ? (parseNum(coverageK) ?? 0) > 0
          : true

  const goNext = () => {
    if (step < 4 && canNext) setStep((s) => s + 1)
  }
  const goBack = () => {
    if (step > 1) setStep((s) => s - 1)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!flex fixed inset-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/10 [&>button]:hover:opacity-100"
        layer="nested"
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 bg-slate-900 px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
          <DialogHeader className="relative pr-12 text-left">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
              ISO / IEC 17025 · GUM
            </p>
            <DialogTitle className="text-xl font-semibold tracking-tight text-white">
              Uncertainty Calculation — Step by Step
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-[#fafbfc] px-4 py-4 sm:px-6 sm:py-5">
          <ol className="flex flex-wrap gap-1.5">
            {STEPS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                    step === s.id
                      ? 'border-teal-600 bg-teal-50 text-teal-900'
                      : step > s.id
                        ? 'border-slate-300 bg-white text-slate-700'
                        : 'border-slate-200 bg-slate-50 text-slate-400',
                  )}
                  onClick={() => {
                    if (s.id <= step) setStep(s.id)
                  }}
                >
                  {s.id}. {s.title}
                </button>
              </li>
            ))}
          </ol>

          {step === 1 ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-xs text-slate-600">
                  Type A from repeated readings at each load point: u<sub>A</sub> = s / √n. Tick
                  column headers to include as repeat readings; select a row for the budget.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatChip label="n" value={String(typeA.n)} />
                  <StatChip label="Mean" value={typeA.mean != null ? fmt(typeA.mean, dp) : '—'} />
                  <StatChip label="s (sample)" value={typeA.s != null ? fmt(typeA.s, dp) : '—'} />
                  <StatChip
                    label="uA"
                    value={typeA.uA != null ? fmt(typeA.uA, dp) : '—'}
                    emphasize
                  />
                </div>
              </div>

              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-14 border border-slate-200 px-2 py-2 text-center">Use</th>
                      <th className="w-12 border border-slate-200 px-2 py-2 text-center">#</th>
                      {inputColumns.map((col) => {
                        const included = readingKeys.includes(col.key)
                        return (
                          <th
                            key={col.key}
                            className={cn(
                              'min-w-[110px] border border-slate-200 px-2 py-2 text-center',
                              included && 'bg-teal-50/80 text-teal-900',
                            )}
                          >
                            <label className="inline-flex cursor-pointer flex-col items-center gap-1">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 accent-teal-600"
                                checked={included}
                                onChange={() => toggleReadingKey(col.key)}
                                aria-label={`Include ${col.label} in Type A`}
                              />
                              <span className="normal-case tracking-normal">{col.label}</span>
                            </label>
                          </th>
                        )
                      })}
                      <th className="min-w-[56px] border border-slate-200 px-2 py-2 text-center">
                        n
                      </th>
                      <th className="min-w-[80px] border border-slate-200 px-2 py-2 text-center">
                        Mean
                      </th>
                      <th className="min-w-[80px] border border-slate-200 px-2 py-2 text-center">
                        s
                      </th>
                      <th className="min-w-[80px] border border-slate-200 bg-teal-50/60 px-2 py-2 text-center text-teal-900">
                        u<sub>A</sub>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={inputColumns.length + 6}
                          className="border border-slate-200 px-3 py-8 text-center text-sm text-slate-500"
                        >
                          No raw data rows available.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row, index) => {
                        const stats = typeAByRow.get(row.id)
                        const selected = (selectedRow?.id ?? '') === row.id
                        return (
                          <tr
                            key={row.id}
                            className={cn(
                              'cursor-pointer transition-colors',
                              selected ? 'bg-teal-50/70' : 'hover:bg-slate-50/80',
                            )}
                            onClick={() => setRowId(row.id)}
                          >
                            <td className="border border-slate-200 px-2 py-1.5 text-center">
                              <input
                                type="radio"
                                name="type-a-row"
                                className="h-4 w-4 accent-teal-600"
                                checked={selected}
                                onChange={() => setRowId(row.id)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Use row ${index + 1} for Type A`}
                              />
                            </td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center font-mono text-xs text-slate-500">
                              {index + 1}
                            </td>
                            {inputColumns.map((col) => {
                              const included = readingKeys.includes(col.key)
                              const raw = String(row.values[col.key] ?? '').trim()
                              return (
                                <td
                                  key={col.key}
                                  className={cn(
                                    'border border-slate-200 px-2 py-1.5 text-center font-mono text-xs',
                                    included ? 'bg-teal-50/40 text-slate-900' : 'text-slate-600',
                                  )}
                                >
                                  {raw || '—'}
                                </td>
                              )
                            })}
                            <td className="border border-slate-200 px-2 py-1.5 text-center font-mono text-xs">
                              {stats?.n ?? 0}
                            </td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center font-mono text-xs">
                              {stats?.mean != null ? fmt(stats.mean, dp) : '—'}
                            </td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center font-mono text-xs">
                              {stats?.s != null ? fmt(stats.s, dp) : '—'}
                            </td>
                            <td
                              className={cn(
                                'border border-slate-200 px-2 py-1.5 text-center font-mono text-xs font-semibold',
                                selected ? 'bg-teal-100/80 text-teal-900' : 'bg-teal-50/40 text-teal-800',
                              )}
                            >
                              {stats?.uA != null ? fmt(stats.uA, dp) : '—'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {readingKeys.length < 2 ? (
                <p className="text-[11px] text-amber-700">
                  Tick at least 2 column headers to use as repeat readings.
                </p>
              ) : readingValues.length < 2 ? (
                <p className="text-[11px] text-amber-700">
                  Selected row needs at least 2 numeric values in the ticked reading columns.
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-600">
                Type B: enter half-width (or expanded U for normal). Standard uncertainty u<sub>i</sub>{' '}
                uses the selected distribution.
              </p>
              <div className="space-y-3">
                {typeBComputed.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-1 gap-2 rounded-md border border-slate-100 bg-slate-50/60 p-2.5 sm:grid-cols-12"
                  >
                    <div className="space-y-1 sm:col-span-4">
                      <Label className="text-[10px]">Component</Label>
                      <Input
                        value={row.name}
                        onChange={(e) => patchTypeB(row.id, { name: e.target.value })}
                        className="h-9 bg-white"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-[10px]">Value</Label>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={row.value}
                        onChange={(e) => patchTypeB(row.id, { value: e.target.value })}
                        className="h-9 bg-white"
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-3">
                      <Label className="text-[10px]">Distribution</Label>
                      <Select
                        value={row.distribution}
                        onValueChange={(v) =>
                          patchTypeB(row.id, {
                            distribution: v as TypeBRow['distribution'],
                          })
                        }
                      >
                        <SelectTrigger className="h-9 bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rectangular">Rectangular (÷√3)</SelectItem>
                          <SelectItem value="triangular">Triangular (÷√6)</SelectItem>
                          <SelectItem value="normal">Normal (÷k)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 sm:col-span-1">
                      <Label className="text-[10px]">k</Label>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        disabled={row.distribution !== 'normal'}
                        value={row.sourceK}
                        onChange={(e) => patchTypeB(row.id, { sourceK: e.target.value })}
                        className="h-9 bg-white"
                      />
                    </div>
                    <div className="flex flex-col justify-end sm:col-span-2">
                      <p className="text-[10px] uppercase text-slate-500">uᵢ</p>
                      <p className="font-mono text-sm font-semibold text-teal-800">
                        {row.u != null ? fmt(row.u, dp) : '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() =>
                  setTypeBRows((prev) => [
                    ...prev,
                    {
                      id: newId('tb'),
                      name: 'Additional component',
                      value: '',
                      distribution: 'rectangular',
                      sourceK: '2',
                    },
                  ])
                }
              >
                Add Type B component
              </Button>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-600">
                Expanded uncertainty U = k · u<sub>c</sub>. For ~95% confidence, k = 2 is usual.
              </p>
              <div className="max-w-xs space-y-2">
                <Label htmlFor="unc-k">Coverage factor (k)</Label>
                <Input
                  id="unc-k"
                  type="number"
                  min={0}
                  step="any"
                  value={coverageK}
                  onChange={(e) => setCoverageK(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <StatChip
                  label="uc (combined)"
                  value={combined.uc != null ? fmt(combined.uc, dp) : '—'}
                />
                <StatChip label="k" value={String(combined.k)} />
                <StatChip
                  label="U (expanded)"
                  value={combined.U != null ? fmt(combined.U, dp) : '—'}
                  emphasize
                />
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-medium text-slate-700">Uncertainty budget</p>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full min-w-[420px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5">Source</th>
                      <th className="px-2 py-1.5 text-right">uᵢ</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-100">
                      <td className="px-2 py-1.5">
                        Type A (repeatability)
                        {selectedRow ? (
                          <span className="ml-1 font-normal text-slate-400">
                            · row {rows.findIndex((r) => r.id === selectedRow.id) + 1}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {typeA.uA != null ? fmt(typeA.uA, dp) : '—'}
                      </td>
                    </tr>
                    {typeBComputed.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-2 py-1.5">{row.name || '—'}</td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {row.u != null && row.u > 0 ? fmt(row.u, dp) : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                      <td className="px-2 py-1.5">Combined u<sub>c</sub></td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {combined.uc != null ? fmt(combined.uc, dp) : '—'}
                      </td>
                    </tr>
                    <tr className="border-t border-teal-200 bg-teal-50 font-semibold text-teal-900">
                      <td className="px-2 py-1.5">
                        Expanded U (k = {combined.k})
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {combined.U != null ? fmt(combined.U, dp) : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-500">
                Formula: u<sub>c</sub> = √(Σ uᵢ²), U = k · u<sub>c</sub>
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1"
            disabled={step <= 1}
            onClick={goBack}
          >
            <ChevronLeft size={14} />
            Back
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {step === 4 && combined.U != null && onApplyUncertainty ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 border-teal-600/40 text-teal-800"
                onClick={() => {
                  onApplyUncertainty(fmt(combined.U!, dp))
                  onOpenChange(false)
                }}
              >
                Use U in Generate Report
              </Button>
            ) : null}
            {step < 4 ? (
              <Button
                type="button"
                size="sm"
                className="h-9 gap-1 bg-teal-600 text-white hover:bg-teal-500"
                disabled={!canNext}
                onClick={goNext}
              >
                Next
                <ChevronRight size={14} />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="h-9 bg-teal-600 text-white hover:bg-teal-500"
                onClick={() => onOpenChange(false)}
              >
                Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StatChip({
  label,
  value,
  emphasize,
}: {
  label: string
  value: string
  emphasize?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-md border px-2.5 py-2',
        emphasize ? 'border-teal-200 bg-teal-50' : 'border-slate-200 bg-slate-50',
      )}
    >
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-mono text-sm font-semibold',
          emphasize ? 'text-teal-900' : 'text-slate-800',
        )}
      >
        {value}
      </p>
    </div>
  )
}
