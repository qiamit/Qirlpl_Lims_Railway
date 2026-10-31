import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, CopyPlus, ExternalLink, FileDown, Loader2, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { equipmentSnapshotsOf, formatEquipmentUsed, parseEquipmentUsed } from '@/lib/equipmentTraceability'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { limsDarkBarGlowStyle, limsDeleteBtnClass, limsDialogClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { EnvPanel, MessageLine, envTdClass, envThClass } from '@/features/environment/EnvironmentUi'
import { useModuleAccessOptional } from '@/features/settings/module-access/ModuleAccessProvider'
import { AnalysisStatusBadge, IndicativeBadge, MetallographyMissingNotice } from '../MetallographyUi'
import { computeRing } from '../engines/ringTest/ringMaths'
import { RING_SHARE_DECIMALS, RING_TEST_ENGINE_VERSION, RING_THICKNESS_DECIMALS, scaleToMmPerPx, type RingTestSummary } from '../engines/types'
import { formatMetallographyResult } from '../formatResult'
import {
  fetchCanRecheck,
  getAnalysis,
  getAnalysisRow,
  metallographyErrorText,
  recordRecheck,
  setAnalysisIncludeInReport,
  supersedeAnalysis,
  voidAnalysis,
} from '../metallographyApi'
import { signedObjectUrl, verifyStoredHash } from '../metallographyStorage'
import {
  ANALYSIS_KIND_LABEL,
  ANALYSIS_PURPOSE_LABEL,
  RING_TEST_DEFAULT_SETTINGS,
  type Analysis,
  type AnalysisDetail,
  type RecheckDetails,
} from '../types'
import { FieldStrip } from '../workbench/FieldStrip'
import { ImageEditToolbar, type StageTool } from '../workbench/ImageEditToolbar'
import { ImageStage } from '../workbench/ImageStage'
import { ResultPanel } from '../workbench/ResultPanel'
import { DEFAULT_DISPLAY, fitDisplay, normalizeDisplay, resetDisplay, zoomAt, type Display } from '../workbench/displayAdjustments'
import {
  checkFieldOriginals,
  objectUrlFor,
  releaseObjectUrls,
  scaleInputFromAnalysis,
  type FieldMedia,
} from '../workbench/imageCanvasUtils'
import { ringGeometryFromMarks } from '../workbench/panels/ring/ringMarks'
import { printMetallographyWorksheet } from '../worksheet/metallographyWorksheetHtml'

/**
 * S3 analysis view (design 3.3): read-only record of a completed, superseded
 * or void analysis. Originals (downloaded and re-hashed on open) with their
 * marks, scale snapshot, equipment, result and statistics, engine version,
 * hashes, supersede chain and re-checks.
 *
 * Re-check (assigned reviewer, QM or Director, never the analyst): downloads
 * every original again, verifies its SHA-256, re-runs the STORED engine
 * version on the stored geometry and scale, compares with result_summary at
 * the stored rounding and stamps metallography_rechecks.
 */

const ANALYSES_PATH = '/metallography/analyses'

export type MetallographyAnalysisViewProps = {
  analysisId: string
  /** Show the Re-check action when fetchCanRecheck() is true. Default true. */
  allowRecheck?: boolean
  /** Called after supersede / void so the parent can reload or navigate. */
  onChanged?: (a: Analysis) => void
}

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'notfound' }
  | { status: 'error'; message: string }
  | { status: 'ok'; detail: AnalysisDetail; supersededByNo: string | null }

const isRing = (s: unknown): s is RingTestSummary => Boolean(s) && (s as { kind?: unknown }).kind === 'ring_test'

/** |a − b| within half a unit of `decimals` (the stored rounding). */
function near(a: number | null | undefined, b: number | null | undefined, decimals: number): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return a === b
  return Math.abs(a - b) <= 0.5 * 10 ** -decimals + 1e-9
}

/**
 * Re-check of one analysis. Never throws for a difference: the outcome is
 * recorded as match = false with the reasons.
 */
async function runRecheck(detail: AnalysisDetail): Promise<{ match: boolean; details: RecheckDetails }> {
  const a = detail.analysis
  const hashes = await Promise.all(
    detail.fields.map(async (f) => {
      const r = await verifyStoredHash(f.rawImagePath, f.rawImageSha256)
      return { field_no: f.fieldNo, expected: f.rawImageSha256, actual: r.actual, ok: r.ok }
    }),
  )
  const hashesVerified = hashes.length > 0 && hashes.every((h) => h.ok)
  const differences: string[] = []
  if (hashes.length === 0) differences.push('The analysis has no images.')
  for (const h of hashes) if (!h.ok) differences.push(`Field ${h.field_no}: the original does not match its recorded SHA-256.`)

  const summary = a.resultSummary
  const engineVersion = a.engineVersion ?? (isRing(summary) ? summary.engine_version : '') ?? ''
  let recomputedValue: string | null = null

  if (a.kind !== 'ring_test') {
    differences.push(`There is no ${ANALYSIS_KIND_LABEL[a.kind].toLowerCase()} engine in this build.`)
  } else if (!isRing(summary)) {
    differences.push('No stored ring-test result.')
  } else if (engineVersion !== RING_TEST_ENGINE_VERSION) {
    differences.push(`Engine ${engineVersion || '(none)'} is not in this build (${RING_TEST_ENGINE_VERSION}); it cannot be re-run here.`)
  } else {
    const settings = { ...RING_TEST_DEFAULT_SETTINGS, ...(a.methodSnapshot?.settings ?? {}) }
    const defaults = {
      angularCorrectionDeg: settings.angular_correction_deg,
      outerGapPx: settings.outer_gap_px,
      innerGapPx: settings.inner_gap_px,
    }
    const field = detail.fields.find((f) => !f.excluded && ringGeometryFromMarks(f.marks.items, defaults))
    const geometry = field ? ringGeometryFromMarks(field.marks.items, defaults) : null
    const scale = scaleInputFromAnalysis(a)
    const dMm = summary.d_nominal_mm ?? summary.d_mm
    if (!geometry) differences.push('The ring geometry is not stored with the image.')
    else if (!scale) differences.push('The analysis has no stored scale.')
    else {
      try {
        const re = computeRing(geometry, scale, dMm, summary.limits)
        const td = summary.thickness_decimals ?? RING_THICKNESS_DECIMALS
        const sd = summary.share_decimals ?? RING_SHARE_DECIMALS
        if (!near(re.d_mm, summary.d_mm, td)) differences.push(`d: stored ${summary.d_mm}, re-run ${re.d_mm}`)
        for (const p of summary.thickness) {
          const q = re.thickness.find((x) => x.label === p.label)
          if (!q || !near(q.thickness_mm, p.thickness_mm, td)) {
            differences.push(`${p.label}: stored ${p.thickness_mm ?? '—'} mm, re-run ${q?.thickness_mm ?? '—'} mm`)
          }
        }
        if (re.valid_point_count !== summary.valid_point_count) {
          differences.push(`Valid points: stored ${summary.valid_point_count}, re-run ${re.valid_point_count}`)
        }
        if (!near(re.area_tm_mm2, summary.area_tm_mm2, 4)) differences.push(`TM area: stored ${summary.area_tm_mm2}, re-run ${re.area_tm_mm2} mm²`)
        if (!near(re.area_fp_mm2, summary.area_fp_mm2, 4)) differences.push(`F&P area: stored ${summary.area_fp_mm2}, re-run ${re.area_fp_mm2} mm²`)
        if (!near(re.tm_share_pct, summary.tm_share_pct, sd)) differences.push(`TM share: stored ${summary.tm_share_pct} %, re-run ${re.tm_share_pct} %`)
        if (re.overall_pass !== summary.overall_pass) differences.push(`Verdict: stored ${summary.overall_pass ? 'PASS' : 'FAIL'}, re-run ${re.overall_pass ? 'PASS' : 'FAIL'}`)
        recomputedValue = formatMetallographyResult({
          kind: a.kind,
          summary: re,
          reportedUnit: a.reportedUnit,
          decimals: a.methodSnapshot?.decimals ?? null,
        }).results
        if (recomputedValue !== (a.reportedValue ?? '')) differences.push('The reported value re-built from the re-run differs from the stored one.')
      } catch (e) {
        differences.push(`Re-run failed: ${metallographyErrorText(e)}`)
      }
    }
  }

  const match = hashesVerified && differences.length === 0
  return {
    match,
    details: {
      hashes_verified: hashesVerified,
      engine_version: engineVersion || '',
      hashes,
      recomputed_value: recomputedValue,
      stored_value: a.reportedValue,
      differences,
      note: match ? 'Originals verified and the stored engine re-run gives the same result.' : undefined,
    },
  }
}

export function MetallographyAnalysisView({ analysisId, allowRecheck = true, onChanged }: MetallographyAnalysisViewProps) {
  const { user, designation, profileName } = useAuth()
  const isDirector = isLaboratoryDirector(designation)
  const moduleAccess = useModuleAccessOptional()
  const canEditModule = !moduleAccess || moduleAccess.loading || moduleAccess.canEditPath(ANALYSES_PATH)
  const ask = useReasonForChange()

  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [media, setMedia] = useState<Record<string, FieldMedia>>({})
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null)
  const [display, setDisplay] = useState<Display>(DEFAULT_DISPLAY)
  const [tool, setTool] = useState<StageTool>('select')
  const [canRecheck, setCanRecheck] = useState(false)
  const [busy, setBusy] = useState<null | 'recheck' | 'print' | 'supersede' | 'void' | 'include'>(null)
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' | 'ok' } | null>(null)
  const blobsRef = useRef(new Set<Blob>())
  const seqRef = useRef(0)

  useEffect(() => {
    const blobs = blobsRef.current
    return () => releaseObjectUrls(blobs)
  }, [])

  const load = useCallback(async () => {
    const seq = ++seqRef.current
    try {
      const res = await getAnalysis(analysisId)
      if (seq !== seqRef.current) return
      if (res.status === 'missing') return setState({ status: 'missing' })
      if (!res.data) return setState({ status: 'notfound' })
      const detail = res.data
      const supersededBy = detail.analysis.supersededBy ? await getAnalysisRow(detail.analysis.supersededBy) : null
      if (seq !== seqRef.current) return
      setState({
        status: 'ok',
        detail,
        supersededByNo: supersededBy?.status === 'ok' ? (supersededBy.data?.analysisNo ?? null) : null,
      })
      const first = detail.fields.find((f) => !f.excluded) ?? detail.fields[0] ?? null
      setActiveFieldId((cur) => (cur && detail.fields.some((f) => f.id === cur) ? cur : (first?.id ?? null)))
      setDisplay(normalizeDisplay(first?.displaySettings))
      setMedia(Object.fromEntries(detail.fields.map((f) => [f.id, { status: 'checking', blob: null, actual: null } as FieldMedia])))
      if (allowRecheck && (detail.analysis.status === 'completed' || detail.analysis.status === 'superseded')) {
        void fetchCanRecheck(analysisId)
          .then((v) => seq === seqRef.current && setCanRecheck(v))
          .catch(() => setCanRecheck(false))
      }
      await checkFieldOriginals(detail.fields, (fieldId, m) => {
        if (seq !== seqRef.current) return
        if (m.blob) blobsRef.current.add(m.blob)
        setMedia((prev) => ({ ...prev, [fieldId]: m }))
      })
    } catch (e) {
      if (seq === seqRef.current) setState({ status: 'error', message: metallographyErrorText(e) })
    }
  }, [analysisId, allowRecheck])

  useEffect(() => {
    void load()
  }, [load])

  const detail = state.status === 'ok' ? state.detail : null
  const a = detail?.analysis ?? null
  const fields = useMemo(() => detail?.fields ?? [], [detail])
  const field = fields.find((f) => f.id === activeFieldId) ?? null
  const fieldMedia = field ? media[field.id] : undefined
  const scale = a ? scaleInputFromAnalysis(a) : null
  const mismatch = fields.some((f) => media[f.id]?.status === 'mismatch' || media[f.id]?.status === 'error')
  const formatted = useMemo(
    () =>
      a?.resultSummary
        ? formatMetallographyResult({
            kind: a.kind,
            summary: a.resultSummary,
            reportedUnit: a.reportedUnit,
            decimals: a.methodSnapshot?.decimals ?? null,
          })
        : null,
    [a],
  )
  const equipment = useMemo(() => equipmentSnapshotsOf(parseEquipmentUsed(a?.equipmentSnapshot ?? [])), [a])
  const isAnalyst = Boolean(a && user && a.performedBy === user.id)
  const canChange = canEditModule && (isAnalyst || isDirector)

  const doRecheck = async () => {
    if (!detail) return
    setBusy('recheck')
    setMessage(null)
    try {
      const { match, details } = await runRecheck(detail)
      await recordRecheck(detail.analysis.id, match, details)
      setMessage(
        match
          ? { text: 'Re-check recorded: originals verified and the result matches.', tone: 'ok' }
          : { text: `Re-check recorded: does not match. ${(details.differences ?? []).join(' ')}`, tone: 'error' },
      )
      await load()
    } catch (e) {
      setMessage({ text: metallographyErrorText(e), tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const doPrint = async () => {
    if (!detail) return
    setBusy('print')
    setMessage(null)
    try {
      await printMetallographyWorksheet(detail, { printedByName: profileName })
    } catch (e) {
      setMessage({ text: metallographyErrorText(e), tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const doSupersede = async () => {
    if (!a) return
    if (!window.confirm(`Start a new analysis that replaces ${a.analysisNo}? The images are copied; ${a.analysisNo} stays valid until the new one is completed.`)) return
    setBusy('supersede')
    setMessage(null)
    try {
      const next = await supersedeAnalysis(a.id)
      setMessage({ text: `${next.analysisNo} started.`, tone: 'ok' })
      onChanged?.(next)
    } catch (e) {
      setMessage({ text: metallographyErrorText(e), tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const doVoid = async () => {
    if (!a) return
    const reason = await ask({ title: 'Reason for voiding the analysis', recordLabel: a.analysisNo ?? undefined, confirmLabel: 'Void' })
    if (!reason) return
    setBusy('void')
    setMessage(null)
    try {
      const next = await voidAnalysis(a.id, reason)
      await recordReason('metallography_analyses', a.id, reason)
      onChanged?.(next)
      await load()
    } catch (e) {
      setMessage({ text: metallographyErrorText(e), tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const doIncludeInReport = async (include: boolean) => {
    if (!a) return
    setBusy('include')
    setMessage(null)
    try {
      await setAnalysisIncludeInReport(a.id, include)
      await load()
    } catch (e) {
      setMessage({ text: metallographyErrorText(e), tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const openOverlay = async (path: string) => {
    const w = window.open('', '_blank')
    try {
      const url = await signedObjectUrl(path)
      if (w) w.location.href = url
      else window.open(url, '_blank', 'noopener')
    } catch (e) {
      w?.close()
      setMessage({ text: metallographyErrorText(e), tone: 'error' })
    }
  }

  if (state.status === 'loading') {
    return (
      <p className="flex items-center gap-2 p-3 text-[13px] text-stone-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading analysis…
      </p>
    )
  }
  if (state.status === 'missing') return <MetallographyMissingNotice />
  if (state.status === 'notfound') return <MessageLine tone="error" text="Analysis not found, or you cannot see it." />
  if (state.status === 'error') return <MessageLine tone="error" text={state.message} />
  if (!detail || !a) return <></>

  const ctx = detail.context
  const snap = a.methodSnapshot
  const sc = a.scaleSnapshot
  const included = fields.filter((f) => !f.excluded).length

  return (
    <div className="space-y-3">
      <EnvPanel
        title={
          <span className="flex flex-wrap items-center gap-2">
            {a.analysisNo ?? 'Analysis'} · {ANALYSIS_KIND_LABEL[a.kind]}
          </span>
        }
        right={
          <div className="flex flex-wrap items-center gap-1.5">
            <AnalysisStatusBadge status={a.status} />
            {a.indicative ? <IndicativeBadge /> : null}
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-4">
          <Info label="SRF" value={ctx?.srfNumber} />
          <Info label="Parameter" value={ctx?.testLabel} />
          <Info label="Standard" value={snap?.standard_ref} />
          <Info label="Purpose" value={ANALYSIS_PURPOSE_LABEL[a.purpose]} />
          <Info label="Test date" value={formatDate(a.testDate)} />
          <Info label="Performed by" value={a.performedByName} />
          <Info label="Completed" value={a.completedAt ? formatDateTime(a.completedAt) : null} />
          <Info label="Engine" value={a.engineVersion} mono />
        </div>
        {a.status === 'void' ? <p className="mt-2 text-[12.5px] text-red-800">Void: {a.voidReason}</p> : null}
        {a.supersededBy ? (
          <p className="mt-2 text-[12.5px]">
            Superseded by{' '}
            <Link className="font-semibold text-amber-800 underline" to={`${ANALYSES_PATH}/${a.supersededBy}`}>
              {state.supersededByNo ?? 'the newer analysis'}
            </Link>
            .
          </p>
        ) : null}
        {a.overrideReason ? <p className="mt-2 text-[12.5px] text-amber-900">Director override: {a.overrideReason}</p> : null}
        {ctx && a.status === 'completed' ? (
          <p className="mt-2 text-[12.5px] text-stone-700">
            {ctx.linkedAnalysisId === a.id ? 'This analysis gives the saved result.' : 'Not yet used as the result in Enter Results.'}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {canRecheck ? (
            <button type="button" className={cn(limsPrimaryBtnClass, 'inline-flex items-center gap-1.5 text-[12.5px]')} disabled={busy !== null} onClick={() => void doRecheck()}>
              {busy === 'recheck' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Re-check
            </button>
          ) : null}
          <button type="button" className={cn(limsOutlineBtnClass, 'inline-flex items-center gap-1.5 border text-[12.5px]')} disabled={busy !== null} onClick={() => void doPrint()}>
            {busy === 'print' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Print worksheet
          </button>
          {a.status === 'completed' && canChange ? (
            <button type="button" className={cn(limsPrimaryBtnClass, 'inline-flex items-center gap-1.5 text-[12.5px]')} disabled={busy !== null || (ctx?.locked ?? false)} onClick={() => void doSupersede()}>
              {busy === 'supersede' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CopyPlus className="h-4 w-4" />} Supersede
            </button>
          ) : null}
          {a.status === 'completed' && canChange ? (
            <button type="button" className={cn(limsDeleteBtnClass, 'inline-flex items-center px-3 text-[12.5px]')} disabled={busy !== null || (ctx?.locked ?? false)} onClick={() => void doVoid()}>
              {busy === 'void' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Void
            </button>
          ) : null}
          {a.status === 'completed' && canEditModule ? (
            <label className="inline-flex items-center gap-1.5 text-[12.5px] text-stone-700">
              <input type="checkbox" checked={a.includeInReport} disabled={busy !== null} onChange={(e) => void doIncludeInReport(e.target.checked)} />
              Micrographs in the report annex
            </label>
          ) : null}
        </div>
        {ctx?.locked && a.status === 'completed' ? (
          <p className="mt-2 text-[12px] text-stone-600">The result is under review, approved or issued: refer it back before changing this analysis.</p>
        ) : null}
        <div className="mt-2">
          <MessageLine text={message?.text ?? null} tone={message?.tone} />
        </div>
      </EnvPanel>

      {mismatch ? (
        <p role="alert" className="flex items-start gap-2 border-2 border-red-600 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          An original image does not match its recorded SHA-256 (or cannot be read). Do not rely on this analysis; tell the Quality Manager.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)_340px]">
        <EnvPanel title="Fields">
          <FieldStrip
            fields={fields}
            media={media}
            activeFieldId={activeFieldId}
            onSelect={(id) => {
              setActiveFieldId(id)
              setDisplay(normalizeDisplay(fields.find((f) => f.id === id)?.displaySettings))
            }}
            readOnly
            minFields={snap?.min_fields ?? 1}
          />
        </EnvPanel>

        <section className="min-w-0 overflow-hidden border-2 border-stone-500">
          <ImageEditToolbar
            tool={tool}
            onToolChange={setTool}
            display={display}
            onDisplayChange={setDisplay}
            onZoom={(f) => setDisplay((d) => zoomAt(d, f, 0, 0, 0, 0))}
            onFit={() => setDisplay((d) => fitDisplay(d))}
            onResetView={() => setDisplay(resetDisplay())}
            drawingDisabled
            allowScaleLine={false}
            annotationColor="#facc15"
            onAnnotationColorChange={() => undefined}
            disabled={!fieldMedia?.blob}
          />
          <ImageStage
            imageUrl={fieldMedia?.blob ? objectUrlFor(fieldMedia.blob) : null}
            width={field?.imageWidthPx ?? 0}
            height={field?.imageHeightPx ?? 0}
            display={display}
            onDisplayChange={setDisplay}
            tool={tool}
            readOnly
            marks={field?.marks.items ?? []}
            adjustments={field?.operatorAdjustments ?? null}
            annotations={field?.annotations ?? []}
            scaleLines={a.inImageScale && (a.inImageScale.field_no ?? field?.fieldNo) === field?.fieldNo ? a.inImageScale.lines : null}
            mmPerPx={scale ? scaleToMmPerPx(scale) : null}
            loading={fieldMedia?.status === 'checking'}
            emptyText={fieldMedia?.status === 'error' ? `The original could not be read: ${fieldMedia.error ?? ''}` : undefined}
          />
          {field?.renderedOverlayPath ? (
            <div className="border-t border-stone-300 bg-stone-50 px-2 py-1.5 text-[12px]">
              <button type="button" className="inline-flex items-center gap-1 font-semibold text-amber-800 hover:underline" onClick={() => void openOverlay(field.renderedOverlayPath as string)}>
                <ExternalLink className="h-3.5 w-3.5" /> Rendered overlay (PNG)
              </button>
            </div>
          ) : null}
        </section>

        <div className="space-y-3">
          <EnvPanel title="Result">
            <ResultPanel
              kind={a.kind}
              summary={a.resultSummary}
              formatted={formatted}
              storedReportedValue={a.reportedValue}
              reportedUnit={a.reportedUnit}
              includedFields={included}
              minFields={snap?.min_fields ?? 1}
              minCountsPerField={snap?.min_counts_per_field ?? null}
              indicative={a.indicative}
            />
          </EnvPanel>
          <EnvPanel title="Scale and equipment">
            <div className="space-y-1 text-[12.5px]">
              {sc ? (
                <>
                  <div>
                    <span className="font-semibold">{sc.cal_code}</span> · {sc.objective}
                    {sc.total_magnification ? ` · ${sc.total_magnification}×` : ''}
                  </div>
                  <div className="tabular-nums">
                    x {sc.um_per_px_x.toFixed(6)} · y {sc.um_per_px_y.toFixed(6)} µm/px
                    {sc.u_rel_scale !== null ? ` · u_rel ${sc.u_rel_scale.toFixed(2)} %` : ''}
                  </div>
                  <div>
                    {sc.image_width_px}×{sc.image_height_px} px · valid {formatDate(sc.valid_from)} to {formatDate(sc.valid_until)}
                  </div>
                  <div>Verified by {sc.verified_by_name ?? '—'}</div>
                </>
              ) : a.inImageScale ? (
                <div>
                  In-image reference: {a.inImageScale.lines.length} line(s)
                  {a.inImageScale.mm_per_px ? `, ${(a.inImageScale.mm_per_px * 1000).toFixed(4)} µm/px` : ''}
                </div>
              ) : (
                <div className="text-red-800">No scale recorded.</div>
              )}
              <div className="pt-1">Magnification {a.magnification || '—'} · etchant {a.etchant || '—'}</div>
              <ul className="list-disc space-y-0.5 pl-4 pt-1">
                {equipment.length ? equipment.map((q) => <li key={q.equipment_id}>{formatEquipmentUsed(q)}</li>) : <li>No equipment snapshot.</li>}
              </ul>
            </div>
          </EnvPanel>
        </div>
      </div>

      <EnvPanel title="Originals (SHA-256)">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className={envThClass}>Field</th>
                <th className={envThClass}>File</th>
                <th className={envThClass}>Recorded SHA-256</th>
                <th className={envThClass}>Check on open</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => {
                const m = media[f.id]
                return (
                  <tr key={f.id}>
                    <td className={cn(envTdClass, 'text-center')}>{f.fieldNo}</td>
                    <td className={envTdClass}>
                      {f.originalFileName ?? '—'}
                      {f.excluded ? <span className="ml-1 text-red-800">(excluded: {f.excludeReason})</span> : null}
                    </td>
                    <td className={cn(envTdClass, 'break-all font-mono text-[11px]')}>{f.rawImageSha256}</td>
                    <td className={cn(envTdClass, 'whitespace-nowrap')}>
                      {!m || m.status === 'checking' ? (
                        <span className="inline-flex items-center gap-1 text-stone-600">
                          <Loader2 className="h-3 w-3 animate-spin" /> Checking
                        </span>
                      ) : m.status === 'ok' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-800">
                          <ShieldCheck className="h-3.5 w-3.5" /> Matches
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-red-800" title={m.actual ?? m.error ?? undefined}>
                          <ShieldAlert className="h-3.5 w-3.5" /> {m.status === 'mismatch' ? 'Does not match' : 'Not readable'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </EnvPanel>

      <EnvPanel title="Re-checks">
        {detail.rechecks.length === 0 ? (
          <p className="text-[12.5px] text-stone-600">No re-check yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className={envThClass}>Run at</th>
                  <th className={envThClass}>By</th>
                  <th className={envThClass}>Engine</th>
                  <th className={envThClass}>Hashes</th>
                  <th className={envThClass}>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {detail.rechecks.map((r) => {
                  const d = r.details as RecheckDetails
                  return (
                    <tr key={r.id}>
                      <td className={envTdClass}>{formatDateTime(r.runAt)}</td>
                      <td className={envTdClass}>{r.runByName ?? '—'}</td>
                      <td className={cn(envTdClass, 'font-mono text-[11px]')}>{r.engineVersion ?? '—'}</td>
                      <td className={envTdClass}>{r.hashesVerified ? 'Verified' : 'Not verified'}</td>
                      <td className={envTdClass}>
                        <span className={cn('font-semibold', r.match ? 'text-emerald-800' : 'text-red-800')}>{r.match ? 'Matches' : 'Differs'}</span>
                        {d?.differences?.length ? <div className="text-[11.5px] text-stone-600">{d.differences.join(' · ')}</div> : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </EnvPanel>
    </div>
  )
}

function Info({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className={cn('truncate text-stone-900', mono && 'font-mono text-[11.5px]')} title={value ?? undefined}>
        {value || '—'}
      </div>
    </div>
  )
}

/** Same view in a stacked dialog ("View analysis" in Results Under Review). */
export function MetallographyAnalysisViewDialog({
  open,
  onOpenChange,
  analysisId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  analysisId: string
}) {
  const moduleAccess = useModuleAccessOptional()
  // Opens in a new tab so the review screen stays as it is; hidden without access to the page.
  const canOpenFullPage = !moduleAccess || moduleAccess.loading || moduleAccess.canAccessPath(ANALYSES_PATH)
  const [currentId, setCurrentId] = useState(analysisId)
  const [prevId, setPrevId] = useState(analysisId)
  if (prevId !== analysisId) {
    setPrevId(analysisId)
    setCurrentId(analysisId)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          '!fixed !left-0 !top-0 !flex !h-[100dvh] !max-h-[100dvh] !w-full !max-w-none !translate-x-0 !translate-y-0 !flex-col !gap-0 !overflow-hidden !border-0 !p-0',
          'lg:!left-[268px] lg:!w-[calc(100vw-268px)] lg:!max-w-[calc(100vw-268px)]',
        )}
        onPointerDownOutside={(e) => {
          if (e.target instanceof Element && e.target.closest('[data-reason-for-change-root]')) e.preventDefault()
        }}
      >
        <div className="relative shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white">Metallography analysis</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-2 text-[12px] text-stone-300">
              Read-only record with the original images and their hashes.
              {canOpenFullPage ? (
                <Link
                  to={`${ANALYSES_PATH}/${currentId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-amber-200 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open in full page
                </Link>
              ) : null}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f3eb] p-2 sm:p-3">
          {open ? (
            <MetallographyAnalysisView
              key={currentId}
              analysisId={currentId}
              onChanged={(next) => {
                if (next.id !== currentId) setCurrentId(next.id)
              }}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
