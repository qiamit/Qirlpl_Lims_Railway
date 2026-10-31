import { escapeHtml } from '@/lib/htmlText'
import {
  equipmentSnapshotsOf,
  loadEquipmentOptions,
  parseEquipmentUsed,
  snapshotFromOption,
  type EquipmentUsedSnapshot,
} from '@/lib/equipmentTraceability'
import { supabase } from '@/lib/supabaseClient'
import { formatDate, formatDateTime } from '@/lib/utils'
import { parseLabSettingsRow, resolveLabSettingsRowId } from '@/features/settings/lab-settings/labSettingsDb'
import { embedPrintImageAsDataUrl } from '@/features/sample-handling/report-preparation/embedPrintImages'
import { getReportedTestResult } from '@/features/sample-handling/sample-under-testing/testResultValues'
import { RING_SHARE_DECIMALS, RING_THICKNESS_DECIMALS, type RingTestSummary } from '../engines/types'
import { METALLOGRAPHY_BUCKET } from '../metallographyStorage'
import {
  ANALYSIS_KIND_LABEL,
  ANALYSIS_PURPOSE_LABEL,
  ANALYSIS_STATUS_LABEL,
  type AnalysisDetail,
  type RecheckDetails,
} from '../types'
import { downscaleDataUrl } from '../workbench/imageCanvasUtils'

/**
 * S7 worksheet: the internal raw-data record of one analysis (design 3.3 S7,
 * replaces the old services/reports.py). Letterhead; SRF, parameter, standard;
 * scale calibration and equipment with asset codes, certificates and due dates;
 * engine version and SHA-256 of every original; per-field thumbnails with
 * marks; values, statistics and the reported value; performed / completed /
 * reviewed by. Images are embedded as data URLs so pdf-service (Playwright)
 * never fetches from storage.
 */

export type MetallographyWorksheetInput = {
  detail: AnalysisDetail
  /** EquipmentUsedSnapshot[] for microscope, camera, stage micrometer / ruler (asset code, certificate, due date). */
  equipment: EquipmentUsedSnapshot[]
  /** Per field: original and overlay as data URLs (embedPrintImageAsDataUrl(path, 'metallography-images')). */
  images: Array<{ fieldNo: number; originalDataUrl: string | null; overlayDataUrl: string | null }>
  letterheadHtml?: string | null
  reviewedByName?: string | null
  printedByName?: string | null
}

const e = escapeHtml

const isRing = (s: unknown): s is RingTestSummary => Boolean(s) && (s as { kind?: unknown }).kind === 'ring_test'

function fx(v: number | null | undefined, d: number): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d)
}

function row(label: string, value: string | null | undefined): string {
  return `<tr><th>${e(label)}</th><td>${value === null || value === undefined || value === '' ? '—' : value}</td></tr>`
}

function ringHtml(s: RingTestSummary): string {
  const td = s.thickness_decimals ?? RING_THICKNESS_DECIMALS
  const sd = s.share_decimals ?? RING_SHARE_DECIMALS
  const points = s.thickness
    .map((p) => `<tr><td class="c">${e(p.label)}</td><td class="r">${fx(p.angle_deg, 1)}</td><td class="r">${fx(p.thickness_mm, td)}</td></tr>`)
    .join('')
  return `
    <div class="cols">
      <table class="grid narrow"><thead><tr><th>Point</th><th>Angle °</th><th>t (mm)</th></tr></thead><tbody>${points}</tbody></table>
      <table class="kv">
        ${row('d used', `${fx(s.d_mm, 2)} mm (${e(s.d_source)})`)}
        ${row('Thickness limits', `${fx(s.thickness_range_low_mm, td)} – ${fx(s.thickness_range_high_mm, td)} mm (${s.limits.thickness_min_factor} d – ${s.limits.thickness_max_factor} d, ${s.limits.limits_inclusive ? 'inclusive' : 'exclusive'})`)}
        ${row('Valid points', `${s.valid_point_count} of 8`)}
        ${row('Min / mean / max', `${fx(s.thickness_min_mm, td)} / ${fx(s.thickness_mean_mm, td)} / ${fx(s.thickness_max_mm, td)} mm`)}
        ${row('Area TM / F&amp;P', `${fx(s.area_tm_mm2, 3)} / ${fx(s.area_fp_mm2, 3)} mm²`)}
        ${row('TM share', `${fx(s.tm_share_pct, sd)} % (limits ${s.limits.tm_share_min_pct}–${s.limits.tm_share_max_pct} %)`)}
        ${row('Scale used', `${s.scale_source === 'calibration' ? 'Calibration' : 'In-image line'}, ${(s.mm_per_px_x * 1000).toFixed(4)} µm/px`)}
        ${row('Engine verdict', `${s.overall_pass ? 'PASS' : 'FAIL'} <span class="muted">(shown only; not the conformity statement)</span>`)}
      </table>
    </div>`
}

export function buildMetallographyWorksheetHtml(input: MetallographyWorksheetInput): string {
  const { detail, equipment, images, letterheadHtml, reviewedByName, printedByName } = input
  const a = detail.analysis
  const snap = a.methodSnapshot
  const sc = a.scaleSnapshot
  const ctx = detail.context
  const prep = a.specimenPrep ?? {}
  const imgByField = new Map(images.map((i) => [i.fieldNo, i]))

  const scaleRows = sc
    ? [
        row('Calibration', `${e(sc.cal_code)} (${e(sc.status)})`),
        row('µm per pixel', `x ${sc.um_per_px_x.toFixed(6)} · y ${sc.um_per_px_y.toFixed(6)}${sc.u_rel_scale !== null ? ` · u<sub>rel</sub> ${sc.u_rel_scale.toFixed(2)} %` : ''}`),
        row('Objective / magnification', `${e(sc.objective)}${sc.total_magnification ? ` · ${sc.total_magnification}×` : ''}`),
        row('Image size', `${sc.image_width_px} × ${sc.image_height_px} px`),
        row('Valid', `${e(formatDate(sc.valid_from))} to ${e(formatDate(sc.valid_until))}`),
        row('Performed / verified by', `${e(sc.performed_by_name ?? '—')} / ${e(sc.verified_by_name ?? '—')}${sc.verified_at ? ` (${e(formatDate(sc.verified_at))})` : ''}`),
      ].join('')
    : a.inImageScale
      ? [
          row(
            'In-image reference',
            a.inImageScale.lines
              .map((l, i) => `Line ${i + 1}: ${l.length_mm} mm over ${fx(l.length_px ?? Math.hypot(l.x2 - l.x1, l.y2 - l.y1), 1)} px`)
              .map(e)
              .join('<br/>'),
          ),
          row('mm per pixel', a.inImageScale.mm_per_px ? a.inImageScale.mm_per_px.toFixed(8) : '—'),
        ].join('')
      : row('Scale', '<b>Not set</b>')

  const equipmentRows = equipment.length
    ? equipment
        .map(
          (q) =>
            `<tr><td>${e(q.asset_code)}</td><td>${e(q.name)}</td><td>${e(q.cal_cert_no ?? '—')}</td><td>${e(formatDate(q.cal_due_date) || '—')}</td><td>${
              q.usable === false ? `Not usable: ${e(q.reason ?? '')}${q.override_reason ? ` (override: ${e(q.override_reason)})` : ''}` : 'Usable'
            }</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="5" class="muted">No equipment recorded.</td></tr>'

  const fieldRows = detail.fields
    .map(
      (f) => `<tr${f.excluded ? ' class="excl"' : ''}>
        <td class="c">${f.fieldNo}</td>
        <td>${e(f.originalFileName ?? '')}<br/><span class="muted">${f.imageWidthPx ?? '?'} × ${f.imageHeightPx ?? '?'} px · ${f.rawImageBytes ? Math.round(f.rawImageBytes / 1024) : '?'} KB</span></td>
        <td class="mono">${e(f.rawImageSha256)}</td>
        <td>${e(f.capturedAt ? formatDateTime(f.capturedAt) : '—')}<br/>${e(f.locationOnSpecimen ?? '')}</td>
        <td>${f.excluded ? `Excluded: ${e(f.excludeReason ?? '')}` : 'In use'}</td>
      </tr>`,
    )
    .join('')

  const thumbs = detail.fields
    .map((f) => {
      const im = imgByField.get(f.fieldNo)
      const pic = (src: string | null | undefined, cap: string) =>
        src ? `<figure><img src="${e(src)}" alt=""/><figcaption>${e(cap)}</figcaption></figure>` : ''
      const body = pic(im?.overlayDataUrl, `Field ${f.fieldNo} with marks`) + pic(im?.originalDataUrl, `Field ${f.fieldNo} original`)
      return body ? `<div class="thumbs">${body}</div>` : ''
    })
    .join('')

  const summary = a.resultSummary
  const resultBlock = isRing(summary)
    ? ringHtml(summary)
    : summary
      ? `<pre class="mono">${e(JSON.stringify(summary, null, 2))}</pre>`
      : '<p class="muted">No result.</p>'

  const rechecks = detail.rechecks.length
    ? detail.rechecks
        .map((r) => {
          const d = r.details as RecheckDetails
          return `<tr><td>${e(formatDateTime(r.runAt))}</td><td>${e(r.runByName ?? '—')}</td><td>${e(r.engineVersion ?? '—')}</td><td>${r.hashesVerified ? 'Yes' : 'No'}</td><td>${r.match ? 'Match' : '<b>Differs</b>'}${
            d?.differences?.length ? `<br/><span class="muted">${e(d.differences.join('; '))}</span>` : ''
          }</td></tr>`
        })
        .join('')
    : ''

  const completedBy = a.completedAt ? `${a.completedBy && a.completedBy === a.performedBy ? e(a.performedByName ?? '') : '—'} (${e(formatDateTime(a.completedAt))})` : '—'

  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>${e(a.analysisNo ?? 'Metallography worksheet')}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #1c1917; margin: 0; }
  h1 { font-size: 13pt; margin: 4px 0 2px; }
  h2 { font-size: 10pt; margin: 10px 0 4px; padding: 3px 6px; background: #292524; color: #fde68a; text-transform: uppercase; letter-spacing: .08em; }
  table { border-collapse: collapse; width: 100%; }
  table.kv th { text-align: left; width: 34%; font-weight: 600; color: #57534e; padding: 2px 6px; border: 1px solid #d6d3d1; background: #fafaf9; vertical-align: top; }
  table.kv td { padding: 2px 6px; border: 1px solid #d6d3d1; vertical-align: top; }
  table.grid th { background: #f5f5f4; border: 1px solid #a8a29e; padding: 2px 4px; font-size: 8.5pt; }
  table.grid td { border: 1px solid #d6d3d1; padding: 2px 4px; vertical-align: top; }
  table.narrow { width: 34%; }
  .cols { display: flex; gap: 8px; align-items: flex-start; }
  .cols > table.kv { flex: 1; }
  .c { text-align: center; } .r { text-align: right; }
  .mono { font-family: 'Courier New', monospace; font-size: 7.5pt; word-break: break-all; }
  .muted { color: #78716c; font-size: 8pt; }
  tr.excl td { color: #78716c; }
  .badge { display: inline-block; border: 1px solid #b45309; color: #92400e; background: #fffbeb; padding: 1px 6px; font-size: 8pt; font-weight: 700; }
  .thumbs { display: flex; gap: 6px; page-break-inside: avoid; margin-bottom: 6px; }
  .thumbs figure { margin: 0; flex: 1; text-align: center; }
  .thumbs img { max-width: 100%; max-height: 95mm; border: 1px solid #a8a29e; }
  .thumbs figcaption { font-size: 8pt; color: #57534e; }
  .reported { border: 2px solid #b45309; background: #fffbeb; padding: 6px; font-weight: 700; font-size: 10.5pt; }
  .sign { display: flex; gap: 8px; margin-top: 12px; page-break-inside: avoid; }
  .sign div { flex: 1; border-top: 1px solid #57534e; padding-top: 3px; font-size: 8.5pt; }
  .letterhead { border-bottom: 2px solid #292524; padding-bottom: 4px; margin-bottom: 6px; }
</style></head>
<body>
  ${letterheadHtml ? `<div class="letterhead">${letterheadHtml}</div>` : ''}
  <h1>Metallography worksheet — ${e(a.analysisNo ?? '')}</h1>
  <div>${e(ANALYSIS_KIND_LABEL[a.kind])} · ${e(ANALYSIS_STATUS_LABEL[a.status])} · ${e(ANALYSIS_PURPOSE_LABEL[a.purpose])}${a.indicative ? ' &nbsp;<span class="badge">Indicative – method not yet validated</span>' : ''}</div>

  <h2>Sample and method</h2>
  <table class="kv">
    ${row('SRF', e(ctx?.srfNumber ?? ''))}
    ${row('Parameter', e(ctx?.testLabel ?? ''))}
    ${row('Standard / method', e(snap?.standard_ref ?? ''))}
    ${row('Reported quantity', `${e(snap?.reported_quantity ?? '')}${snap?.reported_unit ? ` (${e(snap.reported_unit)})` : ''}`)}
    ${row('Method validation', snap?.method_verification_no ? e(snap.method_verification_no) : 'None (indicative)')}
    ${row('Test date', e(formatDate(a.testDate)))}
    ${row('Magnification / etchant', `${e(a.magnification ?? '—')} / ${e(a.etchant ?? '—')}`)}
    ${row('Specimen preparation', e([prep.orientation ? `Orientation ${prep.orientation}` : '', prep.polish ?? '', prep.etch_time_s ? `etch ${prep.etch_time_s} s` : '', prep.location ?? ''].filter(Boolean).join(' · ')))}
  </table>

  <h2>Scale</h2>
  <table class="kv">${scaleRows}</table>

  <h2>Equipment</h2>
  <table class="grid"><thead><tr><th>Asset code</th><th>Name</th><th>Certificate</th><th>Cal. due</th><th>On test date</th></tr></thead><tbody>${equipmentRows}</tbody></table>

  <h2>Images (originals, SHA-256)</h2>
  <table class="grid"><thead><tr><th>Field</th><th>File</th><th>SHA-256</th><th>Captured / location</th><th>Use</th></tr></thead><tbody>${fieldRows || '<tr><td colspan="5" class="muted">No images.</td></tr>'}</tbody></table>
  <p class="muted">Engine ${e(a.engineVersion ?? '—')}. Originals are stored unchanged; the hashes above identify them.</p>
  ${thumbs}

  <h2>Result</h2>
  ${resultBlock}
  <p style="margin-top:6px">Reported value:</p>
  <div class="reported">${e(getReportedTestResult(a.reportedValue) || '—')}${a.reportedUnit ? ` <span class="muted">(${e(a.reportedUnit)})</span>` : ''}</div>

  ${rechecks ? `<h2>Re-checks</h2><table class="grid"><thead><tr><th>Run at</th><th>By</th><th>Engine</th><th>Hashes OK</th><th>Outcome</th></tr></thead><tbody>${rechecks}</tbody></table>` : ''}
  ${a.status === 'void' ? `<p><b>Void:</b> ${e(a.voidReason ?? '')}</p>` : ''}
  ${a.overrideReason ? `<p><b>Director override:</b> ${e(a.overrideReason)}</p>` : ''}

  <div class="sign">
    <div>Performed by<br/><b>${e(a.performedByName ?? '—')}</b><br/>${e(formatDateTime(a.createdAt))}</div>
    <div>Completed by<br/><b>${completedBy}</b></div>
    <div>Reviewed by<br/><b>${e(reviewedByName ?? '—')}</b></div>
    <div>Printed by<br/><b>${e(printedByName ?? '—')}</b><br/>${e(formatDateTime(new Date().toISOString()))}</div>
  </div>
</body></html>`
}

// ---------------------------------------------------------------------------
// Print (pdf-service)
// ---------------------------------------------------------------------------

/** Equipment of the analysis: the stored snapshot, else built now from the ids. */
async function worksheetEquipment(detail: AnalysisDetail): Promise<EquipmentUsedSnapshot[]> {
  const stored = equipmentSnapshotsOf(parseEquipmentUsed(detail.analysis.equipmentSnapshot ?? []))
  if (stored.length > 0) return stored
  const a = detail.analysis
  const ids = [
    a.microscopeEquipmentId,
    a.cameraEquipmentId,
    a.scaleSnapshot?.stage_micrometer_equipment_id ?? detail.calibration?.stageMicrometerEquipmentId ?? null,
    a.inImageScale?.ruler_equipment_id ?? null,
  ].filter((x): x is string => Boolean(x))
  if (ids.length === 0) return []
  try {
    const options = await loadEquipmentOptions()
    return [...new Set(ids)]
      .map((id) => options.find((o) => o.id === id))
      .filter((o): o is NonNullable<typeof o> => Boolean(o))
      .map((o) => snapshotFromOption(o, a.testDate))
  } catch {
    return []
  }
}

async function letterhead(): Promise<string | null> {
  try {
    const rowId = await resolveLabSettingsRowId(supabase)
    const { data } = await supabase.from('lab_settings').select('*').eq('id', rowId).maybeSingle()
    if (!data) return null
    const lab = parseLabSettingsRow(data as Record<string, unknown>)
    if (!lab.labName.trim()) return null
    return `<div style="font-size:12pt;font-weight:700">${escapeHtml(lab.labName)}</div><div style="font-size:8.5pt;color:#57534e">${escapeHtml(
      [lab.address, lab.email, lab.mobile].filter((x) => x.trim()).join(' · '),
    )}</div>`
  } catch {
    return null
  }
}

async function profileName(id: string | null | undefined): Promise<string | null> {
  if (!id) return null
  const { data } = await supabase.from('user_profiles').select('full_name').eq('id', id).maybeSingle()
  const name = (data as { full_name?: string | null } | null)?.full_name
  return name?.trim() || null
}

async function printImage(path: string | null): Promise<string | null> {
  if (!path) return null
  const url = await embedPrintImageAsDataUrl(path, METALLOGRAPHY_BUCKET)
  return url ? downscaleDataUrl(url) : null
}

/**
 * Builds the worksheet with images embedded and downloads it as a PDF
 * through pdf-service (same helper as the test report).
 */
export async function printMetallographyWorksheet(detail: AnalysisDetail, opts: { printedByName?: string | null } = {}): Promise<void> {
  const [equipment, letterheadHtml, reviewer] = await Promise.all([
    worksheetEquipment(detail),
    letterhead(),
    profileName(detail.context?.resultsReviewerId).catch(() => null),
  ])
  const images = await Promise.all(
    detail.fields.map(async (f) => ({
      fieldNo: f.fieldNo,
      originalDataUrl: await printImage(f.rawImagePath),
      overlayDataUrl: await printImage(f.renderedOverlayPath),
    })),
  )
  const reviewedByName = reviewer ?? detail.rechecks[0]?.runByName ?? null
  const html = buildMetallographyWorksheetHtml({
    detail,
    equipment,
    images,
    letterheadHtml,
    reviewedByName,
    printedByName: opts.printedByName ?? null,
  })
  const { downloadHtmlAsPdf } = await import('@/features/sample-handling/report-preparation/downloadHtmlAsPdf')
  const safe = (detail.analysis.analysisNo ?? 'metallography').replace(/[^\w.-]+/g, '_')
  await downloadHtmlAsPdf(html, `${safe}-worksheet.pdf`, 'A4')
}
