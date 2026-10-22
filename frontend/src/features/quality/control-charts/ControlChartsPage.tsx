import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Download, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { csvCell } from '@/lib/csv'
import { limsDarkBarBtnClass, limsOutlineBtnClass, limsPageShellClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn, formatDate } from '@/lib/utils'
import { EnvHeader, EnvPanel, EnvSelect, Field, MessageLine, envInputClass, envTdClass, envThClass } from '@/features/environment/EnvironmentUi'
import { envErrorText, NC_RECORDS_PATH } from '@/features/environment/shared'
import { checkTypeLabel, RESULT_VALIDITY_STATUS_LABELS } from '@/features/quality/result-validation/checkTypes'
import {
  getResultValidationModuleByCheckType,
  resultValidationModulePath,
} from '@/features/quality/result-validation/resultValidationModules'
import type { ResultValidityCheckType } from '@/features/quality/result-validation/types'
import { ControlChartSvg, type ChartPoint } from './ControlChartSvg'
import {
  evaluateWestgard,
  extractCheckPoints,
  fixedLimits,
  formatChartNumber as fmt,
  limitsFromUclLcl,
  modeOf,
  parseAcceptanceCriterion,
  parseNumber,
  REJECTION_RULES,
  statisticalLimits,
  summarize,
  WESTGARD_RULE_TEXT,
  type ChartLimits,
  type ExtractedPoint,
  type PointEvaluation,
  type WestgardRule,
} from './controlChartStats'
import { isMissingColumnError } from './missingColumn'
import { RaiseNcRecordDialog, type CreatedNc, type RaiseNcRequest } from './RaiseNcRecordDialog'

/** Proposed route: /quality/control-charts */
export const CONTROL_CHARTS_PATH = '/quality/control-charts'

type CheckRow = {
  id: string
  checkRef: string
  checkType: ResultValidityCheckType
  checkDate: string
  createdAt: string
  status: string
  title: string
  iqcMasterId: string | null
  iqcLabel: string | null
  equipmentId: string | null
  equipmentLabel: string | null
  testParameterName: string | null
  predefinedCriteria: string | null
  checkData: Record<string, unknown>
  conclusion: string | null
  ncRecordId: string | null
}

type IqcMaster = { id: string; label: string; criteria: string | null }

type SeriesPoint = ExtractedPoint & { row: CheckRow; sourceKey: string; seriesKey: string }

type PlotMode = 'value' | 'deviation'
type LimitChoice = 'statistical' | 'fixed' | 'recorded'

type Settings = {
  plot: PlotMode
  limit: LimitChoice
  baseline: string
  reference: string
  criterion: string
}

const NO_SOURCE = 'none'

function mapRow(r: Record<string, unknown>): CheckRow {
  return {
    id: String(r.id),
    checkRef: String(r.check_ref ?? ''),
    checkType: r.check_type as ResultValidityCheckType,
    checkDate: String(r.check_date ?? '').slice(0, 10),
    createdAt: String(r.created_at ?? ''),
    status: String(r.status ?? ''),
    title: String(r.title ?? ''),
    iqcMasterId: (r.iqc_master_id as string) ?? null,
    iqcLabel: (r.iqc_label as string) ?? null,
    equipmentId: (r.equipment_id as string) ?? null,
    equipmentLabel: (r.equipment_label as string) ?? null,
    testParameterName: (r.test_parameter_name as string) ?? null,
    predefinedCriteria: (r.predefined_criteria as string) ?? null,
    checkData:
      r.check_data && typeof r.check_data === 'object' && !Array.isArray(r.check_data)
        ? (r.check_data as Record<string, unknown>)
        : {},
    conclusion: (r.conclusion as string) ?? null,
    ncRecordId: (r.nc_record_id as string) ?? null,
  }
}

function sourceKeyOf(row: CheckRow): string {
  if (row.iqcMasterId) return `iqc:${row.iqcMasterId}`
  if (row.equipmentId) return `eq:${row.equipmentId}`
  return NO_SOURCE
}

function shortDay(day: string): string {
  const [, m, d] = day.split('-')
  return d && m ? `${d}/${m}` : day
}

function ruleList(rules: WestgardRule[]): string {
  return rules.length ? rules.join(', ') : '—'
}

export default function ControlChartsPage() {
  const [rows, setRows] = useState<CheckRow[]>([])
  const [masters, setMasters] = useState<IqcMaster[]>([])
  const [ncLabels, setNcLabels] = useState<Record<string, string>>({})
  const [linkSupported, setLinkSupported] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [sourceSel, setSourceSel] = useState('')
  const [paramSel, setParamSel] = useState('')
  const [typeSel, setTypeSel] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [settingsByKey, setSettingsByKey] = useState<Record<string, Settings>>({})
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [ncFor, setNcFor] = useState<{ request: RaiseNcRequest; rowId: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [checksRes, mastersRes] = await Promise.all([
        supabase
          .from('result_validity_checks')
          .select('*')
          .order('check_date', { ascending: true })
          .order('created_at', { ascending: true })
          .limit(5000),
        supabase.from('iqc_masters').select('id, asset_code, equipment_name, accuracy_acceptance_criteria').order('asset_code'),
      ])
      if (checksRes.error) throw checksRes.error
      const raw = (checksRes.data ?? []) as Record<string, unknown>[]
      const mapped = raw.map(mapRow)
      setRows(mapped)
      setLinkSupported(raw.length === 0 ? true : raw.some((r) => 'nc_record_id' in r))
      setMasters(
        ((mastersRes.data ?? []) as Array<Record<string, unknown>>).map((m) => ({
          id: String(m.id),
          label: [m.asset_code, m.equipment_name].filter(Boolean).join(' — '),
          criteria: (m.accuracy_acceptance_criteria as string) ?? null,
        })),
      )
      const ncIds = Array.from(new Set(mapped.map((r) => r.ncRecordId).filter((v): v is string => Boolean(v))))
      if (ncIds.length) {
        const { data } = await supabase.from('nc_work_records').select('id, nc_id, status').in('id', ncIds)
        const labels: Record<string, string> = {}
        for (const n of (data ?? []) as Array<{ id: string; nc_id: string; status: string }>) {
          labels[n.id] = `${n.nc_id} (${n.status})`
        }
        setNcLabels(labels)
      } else {
        setNcLabels({})
      }
    } catch (err) {
      setError(envErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const masterById = useMemo(() => new Map(masters.map((m) => [m.id, m])), [masters])

  // Every chartable value, grouped by IQC master / equipment, parameter and check type.
  const allPoints = useMemo<SeriesPoint[]>(() => {
    const out: SeriesPoint[] = []
    for (const row of rows) {
      if (from && row.checkDate < from) continue
      if (to && row.checkDate > to) continue
      const sourceKey = sourceKeyOf(row)
      for (const p of extractCheckPoints(row)) {
        out.push({ ...p, row, sourceKey, seriesKey: `${sourceKey}|${p.parameter.toLowerCase()}|${row.checkType}` })
      }
    }
    return out
  }, [rows, from, to])

  const noValueCount = useMemo(
    () => rows.filter((r) => (!from || r.checkDate >= from) && (!to || r.checkDate <= to) && extractCheckPoints(r).length === 0).length,
    [rows, from, to],
  )

  const sourceLabel = useCallback(
    (key: string, sample?: CheckRow): string => {
      if (key === NO_SOURCE) return 'No IQC master / equipment'
      const [kind, id] = key.split(':')
      if (kind === 'iqc') return masterById.get(id)?.label || sample?.iqcLabel || 'IQC master'
      return `Equipment: ${sample?.equipmentLabel || id.slice(0, 8)}`
    },
    [masterById],
  )

  const sources = useMemo(() => {
    const m = new Map<string, { key: string; label: string; count: number }>()
    for (const p of allPoints) {
      const cur = m.get(p.sourceKey)
      if (cur) cur.count += 1
      else m.set(p.sourceKey, { key: p.sourceKey, label: sourceLabel(p.sourceKey, p.row), count: 1 })
    }
    return Array.from(m.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  }, [allPoints, sourceLabel])

  const source = sources.some((s) => s.key === sourceSel) ? sourceSel : (sources[0]?.key ?? '')

  const params = useMemo(() => {
    const m = new Map<string, { key: string; label: string; count: number }>()
    for (const p of allPoints) {
      if (p.sourceKey !== source) continue
      const k = p.parameter.toLowerCase()
      const cur = m.get(k)
      if (cur) cur.count += 1
      else m.set(k, { key: k, label: p.parameter, count: 1 })
    }
    return Array.from(m.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  }, [allPoints, source])

  const param = params.some((p) => p.key === paramSel) ? paramSel : (params[0]?.key ?? '')

  const types = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of allPoints) {
      if (p.sourceKey !== source || p.parameter.toLowerCase() !== param) continue
      m.set(p.row.checkType, (m.get(p.row.checkType) ?? 0) + 1)
    }
    return Array.from(m.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
  }, [allPoints, source, param])

  const checkType = types.some((t) => t.key === typeSel) ? typeSel : (types[0]?.key ?? '')
  const seriesKey = `${source}|${param}|${checkType}`

  const series = useMemo(
    () =>
      allPoints
        .filter((p) => p.seriesKey === seriesKey)
        .sort((a, b) => a.row.checkDate.localeCompare(b.row.checkDate) || a.row.createdAt.localeCompare(b.row.createdAt)),
    [allPoints, seriesKey],
  )

  const recordedLimits = useMemo(() => {
    for (let i = series.length - 1; i >= 0; i -= 1) if (series[i].limits) return series[i].limits
    return null
  }, [series])
  const modeReference = useMemo(() => modeOf(series.map((p) => p.reference)), [series])

  // Defaults for a series; the user's edits are kept per series.
  const defaults = useMemo<Settings>(() => {
    const latestCriteria = [...series].reverse().map((p) => p.row.predefinedCriteria).find((c) => parseAcceptanceCriterion(c))
    const masterId = source.startsWith('iqc:') ? source.slice(4) : ''
    const masterCriteria = masterById.get(masterId)?.criteria ?? null
    const criterion = latestCriteria ?? (parseAcceptanceCriterion(masterCriteria) ? (masterCriteria as string) : '')
    const limit: LimitChoice =
      series.length >= 5 ? 'statistical' : recordedLimits ? 'recorded' : criterion && modeReference !== null ? 'fixed' : 'statistical'
    return {
      plot: 'value',
      limit,
      baseline: '',
      reference: modeReference !== null ? String(modeReference) : '',
      criterion,
    }
  }, [series, source, masterById, recordedLimits, modeReference])

  const settings = settingsByKey[seriesKey] ?? defaults
  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettingsByKey((prev) => ({ ...prev, [seriesKey]: { ...(prev[seriesKey] ?? defaults), [key]: value } }))

  const plotted = useMemo(() => {
    const out: Array<{ p: SeriesPoint; y: number }> = []
    for (const p of series) {
      if (settings.plot === 'deviation') {
        if (p.reference === null) continue
        out.push({ p, y: p.value - p.reference })
      } else {
        out.push({ p, y: p.value })
      }
    }
    return out
  }, [series, settings.plot])
  const skippedNoReference = series.length - plotted.length

  const limitsResult = useMemo<{ limits: ChartLimits | null; note: string | null }>(() => {
    const values = plotted.map((x) => x.y)
    if (settings.limit === 'statistical') {
      const n = parseNumber(settings.baseline)
      const l = statisticalLimits(values, n && n >= 2 ? n : undefined)
      return { limits: l, note: l ? null : 'Statistical limits need at least two values with some spread.' }
    }
    if (settings.limit === 'recorded') {
      if (settings.plot === 'deviation') return { limits: null, note: 'UCL / LCL recorded on the checks apply to the value, not the deviation.' }
      if (!recordedLimits) return { limits: null, note: 'No UCL / LCL is recorded on these checks.' }
      return { limits: limitsFromUclLcl(recordedLimits), note: null }
    }
    const crit = parseAcceptanceCriterion(settings.criterion)
    if (!crit) return { limits: null, note: 'Enter the acceptance criterion, e.g. ± 0.5 or ± 2 %.' }
    if (settings.plot === 'deviation') {
      const base = crit.percent ? modeReference : 0
      if (crit.percent && (base === null || base === 0)) return { limits: null, note: 'A % criterion needs a reference value on the checks.' }
      const half = crit.percent ? Math.abs(base as number) * (crit.value / 100) : crit.value
      return { limits: fixedLimits(0, { value: half, percent: false }), note: null }
    }
    const ref = parseNumber(settings.reference)
    if (ref === null) return { limits: null, note: 'Enter the reference (assigned) value.' }
    return { limits: fixedLimits(ref, crit), note: null }
  }, [plotted, settings, recordedLimits, modeReference])
  const limits = limitsResult.limits

  const evals = useMemo<PointEvaluation[]>(() => (limits ? evaluateWestgard(plotted.map((x) => x.y), limits) : []), [plotted, limits])
  const summary = useMemo(() => summarize(plotted.map((x) => x.y), evals), [plotted, evals])

  const pointKey = (x: { p: SeriesPoint }, i: number) => `${x.p.rowId}:${x.p.parameter}:${i}`
  const chartPoints: ChartPoint[] = plotted.map((x, i) => {
    const e = evals[i]
    return {
      key: pointKey(x, i),
      label: shortDay(x.p.row.checkDate),
      value: x.y,
      evaluation: e,
      tooltip: `${formatDate(x.p.row.checkDate)} · ${x.p.row.checkRef}: ${fmt(x.y)}${x.p.reference !== null ? ` (ref ${fmt(x.p.reference)})` : ''} · z ${fmt(e?.z, 2)}${e?.rules.length ? ` · ${e.rules.join(', ')}` : ''}`,
    }
  })

  const unit = settings.plot === 'deviation' ? 'deviation from reference' : ''
  const typeLabel = checkType ? checkTypeLabel(checkType as ResultValidityCheckType) : ''
  const currentSourceLabel = sources.find((s) => s.key === source)?.label ?? ''
  const currentParamLabel = params.find((p) => p.key === param)?.label ?? ''

  const limitText = (l: ChartLimits) =>
    l.mode === 'statistical'
      ? `statistical, mean ± SD of ${l.baselineCount ?? plotted.length} point(s)`
      : settings.limit === 'recorded'
        ? 'UCL / LCL recorded on the checks (= ±3SD)'
        : 'fixed, reference ± acceptance criterion (= ±3SD)'

  const openNc = (index: number) => {
    const x = plotted[index]
    const e = evals[index]
    if (!x || !e || !limits) return
    const rejecting = e.rules.filter((r) => REJECTION_RULES.includes(r))
    let lastGood: string | null = null
    for (let i = index - 1; i >= 0; i -= 1) {
      if (!evals[i]?.rejected) {
        lastGood = plotted[i].p.row.checkDate
        break
      }
    }
    const lines = [
      `Control chart (ISO/IEC 17025 7.7.1 d / 7.7.3): ${currentSourceLabel}, parameter ${currentParamLabel}, ${typeLabel}.`,
      `Check ${x.p.row.checkRef} on ${formatDate(x.p.row.checkDate)}: ${settings.plot === 'deviation' ? 'deviation' : 'value'} ${fmt(x.y)}${x.p.reference !== null ? ` (reference ${fmt(x.p.reference)})` : ''}, z = ${fmt(e.z, 2)}.`,
      `Limits (${limitText(limits)}): mean ${fmt(limits.center)}, SD ${fmt(limits.sd)}; warning ${fmt(limits.warnLow)} to ${fmt(limits.warnHigh)}; action ${fmt(limits.actionLow)} to ${fmt(limits.actionHigh)}.`,
      `Westgard rule(s) violated: ${(rejecting.length ? rejecting : e.rules).map((r) => `${r} (${WESTGARD_RULE_TEXT[r]})`).join('; ') || 'none'}.`,
      `Results reported since the last in-control point (${lastGood ? formatDate(lastGood) : 'none on the chart'}) are to be reviewed for impact.`,
    ]
    setNcFor({
      rowId: x.p.row.id,
      request: {
        subtitle: `Creates an Open NC record for check ${x.p.row.checkRef} and links it to the check.`,
        description: lines.join('\n'),
        equipmentOrActivity: `IQC control chart — ${currentSourceLabel} / ${currentParamLabel}`,
        sourceArea: 'Testing',
        detectedAt: new Date().toISOString(),
        defaultRisk: e.zone === 'action' ? 'High' : 'Medium',
        actionsPlaceholder: 'e.g. testing on this parameter stopped, QC material re-run, results since last good point held',
      },
    })
  }

  const linkNc = async (nc: CreatedNc): Promise<string | null> => {
    if (!ncFor) return null
    const rowId = ncFor.rowId
    const { error: linkErr } = await supabase.from('result_validity_checks').update({ nc_record_id: nc.id }).eq('id', rowId)
    if (linkErr) {
      if (isMissingColumnError(linkErr)) {
        setLinkSupported(false)
        return `NC ${nc.nc_id} created. The link to the check is not stored yet (database update 20261028100200 pending); note the NC number in the check's Action Taken.`
      }
      throw linkErr
    }
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ncRecordId: nc.id } : r)))
    setNcLabels((prev) => ({ ...prev, [nc.id]: `${nc.nc_id} (Open)` }))
    setMessage(`NC ${nc.nc_id} raised and linked to the check.`)
    return null
  }

  const exportCsv = () => {
    if (!plotted.length) return
    const header = ['Date', 'Check ref', 'Check type', 'Parameter', 'Value', 'Reference', 'Plotted', 'z', 'Zone', 'Westgard rules', 'Status', 'NC']
    const lines = [
      header.map(csvCell).join(','),
      ...plotted.map((x, i) =>
        [
          x.p.row.checkDate,
          x.p.row.checkRef,
          typeLabel,
          x.p.parameter,
          x.p.value,
          x.p.reference ?? '',
          x.y,
          evals[i] ? fmt(evals[i].z, 3) : '',
          evals[i]?.zone ?? '',
          evals[i] ? evals[i].rules.join(' ') : '',
          RESULT_VALIDITY_STATUS_LABELS[x.p.row.status] ?? x.p.row.status,
          x.p.row.ncRecordId ? (ncLabels[x.p.row.ncRecordId] ?? 'linked') : '',
        ]
          .map(csvCell)
          .join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `control_chart_${currentParamLabel.replace(/[^a-z0-9]+/gi, '_') || 'series'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const moduleSlug = checkType ? getResultValidationModuleByCheckType(checkType as ResultValidityCheckType)?.slug : undefined

  return (
    <div className={cn(limsPageShellClass, 'space-y-4')}>
      <EnvHeader
        title="Control Charts (IQC)"
        clause="7.7.1 d · 7.7.3"
        subtitle="X-chart of internal quality control results with Westgard rules"
        actions={
          <>
            <Button size="sm" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
            </Button>
            <Button size="sm" className={limsDarkBarBtnClass} onClick={exportCsv} disabled={!plotted.length}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          </>
        }
      />

      <MessageLine tone="error" text={error} />
      <MessageLine tone="ok" text={message} />
      {!linkSupported ? (
        <MessageLine
          tone="info"
          text="NC links on checks need database update 20261028100200. Charts work; raised NCs are created but not linked to the check until then."
        />
      ) : null}

      <EnvPanel title="Series">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="IQC master / equipment" htmlFor="cc-source">
            <EnvSelect id="cc-source" value={source} onChange={(v) => setSourceSel(v)} disabled={!sources.length}>
              {sources.length === 0 ? <option value="">No data</option> : null}
              {sources.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label} ({s.count})
                </option>
              ))}
            </EnvSelect>
          </Field>
          <Field label="Parameter" htmlFor="cc-param">
            <EnvSelect id="cc-param" value={param} onChange={(v) => setParamSel(v)} disabled={!params.length}>
              {params.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label} ({p.count})
                </option>
              ))}
            </EnvSelect>
          </Field>
          <Field label="Check type" htmlFor="cc-type">
            <EnvSelect id="cc-type" value={checkType} onChange={(v) => setTypeSel(v)} disabled={!types.length}>
              {types.map((t) => (
                <option key={t.key} value={t.key}>
                  {checkTypeLabel(t.key as ResultValidityCheckType)} ({t.count})
                </option>
              ))}
            </EnvSelect>
          </Field>
          <Field label="From" htmlFor="cc-from">
            <Input id="cc-from" type="date" className={envInputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To" htmlFor="cc-to">
            <Input id="cc-to" type="date" className={envInputClass} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        {noValueCount > 0 ? (
          <p className="mt-2 text-[12px] text-stone-600">
            {noValueCount} validity check(s) in this period hold no numeric value (functional checks, reviews, text results) and are not charted.
          </p>
        ) : null}
      </EnvPanel>

      <EnvPanel title="Limits">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Plot" htmlFor="cc-plot">
            <EnvSelect id="cc-plot" value={settings.plot} onChange={(v) => setSetting('plot', v as PlotMode)}>
              <option value="value">Value</option>
              <option value="deviation">Deviation from reference</option>
            </EnvSelect>
          </Field>
          <Field label="Control limits" htmlFor="cc-limit">
            <EnvSelect id="cc-limit" value={settings.limit} onChange={(v) => setSetting('limit', v as LimitChoice)}>
              <option value="statistical">Mean ± 2SD / 3SD (from data)</option>
              <option value="fixed">Reference ± acceptance criterion</option>
              <option value="recorded" disabled={!recordedLimits}>
                UCL / LCL recorded on checks{recordedLimits ? '' : ' (none)'}
              </option>
            </EnvSelect>
          </Field>
          {settings.limit === 'statistical' ? (
            <Field label="Baseline points (blank = all)" htmlFor="cc-baseline">
              <Input
                id="cc-baseline"
                inputMode="numeric"
                className={envInputClass}
                placeholder="e.g. 20"
                value={settings.baseline}
                onChange={(e) => setSetting('baseline', e.target.value)}
              />
            </Field>
          ) : null}
          {settings.limit === 'fixed' ? (
            <>
              <Field label={settings.plot === 'deviation' ? 'Reference (deviation: 0)' : 'Reference value'} htmlFor="cc-ref">
                <Input
                  id="cc-ref"
                  inputMode="decimal"
                  className={envInputClass}
                  disabled={settings.plot === 'deviation'}
                  value={settings.plot === 'deviation' ? '0' : settings.reference}
                  onChange={(e) => setSetting('reference', e.target.value)}
                />
              </Field>
              <Field label="Acceptance criterion (±)" htmlFor="cc-crit">
                <Input
                  id="cc-crit"
                  className={envInputClass}
                  placeholder="± 0.5 or ± 2 %"
                  value={settings.criterion}
                  onChange={(e) => setSetting('criterion', e.target.value)}
                />
              </Field>
            </>
          ) : null}
        </div>
        <p className="mt-2 text-[12px] text-stone-600">
          Warning limits ±2SD, action limits ±3SD. With fixed limits the criterion is the action limit and the warning limit is two
          thirds of it. Westgard rules: {REJECTION_RULES.join(', ')} reject; 1-2s warns.
          {skippedNoReference > 0 ? ` ${skippedNoReference} point(s) without a reference value are left out of the deviation chart.` : ''}
        </p>
        <MessageLine tone="info" text={limitsResult.note} />
      </EnvPanel>

      <EnvPanel
        title={
          plotted.length
            ? `${currentParamLabel} · ${typeLabel} · ${plotted.length} point(s)`
            : 'Chart'
        }
        right={
          moduleSlug ? (
            <Link to={resultValidationModulePath(moduleSlug)} className="text-[11px] font-semibold text-amber-200 underline-offset-2 hover:underline">
              Open {typeLabel} register
            </Link>
          ) : null
        }
      >
        {loading ? (
          <p className="py-6 text-center text-sm text-stone-600">Loading…</p>
        ) : !plotted.length ? (
          <p className="py-6 text-center text-sm text-stone-600">
            No numeric IQC results to chart. Record reference material, control chart, intermediate or replicate checks with values in Result
            Validation.
          </p>
        ) : limits ? (
          <ControlChartSvg
            points={chartPoints}
            limits={limits}
            unit={unit}
            selectedKey={selectedKey}
            onSelect={(k) => setSelectedKey((cur) => (cur === k ? null : k))}
          />
        ) : (
          <p className="py-6 text-center text-sm text-stone-600">Set the limits above to draw the chart.</p>
        )}
        {limits && plotted.length ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-stone-700">
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-stone-700 align-middle" />
              in control
            </span>
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-amber-600 align-middle" />
              beyond ±2SD (warning)
            </span>
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-red-700 align-middle" />
              beyond ±3SD (action)
            </span>
            <span>
              <span className="mr-1 inline-block h-3 w-3 rounded-full border-2 border-red-700 align-middle" />
              Westgard rejection rule
            </span>
          </div>
        ) : null}
      </EnvPanel>

      {limits && plotted.length ? (
        <EnvPanel title="Summary">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  {['n', 'Mean', 'SD', 'CV %', 'Min', 'Max', 'Last', 'Centre line', 'Chart SD', 'Beyond 2SD', 'Beyond 3SD', 'Rejected'].map((h) => (
                    <th key={h} className={envThClass}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-[#fffcf7] text-center">
                  <td className={envTdClass}>{summary.n}</td>
                  <td className={envTdClass}>{fmt(summary.mean)}</td>
                  <td className={envTdClass}>{fmt(summary.sd)}</td>
                  <td className={envTdClass}>{fmt(summary.cvPercent, 2)}</td>
                  <td className={envTdClass}>{fmt(summary.min)}</td>
                  <td className={envTdClass}>{fmt(summary.max)}</td>
                  <td className={envTdClass}>{fmt(summary.last)}</td>
                  <td className={envTdClass}>{fmt(limits.center)}</td>
                  <td className={envTdClass}>{fmt(limits.sd)}</td>
                  <td className={envTdClass}>{summary.beyondWarning}</td>
                  <td className={cn(envTdClass, summary.beyondAction ? 'font-bold text-red-700' : '')}>{summary.beyondAction}</td>
                  <td className={cn(envTdClass, summary.rejectedPoints ? 'font-bold text-red-700' : '')}>{summary.rejectedPoints}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-stone-700">
            Limits: {limitText(limits)}. Rule counts:{' '}
            {(Object.keys(summary.ruleCounts) as WestgardRule[]).map((r) => `${r} ${summary.ruleCounts[r]}`).join(' · ')}
          </p>
          {summary.rejectedPoints === 0 ? (
            <MessageLine tone="ok" text="No Westgard rejection rule is violated in this series." />
          ) : null}
        </EnvPanel>
      ) : null}

      {limits && plotted.length ? (
        <EnvPanel title="Points">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr>
                  {['Date', 'Check', 'Value', 'Reference', settings.plot === 'deviation' ? 'Deviation' : 'Plotted', 'z', 'Westgard', 'Status', 'NC'].map((h) => (
                    <th key={h} className={envThClass}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plotted.map((x, i) => {
                  const e = evals[i]
                  const key = pointKey(x, i)
                  const nc = x.p.row.ncRecordId
                  return (
                    <tr
                      key={key}
                      className={cn(
                        i % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]',
                        selectedKey === key && 'outline outline-2 -outline-offset-2 outline-blue-600',
                        e?.rejected && 'bg-red-50',
                      )}
                    >
                      <td className={envTdClass}>{formatDate(x.p.row.checkDate)}</td>
                      <td className={envTdClass}>
                        <button type="button" className="font-semibold text-amber-800 hover:underline" onClick={() => setSelectedKey(key)}>
                          {x.p.row.checkRef || '—'}
                        </button>
                      </td>
                      <td className={cn(envTdClass, 'text-right')}>{fmt(x.p.value)}</td>
                      <td className={cn(envTdClass, 'text-right')}>{fmt(x.p.reference)}</td>
                      <td className={cn(envTdClass, 'text-right font-semibold')}>{fmt(x.y)}</td>
                      <td
                        className={cn(
                          envTdClass,
                          'text-right',
                          e?.zone === 'action' && 'font-bold text-red-700',
                          e?.zone === 'warning' && 'font-semibold text-amber-700',
                        )}
                      >
                        {fmt(e?.z, 2)}
                      </td>
                      <td className={cn(envTdClass, e?.rejected && 'font-bold text-red-700')}>
                        {e?.rejected ? <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> : null}
                        {ruleList(e?.rules ?? [])}
                      </td>
                      <td className={envTdClass}>{RESULT_VALIDITY_STATUS_LABELS[x.p.row.status] ?? x.p.row.status}</td>
                      <td className={envTdClass}>
                        {nc ? (
                          <Link to={NC_RECORDS_PATH} className="font-semibold text-amber-800 hover:underline">
                            {ncLabels[nc] ?? 'Linked'}
                          </Link>
                        ) : e?.rejected || e?.zone === 'action' ? (
                          <Button size="sm" variant="outline" className={cn(limsOutlineBtnClass, 'h-7 px-2 text-[11px]')} onClick={() => openNc(i)}>
                            Raise NC
                          </Button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </EnvPanel>
      ) : null}

      <RaiseNcRecordDialog request={ncFor?.request ?? null} onClose={() => setNcFor(null)} link={linkNc} />
    </div>
  )
}
