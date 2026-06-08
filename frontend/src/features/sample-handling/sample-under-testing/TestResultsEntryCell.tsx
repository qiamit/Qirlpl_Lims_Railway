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
    if (!open) return
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Test Results — {testLabel}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">Individual readings</Label>
                <Button type="button" variant="outline" size="sm" onClick={addReading}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add reading
                </Button>
              </div>
              <div className="grid grid-cols-[1.1fr_0.9fr_0.65fr_auto] gap-2 px-1 text-xs font-medium text-muted-foreground">
                <span>Label</span>
                <span>Value</span>
                <span>Unit</span>
                <span className="w-8" />
              </div>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {readingRows.map((row, index) => (
                  <div
                    key={`reading-${index}`}
                    className="grid grid-cols-[1.1fr_0.9fr_0.65fr_auto] gap-2 items-center"
                  >
                    <Input
                      type="text"
                      className="h-8 text-sm"
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
                      className="h-8 text-sm"
                      placeholder="Value"
                      value={row.value}
                      onChange={(e) =>
                        setReadingRows((prev) =>
                          prev.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)),
                        )
                      }
                    />
                    <Input
                      type="text"
                      className="h-8 text-sm"
                      placeholder="Unit"
                      value={row.unit}
                      onChange={(e) =>
                        setReadingRows((prev) =>
                          prev.map((r, i) => (i === index ? { ...r, unit: e.target.value } : r)),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive"
                      aria-label="Remove reading"
                      onClick={() => removeReading(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {stats && entries.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-4">
                <div className="space-y-2 border-b border-border/50 pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Statistics
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant={calcOpen ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => setCalcOpen((o) => !o)}
                      >
                        <Calculator className="h-3.5 w-3.5" />
                        Calculator
                      </Button>
                      <div className="flex items-center gap-2 min-w-[150px]">
                        <Label htmlFor="decimal-places" className="text-xs shrink-0">
                          Decimals
                        </Label>
                        <Select value={String(decimalPlaces)} onValueChange={handleDecimalPlacesChange}>
                          <SelectTrigger id="decimal-places" className="h-8 text-xs w-[110px]">
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

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Statistic</Label>
                    <Select
                      value={statPicker}
                      onValueChange={(v) => setStatPicker(v as TestResultStatKey)}
                    >
                      <SelectTrigger className="h-8 text-xs">
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
                    <Label className="text-xs">Value</Label>
                    <Input
                      readOnly
                      className="h-8 text-xs font-mono bg-background"
                      value={selectedStatDisplay}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => applyStat(statPicker, 'apply')}
                  >
                    Apply
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => applyStat(statPicker, 'add')}
                  >
                    Add
                  </Button>
                </div>

                {sectionCompareSources.length > 0 && (
                  <div className="space-y-2 border-t border-border/50 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Compare with another field (same section)
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_0.9fr_auto_auto] gap-2 items-end">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Field</Label>
                        <Select value={compareSourceId || '__none__'} onValueChange={(v) => setCompareSourceId(v === '__none__' ? '' : v)}>
                          <SelectTrigger className="h-8 text-xs">
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
                        <Label className="text-xs">Action</Label>
                        <Select
                          value={compareAction}
                          onValueChange={(v) => setCompareAction(v as TestResultCompareAction)}
                        >
                          <SelectTrigger className="h-8 text-xs">
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
                        <Label className="text-xs">Result</Label>
                        <Input
                          readOnly
                          className="h-8 text-xs font-mono bg-background"
                          value={compareResultDisplay}
                          placeholder="—"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={!compareResultDisplay || compareResultDisplay === '—'}
                        onClick={() => applyCompare('apply')}
                      >
                        Apply
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={!compareResultDisplay || compareResultDisplay === '—'}
                        onClick={() => applyCompare('add')}
                      >
                        Add
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Uses selected statistic ({statLabel(statPicker)}) against the chosen field from this
                      section code.
                    </p>
                  </div>
                )}

                <div className="rounded-md border border-border/60 bg-background/70 p-3 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Compose reported result
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="flex items-center gap-2 cursor-pointer rounded-md border border-border/50 px-2.5 py-2">
                      <input
                        type="checkbox"
                        className="rounded border-input"
                        checked={composeOptions.includeLabels}
                        onChange={(e) =>
                          setComposeOptions((o) => ({ ...o, includeLabels: e.target.checked }))
                        }
                      />
                      <span className="text-xs">Include labels</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer rounded-md border border-border/50 px-2.5 py-2">
                      <input
                        type="checkbox"
                        className="rounded border-input"
                        checked={composeOptions.includeStat}
                        onChange={(e) =>
                          setComposeOptions((o) => ({ ...o, includeStat: e.target.checked }))
                        }
                      />
                      <span className="text-xs">Include statistic</span>
                    </label>
                    <div className="space-y-1">
                      <Label className="text-xs">Separator</Label>
                      <Select
                        value={composeOptions.separator}
                        onValueChange={(v) =>
                          setComposeOptions((o) => ({
                            ...o,
                            separator: v as TestResultComposeOptions['separator'],
                          }))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
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
                      className="text-xs h-8"
                      onClick={() => applyComposed({ includeLabels: false, includeStat: false })}
                    >
                      Values only
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-8"
                      onClick={() => applyComposed({ includeLabels: true, includeStat: false })}
                    >
                      With labels
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-8"
                      onClick={() => applyComposed({ includeLabels: false, includeStat: true })}
                    >
                      With statistic
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="text-xs h-8"
                      onClick={() => applyComposed()}
                    >
                      Apply composed result
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5 rounded-md border border-primary/20 bg-primary/5 p-3">
              <Label htmlFor="reported-result">Reported result (saved value)</Label>
              <Input
                id="reported-result"
                className="h-9"
                value={reported}
                onChange={(e) => {
                  setSelectedStat('manual')
                  setReported(e.target.value)
                }}
                placeholder="Final value for report / review"
              />
              <p className="text-xs text-muted-foreground">
                Statistic value is preview only until you click Apply (replace) or Add (append).
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave}>
              Save result
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
