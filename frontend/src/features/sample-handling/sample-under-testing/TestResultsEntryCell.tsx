import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Calculator, Plus, Trash2 } from 'lucide-react'
import { MeasurementUnitSelect } from '@/features/masters/measurement-units/MeasurementUnitSelect'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { SectionCompareSource } from './sectionCompareSources'
import { TestResultMiniCalculator } from './TestResultMiniCalculator'
import {
  DEFAULT_COMPOSE_OPTIONS,
  DEFAULT_DECIMAL_PLACES,
  TEST_RESULT_COMPARE_ACTIONS,
  TEST_RESULT_DECIMAL_OPTIONS,
  TEST_RESULT_SEPARATOR_OPTIONS,
  TEST_RESULT_STAT_KEYS,
  appendReportedFragment,
  buildComposedReported,
  computeCompareResult,
  computeTestResultStats,
  formatNumber,
  formatStatDisplay,
  formatTestResultDisplay,
  formatTestResultForTable,
  formatValueWithUnit,
  parseReadingInput,
  parseTestResultValue,
  serializeTestResult,
  statLabel,
  statValue,
  structuredFromLegacyText,
  type StructuredTestResult,
  type TestResultCompareAction,
  type TestResultComposeOptions,
  type TestResultReadingEntry,
  type TestResultStatKey,
} from './testResultValues'

type ReadingRow = { label: string; value: string; unit: string }

const emptyReadingRow = (unit = ''): ReadingRow => ({ label: '', value: '', unit })

export function TestResultsEntryCell({
  value,
  onChange,
  testLabel,
  sectionCompareSources = [],
  defaultUnit = '',
}: {
  value: string | null
  onChange: (value: string) => void
  testLabel: string
  sectionCompareSources?: SectionCompareSource[]
  defaultUnit?: string
}) {
  const [open, setOpen] = useState(false)
  const [readingRows, setReadingRows] = useState<ReadingRow[]>([emptyReadingRow(defaultUnit)])
  const [reported, setReported] = useState('')
  const [selectedStat, setSelectedStat] = useState<
    TestResultStatKey | 'manual' | 'readings' | 'composed'
  >('manual')
  const [statPicker, setStatPicker] = useState<TestResultStatKey>('average')
  const [composeOptions, setComposeOptions] = useState<TestResultComposeOptions>(
    DEFAULT_COMPOSE_OPTIONS,
  )
  const [decimalPlaces, setDecimalPlaces] = useState(DEFAULT_DECIMAL_PLACES)
  const [compareSourceId, setCompareSourceId] = useState('')
  const [compareAction, setCompareAction] = useState<TestResultCompareAction>('difference')
  const [calcOpen, setCalcOpen] = useState(false)
  const [reportedCalcOpen, setReportedCalcOpen] = useState(false)

  const structuredValue = useMemo(() => parseTestResultValue(value ?? ''), [value])
  const displayText = useMemo(() => formatTestResultForTable(value), [value])
  const displayTitle = formatTestResultDisplay(value)

  useEffect(() => {
    if (!open) return
    const structured = parseTestResultValue(value ?? '')
    if (structured) {
      setReadingRows(
        structured.entries.length > 0
          ? structured.entries.map((e) => ({
              label: e.label ?? '',
              value: formatNumber(e.value),
              unit: e.unit ?? defaultUnit,
            }))
          : [emptyReadingRow(defaultUnit)],
      )
      setReported(structured.reported)
      setSelectedStat(structured.stat ?? 'manual')
      if (
        structured.stat &&
        structured.stat !== 'manual' &&
        structured.stat !== 'readings' &&
        structured.stat !== 'composed'
      ) {
        setStatPicker(structured.stat)
      }
      setComposeOptions(structured.compose ?? DEFAULT_COMPOSE_OPTIONS)
      setDecimalPlaces(structured.decimals ?? DEFAULT_DECIMAL_PLACES)
      return
    }
    const legacy = structuredFromLegacyText(value ?? '')
    setReadingRows(
      legacy.entries.length > 0
        ? legacy.entries.map((e) => ({
            label: e.label ?? '',
            value: formatNumber(e.value),
            unit: e.unit ?? defaultUnit,
          }))
        : [emptyReadingRow(defaultUnit)],
    )
    setReported(legacy.reported)
    setSelectedStat('manual')
    setStatPicker('average')
    setComposeOptions(DEFAULT_COMPOSE_OPTIONS)
    setDecimalPlaces(DEFAULT_DECIMAL_PLACES)
  }, [open, value, defaultUnit])

  useEffect(() => {
    if (!open) {
      setCalcOpen(false)
      setReportedCalcOpen(false)
      return
    }
    if (compareSourceId && !sectionCompareSources.some((s) => s.id === compareSourceId)) {
      setCompareSourceId('')
    }
  }, [open, compareSourceId, sectionCompareSources])

  const entries: TestResultReadingEntry[] = useMemo(
    () =>
      readingRows
        .map((row) => {
          const parsed = parseReadingInput(row.value)
          if (parsed === null) return null
          return {
            label: row.label.trim(),
            value: parsed,
            unit: row.unit.trim() || undefined,
          }
        })
        .filter((e): e is TestResultReadingEntry => e !== null),
    [readingRows],
  )

  const calculatorReferences = useMemo((): SectionCompareSource[] => {
    const current: SectionCompareSource[] = entries.map((e, index) => ({
      id: `current:entry:${index}`,
      label: `${testLabel} · ${e.label?.trim() || `Reading ${index + 1}`}`,
      value: e.value,
      unit: e.unit,
    }))
    return [...current, ...sectionCompareSources]
  }, [entries, sectionCompareSources, testLabel])

  const numericReadings = useMemo(() => entries.map((e) => e.value), [entries])
  const stats = useMemo(() => computeTestResultStats(numericReadings), [numericReadings])

  const selectedStatDisplay = useMemo(() => {
    if (!stats) return ''
    return formatStatDisplay(stats, statPicker, decimalPlaces)
  }, [stats, statPicker, decimalPlaces])

  const compareSource = useMemo(
    () => sectionCompareSources.find((s) => s.id === compareSourceId) ?? null,
    [sectionCompareSources, compareSourceId],
  )

  const compareBaseValue = useMemo(() => {
    if (!stats) return null
    if (selectedStat === 'manual' || selectedStat === 'readings' || selectedStat === 'composed') {
      return stats.average
    }
    return statValue(stats, selectedStat)
  }, [stats, selectedStat])

  const compareResultDisplay = useMemo(() => {
    if (!compareSource || compareBaseValue === null) return ''
    const raw = computeCompareResult(compareAction, compareBaseValue, compareSource.value, decimalPlaces)
    if (raw === '—') return raw
    if (compareAction === 'ratio') return raw
    if (compareAction === 'use' && compareSource.unit) {
      return formatValueWithUnit(compareSource.value, compareSource.unit, decimalPlaces)
    }
    return raw
  }, [compareAction, compareBaseValue, compareSource, decimalPlaces])

  const applyStat = (key: TestResultStatKey, mode: 'apply' | 'add') => {
    if (!stats) return
    const formatted = formatStatDisplay(stats, key, decimalPlaces)
    setStatPicker(key)
    setSelectedStat(key)
    setReported((prev) => (mode === 'add' ? appendReportedFragment(prev, formatted) : formatted))
  }

  const handleDecimalPlacesChange = (next: string) => {
    setDecimalPlaces(Number(next))
  }

  const addReading = () =>
    setReadingRows((prev) => [...prev, emptyReadingRow(prev[0]?.unit ?? defaultUnit)])

  const removeReading = (index: number) => {
    setReadingRows((prev) =>
      prev.length <= 1 ? [emptyReadingRow(defaultUnit)] : prev.filter((_, i) => i !== index),
    )
  }

  const applyComposed = (overrides?: Partial<TestResultComposeOptions>) => {
    const options: TestResultComposeOptions = { ...composeOptions, ...overrides }
    setComposeOptions(options)
    const composed = buildComposedReported(entries, options, stats, statPicker, decimalPlaces)
    setReported(composed)
    setSelectedStat('composed')
  }

  const applyCompare = (mode: 'apply' | 'add') => {
    if (!compareResultDisplay || compareResultDisplay === '—') return
    setSelectedStat('manual')
    setReported((prev) =>
      mode === 'add' ? appendReportedFragment(prev, compareResultDisplay) : compareResultDisplay,
    )
  }

  const handleSave = () => {
    const record: StructuredTestResult = {
      v:
        entries.some((e) => e.label || e.unit) || entries.length > 1 ? 2 : 1,
      readings: numericReadings,
      entries,
      reported: reported.trim(),
      stat: selectedStat,
      compose: selectedStat === 'composed' ? composeOptions : undefined,
      decimals: decimalPlaces,
    }
    if (numericReadings.length === 0 && !record.reported) {
      onChange('')
    } else if (numericReadings.length === 0) {
      onChange(record.reported)
    } else {
      onChange(serializeTestResult(record))
    }
    setOpen(false)
  }

  return (
    <>
      <div className="flex items-start gap-1 min-w-[200px] max-w-[320px]">
        {structuredValue ? (
          <button
            type="button"
            className="flex-1 min-h-8 rounded-md border border-input bg-background px-2 py-1.5 text-xs text-center whitespace-pre-wrap break-words leading-relaxed hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-0"
            title={displayTitle || 'Open calculator to edit multiple readings'}
            onClick={() => setOpen(true)}
          >
            {displayText || 'Results'}
          </button>
        ) : (
          <Input
            type="text"
            className="h-8 text-xs flex-1 text-center min-w-0"
            placeholder="Results"
            value={value ?? ''}
            title={displayTitle || 'Enter result or open calculator for multiple readings'}
            onChange={(e) => onChange(e.target.value)}
            onDoubleClick={() => setOpen(true)}
          />
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Multiple readings and statistics"
          title="Multiple readings — Sum, Average, CV, Std. Deviation…"
          onClick={() => setOpen(true)}
        >
          <Calculator className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          layer="nested"
          className={cn(limsDialogClass, 'max-w-2xl max-h-[90vh] overflow-hidden p-0')}
          aria-describedby={undefined}
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                Test Results — {testLabel}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="max-h-[calc(90vh-7.5rem)] space-y-4 overflow-y-auto bg-[#f7f3eb] px-4 py-4">
            <div className="space-y-2 overflow-hidden border-2 border-stone-500 bg-[#f7f3eb] shadow-sm ring-1 ring-amber-700/20">
              <div className="border-b border-stone-500 bg-stone-800 px-3 py-2">
                <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                  Individual Readings
                </Label>
              </div>
              <div className="grid grid-cols-[1.1fr_0.9fr_0.65fr_auto] gap-2 border-b border-[#e7e0d4] bg-stone-800/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-100/90">
                <span>Label</span>
                <span>Value</span>
                <span>Unit</span>
                <span className="w-8" />
              </div>
              <div className="max-h-[220px] space-y-2 overflow-y-auto px-3 py-2">
                {readingRows.map((row, index) => {
                  const isLastRow = index === readingRows.length - 1
                  return (
                    <div
                      key={`reading-${index}`}
                      className="grid grid-cols-[1.1fr_0.9fr_0.65fr_auto] items-center gap-2"
                    >
                      <Input
                        type="text"
                        className={cn(limsFieldClass, 'h-8 text-sm')}
                        placeholder="e.g. Specimen 1"
                        value={row.label}
                        onChange={(e) =>
                          setReadingRows((prev) =>
                            prev.map((r, i) => (i === index ? { ...r, label: e.target.value } : r)),
                          )
                        }
                      />
                      <Input
                        type="text"
                        inputMode="decimal"
                        className={cn(limsFieldClass, 'h-8 text-sm')}
                        placeholder="Value"
                        value={row.value}
                        onChange={(e) =>
                          setReadingRows((prev) =>
                            prev.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)),
                          )
                        }
                      />
                      <MeasurementUnitSelect
                        value={row.unit}
                        onChange={(unit) =>
                          setReadingRows((prev) =>
                            prev.map((r, i) => (i === index ? { ...r, unit } : r)),
                          )
                        }
                        showLabel={false}
                        inputClassName={cn(limsFieldClass, 'h-8 text-sm')}
                        className="space-y-0"
                      />
                      {isLastRow ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 rounded-none text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]"
                          aria-label="Add reading"
                          title="Add reading"
                          onClick={addReading}
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 rounded-none text-red-700 hover:bg-[#f3e9d8] hover:text-red-800"
                          aria-label="Remove reading"
                          title="Remove reading"
                          onClick={() => removeReading(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {stats && entries.length > 0 && (
              <div className="relative space-y-4 overflow-hidden border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 p-3 text-white shadow-sm ring-1 ring-amber-700/20">
                <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={limsDarkBarGlowStyle} />
                <div className="relative space-y-2 border-b border-amber-500/30 pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Statistics
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          limsDarkBarBtnClass,
                          'h-8 gap-1.5 text-xs',
                          calcOpen && 'border-amber-400 bg-amber-500/25 text-amber-50',
                        )}
                        onClick={() => setCalcOpen((o) => !o)}
                      >
                        <Calculator className="h-3.5 w-3.5" />
                        Calculator
                      </Button>
                      <div className="flex min-w-[150px] items-center gap-2">
                        <Label htmlFor="decimal-places" className="shrink-0 text-xs text-amber-100/90">
                          Decimals
                        </Label>
                        <Select value={String(decimalPlaces)} onValueChange={handleDecimalPlacesChange}>
                          <SelectTrigger
                            id="decimal-places"
                            className={cn(limsDarkBarFieldClass, 'w-[110px] text-xs')}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TEST_RESULT_DECIMAL_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  {calcOpen && (
                    <TestResultMiniCalculator
                      decimalPlaces={decimalPlaces}
                      references={calculatorReferences}
                      onInsertReading={(val) => {
                        setReadingRows((prev) => {
                          const unit = prev[0]?.unit ?? defaultUnit
                          const emptyIdx = prev.findIndex((r) => !r.value.trim())
                          if (emptyIdx >= 0) {
                            return prev.map((r, i) => (i === emptyIdx ? { ...r, value: val } : r))
                          }
                          return [...prev, { label: '', value: val, unit }]
                        })
                      }}
                      onApplyReported={(val) => {
                        setSelectedStat('manual')
                        setReported(val)
                      }}
                    />
                  )}
                </div>

                <div className="relative grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-amber-100/90">Statistic</Label>
                    <Select
                      value={statPicker}
                      onValueChange={(v) => setStatPicker(v as TestResultStatKey)}
                    >
                      <SelectTrigger className={cn(limsDarkBarFieldClass, 'text-xs')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEST_RESULT_STAT_KEYS.map((key) => (
                          <SelectItem key={key} value={key} className="text-xs">
                            {statLabel(key)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-amber-100/90">Value</Label>
                    <Input
                      readOnly
                      className={cn(limsDarkBarFieldClass, 'font-mono text-xs')}
                      value={selectedStatDisplay}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(limsDarkBarBtnClass, 'h-8 text-xs')}
                    onClick={() => applyStat(statPicker, 'apply')}
                  >
                    Apply
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(limsDarkBarBtnClass, 'h-8 text-xs')}
                    onClick={() => applyStat(statPicker, 'add')}
                  >
                    Add
                  </Button>
                </div>

                {sectionCompareSources.length > 0 && (
                  <div className="relative space-y-2 border-t border-amber-500/30 pt-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Compare with another field (same section)
                    </p>
                    <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1.4fr_1fr_0.9fr_auto_auto]">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-amber-100/90">Field</Label>
                        <Select
                          value={compareSourceId || '__none__'}
                          onValueChange={(v) => setCompareSourceId(v === '__none__' ? '' : v)}
                        >
                          <SelectTrigger className={cn(limsDarkBarFieldClass, 'text-xs')}>
                            <SelectValue placeholder="Select parameter / reading" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__" className="text-xs">
                              Select field…
                            </SelectItem>
                            {sectionCompareSources.map((source) => (
                              <SelectItem key={source.id} value={source.id} className="text-xs">
                                {source.label}
                                {source.unit ? ` (${source.unit})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-amber-100/90">Action</Label>
                        <Select
                          value={compareAction}
                          onValueChange={(v) => setCompareAction(v as TestResultCompareAction)}
                        >
                          <SelectTrigger className={cn(limsDarkBarFieldClass, 'text-xs')}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TEST_RESULT_COMPARE_ACTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-amber-100/90">Result</Label>
                        <Input
                          readOnly
                          className={cn(limsDarkBarFieldClass, 'font-mono text-xs')}
                          value={compareResultDisplay}
                          placeholder="—"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(limsDarkBarBtnClass, 'h-8 text-xs')}
                        disabled={!compareResultDisplay || compareResultDisplay === '—'}
                        onClick={() => applyCompare('apply')}
                      >
                        Apply
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(limsDarkBarBtnClass, 'h-8 text-xs')}
                        disabled={!compareResultDisplay || compareResultDisplay === '—'}
                        onClick={() => applyCompare('add')}
                      >
                        Add
                      </Button>
                    </div>
                    <p className="text-[11px] text-stone-400">
                      Uses selected statistic ({statLabel(statPicker)}) against the chosen field from this
                      section code.
                    </p>
                  </div>
                )}

                <div className="relative space-y-3 border border-amber-500/35 bg-stone-950/40 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    Compose reported result
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="flex cursor-pointer items-center gap-2 border border-stone-500 bg-stone-800/60 px-2.5 py-2">
                      <input
                        type="checkbox"
                        className="rounded-none border-stone-500"
                        checked={composeOptions.includeLabels}
                        onChange={(e) =>
                          setComposeOptions((o) => ({ ...o, includeLabels: e.target.checked }))
                        }
                      />
                      <span className="text-xs text-amber-50">Include labels</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 border border-stone-500 bg-stone-800/60 px-2.5 py-2">
                      <input
                        type="checkbox"
                        className="rounded-none border-stone-500"
                        checked={composeOptions.includeStat}
                        onChange={(e) =>
                          setComposeOptions((o) => ({ ...o, includeStat: e.target.checked }))
                        }
                      />
                      <span className="text-xs text-amber-50">Include statistic</span>
                    </label>
                    <div className="space-y-1">
                      <Label className="text-xs text-amber-100/90">Separator</Label>
                      <Select
                        value={composeOptions.separator}
                        onValueChange={(v) =>
                          setComposeOptions((o) => ({
                            ...o,
                            separator: v as TestResultComposeOptions['separator'],
                          }))
                        }
                      >
                        <SelectTrigger className={cn(limsDarkBarFieldClass, 'text-xs')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TEST_RESULT_SEPARATOR_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value} className="text-xs">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(limsDarkBarBtnClass, 'h-8 text-xs')}
                      onClick={() => applyComposed({ includeLabels: false, includeStat: false })}
                    >
                      Values only
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(limsDarkBarBtnClass, 'h-8 text-xs')}
                      onClick={() => applyComposed({ includeLabels: true, includeStat: false })}
                    >
                      With labels
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(limsDarkBarBtnClass, 'h-8 text-xs')}
                      onClick={() => applyComposed({ includeLabels: false, includeStat: true })}
                    >
                      With statistic
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className={cn(limsPrimaryBtnClass, 'h-8 text-xs')}
                      onClick={() => applyComposed()}
                    >
                      Apply composed result
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2 border-2 border-stone-500 bg-stone-50 p-3 shadow-sm ring-1 ring-amber-700/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label
                  htmlFor="reported-result"
                  className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-700"
                >
                  Reported result (saved value)
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-7 gap-1.5 rounded-none border-amber-700/45 px-2 text-[11px] font-semibold text-[#92400e] hover:bg-[#f3e9d8]',
                    reportedCalcOpen && 'border-amber-700 bg-[#f3e9d8]',
                  )}
                  onClick={() => setReportedCalcOpen((o) => !o)}
                  aria-expanded={reportedCalcOpen}
                  aria-label="Open calculator using section readings"
                  title="Calculate using this section’s test parameters and individual readings"
                >
                  <Calculator className="h-3.5 w-3.5" />
                  Calculator
                </Button>
              </div>
              {reportedCalcOpen ? (
                <div className="border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 p-2 shadow-sm ring-1 ring-amber-700/20">
                  <TestResultMiniCalculator
                    decimalPlaces={decimalPlaces}
                    references={calculatorReferences}
                    onApplyReported={(val) => {
                      setSelectedStat('manual')
                      setReported(val)
                      setReportedCalcOpen(false)
                    }}
                  />
                </div>
              ) : null}
              <Input
                id="reported-result"
                className={limsFieldClass}
                value={reported}
                onChange={(e) => {
                  setSelectedStat('manual')
                  setReported(e.target.value)
                }}
                placeholder="Final value for report / review"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 sm:justify-end">
            <Button type="button" className={limsPrimaryBtnClass} onClick={handleSave}>
              Save & Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
