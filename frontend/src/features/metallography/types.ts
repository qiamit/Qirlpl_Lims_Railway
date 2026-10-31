/**
 * Metallurgy & Metallography: database row types (snake_case, as PostgREST
 * returns them) and app types (camelCase) used by the screens.
 * Tables: migration 20261102101700_metallurgy_module.sql (design 3.2).
 * The module is OFF until the Laboratory Director sets
 * metallography_settings.enabled.
 */
import type { StructuredTestResult } from '@/features/sample-handling/sample-under-testing/testResultValues'
import type {
  Annotation,
  DisplaySettings,
  FieldMarks,
  OperatorAdjustments,
  RingTestLimits,
  RingTestSummary,
} from './engines/types'

export type {
  Annotation,
  DisplaySettings,
  FieldMarks,
  Mark,
  MarkKind,
  MarkOrigin,
  OperatorAdjustments,
  RingGeometry,
  RingTestLimits,
  RingTestSummary,
  RingThicknessPoint,
} from './engines/types'

// ---------------------------------------------------------------------------
// Unions and labels
// ---------------------------------------------------------------------------

export type AnalysisKind = 'ring_test' | 'grain_size' | 'inclusion' | 'decarburization' | 'microstructure' | 'macro'

export const ANALYSIS_KINDS: AnalysisKind[] = [
  'ring_test',
  'grain_size',
  'inclusion',
  'decarburization',
  'microstructure',
  'macro',
]

export const ANALYSIS_KIND_LABEL: Record<AnalysisKind, string> = {
  ring_test: 'Ring test',
  grain_size: 'Grain size',
  inclusion: 'Inclusion',
  decarburization: 'Decarburization',
  microstructure: 'Microstructure',
  macro: 'Macro',
}

/** Standard each kind is usually run to (prefill only; Method Setup holds the real reference). */
export const ANALYSIS_KIND_STANDARD_HINT: Record<AnalysisKind, string> = {
  ring_test: 'IS 1786',
  grain_size: 'ISO 643',
  inclusion: 'ISO 4967',
  decarburization: 'ISO 3887',
  microstructure: '',
  macro: '',
}

/** Kinds whose engine is built in this release. The others show "coming later". */
export const AVAILABLE_ANALYSIS_KINDS: ReadonlySet<AnalysisKind> = new Set<AnalysisKind>(['ring_test'])

export const COMING_LATER_TEXT = 'Coming later'

export type AnalysisPurpose = 'sample' | 'validation' | 'iqc' | 'training'

export const ANALYSIS_PURPOSE_LABEL: Record<AnalysisPurpose, string> = {
  sample: 'Sample',
  validation: 'Method validation',
  iqc: 'IQC',
  training: 'Training',
}

export type AnalysisStatus = 'in_progress' | 'completed' | 'superseded' | 'void'

export const ANALYSIS_STATUS_LABEL: Record<AnalysisStatus, string> = {
  in_progress: 'In progress',
  completed: 'Completed',
  superseded: 'Superseded',
  void: 'Void',
}

export type CalibrationStatus = 'draft' | 'verified' | 'withdrawn'

export const CALIBRATION_STATUS_LABEL: Record<CalibrationStatus, string> = {
  draft: 'Draft',
  verified: 'Verified',
  withdrawn: 'Withdrawn',
}

export type AiMode = 'off' | 'numeric_only' | 'image'

export type ScaleMode = 'calibration' | 'in_image_reference'

/** Calibrations due within this many days are flagged (S1 strip, S4). */
export const CALIBRATION_EXPIRY_WARNING_DAYS = 15

/** 'missing' = migration 20261102101700 not applied (table / function absent). */
export type MetallographySwitch = 'on' | 'off' | 'missing'

/** Reads return this; any other failure is thrown as an Error with a readable message. */
export type MgLoad<T> = { status: 'ok'; data: T } | { status: 'missing' }

export const METALLOGRAPHY_MIGRATION = '20261102101700_metallurgy_module.sql'

export const METALLOGRAPHY_OFF_TITLE = 'Metallography is not in use'

export const INDICATIVE_REMARK = 'Indicative – method not yet validated (metallography)'

// ---------------------------------------------------------------------------
// Method settings (metallography_parameter_methods.settings)
// ---------------------------------------------------------------------------

/** Ring test settings: the limits plus drawing parameters (old ring-test settings.ts). */
export type RingTestMethodSettings = RingTestLimits & {
  /** false until the Technical Manager confirms the limits against IS 1786. */
  limits_verified: boolean
  outer_gap_px: number
  inner_gap_px: number
  angular_correction_deg: number
}

export const RING_TEST_DEFAULT_SETTINGS: RingTestMethodSettings = {
  thickness_min_factor: 0.07,
  thickness_max_factor: 0.15,
  tm_share_min_pct: 30,
  tm_share_max_pct: 50,
  limits_inclusive: true,
  limits_verified: false,
  outer_gap_px: 1,
  inner_gap_px: 1,
  angular_correction_deg: 0,
}

/** Settings of any kind. Only ring_test is defined in Phase 1. */
export type MethodSettings = Partial<RingTestMethodSettings> & Record<string, unknown>

// ---------------------------------------------------------------------------
// JSON column shapes
// ---------------------------------------------------------------------------

/** One stage micrometer reading. length_px is recomputed by the database from the coordinates. */
export type CalibrationReading = {
  axis: 'x' | 'y'
  x1: number
  y1: number
  x2: number
  y2: number
  length_px?: number
}

/**
 * metallography_analyses.in_image_scale (ring and macro photos). length_px of
 * each line and mm_per_px = mean(length_mm / length_px) are recomputed by the
 * database.
 */
export type InImageScale = {
  lines: Array<{ x1: number; y1: number; x2: number; y2: number; length_mm: number; length_px?: number }>
  ruler_equipment_id: string | null
  /** Field the lines were drawn on. */
  field_no?: number
  mm_per_px?: number
}

/** metallography_analyses.method_snapshot (set by the database at creation). */
export type MethodSnapshot = {
  method_id: string
  test_parameter_id: string
  analysis_kind: AnalysisKind
  method_variant: string | null
  standard_ref: string
  reported_quantity: string
  reported_unit: string | null
  decimals: number | null
  min_fields: number
  min_counts_per_field: number | null
  scale_mode: ScaleMode
  settings: MethodSettings
  method_verification_id: string | null
  method_verification_no: string | null
  reportable: boolean
  snapshot_at: string
}

/** metallography_analyses.scale_snapshot (set by the database from the calibration). */
export type ScaleSnapshot = {
  calibration_id: string
  cal_code: string
  status: CalibrationStatus
  um_per_px_x: number
  um_per_px_y: number
  u_rel_scale: number | null
  objective: string
  total_magnification: number | null
  image_width_px: number
  image_height_px: number
  valid_from: string
  valid_until: string
  microscope_equipment_id: string
  camera_equipment_id: string | null
  stage_micrometer_equipment_id: string
  performed_by_name: string | null
  verified_by_name: string | null
  verified_at: string | null
  snapshot_at: string
}

export type SpecimenPrep = {
  orientation?: 'L' | 'T' | null
  polish?: string | null
  etch_time_s?: number | null
  location?: string | null
}

/** result_summary of any kind. Only ring_test is defined in Phase 1. */
export type ResultSummary = RingTestSummary | Record<string, unknown>

/** metallography_rechecks.details (written by the S3 re-check). */
export type RecheckDetails = {
  hashes_verified: boolean
  engine_version: string
  /** Per field: stored hash, recomputed hash, ok. */
  hashes?: Array<{ field_no: number; expected: string; actual: string | null; ok: boolean }>
  /** Reported value recomputed at the stored rounding. */
  recomputed_value?: string | null
  stored_value?: string | null
  differences?: string[]
  note?: string
}

// ---------------------------------------------------------------------------
// Database rows (snake_case)
// ---------------------------------------------------------------------------

export type MetallographySettingsRow = {
  id: number
  enabled: boolean
  ai_mode: AiMode
  updated_by: string | null
  updated_at: string
}

export type MetallographyParameterMethodRow = {
  id: string
  test_parameter_id: string
  analysis_kind: AnalysisKind
  method_variant: string | null
  standard_ref: string
  reported_quantity: string
  reported_unit: string | null
  decimals: number | null
  min_fields: number
  min_counts_per_field: number | null
  scale_mode: ScaleMode
  settings: MethodSettings
  method_verification_id: string | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type MetallographyScaleCalibrationRow = {
  id: string
  cal_code: string | null
  microscope_equipment_id: string
  camera_equipment_id: string | null
  stage_micrometer_equipment_id: string
  objective: string
  total_magnification: number | null
  image_width_px: number
  image_height_px: number
  camera_settings: Record<string, unknown> | null
  reference_length_um: number
  readings: CalibrationReading[]
  um_per_px_x: number
  um_per_px_y: number
  u_rel_scale: number | null
  evidence_image_path: string
  evidence_image_sha256: string
  performed_by: string | null
  performed_by_name: string | null
  performed_at: string
  verified_by: string | null
  verified_by_name: string | null
  verified_at: string | null
  status: CalibrationStatus
  valid_from: string | null
  valid_until: string
  override_reason: string | null
  withdraw_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type MetallographyAnalysisRow = {
  id: string
  analysis_no: string | null
  purpose: AnalysisPurpose
  test_allocation_parameter_id: string | null
  sample_id: string | null
  test_allocation_id: string | null
  test_parameter_id: string | null
  method_id: string | null
  method_snapshot: MethodSnapshot | null
  analysis_kind: AnalysisKind
  indicative: boolean
  scale_calibration_id: string | null
  scale_snapshot: ScaleSnapshot | null
  in_image_scale: InImageScale | null
  microscope_equipment_id: string | null
  camera_equipment_id: string | null
  /** EquipmentUsedSnapshot[] (lib/equipmentTraceability.ts). */
  equipment_snapshot: unknown[] | null
  magnification: string | null
  etchant: string | null
  specimen_prep: SpecimenPrep | null
  test_date: string
  engine_version: string | null
  engine_params: Record<string, unknown>
  result_summary: ResultSummary | null
  reported_value: string | null
  reported_unit: string | null
  status: AnalysisStatus
  completed_by: string | null
  completed_at: string | null
  superseded_by: string | null
  void_reason: string | null
  voided_by: string | null
  voided_at: string | null
  override_reason: string | null
  include_in_report: boolean
  performed_by: string | null
  performed_by_name: string | null
  created_at: string
  updated_at: string
}

export type MetallographyFieldRow = {
  id: string
  analysis_id: string
  field_no: number
  raw_image_path: string
  raw_image_sha256: string
  raw_image_bytes: number | null
  raw_image_mime: string | null
  original_file_name: string | null
  image_width_px: number | null
  image_height_px: number | null
  captured_at: string | null
  location_on_specimen: string | null
  display_settings: DisplaySettings | null
  operator_adjustments: OperatorAdjustments | null
  marks: FieldMarks | Record<string, never>
  annotations: Annotation[] | null
  measurements: Record<string, unknown> | null
  features_path: string | null
  features_sha256: string | null
  rendered_overlay_path: string | null
  include_in_report: boolean
  excluded: boolean
  exclude_reason: string | null
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

export type MetallographyRecheckRow = {
  id: string
  analysis_id: string
  engine_version: string | null
  hashes_verified: boolean
  match: boolean
  details: RecheckDetails | Record<string, unknown>
  run_by: string | null
  run_by_name: string | null
  run_at: string
}

// ---------------------------------------------------------------------------
// App types (camelCase)
// ---------------------------------------------------------------------------

export type MetallographySettings = {
  enabled: boolean
  aiMode: AiMode
  updatedBy: string | null
  updatedAt: string
}

export type ParameterMethod = {
  id: string
  testParameterId: string
  analysisKind: AnalysisKind
  methodVariant: string | null
  standardRef: string
  reportedQuantity: string
  reportedUnit: string | null
  decimals: number | null
  minFields: number
  minCountsPerField: number | null
  scaleMode: ScaleMode
  settings: MethodSettings
  methodVerificationId: string | null
  active: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

/** Write payload for Method Setup (insert or update). standardRef empty = prefill from test_parameters.test_method. */
export type ParameterMethodInput = {
  testParameterId: string
  analysisKind: AnalysisKind
  methodVariant?: string | null
  standardRef?: string | null
  reportedQuantity: string
  reportedUnit?: string | null
  decimals?: number | null
  minFields?: number
  minCountsPerField?: number | null
  scaleMode?: ScaleMode
  settings?: MethodSettings
  methodVerificationId?: string | null
  active?: boolean
}

/** A method_verifications record offered in Method Setup. */
export type MethodVerificationOption = {
  id: string
  recordNo: string
  methodReference: string
  testParameterId: string | null
  status: string
  conclusion: string | null
  validUntil: string | null
  /** approved, conclusion fit_for_purpose / conditional, in date (same rule as SQL). */
  reportable: boolean
}

export type ScaleCalibration = {
  id: string
  calCode: string | null
  microscopeEquipmentId: string
  cameraEquipmentId: string | null
  stageMicrometerEquipmentId: string
  objective: string
  totalMagnification: number | null
  imageWidthPx: number
  imageHeightPx: number
  cameraSettings: Record<string, unknown> | null
  referenceLengthUm: number
  readings: CalibrationReading[]
  umPerPxX: number
  umPerPxY: number
  uRelScalePct: number | null
  evidenceImagePath: string
  evidenceImageSha256: string
  performedBy: string | null
  performedByName: string | null
  performedAt: string
  verifiedBy: string | null
  verifiedByName: string | null
  verifiedAt: string | null
  status: CalibrationStatus
  validFrom: string | null
  validUntil: string
  overrideReason: string | null
  withdrawReason: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

/** New calibration draft. µm/px and u_rel are computed by the database from the readings. */
export type ScaleCalibrationDraftInput = {
  microscopeEquipmentId: string
  cameraEquipmentId?: string | null
  stageMicrometerEquipmentId: string
  objective: string
  totalMagnification?: number | null
  imageWidthPx: number
  imageHeightPx: number
  cameraSettings?: Record<string, unknown> | null
  referenceLengthUm: number
  readings: CalibrationReading[]
  validFrom?: string | null
  validUntil: string
  notes?: string | null
}

export type Analysis = {
  id: string
  analysisNo: string | null
  purpose: AnalysisPurpose
  paramRowId: string | null
  sampleId: string | null
  testAllocationId: string | null
  testParameterId: string | null
  methodId: string | null
  methodSnapshot: MethodSnapshot | null
  kind: AnalysisKind
  indicative: boolean
  scaleCalibrationId: string | null
  scaleSnapshot: ScaleSnapshot | null
  inImageScale: InImageScale | null
  microscopeEquipmentId: string | null
  cameraEquipmentId: string | null
  equipmentSnapshot: unknown[] | null
  magnification: string | null
  etchant: string | null
  specimenPrep: SpecimenPrep | null
  testDate: string
  engineVersion: string | null
  engineParams: Record<string, unknown>
  resultSummary: ResultSummary | null
  reportedValue: string | null
  reportedUnit: string | null
  status: AnalysisStatus
  completedBy: string | null
  completedAt: string | null
  supersededBy: string | null
  voidReason: string | null
  voidedBy: string | null
  voidedAt: string | null
  overrideReason: string | null
  includeInReport: boolean
  performedBy: string | null
  performedByName: string | null
  createdAt: string
  updatedAt: string
}

/** Fields the analyst may change while the analysis is in progress. */
export type AnalysisUpdateInput = {
  scaleCalibrationId?: string | null
  inImageScale?: InImageScale | null
  cameraEquipmentId?: string | null
  equipmentSnapshot?: unknown[] | null
  magnification?: string | null
  etchant?: string | null
  specimenPrep?: SpecimenPrep | null
  testDate?: string
  engineVersion?: string | null
  engineParams?: Record<string, unknown>
  resultSummary?: ResultSummary | null
  reportedValue?: string | null
  reportedUnit?: string | null
  /** Laboratory Director only (equipment / calibration date override at completion). */
  overrideReason?: string | null
}

export type AnalysisCreateInput = {
  /** Supply it so storage paths can be built before the insert (crypto.randomUUID()). */
  id?: string
  purpose: AnalysisPurpose
  /** Required for purpose 'sample'. */
  paramRowId?: string | null
  /** Required for purpose other than 'sample'; ignored for 'sample' (taken from Method Setup). */
  methodId?: string | null
  testDate?: string
  scaleCalibrationId?: string | null
}

export type AnalysisListFilters = {
  kind?: AnalysisKind | 'all'
  status?: AnalysisStatus | 'all'
  purpose?: AnalysisPurpose | 'all'
  /** created_at / test_date window (yyyy-mm-dd). */
  from?: string
  to?: string
  /** SRF number contains. */
  srf?: string
  performedBy?: string
  limit?: number
}

/** Register row: an analysis with its SRF / parameter context. */
export type AnalysisListItem = Analysis & {
  srfNumber: string | null
  testLabel: string | null
  /** test_allocation_parameters.metallography_analysis_id points at this analysis. */
  linkedToResult: boolean
  lastRecheck: { match: boolean; runAt: string; runByName: string | null } | null
}

export type AnalysisField = {
  id: string
  analysisId: string
  fieldNo: number
  rawImagePath: string
  rawImageSha256: string
  rawImageBytes: number | null
  rawImageMime: string | null
  originalFileName: string | null
  imageWidthPx: number | null
  imageHeightPx: number | null
  capturedAt: string | null
  locationOnSpecimen: string | null
  displaySettings: DisplaySettings | null
  operatorAdjustments: OperatorAdjustments | null
  marks: FieldMarks
  annotations: Annotation[]
  measurements: Record<string, unknown> | null
  featuresPath: string | null
  featuresSha256: string | null
  renderedOverlayPath: string | null
  includeInReport: boolean
  excluded: boolean
  excludeReason: string | null
  uploadedBy: string | null
  createdAt: string
  updatedAt: string
}

/** Field changes allowed while the analysis is in progress (the original never changes). */
export type FieldUpdateInput = {
  imageWidthPx?: number
  imageHeightPx?: number
  capturedAt?: string | null
  locationOnSpecimen?: string | null
  displaySettings?: DisplaySettings | null
  operatorAdjustments?: OperatorAdjustments | null
  marks?: FieldMarks
  annotations?: Annotation[] | null
  measurements?: Record<string, unknown> | null
  featuresPath?: string | null
  featuresSha256?: string | null
  renderedOverlayPath?: string | null
  includeInReport?: boolean
}

export type Recheck = {
  id: string
  analysisId: string
  engineVersion: string | null
  hashesVerified: boolean
  match: boolean
  details: RecheckDetails | Record<string, unknown>
  runBy: string | null
  runByName: string | null
  runAt: string
}

/** Everything S2 / S3 need for one analysis. */
export type AnalysisDetail = {
  analysis: Analysis
  fields: AnalysisField[]
  rechecks: Recheck[]
  method: ParameterMethod | null
  calibration: ScaleCalibration | null
  /** Result row context (purpose 'sample'). */
  context: {
    srfNumber: string | null
    testLabel: string | null
    results: string | null
    resultsReviewStatus: string | null
    resultsReviewerId: string | null
    /** test_allocation_parameters.metallography_analysis_id of the result row. */
    linkedAnalysisId: string | null
    /** app_metallography_result_locked() */
    locked: boolean
  } | null
}

/** Latest analysis per result row, for the Enter Results link and hover text. */
export type ParamRowAnalysisInfo = {
  paramRowId: string
  /** In-progress draft, if any. */
  inProgress: { id: string; analysisNo: string | null } | null
  /** Completed analysis, if any. */
  completed: {
    id: string
    analysisNo: string | null
    reportedValue: string | null
    indicative: boolean
    microscopeEquipmentId: string | null
    cameraEquipmentId: string | null
  } | null
  /** The analysis the saved result is linked to (any status). */
  linked: { id: string; analysisNo: string | null; status: AnalysisStatus } | null
}

/** S1 Pending tab: saved parameter rows of mapped parameters with no result yet. */
export type PendingParameterRow = {
  paramRowId: string
  testAllocationId: string
  sampleId: string
  srfNumber: string | null
  sectionCode: string | null
  testParameterId: string
  testLabel: string
  analysisKind: AnalysisKind
  methodId: string
  assignedEmployeeId: string | null
  assignedEmployeeName: string | null
  /** In-progress analysis for the row, if one exists. */
  inProgressAnalysisId: string | null
  inProgressAnalysisNo: string | null
}

/** S1 stat strip. */
export type RegisterStats = {
  inProgress: number
  /** Completed analyses whose result row is not linked to them yet. */
  completedNotLinked: number
  /** Verified calibrations whose valid_until is within CALIBRATION_EXPIRY_WARNING_DAYS. */
  calibrationsExpiringSoon: number
}

export type MetallographyPermissions = {
  canRun: boolean
  canCalibrate: boolean
  canManageMethods: boolean
}

// ---------------------------------------------------------------------------
// Shapes shared between builders (see CONTRACT.md)
// ---------------------------------------------------------------------------

/** The Enter Results row the workbench dialog is opened for. */
export type MetallographyParamRowRef = {
  /** test_allocation_parameters.id (saved rows only). */
  paramRowId: string
  testParameterId: string
  testLabel: string
  sampleId: string
  /** Parameter unit from the Test Parameter master (unit_value). */
  unit: string | null
  /** Mapped decimals (Method Setup) when known. */
  decimals?: number | null
}

/** What "Use result" hands back to Enter Results (row draft via updateDraft). */
export type MetallographyUseResult = {
  /** Exactly the analysis reported_value; the database refuses any other text while linked. */
  results: string
  metallographyAnalysisId: string
  /** Microscope, camera (and ruler) to pre-select in EquipmentUsedPickerDialog. */
  suggestedEquipmentIds: string[]
  /** true -> propose INDICATIVE_REMARK and nabl_scope_override 'Non NABL' (editable). */
  indicative: boolean
}

/** formatResult.ts output. `results` is written to reported_value and, via Use result, to results. */
export type FormattedMetallographyResult = {
  results: string
  /** Human text (the StructuredTestResult.reported, or the plain value). */
  reportedText: string
  /** Set for multi-value results (ring test t1–t8 + TM %). */
  structured: StructuredTestResult | null
  /** Engine verdict shown next to the value; never written as the conformity statement. */
  verdict: 'PASS' | 'FAIL' | null
}

/** calc/scaleCalibration.ts output (must equal the SQL recompute in the calibration guard). */
export type ScaleFromReadings = {
  /** Readings with length_px = round(√(dx² + dy²), 4). */
  readings: CalibrationReading[]
  nX: number
  nY: number
  meanPxX: number | null
  meanPxY: number | null
  /** Sample standard deviation (n − 1) of length_px per axis. */
  sPxX: number | null
  sPxY: number | null
  /** round(reference_length_um / meanPx, 6) */
  umPerPxX: number | null
  umPerPxY: number | null
  /** s / mean × 100 per axis */
  uRelPctX: number | null
  uRelPctY: number | null
  /** round(max(uRelPctX, uRelPctY), 4) — stored as u_rel_scale */
  uRelScalePct: number | null
  /** Plain-English problems (fewer than 3 per axis, line along the wrong axis, < 1 px). Empty = valid. */
  errors: string[]
}

/** calc/fieldStatistics.ts output (multi-field statistics, case MC-02). */
export type FieldStatistics = {
  n: number
  mean: number | null
  /** Sample standard deviation (n − 1). */
  s: number | null
  /** Two-sided 95 % Student t for n − 1 degrees of freedom. */
  t95: number | null
  /** t95 × s / √n */
  ci95: number | null
  /** ci95 / mean × 100 (% relative accuracy) */
  relativeAccuracyPct: number | null
}
