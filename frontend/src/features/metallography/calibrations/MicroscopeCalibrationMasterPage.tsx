import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EnvHeader, MessageLine } from '@/features/environment/EnvironmentUi'
import { useCanEditCurrentModule } from '@/features/settings/module-access/useCanEditCurrentModule'
import { useAuth } from '@/hooks/useAuth'
import { csvCell } from '@/lib/csv'
import { loadEquipmentOptions, type EquipmentOption } from '@/lib/equipmentTraceability'
import { escapeHtml } from '@/lib/htmlText'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { formatDate, formatDateTime } from '@/lib/utils'
import { fetchMetallographyPermissions, listCalibrations, localIsoDate, metallographyErrorText } from '../metallographyApi'
import { MetallographyGate, MetallographyMissingNotice } from '../MetallographyUi'
import { CALIBRATION_EXPIRY_WARNING_DAYS, CALIBRATION_STATUS_LABEL, type MetallographyPermissions, type ScaleCalibration } from '../types'
import { useMetallographySwitch } from '../useMetallographySwitch'
import {
  calibrationValidity,
  effectiveValidFrom,
  equipmentText,
  fixed,
  instrumentOptions,
  isCalibrationFilter,
  matchesFilter,
  resolutionText,
  umPerPxText,
  validityWarningText,
  type CalibrationFilter,
} from './calibrationFormat'
import { MicroscopeCalibrationFooterBar } from './MicroscopeCalibrationFooterBar'
import { MicroscopeCalibrationForm } from './MicroscopeCalibrationForm'
import { MicroscopeCalibrationHeaderBar } from './MicroscopeCalibrationHeaderBar'
import { MicroscopeCalibrationTable } from './MicroscopeCalibrationTable'

/**
 * S4 Microscope Calibration (µm/px), route /metallography/scale-calibrations
 * (ISO/IEC 17025 6.4, 6.5, 7.5; design 3.4 S4, 3.5). A calibration is
 * recorded as a draft from a stage micrometer image and its readings,
 * verified by a second person, and then offered to analyses at exactly its
 * image resolution while it is in date. Rules are enforced by the database
 * (metallography_scale_calibrations_guard); this page only explains them.
 * ?filter=expiring|expired|draft|in_use|withdrawn preselects the list.
 */

type FormTarget = { key: number; calibration: ScaleCalibration | null }

const CSV_HEADERS = [
  'Cal. No',
  'Status',
  'Validity',
  'Microscope',
  'Camera',
  'Stage micrometer',
  'Objective',
  'Total magnification',
  'Resolution',
  'Reference length (µm)',
  'Readings x',
  'Readings y',
  'µm/px X',
  'µm/px Y',
  'u rel %',
  'Valid from',
  'Valid until',
  'Performed by',
  'Performed at',
  'Verified by',
  'Verified at',
  'Withdrawn because',
]

function printViaIframe(html: string) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  if (!doc) {
    iframe.remove()
    return
  }
  doc.open()
  doc.write(html)
  doc.close()
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } finally {
      window.setTimeout(() => iframe.remove(), 1000)
    }
  }
}

function CalibrationRegister() {
  const { user, designation } = useAuth()
  const isDirector = isLaboratoryDirector(designation)
  const canEditModule = useCanEditCurrentModule()
  const [searchParams, setSearchParams] = useSearchParams()
  const [today] = useState(() => localIsoDate())

  const [rows, setRows] = useState<ScaleCalibration[]>([])
  const [perms, setPerms] = useState<MetallographyPermissions | null>(null)
  const [equipment, setEquipment] = useState<EquipmentOption[]>([])
  const [equipmentError, setEquipmentError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null)

  const filterParam = searchParams.get('filter')
  const filter: CalibrationFilter = isCalibrationFilter(filterParam) ? filterParam : 'all'
  const setFilter = (next: CalibrationFilter) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'all') p.delete('filter')
        else p.set('filter', next)
        return p
      },
      { replace: true },
    )
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, permissions, options] = await Promise.all([
        listCalibrations(),
        fetchMetallographyPermissions(),
        loadEquipmentOptions().catch((e: unknown) => {
          setEquipmentError(`Equipment list could not be loaded: ${metallographyErrorText(e)}`)
          return null
        }),
      ])
      if (list.status === 'missing' || permissions.status === 'missing') {
        setMissing(true)
        return
      }
      setMissing(false)
      setRows(list.data)
      setPerms(permissions.data)
      if (options) {
        setEquipment(instrumentOptions(options))
        setEquipmentError(null)
      }
    } catch (e) {
      setError(metallographyErrorText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const canEdit = Boolean(perms?.canCalibrate) && canEditModule
  const equipmentById = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((c) => {
      if (!matchesFilter(c, filter, today)) return false
      if (!q) return true
      return [
        c.calCode,
        c.objective,
        c.totalMagnification,
        CALIBRATION_STATUS_LABEL[c.status],
        equipmentText(c.microscopeEquipmentId, equipmentById),
        equipmentText(c.cameraEquipmentId, equipmentById),
        equipmentText(c.stageMicrometerEquipmentId, equipmentById),
        c.performedByName,
        c.verifiedByName,
        resolutionText(c.imageWidthPx, c.imageHeightPx),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [rows, filter, search, today, equipmentById])

  const counts = useMemo(() => {
    let drafts = 0
    let expiring = 0
    for (const c of rows) {
      const v = calibrationValidity(c, today)
      if (v.state === 'draft') drafts += 1
      if (v.state === 'expiring') expiring += 1
    }
    return { drafts, expiring }
  }, [rows, today])

  const openForm = (calibration: ScaleCalibration | null) => {
    setMessage(null)
    setFormTarget((t) => ({ key: (t?.key ?? 0) + 1, calibration }))
  }

  const handleChanged = (saved: ScaleCalibration | null, text: string) => {
    setMessage(text)
    if (saved) {
      setRows((list) => {
        const i = list.findIndex((c) => c.id === saved.id)
        return i === -1 ? [saved, ...list] : list.map((c) => (c.id === saved.id ? saved : c))
      })
      // Reopen on the saved record: the image is downloaded and re-hashed from storage.
      setFormTarget((t) => ({ key: (t?.key ?? 0) + 1, calibration: saved }))
    } else {
      setFormTarget(null)
    }
    void load()
  }

  const csvRow = (c: ScaleCalibration): string[] => {
    const v = calibrationValidity(c, today)
    return [
      c.calCode ?? '',
      CALIBRATION_STATUS_LABEL[c.status],
      validityWarningText(v) ?? '',
      equipmentText(c.microscopeEquipmentId, equipmentById),
      c.cameraEquipmentId ? equipmentText(c.cameraEquipmentId, equipmentById) : '',
      equipmentText(c.stageMicrometerEquipmentId, equipmentById),
      c.objective,
      c.totalMagnification === null ? '' : String(c.totalMagnification),
      resolutionText(c.imageWidthPx, c.imageHeightPx),
      String(c.referenceLengthUm),
      String(c.readings.filter((r) => r.axis === 'x').length),
      String(c.readings.filter((r) => r.axis === 'y').length),
      umPerPxText(c.umPerPxX),
      umPerPxText(c.umPerPxY),
      fixed(c.uRelScalePct, 4),
      effectiveValidFrom(c),
      c.validUntil,
      c.performedByName ?? '',
      c.performedAt,
      c.verifiedByName ?? '',
      c.verifiedAt ?? '',
      c.withdrawReason ?? '',
    ]
  }

  const handleExport = () => {
    const lines = [CSV_HEADERS.map(csvCell).join(','), ...visible.map((c) => csvRow(c).map(csvCell).join(','))]
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `microscope_calibrations_${today}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    const body = visible
      .map((c) => {
        const v = validityWarningText(calibrationValidity(c, today))
        return `<tr>
          <td>${escapeHtml(c.calCode ?? '')}</td>
          <td>${escapeHtml(equipmentText(c.microscopeEquipmentId, equipmentById))}</td>
          <td>${escapeHtml(c.cameraEquipmentId ? equipmentText(c.cameraEquipmentId, equipmentById) : '—')}</td>
          <td>${escapeHtml(equipmentText(c.stageMicrometerEquipmentId, equipmentById))}</td>
          <td>${escapeHtml(c.objective)}${c.totalMagnification ? ` (${escapeHtml(c.totalMagnification)}×)` : ''}</td>
          <td>${escapeHtml(resolutionText(c.imageWidthPx, c.imageHeightPx))}</td>
          <td class="n">${escapeHtml(umPerPxText(c.umPerPxX))}</td>
          <td class="n">${escapeHtml(umPerPxText(c.umPerPxY))}</td>
          <td class="n">${escapeHtml(fixed(c.uRelScalePct, 2))}</td>
          <td>${escapeHtml(formatDate(effectiveValidFrom(c)))} – ${escapeHtml(formatDate(c.validUntil))}</td>
          <td>${escapeHtml(CALIBRATION_STATUS_LABEL[c.status])}${v ? `<br>${escapeHtml(v)}` : ''}</td>
          <td>${escapeHtml(c.performedByName ?? '—')}<br>${escapeHtml(formatDateTime(c.performedAt))}</td>
          <td>${escapeHtml(c.verifiedByName ?? '—')}${c.verifiedAt ? `<br>${escapeHtml(formatDateTime(c.verifiedAt))}` : ''}</td>
        </tr>`
      })
      .join('')
    printViaIframe(`<!doctype html><html><head><title>Microscope calibrations</title>
<style>
  @page{size:A4 landscape;margin:10mm}
  body{font-family:sans-serif;font-size:10px;color:#1c1917}
  h1{font-size:15px;margin:0 0 4px}
  p{margin:0 0 10px;color:#57534e}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #444;padding:3px 4px;vertical-align:top}
  th{background:#292524;color:#fde68a;text-transform:uppercase;font-size:9px}
  td.n{text-align:right;font-family:monospace}
</style></head><body>
<h1>Microscope Calibration (µm/px)</h1>
<p>Printed ${escapeHtml(formatDate(today))} · ${visible.length} record(s)</p>
<table><thead><tr>
  <th>Cal. No</th><th>Microscope</th><th>Camera</th><th>Stage micrometer</th><th>Objective</th><th>Resolution</th>
  <th>µm/px X</th><th>µm/px Y</th><th>u rel %</th><th>Valid</th><th>Status</th><th>Performed</th><th>Verified</th>
</tr></thead><tbody>${body}</tbody></table>
</body></html>`)
  }

  if (missing) {
    return (
      <>
        <EnvHeader title="Microscope Calibration (µm/px)" clause="6.4 · 6.5" />
        <MetallographyMissingNotice />
      </>
    )
  }

  return (
    <>
      <MicroscopeCalibrationHeaderBar
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        loading={loading}
        onRefresh={() => void load()}
        canCreate={canEdit}
        onNew={() => openForm(null)}
      />

      {perms && !canEdit ? (
        <MessageLine text="View only. Recording and verifying calibrations needs Edit on Microscope Calibration (or the Laboratory Director)." />
      ) : null}
      {counts.expiring > 0 && filter !== 'expiring' ? (
        <button
          type="button"
          onClick={() => setFilter('expiring')}
          className="block w-full border border-amber-600/60 bg-amber-50 px-3 py-2 text-left text-[13px] text-amber-950 hover:bg-amber-100"
        >
          {counts.expiring === 1
            ? `1 verified calibration expires within ${CALIBRATION_EXPIRY_WARNING_DAYS} days.`
            : `${counts.expiring} verified calibrations expire within ${CALIBRATION_EXPIRY_WARNING_DAYS} days.`}{' '}
          Record a new calibration before then. <span className="font-semibold underline">Show</span>
        </button>
      ) : null}
      <MessageLine tone="error" text={equipmentError} />

      <MicroscopeCalibrationTable
        rows={visible}
        loading={loading}
        error={error}
        filtered={filter !== 'all' || search.trim() !== ''}
        today={today}
        equipmentById={equipmentById}
        canEdit={canEdit}
        userId={user?.id ?? null}
        isDirector={isDirector}
        onOpen={(c) => openForm(c)}
      />

      <MicroscopeCalibrationFooterBar
        message={formTarget ? null : message}
        shownCount={visible.length}
        totalCount={rows.length}
        awaitingVerification={counts.drafts}
        expiringSoon={counts.expiring}
        disabled={loading}
        onExport={handleExport}
        onPrint={handlePrint}
      />

      {formTarget ? (
        <MicroscopeCalibrationForm
          key={formTarget.key}
          open
          onOpenChange={(o) => {
            if (!o) setFormTarget(null)
          }}
          calibration={formTarget.calibration}
          equipment={equipment}
          equipmentById={equipmentById}
          canEdit={canEdit}
          isDirector={isDirector}
          userId={user?.id ?? null}
          notice={message}
          onChanged={handleChanged}
        />
      ) : null}
    </>
  )
}

export default function MicroscopeCalibrationMasterPage() {
  const { state } = useMetallographySwitch()
  return (
    <div className={limsPageShellClass}>
      {state === 'on' ? (
        <CalibrationRegister />
      ) : (
        <>
          <EnvHeader title="Microscope Calibration (µm/px)" clause="6.4 · 6.5" />
          <MetallographyGate state={state}>{null}</MetallographyGate>
        </>
      )}
    </div>
  )
}
