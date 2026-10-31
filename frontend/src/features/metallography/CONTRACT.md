# Metallurgy & Metallography: build contract (Phase 1)

Design: `docs/metallography-module-design.md` (3.1–3.5, 3.6 ring test, 3.8, 3.9 Phase 1, 3.10).
Database: `backend/supabase/migrations/20261102101700_metallurgy_module.sql` (migration 55).

Every builder codes against the files in "Contract files" below. **Do not change them.** If you need
a change, ask the contract owner; do not fork the types locally.

## 1. Contract files (owner: contract)

| File | What it pins |
|---|---|
| `types.ts` | DB row types (snake_case), app types (camelCase), unions, labels, `MgLoad<T>`, `MetallographySwitch`, `RING_TEST_DEFAULT_SETTINGS`, `MetallographyParamRowRef`, `MetallographyUseResult`, `FormattedMetallographyResult`, `ScaleFromReadings`, `FieldStatistics`, `INDICATIVE_REMARK`, `AVAILABLE_ANALYSIS_KINDS` |
| `metallographyApi.ts` | All supabase-js reads / writes (settings, permissions, methods, calibrations, analyses, fields, re-checks, pending rows, stats, unlink) |
| `metallographyStorage.ts` | Bucket `metallography-images`: hashing, paths, upload (no upsert), download, signed URLs, re-hash, clean-up |
| `engines/types.ts` | `GrayImage`, `RgbaImage`, `rgbaToGray`, `ScaleInput`, `Mark`, `FieldMarks`, `EngineResult<T>`, ring geometry / summary / limits, `DetectRingFn`, `ComputeRingFn`, worker protocol |
| `CONTRACT.md` | This file |

Rules that apply to everyone:
- Reads return `MgLoad<T>`; on `{ status: 'missing' }` show the metallography missing-migration notice (section 4), never an error.
- Writes throw `Error` (or `MetallographyMissingError`); show `metallographyErrorText(e)` with `MessageLine` / toast. The database messages are already plain English.
- After void, withdraw, unlink and every Director override, call `recordReason(table, rowId, reason)` (`lib/auditReason.ts`) with `table` = `metallography_analyses` / `metallography_scale_calibrations` / `test_allocation_parameters`.
- Save buttons use `limsPrimaryBtnClass`, void / withdraw / delete use `limsDeleteBtnClass` (view-only module access disables them). Canvas tools also check `useCanEditCurrentModule()`.
- UI kit: `EnvHeader`, `EnvPanel`, `MessageLine`, `Field`, `EnvSelect` from `features/environment/EnvironmentUi.tsx`; classes from `lib/limsThemeUi.ts`; icons from lucide-react 0.575; `@/…` imports; phone card list (`md:hidden`) + desktop table (`hidden md:block`).
- Engines and `calc/*` and `formatResult.ts` never import `@/lib/supabaseClient`, React or DOM APIs (the validation runner bundles them for Node).

## 2. Routes and module keys

| Screen | Route | Module key | Page file (default export) | Owner |
|---|---|---|---|---|
| S1 Analyses register | `/metallography/analyses` | `/metallography/analyses` | `MetallographyMasterPage.tsx` | shell |
| S2 Workbench (full page) | `/metallography/analyses/:id` | inherits `/metallography/analyses` | `workbench/MetallographyWorkbenchPage.tsx` | workbench |
| S4 Microscope Calibration | `/metallography/scale-calibrations` | `/metallography/scale-calibrations` | `calibrations/MicroscopeCalibrationMasterPage.tsx` | calibration |
| S5 Method Setup | `/metallography/methods` | `/metallography/methods` | `methods/MethodSetupPage.tsx` | shell |
| S6 Periodic Table | `/metallography/periodic-table` | `/metallography/periodic-table` | `periodic-table/PeriodicTablePage.tsx` | periodic |
| S6 Element detail | `/metallography/periodic-table/:symbol` (`?temp=` °C, default 27) | inherits | `periodic-table/ElementDetailPage.tsx` | periodic |
| redirect | `/metallography` → `/metallography/analyses` (`<Navigate replace/>`) | — | — | shell |

Sidebar (`lib/appNav.ts`, Testing LIMS, after Sample Handling, before Consent Letter):

```ts
{ label: 'Metallurgy & Metallography', icon: Microscope, clause: '7.2', children: [
  { label: 'Analyses',                       to: '/metallography/analyses',           icon: Microscope, clause: '7.5' },
  { label: 'Microscope Calibration (µm/px)', to: '/metallography/scale-calibrations', icon: Ruler,      clause: '6.4' },
  { label: 'Method Setup',                   to: '/metallography/methods',            icon: Settings2,  clause: '7.2' },
  { label: 'Periodic Table',                 to: '/metallography/periodic-table',     icon: Atom },
]}
```

Also (shell): `ROUTE_LABELS` in `GlobalLayout.tsx` for every route above, `'/metallography'` in
`APP_PREFIXES` in `frontend/server.mjs`, `*Route` wrappers in `routes/routeElements.tsx`, `<Route>`s in
`App.tsx` inside `AuthenticatedShell`, entries in `features/help/helpContent.ts`. No
`requiredDesignations`; module access decides. Legacy allowlists are not changed.

## 3. Database facts the UI relies on

- Module switch: `fetchMetallographySwitch()` → `'on' | 'off' | 'missing'` (RPC `app_metallography_enabled`). Settings change: `updateSettings()` (Director only).
- Permissions: `fetchMetallographyPermissions()` → `{ canRun, canCalibrate, canManageMethods }` (Director, or Edit on the page).
- Numbers: `MA-YYYY-NNNNN` (analyses), `MSC-YYYY-NNN` (calibrations), set by the database.
- Analyses: create with `createAnalysis()` / `openOrCreateAnalysisForParamRow()`. Links, `method_snapshot`, `indicative`, `analysis_kind`, `scale_snapshot`, microscope / camera (from the calibration) are set by the database; client values are ignored.
- Completion (`completeAnalysis(id, patch)`) is refused unless: non-excluded fields ≥ `min_fields`; reported value set; scale = verified calibration valid on `test_date` with every field at its exact resolution, **or** (ring test / macro with `scale_mode = 'in_image_reference'`) `in_image_scale` with lines and `ruler_equipment_id`; microscope (or ruler) usable on `test_date` (Director may override with `overrideReason`); ring test: `app_metallography_ring_check` agrees (section 6).
- A completed analysis is read-only except `include_in_report` and void. Change = `supersedeAnalysis(oldId)` (copies fields by reference); the old one becomes `superseded` when the new one completes.
- Any analysis / field / link change is refused while the result row is under review, approved or the sample is issued (Director exempt).
- Fields: only while the analysis is `in_progress`, by its analyst or the Director. Original columns never change; exclude needs a reason.
- Re-check: `fetchCanRecheck(id)` (assigned reviewer, QM or Director, never the analyst; completed or superseded analyses) and `recordRecheck(id, match, details)`.
- Result link: `test_allocation_parameters.metallography_analysis_id`. While set, `results` must equal the analysis `reported_value` exactly, the analysis must be `completed` and belong to the row. Changing / clearing the link is refused under review / approved (Director exempt).

## 4. Shell components (owner: shell)

File `MetallographyUi.tsx`:

```ts
/** Renders children only when the module is on. 'missing' -> MetallographyMissingNotice. */
export function MetallographyGate(props: {
  state: MetallographySwitch | null      // null = loading
  /** Director may still open Method Setup while the module is off (to switch it on). */
  allowWhenOff?: boolean
  children: ReactNode
}): JSX.Element

/** "Metallography is not set up on this database yet" + migration 20261102101700_metallurgy_module.sql. */
export function MetallographyMissingNotice(): JSX.Element

export function AnalysisStatusBadge(props: { status: AnalysisStatus }): JSX.Element
export function CalibrationStatusBadge(props: { status: CalibrationStatus }): JSX.Element
/** Amber "Indicative" badge (method not yet validated). */
export function IndicativeBadge(): JSX.Element
/** "Coming later" chip for kinds not in AVAILABLE_ANALYSIS_KINDS. */
export function ComingLaterChip(): JSX.Element
```

Off text: title `METALLOGRAPHY_OFF_TITLE`; body "The Laboratory Director can switch it on in Method Setup → Module settings."
Also exported: `MetallographyOffNotice()` (the off text above). `MetallographyGate.tsx` only re-exports the gate; import from `MetallographyUi.tsx`.

File `useMetallographySwitch.ts`: `useMetallographySwitch(): { state: MetallographySwitch | null; reload(): void }`
(own `.ts` file for the react-refresh lint). Every gated page uses it with `MetallographyGate`. The Periodic Table is a
reference and is not gated.

S1 register uses `listAnalyses(filters)` (filters in the URL: `kind`, `status`, `from`, `to`, `srf`, `analyst`, `tab=pending|analyses`), `fetchPendingParameterRows({ userId, isDirector })`, `fetchRegisterStats()`. "Analyse" on a pending row opens `MetallographyAnalysisDialog`; a row click in the Analyses tab navigates to `/metallography/analyses/:id`. "New validation / IQC analysis": `createAnalysis({ purpose, methodId })` then navigate. Footer: Export CSV, Print, Void (`voidAnalysis` + `recordReason`).

S5 Method Setup tabs: Test parameters (map / unmap: `createMethod`, `updateMethod`, `setMethodActive`, `deleteMethod`), Method validation (`listMethodVerificationOptions`, `methodVerificationId`), Module settings (Director only: `updateSettings`), Engines (bundled versions, e.g. `RING_TEST_ENGINE_VERSION`). Kinds other than `ring_test` can be mapped but show `ComingLaterChip`. Ring test settings default to `RING_TEST_DEFAULT_SETTINGS` with "Verify against IS 1786" while `limits_verified` is false.

## 5. Workbench, dialog and view (owner: workbench)

`workbench/MetallographyWorkbench.tsx`:

```ts
export type MetallographyWorkbenchProps = {
  analysisId: string
  mode: 'page' | 'dialog'
  /** Forced read-only (review screens). Otherwise read-only when status !== 'in_progress' or no edit right. */
  readOnly?: boolean
  /** Dialog mode only: hand the result back to Enter Results. */
  onUseResult?: (r: MetallographyUseResult) => void
  /** Dialog mode: close. Page mode: ignored. */
  onClose?: () => void
  /** Called when the shown analysis changes (e.g. after a supersede) so the dialog header link follows it. */
  onAnalysisChange?: (id: string) => void
}
export function MetallographyWorkbench(props: MetallographyWorkbenchProps): JSX.Element
```

Steps: Image → Scale & equipment → Analyse → Review marks → Complete → Use result. When the analysis is not `in_progress` the workbench renders `MetallographyAnalysisView`.

`workbench/MetallographyWorkbenchPage.tsx` (default export): reads `:id` with `useParams`, wraps `MetallographyGate`, renders `<MetallographyWorkbench analysisId={id} mode="page" />`. In page mode "Use result" is not a button: the completed analysis is picked up from Enter Results ("MA-… completed — Use result").

`workbench/MetallographyAnalysisDialog.tsx` (opened from Enter Results):

```ts
export type MetallographyAnalysisDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  paramRow: MetallographyParamRowRef      // { paramRowId, testParameterId, testLabel, sampleId, unit, decimals? }
  onUseResult: (r: MetallographyUseResult) => void   // { results, metallographyAnalysisId, suggestedEquipmentIds, indicative }
  /** Review screens: open read-only on the linked / completed analysis. */
  readOnly?: boolean
  /** Open this analysis instead of the row's draft (e.g. the linked one). */
  analysisId?: string | null
}
```

Behaviour: stacked full-height dialog (`layer="stacked"`, `overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"`); on open calls `openOrCreateAnalysisForParamRow(paramRow.paramRowId)` unless `analysisId` / `readOnly` / `canRun === false` (then it only opens an existing analysis); "Open in full page" link to `/metallography/analyses/:id` in a new tab (hidden without access to that page), so unsaved Enter Results edits stay. Use result is enabled only for a `completed` analysis (ring test: after t1–t8 are applied and Complete succeeded) and returns `results = analysis.reportedValue` **unchanged**, `suggestedEquipmentIds = [microscopeEquipmentId, cameraEquipmentId, in_image_scale.ruler_equipment_id].filter(Boolean)`, `indicative = analysis.indicative`.

`view/MetallographyAnalysisView.tsx`:

```ts
export type MetallographyAnalysisViewProps = {
  analysisId: string
  /** Show the Re-check action when fetchCanRecheck() is true. Default true. */
  allowRecheck?: boolean
  /** Called after supersede / void so the parent can reload or navigate. */
  onChanged?: (a: Analysis) => void
}
export function MetallographyAnalysisView(props: MetallographyAnalysisViewProps): JSX.Element

/** Same view in a stacked dialog ("View analysis" in Results Under Review). */
export function MetallographyAnalysisViewDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  analysisId: string
}): JSX.Element
```

Shows originals and overlays (`downloadObject` blobs or `signedObjectUrl`, 600 s), marks, calibration snapshot, equipment, statistics, engine version, hashes, supersede chain. Re-check: `verifyStoredHash` for every field, re-run the **stored** engine version with stored params / adjustments / marks, compare with `result_summary` at the stored rounding, `recordRecheck(id, match, details: RecheckDetails)`.

Worksheet (S7) `worksheet/metallographyWorksheetHtml.ts`:

```ts
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
export function buildMetallographyWorksheetHtml(input: MetallographyWorksheetInput): string
```

Printed with `downloadHtmlAsPdf(html, `${analysisNo}-worksheet.pdf`, 'A4')`. `embedPrintImageAsDataUrl` in `report-preparation/embedPrintImages.ts` gains an optional `bucket = 'laboratory-files'` second parameter (existing callers unchanged).

## 6. Ring test (owners: engines for maths / detection, ring-ui for the editor)

Stored shapes are in `engines/types.ts`: `RingGeometry` (saved in the field's `marks` as `ring_inner`, `ring_outer`, `ring_diameter_line`, `ring_thickness_point` marks plus `meta`), `RingTestSummary` (saved as `result_summary`), `RingTestLimits` (same keys as Method Setup settings).

SQL recompute (`app_metallography_ring_check`) reads: `d_mm > 0`; `thickness[]` with labels `t1`…`t8` and `thickness_mm > 0` (exactly 8 valid, `valid_point_count` = 8); limits `thickness_min_factor × d` … `thickness_max_factor × d` (inclusive unless `limits_inclusive` false); `thickness_decimals` must be 3 and `share_decimals` 2 (fixed; never taken from the summary); `tm_share_pct` on the 2-decimal grid and within 0.005 of `area_tm_mm2 / (area_tm_mm2 + area_fp_mm2) × 100` (TM area 0 is a valid FAIL); the share limits `tm_share_min_pct` … `tm_share_max_pct` are judged on the stored `tm_share_pct`, the thickness limits on the stored `thickness_mm`; `limits` must equal the method snapshot's; `overall_pass` must equal the recompute exactly. `app_metallography_ring_reported_check` then requires `reported_value` to be exactly the formatResult.ts text built from the summary.

`workbench/panels/RingTestPanel.tsx` (owner: ring-ui):

```ts
export type RingTestPanelProps = {
  analysis: Analysis
  /** Field the ring is measured on (field_no 1 in Phase 1). */
  field: AnalysisField
  /** Original image (downloaded blob, already hash-checked) decoded once by the workbench. */
  image: { blob: Blob; width: number; height: number; gray: GrayImage }
  /** method_snapshot.settings merged over RING_TEST_DEFAULT_SETTINGS. */
  settings: RingTestMethodSettings
  /** Calibration scale or in-image scale; null until set (Use result stays blocked). */
  scale: ScaleInput | null
  /** Nominal bar diameter d (mm), prefilled from the sample when known; editable. */
  dNominalMm: number | null
  readOnly: boolean
  /** Saved geometry from field.marks (null on first open). */
  initialGeometry: RingGeometry | null
  /** Draw / edit the in-image reference line (ring photos without a calibration). */
  onInImageScaleChange?: (scale: InImageScale) => void
  /** Every edit: geometry for field.marks, summary for result_summary (null until t1–t8 are applied). */
  onChange: (next: { geometry: RingGeometry; marks: Mark[]; summary: RingTestSummary | null; dNominalMm: number | null }) => void
}
export function RingTestPanel(props: RingTestPanelProps): JSX.Element
```

`workbench/panels/ring/RingEditor.tsx`: port of the old editor (LIMS tokens, no AI fetch, no 590×590 resize, original pixels in / out, no image in sessionStorage, display colours in localStorage with try/catch). Detection via `runEngine` (worker), maths via `computeRing`.

Engine files (owner: engines):

```ts
// engines/ringTest/ringMaths.ts
export const computeRing: ComputeRingFn
// engines/ringTest/detectRing.ts
export const detectRing: DetectRingFn
// engines/analysis.worker.ts   (module worker; handles EngineRequest, posts EngineResponse)
// engines/runEngine.ts
export function runEngine(req: Omit<EngineRequest, 'id'>): Promise<EngineResponse & { ok: true }>  // rejects with Error on { ok: false }
// loaded with: new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })
```

## 7. Calculation modules (owner: engines; cases in `frontend/scripts/validation/calculationCases.mjs`)

```ts
// calc/scaleCalibration.ts  (MODULE_FILES key mgScale; cases MC-01…)
/** Same rule as the calibration guard: length_px = round(√(dx²+dy²), 4); µm/px = round(ref / mean px, 6);
 *  u_rel = s / mean × 100 per axis, stored round(max, 4); ≥ 3 readings per axis; x readings |dx| ≥ |dy|. */
export function computeScaleFromReadings(readings: CalibrationReading[], referenceLengthUm: number): ScaleFromReadings
export function readingLengthPx(r: Pick<CalibrationReading, 'x1' | 'y1' | 'x2' | 'y2'>): number

// calc/fieldStatistics.ts  (mgStats; MC-02: 10,12,11,13,9 -> mean 11.000, s 1.581, CI95 1.963, %RA 17.8)
export function fieldStatistics(values: number[]): FieldStatistics
/** Two-sided 95 % Student t for df >= 1: table for df 1–30 (3 decimals), then the printed rows for 40, 60, 120
 *  (the lower-df value is used between rows, a slightly wider interval); 1.96 only above df 120. */
export function studentT95(df: number): number

// formatResult.ts  (mgFormat; MF-01: 7.46 at 1 decimal -> "7.5" via lib/is2Rounding is2RoundFixed)
export function formatSingleValue(value: number, decimals: number): string
export function formatMetallographyResult(args: {
  kind: AnalysisKind
  summary: ResultSummary
  reportedUnit: string | null
  /** Method decimals (Phase 2+ kinds). Ignored for the ring test (always RING_THICKNESS_DECIMALS / RING_SHARE_DECIMALS). */
  decimals: number | null
}): FormattedMetallographyResult
```

Ring test `results` = `serializeTestResult(structured)` (`testResultValues.ts`) with
`entries = [{label:'t1', value, unit:'mm'} … {label:'t8', …}, {label:'TM', value: tm_share_pct, unit:'%'}]`,
`decimals = 3` (thickness), `reported = "t1 1.460 mm, t2 …, t8 … mm; TM 43.75 %"`. The verdict is returned
separately and never written into `results`. The workbench stores `formatMetallographyResult(...).results`
as `reported_value`; Use result passes it on unchanged.

New validation case prefixes: RT (ring), MC (calibration / statistics), MF (format). Expected values are
hand-calculated (design 3.10 table) and never changed to match the program.

## 8. Enter Results integration (owner: enter-results)

- `SectionResultsEntryDialog`: on open, one `fetchMethodsByTestParameterIds(rows' testParameterIds)` and `fetchMetallographySwitch()`; show nothing when `'missing'`/`'off'` or empty. For saved rows, `fetchAnalysisInfoForParamRows(paramRowIds)` for hover text ("MA-… in progress" / "MA-… completed — Use result" / "from MA-…"); refetch on window focus.
- In the `TestResultsEntryCell` footer: the word **Metallography** after Attach ("Calculator | Attach | Metallography"), only when module on, parameter mapped, row saved (`paramRowId`), dialog not read-only.
- Click → `MetallographyAnalysisDialog`. `onUseResult` → `updateDraft` with `results`, `metallographyAnalysisId`, equipment picker `suggestedIds`, and when `indicative`: report remark `INDICATIVE_REMARK` and `nablScopeOverride: 'Non NABL'` (both editable).
- Linked rows: result box read-only, labelled "from MA-…"; "Unlink" asks a reason (`useReasonForChange`), calls `unlinkParamRow` then `recordReason('test_allocation_parameters', paramRowId, reason)`; hidden / refused under review or approved.
- Save path (`SampleUnderTestingMasterPage.handleSaveSectionResults`): add `metallography_analysis_id` to the update payload; on a missing-column error retry without it (existing pattern). The database message "Result comes from metallography analysis MA-…; change it there or unlink." is shown as is.
- Review screens: "View analysis" opens `MetallographyAnalysisViewDialog`.
- Phase 1: `test_allocation_parameters` has no free per-row remark (`report_remark` is the Part C conformity remark, which the report re-evaluates), so `INDICATIVE_REMARK` is shown as a label under the linked result only; the Non NABL suggestion is applied.

## 9. Storage paths (`metallographyStorage.ts`)

`analyses/<analysis_id>/fields/<field_no>_<sha16>.<ext>`, `analyses/<id>/overlay_<field_no>_<sha16>.png`,
`analyses/<id>/features_<field_no>_<sha16>.json`, `calibrations/<cal_id>/micrometer_<sha16>.<ext>`.
Extensions: png, jpg, jpeg, bmp, webp (no TIFF in Phase 1); 25 MB; 25 MP. Use `addFieldFromFile` (hash →
upload → insert → remove on failure) and `createCalibrationDraft` (insert → upload → delete on failure);
do not upload originals any other way. Canvas images come from `downloadObject()` blobs (canvas not tainted)
and are re-hashed on every open with `verifyStoredHash` (red banner on mismatch).

## 10. File ownership

| Builder | Files |
|---|---|
| contract | `types.ts`, `metallographyApi.ts`, `metallographyStorage.ts`, `engines/types.ts`, `CONTRACT.md`; migration `20261102101700_metallurgy_module.sql`; data fix `20261103_module_access_metallography.sql`; `backend/mcp-server/lib/policy.mjs`; `features/audit-trail/auditTrailDiff.ts`; `docs/audit-gap-closure-plan.md` |
| shell | `lib/appNav.ts`, `components/layout/GlobalLayout.tsx` (ROUTE_LABELS, ROUTE_PREFIX_LABELS for `:id` / `:symbol`), `routes/routeElements.tsx`, `App.tsx`, `frontend/server.mjs` (APP_PREFIXES), `features/help/helpContent.ts`, `MetallographyUi.tsx` (gate, notices, badges), `MetallographyGate.tsx` (re-export), `useMetallographySwitch.ts`, `metallographyRegisterText.ts`, S1 `MetallographyMasterPage.tsx`, `MetallographyHeaderBar.tsx`, `MetallographyTable.tsx`, `MetallographyFooterBar.tsx`, S5 `methods/MethodSetupPage.tsx` (+ `methods/*`) |
| calibration | S4 `calibrations/MicroscopeCalibrationMasterPage.tsx`, `MicroscopeCalibrationHeaderBar.tsx`, `MicroscopeCalibrationTable.tsx`, `MicroscopeCalibrationForm.tsx`, `MicroscopeCalibrationFooterBar.tsx`, `calibrations/MicrometerReadingsCanvas.tsx`, `calibrations/calibrationFormat.ts` |
| engines | `engines/ringTest/ringMaths.ts`, `engines/ringTest/detectRing.ts`, `engines/analysis.worker.ts`, `engines/runEngine.ts`, `engines/imageDecode.ts`, `calc/scaleCalibration.ts`, `calc/fieldStatistics.ts`, `formatResult.ts`, `frontend/scripts/validation/calculationCases.mjs` (MODULE_FILES `mgScale`, `mgStats`, `mgRing`, `mgRingDetect`, `mgFormat`; RT / MC / MF cases) |
| workbench | `workbench/MetallographyWorkbench.tsx`, `workbench/MetallographyWorkbenchPage.tsx`, `workbench/MetallographyAnalysisDialog.tsx`, `workbench/ImageStage.tsx`, `workbench/FieldStrip.tsx`, `workbench/ScalePanel.tsx`, `workbench/ResultPanel.tsx`, `workbench/displayAdjustments.ts`, `workbench/imageCanvasUtils.ts` (also `decodeToGray`), `workbench/ImageEditToolbar.tsx`, `view/MetallographyAnalysisView.tsx` (also `runRecheck`), `worksheet/metallographyWorksheetHtml.ts` (also `printMetallographyWorksheet`), `features/sample-handling/report-preparation/embedPrintImages.ts` (optional bucket parameter) |
| ring-ui | `workbench/panels/RingTestPanel.tsx`, `workbench/panels/ring/RingEditor.tsx`, `workbench/panels/ring/*` (editor helpers, display colours) |
| enter-results | `features/sample-handling/sample-under-testing/SectionResultsEntryDialog.tsx`, `sectionParameterRows.ts`, `SampleUnderTestingMasterPage.tsx`, `TestResultsEntryCell.tsx` (footer only), new `MetallographyResultLink.tsx` there; `results-under-review/ResultsUnderReviewMasterPage.tsx`, `ResultsReviewedSrfsDialog.tsx` ("View analysis") |
| periodic | `periodic-table/periodicTable.ts`, `periodic-table/PeriodicTableView.tsx` (not `PeriodicTable.tsx`: avoids a case clash with `periodicTable.ts` on macOS), `periodic-table/ElementDetailPanel.tsx`, `periodic-table/PeriodicTablePage.tsx`, `periodic-table/ElementDetailPage.tsx`, `periodic-table/periodicTable.css` (scoped, stone / amber) |

Panels for grain size, inclusion, decarburization, microstructure and macro are **not** built in
Phase 1: the workbench shows `ComingLaterChip` for those kinds.
