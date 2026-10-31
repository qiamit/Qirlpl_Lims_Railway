import { supabase } from '@/lib/supabaseClient'
import { formatSupabaseError } from '@/lib/formatSupabaseError'
import { isMissingSchemaError } from '@/lib/missingSchema'
import {
  assertImagePixels,
  assertMetallographyImage,
  calibrationImagePath,
  imageExtension,
  removeObjects,
  sha256Hex,
  uploadCalibrationImage,
  uploadFieldOriginal,
} from './metallographyStorage'
import {
  CALIBRATION_EXPIRY_WARNING_DAYS,
  METALLOGRAPHY_MIGRATION,
  type AiMode,
  type Analysis,
  type AnalysisCreateInput,
  type AnalysisDetail,
  type AnalysisField,
  type AnalysisKind,
  type AnalysisListFilters,
  type AnalysisListItem,
  type AnalysisStatus,
  type AnalysisUpdateInput,
  type CalibrationStatus,
  type FieldUpdateInput,
  type MetallographyAnalysisRow,
  type MetallographyFieldRow,
  type MetallographyParameterMethodRow,
  type MetallographyPermissions,
  type MetallographyRecheckRow,
  type MetallographyScaleCalibrationRow,
  type MetallographySettings,
  type MetallographySettingsRow,
  type MetallographySwitch,
  type MethodVerificationOption,
  type MgLoad,
  type ParameterMethod,
  type ParameterMethodInput,
  type ParamRowAnalysisInfo,
  type PendingParameterRow,
  type Recheck,
  type RecheckDetails,
  type RegisterStats,
  type ScaleCalibration,
  type ScaleCalibrationDraftInput,
} from './types'

/**
 * Metallurgy & Metallography: every read and write the screens need, through
 * supabase-js with the signed-in user's token (RLS, module access, guards and
 * the audit trail apply; design 3.1 item 5).
 *
 * Reads return MgLoad<T>: { status: 'missing' } while migration
 * 20261102101700 is not applied (table / column / function absent), so the
 * pages can show MissingMigrationNotice and Enter Results can hide the link.
 * Any other failure is thrown as an Error with a readable message. Writes
 * throw MetallographyMissingError when the migration is missing.
 */

// ---------------------------------------------------------------------------
// Errors and small helpers
// ---------------------------------------------------------------------------

export class MetallographyMissingError extends Error {
  constructor(message = `Metallography is not set up on this database yet (migration ${METALLOGRAPHY_MIGRATION}).`) {
    super(message)
    this.name = 'MetallographyMissingError'
  }
}

type PgErr = { message?: string; details?: string; hint?: string; code?: string }

/** Throws a readable Error (MetallographyMissingError when the migration is missing). */
function fail(err: unknown): never {
  if (isMissingSchemaError(err)) throw new MetallographyMissingError()
  if (err instanceof Error) throw err
  const text = err && typeof err === 'object' ? formatSupabaseError(err as PgErr) : ''
  throw new Error(text || 'Unknown error')
}

const MISSING = { status: 'missing' } as const

function ok<T>(data: T): MgLoad<T> {
  return { status: 'ok', data }
}

/** Readable message for any error thrown by this module. */
export function metallographyErrorText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') return formatSupabaseError(err as PgErr) || 'Unknown error'
  return 'Unknown error'
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v)
}

/** yyyy-mm-dd in the browser's local time zone. */
export function localIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return localIsoDate(new Date(y, m - 1, d + days))
}

const cleanIds = (ids: ReadonlyArray<string | null | undefined>) =>
  [...new Set(ids.map((v) => String(v ?? '').trim()).filter((v) => v && !v.startsWith('local-')))]

const CHUNK = 150

function chunks<T>(list: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** Runs one `.in(column, ids)` select per chunk of ids. Returns 'missing' when the schema is absent. */
async function selectIn<T>(
  table: string,
  columns: string,
  column: string,
  ids: string[],
): Promise<T[] | 'missing'> {
  const out: T[] = []
  for (const part of chunks(ids)) {
    const { data, error } = await supabase.from(table).select(columns).in(column, part)
    if (error) {
      if (isMissingSchemaError(error)) return 'missing'
      fail(error)
    }
    out.push(...((data ?? []) as unknown as T[]))
  }
  return out
}

/** Update one row by id and return it; RLS hides refused updates, so no row = not allowed. */
async function updateRow<R>(table: string, id: string | number, patch: Record<string, unknown>, denied: string): Promise<R> {
  const { data, error } = await supabase.from(table).update(patch).eq('id', id).select('*')
  if (error) fail(error)
  const row = (data ?? [])[0] as R | undefined
  if (!row) throw new Error(denied)
  return row
}

/** Drops undefined keys (PostgREST would otherwise send them as null). */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v
  return out
}

// ---------------------------------------------------------------------------
// Row mappers (exported for screens that read rows themselves)
// ---------------------------------------------------------------------------

export function rowToSettings(r: MetallographySettingsRow): MetallographySettings {
  return { enabled: r.enabled === true, aiMode: r.ai_mode ?? 'off', updatedBy: r.updated_by, updatedAt: r.updated_at }
}

export function rowToMethod(r: MetallographyParameterMethodRow): ParameterMethod {
  return {
    id: r.id,
    testParameterId: r.test_parameter_id,
    analysisKind: r.analysis_kind,
    methodVariant: r.method_variant,
    standardRef: r.standard_ref,
    reportedQuantity: r.reported_quantity,
    reportedUnit: r.reported_unit,
    decimals: num(r.decimals),
    minFields: num(r.min_fields) ?? 1,
    minCountsPerField: num(r.min_counts_per_field),
    scaleMode: r.scale_mode,
    settings: r.settings ?? {},
    methodVerificationId: r.method_verification_id,
    active: r.active !== false,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function rowToCalibration(r: MetallographyScaleCalibrationRow): ScaleCalibration {
  return {
    id: r.id,
    calCode: r.cal_code,
    microscopeEquipmentId: r.microscope_equipment_id,
    cameraEquipmentId: r.camera_equipment_id,
    stageMicrometerEquipmentId: r.stage_micrometer_equipment_id,
    objective: r.objective,
    totalMagnification: num(r.total_magnification),
    imageWidthPx: num(r.image_width_px) ?? 0,
    imageHeightPx: num(r.image_height_px) ?? 0,
    cameraSettings: r.camera_settings,
    referenceLengthUm: num(r.reference_length_um) ?? 0,
    readings: Array.isArray(r.readings) ? r.readings : [],
    umPerPxX: num(r.um_per_px_x) ?? 0,
    umPerPxY: num(r.um_per_px_y) ?? 0,
    uRelScalePct: num(r.u_rel_scale),
    evidenceImagePath: r.evidence_image_path,
    evidenceImageSha256: r.evidence_image_sha256,
    performedBy: r.performed_by,
    performedByName: r.performed_by_name,
    performedAt: r.performed_at,
    verifiedBy: r.verified_by,
    verifiedByName: r.verified_by_name,
    verifiedAt: r.verified_at,
    status: r.status,
    validFrom: r.valid_from,
    validUntil: r.valid_until,
    overrideReason: r.override_reason,
    withdrawReason: r.withdraw_reason,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function rowToAnalysis(r: MetallographyAnalysisRow): Analysis {
  return {
    id: r.id,
    analysisNo: r.analysis_no,
    purpose: r.purpose,
    paramRowId: r.test_allocation_parameter_id,
    sampleId: r.sample_id,
    testAllocationId: r.test_allocation_id,
    testParameterId: r.test_parameter_id,
    methodId: r.method_id,
    methodSnapshot: r.method_snapshot,
    kind: r.analysis_kind,
    indicative: r.indicative !== false,
    scaleCalibrationId: r.scale_calibration_id,
    scaleSnapshot: r.scale_snapshot,
    inImageScale: r.in_image_scale,
    microscopeEquipmentId: r.microscope_equipment_id,
    cameraEquipmentId: r.camera_equipment_id,
    equipmentSnapshot: Array.isArray(r.equipment_snapshot) ? r.equipment_snapshot : null,
    magnification: r.magnification,
    etchant: r.etchant,
    specimenPrep: r.specimen_prep,
    testDate: r.test_date,
    engineVersion: r.engine_version,
    engineParams: r.engine_params ?? {},
    resultSummary: r.result_summary,
    reportedValue: r.reported_value,
    reportedUnit: r.reported_unit,
    status: r.status,
    completedBy: r.completed_by,
    completedAt: r.completed_at,
    supersededBy: r.superseded_by,
    voidReason: r.void_reason,
    voidedBy: r.voided_by,
    voidedAt: r.voided_at,
    overrideReason: r.override_reason,
    includeInReport: r.include_in_report === true,
    performedBy: r.performed_by,
    performedByName: r.performed_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function rowToField(r: MetallographyFieldRow): AnalysisField {
  const marks = r.marks && Array.isArray((r.marks as { items?: unknown }).items) ? (r.marks as AnalysisField['marks']) : { items: [] }
  return {
    id: r.id,
    analysisId: r.analysis_id,
    fieldNo: num(r.field_no) ?? 0,
    rawImagePath: r.raw_image_path,
    rawImageSha256: r.raw_image_sha256,
    rawImageBytes: num(r.raw_image_bytes),
    rawImageMime: r.raw_image_mime,
    originalFileName: r.original_file_name,
    imageWidthPx: num(r.image_width_px),
    imageHeightPx: num(r.image_height_px),
    capturedAt: r.captured_at,
    locationOnSpecimen: r.location_on_specimen,
    displaySettings: r.display_settings,
    operatorAdjustments: r.operator_adjustments,
    marks,
    annotations: Array.isArray(r.annotations) ? r.annotations : [],
    measurements: r.measurements,
    featuresPath: r.features_path,
    featuresSha256: r.features_sha256,
    renderedOverlayPath: r.rendered_overlay_path,
    includeInReport: r.include_in_report === true,
    excluded: r.excluded === true,
    excludeReason: r.exclude_reason,
    uploadedBy: r.uploaded_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function rowToRecheck(r: MetallographyRecheckRow): Recheck {
  return {
    id: r.id,
    analysisId: r.analysis_id,
    engineVersion: r.engine_version,
    hashesVerified: r.hashes_verified === true,
    match: r.match === true,
    details: r.details ?? {},
    runBy: r.run_by,
    runByName: r.run_by_name,
    runAt: r.run_at,
  }
}

// ---------------------------------------------------------------------------
// Settings, switch and permissions
// ---------------------------------------------------------------------------

/** Module switch through the RPC app_metallography_enabled(). Never throws. */
export async function fetchMetallographySwitch(): Promise<MetallographySwitch> {
  try {
    const { data, error } = await supabase.rpc('app_metallography_enabled')
    if (error) return isMissingSchemaError(error) ? 'missing' : 'off'
    return data === true ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

export async function fetchSettings(): Promise<MgLoad<MetallographySettings>> {
  const { data, error } = await supabase.from('metallography_settings').select('*').eq('id', 1).maybeSingle()
  if (error) {
    if (isMissingSchemaError(error)) return MISSING
    fail(error)
  }
  if (!data) return ok({ enabled: false, aiMode: 'off', updatedBy: null, updatedAt: '' })
  return ok(rowToSettings(data as MetallographySettingsRow))
}

/** Laboratory Director only (RLS + guard). */
export async function updateSettings(patch: { enabled?: boolean; aiMode?: AiMode }): Promise<MetallographySettings> {
  const row = await updateRow<MetallographySettingsRow>(
    'metallography_settings',
    1,
    compact({ enabled: patch.enabled, ai_mode: patch.aiMode }),
    'Only the Laboratory Director can change the metallography settings.',
  )
  return rowToSettings(row)
}

async function rpcBool(fn: string, args?: Record<string, unknown>): Promise<boolean | 'missing'> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    if (isMissingSchemaError(error)) return 'missing'
    fail(error)
  }
  return data === true
}

/** What the signed-in user may do (same SQL helpers the guards use). */
export async function fetchMetallographyPermissions(): Promise<MgLoad<MetallographyPermissions>> {
  const [canRun, canCalibrate, canManageMethods] = await Promise.all([
    rpcBool('app_metallography_can_run'),
    rpcBool('app_metallography_can_calibrate'),
    rpcBool('app_metallography_can_manage_methods'),
  ])
  if (canRun === 'missing' || canCalibrate === 'missing' || canManageMethods === 'missing') return MISSING
  return ok({ canRun, canCalibrate, canManageMethods })
}

// ---------------------------------------------------------------------------
// Method Setup
// ---------------------------------------------------------------------------

export async function listMethods(opts?: { activeOnly?: boolean }): Promise<MgLoad<ParameterMethod[]>> {
  let q = supabase.from('metallography_parameter_methods').select('*').order('created_at', { ascending: true })
  if (opts?.activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) {
    if (isMissingSchemaError(error)) return MISSING
    fail(error)
  }
  return ok(((data ?? []) as MetallographyParameterMethodRow[]).map(rowToMethod))
}

export async function getMethod(id: string): Promise<MgLoad<ParameterMethod | null>> {
  const { data, error } = await supabase.from('metallography_parameter_methods').select('*').eq('id', id).maybeSingle()
  if (error) {
    if (isMissingSchemaError(error)) return MISSING
    fail(error)
  }
  return ok(data ? rowToMethod(data as MetallographyParameterMethodRow) : null)
}

/**
 * Active mappings by test_parameter_id, in one query per 150 ids (Enter
 * Results loads its rows' parameters at once). 'missing' before the migration.
 */
export async function fetchMethodsByTestParameterIds(
  testParameterIds: ReadonlyArray<string | null | undefined>,
): Promise<MgLoad<Record<string, ParameterMethod>>> {
  const ids = cleanIds(testParameterIds)
  if (ids.length === 0) return ok({})
  const rows = await selectIn<MetallographyParameterMethodRow>(
    'metallography_parameter_methods',
    '*',
    'test_parameter_id',
    ids,
  )
  if (rows === 'missing') return MISSING
  const out: Record<string, ParameterMethod> = {}
  for (const r of rows) if (r.active !== false) out[r.test_parameter_id] = rowToMethod(r)
  return ok(out)
}

function methodInputToRow(input: Partial<ParameterMethodInput>): Record<string, unknown> {
  return compact({
    test_parameter_id: input.testParameterId,
    analysis_kind: input.analysisKind,
    method_variant: input.methodVariant === undefined ? undefined : input.methodVariant?.trim() || null,
    // empty -> the database prefills test_parameters.test_method
    standard_ref: input.standardRef === undefined ? undefined : input.standardRef?.trim() || '',
    reported_quantity: input.reportedQuantity === undefined ? undefined : input.reportedQuantity.trim(),
    reported_unit: input.reportedUnit === undefined ? undefined : input.reportedUnit?.trim() || null,
    decimals: input.decimals,
    min_fields: input.minFields,
    min_counts_per_field: input.minCountsPerField,
    scale_mode: input.scaleMode,
    settings: input.settings,
    method_verification_id: input.methodVerificationId,
    active: input.active,
  })
}

/** Map a test parameter (insert). */
export async function createMethod(input: ParameterMethodInput): Promise<ParameterMethod> {
  const { data, error } = await supabase
    .from('metallography_parameter_methods')
    .insert(methodInputToRow(input))
    .select('*')
    .single()
  if (error) fail(error)
  return rowToMethod(data as MetallographyParameterMethodRow)
}

export async function updateMethod(id: string, patch: Partial<ParameterMethodInput>): Promise<ParameterMethod> {
  const row = await updateRow<MetallographyParameterMethodRow>(
    'metallography_parameter_methods',
    id,
    methodInputToRow(patch),
    'Only the Laboratory Director or someone with Edit on Method Setup can change metallography methods.',
  )
  return rowToMethod(row)
}

export async function setMethodActive(id: string, active: boolean): Promise<ParameterMethod> {
  return updateMethod(id, { active })
}

/** Refused by the database once an analysis uses the method (deactivate instead). */
export async function deleteMethod(id: string): Promise<void> {
  const { data, error } = await supabase.from('metallography_parameter_methods').delete().eq('id', id).select('id')
  if (error) fail(error)
  if (!data || data.length === 0) {
    throw new Error('Only the Laboratory Director or someone with Edit on Method Setup can remove a mapping.')
  }
}

/** app_metallography_method_reportable(): approved, fit / conditional, in date. */
export async function fetchMethodReportable(methodId: string): Promise<boolean> {
  const v = await rpcBool('app_metallography_method_reportable', { p_method: methodId })
  if (v === 'missing') throw new MetallographyMissingError()
  return v
}

/** Method validation / verification records to link (Quality → Method Verifications). */
export async function listMethodVerificationOptions(
  testParameterIds?: ReadonlyArray<string>,
): Promise<MgLoad<MethodVerificationOption[]>> {
  let q = supabase
    .from('method_verifications')
    .select('id, record_no, method_reference, test_parameter_id, status, conclusion, valid_until')
    .order('record_no', { ascending: true })
  const ids = cleanIds(testParameterIds ?? [])
  if (ids.length > 0) q = q.in('test_parameter_id', ids.slice(0, CHUNK))
  const { data, error } = await q
  if (error) {
    if (isMissingSchemaError(error)) return MISSING
    fail(error)
  }
  const today = localIsoDate()
  return ok(
    ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
      const status = String(r.status ?? '')
      const conclusion = str(r.conclusion)
      const validUntil = str(r.valid_until)
      return {
        id: String(r.id),
        recordNo: String(r.record_no ?? ''),
        methodReference: String(r.method_reference ?? ''),
        testParameterId: str(r.test_parameter_id),
        status,
        conclusion,
        validUntil,
        reportable:
          status === 'approved' &&
          (conclusion === 'fit_for_purpose' || conclusion === 'conditional') &&
          (!validUntil || validUntil >= today),
      }
    }),
  )
}

// ---------------------------------------------------------------------------
// Microscope calibrations (µm/px)
// ---------------------------------------------------------------------------

export async function listCalibrations(filters?: {
  status?: CalibrationStatus | 'all'
  microscopeEquipmentId?: string
}): Promise<MgLoad<ScaleCalibration[]>> {
  let q = supabase.from('metallography_scale_calibrations').select('*').order('performed_at', { ascending: false })
  if (filters?.status && filters.status !== 'all') q = q.eq('status', filters.status)
  if (filters?.microscopeEquipmentId) q = q.eq('microscope_equipment_id', filters.microscopeEquipmentId)
  const { data, error } = await q
  if (error) {
    if (isMissingSchemaError(error)) return MISSING
    fail(error)
  }
  return ok(((data ?? []) as MetallographyScaleCalibrationRow[]).map(rowToCalibration))
}

export async function getCalibration(id: string): Promise<MgLoad<ScaleCalibration | null>> {
  const { data, error } = await supabase.from('metallography_scale_calibrations').select('*').eq('id', id).maybeSingle()
  if (error) {
    if (isMissingSchemaError(error)) return MISSING
    fail(error)
  }
  return ok(data ? rowToCalibration(data as MetallographyScaleCalibrationRow) : null)
}

/** Effective first day of validity (valid_from, else the reading date). */
export function calibrationValidFrom(c: ScaleCalibration): string {
  return c.validFrom ?? c.performedAt.slice(0, 10)
}

/** Verified, valid on `onDate` and (when given) at this resolution: the only ones the workbench offers. */
export async function listUsableCalibrations(opts: {
  onDate: string
  imageWidthPx?: number | null
  imageHeightPx?: number | null
  microscopeEquipmentId?: string | null
}): Promise<MgLoad<ScaleCalibration[]>> {
  let q = supabase
    .from('metallography_scale_calibrations')
    .select('*')
    .eq('status', 'verified')
    .gte('valid_until', opts.onDate)
    .order('valid_until', { ascending: false })
  if (opts.microscopeEquipmentId) q = q.eq('microscope_equipment_id', opts.microscopeEquipmentId)
  if (opts.imageWidthPx) q = q.eq('image_width_px', opts.imageWidthPx)
  if (opts.imageHeightPx) q = q.eq('image_height_px', opts.imageHeightPx)
  const { data, error } = await q
  if (error) {
    if (isMissingSchemaError(error)) return MISSING
    fail(error)
  }
  return ok(
    ((data ?? []) as MetallographyScaleCalibrationRow[])
      .map(rowToCalibration)
      .filter((c) => calibrationValidFrom(c) <= opts.onDate),
  )
}

function calibrationInputToRow(input: Partial<ScaleCalibrationDraftInput>): Record<string, unknown> {
  return compact({
    microscope_equipment_id: input.microscopeEquipmentId,
    camera_equipment_id: input.cameraEquipmentId,
    stage_micrometer_equipment_id: input.stageMicrometerEquipmentId,
    objective: input.objective === undefined ? undefined : input.objective.trim(),
    total_magnification: input.totalMagnification,
    image_width_px: input.imageWidthPx,
    image_height_px: input.imageHeightPx,
    camera_settings: input.cameraSettings,
    reference_length_um: input.referenceLengthUm,
    readings: input.readings?.map((r) => ({ axis: r.axis, x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 })),
    valid_from: input.validFrom,
    valid_until: input.validUntil,
    notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
  })
}

/**
 * New draft calibration with its micrometer image. The row is inserted first
 * (the bucket accepts the image only for a draft the caller performs), then
 * the image is uploaded; if the upload fails the draft is deleted again.
 * µm/px and u_rel come back computed by the database.
 */
export async function createCalibrationDraft(
  input: ScaleCalibrationDraftInput & { file: File; id?: string },
): Promise<ScaleCalibration> {
  assertMetallographyImage(input.file)
  const id = input.id ?? crypto.randomUUID()
  const sha256 = await sha256Hex(input.file)
  const path = calibrationImagePath(id, sha256, imageExtension(input.file))
  const { data, error } = await supabase
    .from('metallography_scale_calibrations')
    .insert({
      ...calibrationInputToRow(input),
      id,
      status: 'draft',
      evidence_image_path: path,
      evidence_image_sha256: sha256,
    })
    .select('*')
    .single()
  if (error) fail(error)
  try {
    await uploadCalibrationImage({ calibrationId: id, file: input.file, sha256 })
  } catch (e) {
    await supabase.from('metallography_scale_calibrations').delete().eq('id', id)
    throw e
  }
  return rowToCalibration(data as MetallographyScaleCalibrationRow)
}

/** Change a draft (performer or Director). Verified calibrations are read-only. */
export async function updateCalibrationDraft(
  id: string,
  patch: Partial<ScaleCalibrationDraftInput>,
): Promise<ScaleCalibration> {
  const row = await updateRow<MetallographyScaleCalibrationRow>(
    'metallography_scale_calibrations',
    id,
    calibrationInputToRow(patch),
    'Only the person who performed the calibration can change the draft (or the Laboratory Director).',
  )
  return rowToCalibration(row)
}

/** Replace the micrometer image of a draft: upload new, point the row at it, remove the old file. */
export async function replaceCalibrationImage(cal: ScaleCalibration, file: File): Promise<ScaleCalibration> {
  const up = await uploadCalibrationImage({ calibrationId: cal.id, file })
  let row: MetallographyScaleCalibrationRow
  try {
    row = await updateRow<MetallographyScaleCalibrationRow>(
      'metallography_scale_calibrations',
      cal.id,
      { evidence_image_path: up.path, evidence_image_sha256: up.sha256 },
      'Only the person who performed the calibration can change the draft (or the Laboratory Director).',
    )
  } catch (e) {
    if (!up.alreadyExisted && up.path !== cal.evidenceImagePath) await removeObjects([up.path])
    throw e
  }
  if (cal.evidenceImagePath && cal.evidenceImagePath !== up.path) await removeObjects([cal.evidenceImagePath])
  return rowToCalibration(row)
}

/**
 * Verify (second person with Edit on Microscope Calibration). The database
 * checks the stage micrometer and microscope; when one is not usable only the
 * Director can verify, with overrideReason (then call recordReason()).
 */
export async function verifyCalibration(id: string, overrideReason?: string | null): Promise<ScaleCalibration> {
  const row = await updateRow<MetallographyScaleCalibrationRow>(
    'metallography_scale_calibrations',
    id,
    compact({ status: 'verified', override_reason: overrideReason?.trim() || undefined }),
    'You cannot verify this calibration.',
  )
  return rowToCalibration(row)
}

export async function withdrawCalibration(id: string, reason: string): Promise<ScaleCalibration> {
  const row = await updateRow<MetallographyScaleCalibrationRow>(
    'metallography_scale_calibrations',
    id,
    { status: 'withdrawn', withdraw_reason: reason.trim() },
    'You cannot withdraw this calibration.',
  )
  return rowToCalibration(row)
}

/** Validity of a verified calibration can only be shortened. */
export async function shortenCalibrationValidity(id: string, validUntil: string): Promise<ScaleCalibration> {
  const row = await updateRow<MetallographyScaleCalibrationRow>(
    'metallography_scale_calibrations',
    id,
    { valid_until: validUntil },
    'You cannot change this calibration.',
  )
  return rowToCalibration(row)
}

/** Drafts only, by the performer or the Director. Removes the row, then the image. */
export async function deleteCalibrationDraft(cal: ScaleCalibration): Promise<void> {
  const { data, error } = await supabase.from('metallography_scale_calibrations').delete().eq('id', cal.id).select('id')
  if (error) fail(error)
  if (!data || data.length === 0) {
    throw new Error('Only a draft can be deleted, by the person who performed it (or the Laboratory Director).')
  }
  await removeObjects([cal.evidenceImagePath])
}

// ---------------------------------------------------------------------------
// Analyses
// ---------------------------------------------------------------------------

function analysisUpdateToRow(patch: AnalysisUpdateInput): Record<string, unknown> {
  return compact({
    scale_calibration_id: patch.scaleCalibrationId,
    in_image_scale: patch.inImageScale,
    camera_equipment_id: patch.cameraEquipmentId,
    equipment_snapshot: patch.equipmentSnapshot,
    magnification: patch.magnification,
    etchant: patch.etchant,
    specimen_prep: patch.specimenPrep,
    test_date: patch.testDate,
    engine_version: patch.engineVersion,
    engine_params: patch.engineParams,
    result_summary: patch.resultSummary,
    reported_value: patch.reportedValue,
    reported_unit: patch.reportedUnit,
    override_reason: patch.overrideReason,
  })
}

/** S1 Analyses tab: newest first, with SRF, parameter, link and last re-check. */
export async function listAnalyses(filters: AnalysisListFilters = {}): Promise<MgLoad<AnalysisListItem[]>> {
  let sampleFilter: string[] | null = null
  const srf = filters.srf?.trim()
  if (srf) {
    const { data, error } = await supabase.from('samples').select('id').ilike('srf_number', `%${srf}%`).limit(CHUNK)
    if (error) fail(error)
    sampleFilter = ((data ?? []) as Array<{ id: string }>).map((r) => r.id)
    if (sampleFilter.length === 0) return ok([])
  }

  let q = supabase
    .from('metallography_analyses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 500)
  if (filters.kind && filters.kind !== 'all') q = q.eq('analysis_kind', filters.kind)
  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
  if (filters.purpose && filters.purpose !== 'all') q = q.eq('purpose', filters.purpose)
  if (filters.from) q = q.gte('test_date', filters.from)
  if (filters.to) q = q.lte('test_date', filters.to)
  if (filters.performedBy) q = q.eq('performed_by', filters.performedBy)
  if (sampleFilter) q = q.in('sample_id', sampleFilter)
  const { data, error } = await q
  if (error) {
    if (isMissingSchemaError(error)) return MISSING
    fail(error)
  }
  const analyses = ((data ?? []) as MetallographyAnalysisRow[]).map(rowToAnalysis)
  if (analyses.length === 0) return ok([])

  const sampleIds = cleanIds(analyses.map((a) => a.sampleId))
  const paramIds = cleanIds(analyses.map((a) => a.paramRowId))
  const analysisIds = analyses.map((a) => a.id)

  const [samples, params, rechecks] = await Promise.all([
    sampleIds.length ? selectIn<{ id: string; srf_number: string | null }>('samples', 'id, srf_number', 'id', sampleIds) : [],
    paramIds.length
      ? selectIn<{ id: string; test_label: string | null; metallography_analysis_id: string | null }>(
          'test_allocation_parameters',
          'id, test_label, metallography_analysis_id',
          'id',
          paramIds,
        )
      : [],
    selectIn<{ analysis_id: string; match: boolean; run_at: string; run_by_name: string | null }>(
      'metallography_rechecks',
      'analysis_id, match, run_at, run_by_name',
      'analysis_id',
      analysisIds,
    ),
  ])
  if (samples === 'missing' || params === 'missing' || rechecks === 'missing') return MISSING

  const srfBySample = new Map(samples.map((s) => [s.id, s.srf_number]))
  const paramById = new Map(params.map((p) => [p.id, p]))
  const lastRecheck = new Map<string, { match: boolean; runAt: string; runByName: string | null }>()
  for (const r of rechecks) {
    const prev = lastRecheck.get(r.analysis_id)
    if (!prev || r.run_at > prev.runAt) {
      lastRecheck.set(r.analysis_id, { match: r.match === true, runAt: r.run_at, runByName: r.run_by_name })
    }
  }

  return ok(
    analyses.map((a) => {
      const p = a.paramRowId ? paramById.get(a.paramRowId) : undefined
      return {
        ...a,
        srfNumber: a.sampleId ? (srfBySample.get(a.sampleId) ?? null) : null,
        testLabel: p?.test_label ?? null,
        linkedToResult: Boolean(p && p.metallography_analysis_id === a.id),
        lastRecheck: lastRecheck.get(a.id) ?? null,
      }
    }),
  )
}

export async function listFields(analysisId: string): Promise<MgLoad<AnalysisField[]>> {
  const { data, error } = await supabase
    .from('metallography_fields')
    .select('*')
    .eq('analysis_id', analysisId)
    .order('field_no', { ascending: true })
  if (error) {
    if (isMissingSchemaError(error)) return MISSING
    fail(error)
  }
  return ok(((data ?? []) as MetallographyFieldRow[]).map(rowToField))
}

export async function listRechecks(analysisId: string): Promise<MgLoad<Recheck[]>> {
  const { data, error } = await supabase
    .from('metallography_rechecks')
    .select('*')
    .eq('analysis_id', analysisId)
    .order('run_at', { ascending: false })
  if (error) {
    if (isMissingSchemaError(error)) return MISSING
    fail(error)
  }
  return ok(((data ?? []) as MetallographyRecheckRow[]).map(rowToRecheck))
}

export async function getAnalysisRow(id: string): Promise<MgLoad<Analysis | null>> {
  const { data, error } = await supabase.from('metallography_analyses').select('*').eq('id', id).maybeSingle()
  if (error) {
    if (isMissingSchemaError(error)) return MISSING
    fail(error)
  }
  return ok(data ? rowToAnalysis(data as MetallographyAnalysisRow) : null)
}

/** Everything S2 / S3 show for one analysis. data null = not found (or not visible). */
export async function getAnalysis(id: string): Promise<MgLoad<AnalysisDetail | null>> {
  const head = await getAnalysisRow(id)
  if (head.status === 'missing') return MISSING
  const analysis = head.data
  if (!analysis) return ok(null)

  const [fields, rechecks, method, calibration] = await Promise.all([
    listFields(id),
    listRechecks(id),
    analysis.methodId ? getMethod(analysis.methodId) : Promise.resolve(ok<ParameterMethod | null>(null)),
    analysis.scaleCalibrationId
      ? getCalibration(analysis.scaleCalibrationId)
      : Promise.resolve(ok<ScaleCalibration | null>(null)),
  ])
  if (fields.status === 'missing' || rechecks.status === 'missing' || method.status === 'missing' || calibration.status === 'missing') {
    return MISSING
  }

  let context: AnalysisDetail['context'] = null
  if (analysis.paramRowId) {
    const { data: p, error: pErr } = await supabase
      .from('test_allocation_parameters')
      .select('id, test_allocation_id, test_label, results, results_review_status, results_reviewer_id, metallography_analysis_id')
      .eq('id', analysis.paramRowId)
      .maybeSingle()
    if (pErr) {
      if (isMissingSchemaError(pErr)) return MISSING
      fail(pErr)
    }
    let srfNumber: string | null = null
    const allocId = (p as { test_allocation_id?: string } | null)?.test_allocation_id ?? analysis.testAllocationId
    if (allocId) {
      const { data: ta } = await supabase.from('test_allocations').select('srf_number').eq('id', allocId).maybeSingle()
      srfNumber = (ta as { srf_number?: string | null } | null)?.srf_number ?? null
    }
    const locked = await rpcBool('app_metallography_result_locked', { p_tap: analysis.paramRowId })
    const row = (p ?? {}) as Record<string, unknown>
    context = {
      srfNumber,
      testLabel: str(row.test_label),
      results: str(row.results),
      resultsReviewStatus: str(row.results_review_status),
      resultsReviewerId: str(row.results_reviewer_id),
      linkedAnalysisId: str(row.metallography_analysis_id),
      locked: locked === true,
    }
  }

  return ok({
    analysis,
    fields: fields.data,
    rechecks: rechecks.data,
    method: method.data,
    calibration: calibration.data,
    context,
  })
}

/**
 * Enter Results: in-progress / completed / linked analysis per result row.
 * 'missing' before the migration (the link stays hidden).
 */
export async function fetchAnalysisInfoForParamRows(
  paramRowIds: ReadonlyArray<string | null | undefined>,
): Promise<MgLoad<Record<string, ParamRowAnalysisInfo>>> {
  const ids = cleanIds(paramRowIds)
  if (ids.length === 0) return ok({})
  const [taps, analyses] = await Promise.all([
    selectIn<{ id: string; metallography_analysis_id: string | null }>(
      'test_allocation_parameters',
      'id, metallography_analysis_id',
      'id',
      ids,
    ),
    selectIn<MetallographyAnalysisRow>(
      'metallography_analyses',
      'id, analysis_no, test_allocation_parameter_id, status, reported_value, indicative, microscope_equipment_id, camera_equipment_id',
      'test_allocation_parameter_id',
      ids,
    ),
  ])
  if (taps === 'missing' || analyses === 'missing') return MISSING

  const byId = new Map(analyses.map((a) => [a.id, a]))
  const out: Record<string, ParamRowAnalysisInfo> = {}
  for (const id of ids) out[id] = { paramRowId: id, inProgress: null, completed: null, linked: null }
  for (const a of analyses) {
    const info = a.test_allocation_parameter_id ? out[a.test_allocation_parameter_id] : undefined
    if (!info) continue
    if (a.status === 'in_progress') info.inProgress = { id: a.id, analysisNo: a.analysis_no }
    if (a.status === 'completed') {
      info.completed = {
        id: a.id,
        analysisNo: a.analysis_no,
        reportedValue: a.reported_value,
        indicative: a.indicative !== false,
        microscopeEquipmentId: a.microscope_equipment_id,
        cameraEquipmentId: a.camera_equipment_id,
      }
    }
  }
  for (const t of taps) {
    if (!t.metallography_analysis_id || !out[t.id]) continue
    const a = byId.get(t.metallography_analysis_id)
    out[t.id].linked = {
      id: t.metallography_analysis_id,
      analysisNo: a?.analysis_no ?? null,
      status: (a?.status ?? 'completed') as AnalysisStatus,
    }
  }
  return ok(out)
}

/** New analysis. Links, method snapshot, Indicative flag and number are set by the database. */
export async function createAnalysis(input: AnalysisCreateInput): Promise<Analysis> {
  const { data, error } = await supabase
    .from('metallography_analyses')
    .insert(
      compact({
        id: input.id,
        purpose: input.purpose,
        test_allocation_parameter_id: input.purpose === 'sample' ? input.paramRowId : null,
        method_id: input.purpose === 'sample' ? undefined : input.methodId,
        test_date: input.testDate,
        scale_calibration_id: input.scaleCalibrationId,
      }),
    )
    .select('*')
    .single()
  if (error) fail(error)
  return rowToAnalysis(data as MetallographyAnalysisRow)
}

/** Enter Results "Metallography": reopen the draft of this result row, or create one. */
export async function openOrCreateAnalysisForParamRow(paramRowId: string, opts?: { testDate?: string }): Promise<Analysis> {
  const findDraft = async () => {
    const { data, error } = await supabase
      .from('metallography_analyses')
      .select('*')
      .eq('test_allocation_parameter_id', paramRowId)
      .eq('status', 'in_progress')
      .maybeSingle()
    if (error) fail(error)
    return data ? rowToAnalysis(data as MetallographyAnalysisRow) : null
  }
  const existing = await findDraft()
  if (existing) return existing
  try {
    return await createAnalysis({ purpose: 'sample', paramRowId, testDate: opts?.testDate })
  } catch (e) {
    // Another tab created it a moment ago.
    const again = await findDraft()
    if (again) return again
    throw e
  }
}

/** Save draft (analyst or Director, while in progress). */
export async function updateAnalysis(id: string, patch: AnalysisUpdateInput): Promise<Analysis> {
  const row = await updateRow<MetallographyAnalysisRow>(
    'metallography_analyses',
    id,
    analysisUpdateToRow(patch),
    'Only the analyst (or the Laboratory Director) can change this analysis.',
  )
  return rowToAnalysis(row)
}

/**
 * Complete: the database checks fields, scale, equipment and (ring test) the
 * verdict, then supersedes an earlier completed analysis of the same result.
 */
export async function completeAnalysis(id: string, patch: AnalysisUpdateInput = {}): Promise<Analysis> {
  const row = await updateRow<MetallographyAnalysisRow>(
    'metallography_analyses',
    id,
    { ...analysisUpdateToRow(patch), status: 'completed' },
    'Only the analyst (or the Laboratory Director) can complete this analysis.',
  )
  return rowToAnalysis(row)
}

/** Void with a reason (analyst or Director). Call recordReason() afterwards. */
export async function voidAnalysis(id: string, reason: string): Promise<Analysis> {
  const row = await updateRow<MetallographyAnalysisRow>(
    'metallography_analyses',
    id,
    { status: 'void', void_reason: reason.trim() },
    'Only the analyst or the Laboratory Director can void this analysis.',
  )
  return rowToAnalysis(row)
}

/** Micrograph annex flag (analyst, Quality Manager or Director; allowed on a completed analysis). */
export async function setAnalysisIncludeInReport(id: string, include: boolean): Promise<Analysis> {
  const row = await updateRow<MetallographyAnalysisRow>(
    'metallography_analyses',
    id,
    { include_in_report: include },
    'You cannot change this analysis.',
  )
  return rowToAnalysis(row)
}

/** In-progress analysis without images (analyst), or Director. */
export async function deleteAnalysis(id: string): Promise<void> {
  const { data, error } = await supabase.from('metallography_analyses').delete().eq('id', id).select('id')
  if (error) fail(error)
  if (!data || data.length === 0) {
    throw new Error('Only the analyst can delete an analysis that is in progress and has no images (or the Laboratory Director).')
  }
}

/**
 * Supersede: a new in-progress analysis of the same result (or the same method
 * for validation / IQC / training) that copies scale, specimen data and the
 * fields BY REFERENCE (same stored originals and hashes, marks and
 * adjustments). The old analysis becomes superseded when the new one is completed.
 */
export async function supersedeAnalysis(oldId: string): Promise<Analysis> {
  const head = await getAnalysisRow(oldId)
  if (head.status === 'missing') throw new MetallographyMissingError()
  const old = head.data
  if (!old) throw new Error('Analysis not found.')
  if (old.status !== 'completed') throw new Error('Only a completed analysis can be superseded.')

  let calibrationId: string | null = null
  if (old.scaleCalibrationId) {
    const cal = await getCalibration(old.scaleCalibrationId)
    if (cal.status === 'ok' && cal.data?.status === 'verified') calibrationId = cal.data.id
  }

  const next = await createAnalysis({
    purpose: old.purpose,
    paramRowId: old.paramRowId,
    methodId: old.methodId,
    testDate: localIsoDate(),
    scaleCalibrationId: calibrationId,
  })

  const updated = await updateAnalysis(next.id, {
    inImageScale: old.inImageScale,
    cameraEquipmentId: old.cameraEquipmentId,
    equipmentSnapshot: old.equipmentSnapshot,
    magnification: old.magnification,
    etchant: old.etchant,
    specimenPrep: old.specimenPrep,
    engineParams: old.engineParams,
  })

  const fields = await listFields(old.id)
  if (fields.status === 'ok' && fields.data.length > 0) {
    const { error } = await supabase.from('metallography_fields').insert(
      fields.data.map((f) => ({
        analysis_id: next.id,
        field_no: f.fieldNo,
        raw_image_path: f.rawImagePath,
        raw_image_sha256: f.rawImageSha256,
        raw_image_bytes: f.rawImageBytes,
        raw_image_mime: f.rawImageMime,
        original_file_name: f.originalFileName,
        image_width_px: f.imageWidthPx,
        image_height_px: f.imageHeightPx,
        captured_at: f.capturedAt,
        location_on_specimen: f.locationOnSpecimen,
        display_settings: f.displaySettings,
        operator_adjustments: f.operatorAdjustments,
        marks: f.marks,
        annotations: f.annotations,
        measurements: f.measurements,
        excluded: f.excluded,
        exclude_reason: f.excludeReason,
        include_in_report: f.includeInReport,
      })),
    )
    if (error) fail(error)
  }
  return updated
}

/** Unlink a result row from its analysis (refused under review / approved). Call recordReason() afterwards. */
export async function unlinkParamRow(paramRowId: string): Promise<void> {
  const { data, error } = await supabase
    .from('test_allocation_parameters')
    .update({ metallography_analysis_id: null })
    .eq('id', paramRowId)
    .select('id')
  if (error) fail(error)
  if (!data || data.length === 0) throw new Error('You cannot change this result.')
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/** Next free field number. */
export function nextFieldNo(fields: ReadonlyArray<Pick<AnalysisField, 'fieldNo'>>): number {
  return fields.reduce((m, f) => Math.max(m, f.fieldNo), 0) + 1
}

/**
 * Add an original: hash in the browser, upload (no upsert), insert the field
 * row; if the insert fails the uploaded file is removed again. Width and height
 * come from decoding the file (the caller decodes it to show it anyway).
 */
export async function addFieldFromFile(input: {
  analysisId: string
  fieldNo: number
  file: File
  imageWidthPx: number
  imageHeightPx: number
  capturedAt?: string | null
  locationOnSpecimen?: string | null
}): Promise<AnalysisField> {
  assertMetallographyImage(input.file)
  assertImagePixels(input.imageWidthPx, input.imageHeightPx)
  const up = await uploadFieldOriginal({ analysisId: input.analysisId, fieldNo: input.fieldNo, file: input.file })
  const { data, error } = await supabase
    .from('metallography_fields')
    .insert({
      analysis_id: input.analysisId,
      field_no: input.fieldNo,
      raw_image_path: up.path,
      raw_image_sha256: up.sha256,
      raw_image_bytes: up.bytes,
      raw_image_mime: up.contentType,
      original_file_name: input.file.name,
      image_width_px: input.imageWidthPx,
      image_height_px: input.imageHeightPx,
      captured_at: input.capturedAt ?? null,
      location_on_specimen: input.locationOnSpecimen?.trim() || null,
      marks: { items: [] },
    })
    .select('*')
    .single()
  if (error) {
    await removeObjects([up.path])
    fail(error)
  }
  return rowToField(data as MetallographyFieldRow)
}

export async function updateField(id: string, patch: FieldUpdateInput): Promise<AnalysisField> {
  const row = await updateRow<MetallographyFieldRow>(
    'metallography_fields',
    id,
    compact({
      image_width_px: patch.imageWidthPx,
      image_height_px: patch.imageHeightPx,
      captured_at: patch.capturedAt,
      location_on_specimen: patch.locationOnSpecimen,
      display_settings: patch.displaySettings,
      operator_adjustments: patch.operatorAdjustments,
      marks: patch.marks,
      annotations: patch.annotations,
      measurements: patch.measurements,
      features_path: patch.featuresPath,
      features_sha256: patch.featuresSha256,
      rendered_overlay_path: patch.renderedOverlayPath,
      include_in_report: patch.includeInReport,
    }),
    'Only the analyst (or the Laboratory Director) can change the images of an analysis in progress.',
  )
  return rowToField(row)
}

export async function excludeField(id: string, reason: string): Promise<AnalysisField> {
  const row = await updateRow<MetallographyFieldRow>(
    'metallography_fields',
    id,
    { excluded: true, exclude_reason: reason.trim() },
    'Only the analyst (or the Laboratory Director) can change the images of an analysis in progress.',
  )
  return rowToField(row)
}

export async function includeField(id: string): Promise<AnalysisField> {
  const row = await updateRow<MetallographyFieldRow>(
    'metallography_fields',
    id,
    { excluded: false, exclude_reason: null },
    'Only the analyst (or the Laboratory Director) can change the images of an analysis in progress.',
  )
  return rowToField(row)
}

/**
 * Removes a field row, then its files. Files still referenced by another row
 * (an original re-used by a superseding analysis) are kept by the bucket rule.
 */
export async function deleteField(field: AnalysisField): Promise<void> {
  const { data, error } = await supabase.from('metallography_fields').delete().eq('id', field.id).select('id')
  if (error) fail(error)
  if (!data || data.length === 0) {
    throw new Error('Only the analyst (or the Laboratory Director) can remove an image while the analysis is in progress.')
  }
  const own = `analyses/${field.analysisId}/`
  await removeObjects(
    [field.rawImagePath, field.featuresPath, field.renderedOverlayPath].filter((p): p is string => Boolean(p && p.startsWith(own))),
  )
}

// ---------------------------------------------------------------------------
// Re-checks (S3)
// ---------------------------------------------------------------------------

/** Assigned reviewer, QM or Director, never the analyst. */
export async function fetchCanRecheck(analysisId: string): Promise<boolean> {
  const v = await rpcBool('app_metallography_can_recheck', { p_analysis: analysisId })
  return v === true
}

/** Stamps a re-check through the RPC; returns the new record id. */
export async function recordRecheck(analysisId: string, match: boolean, details: RecheckDetails): Promise<string> {
  const { data, error } = await supabase.rpc('app_metallography_record_recheck', {
    p_analysis: analysisId,
    p_match: match,
    p_details: details,
  })
  if (error) fail(error)
  return String(data)
}

// ---------------------------------------------------------------------------
// Register (S1): pending result rows and the stat strip
// ---------------------------------------------------------------------------

/**
 * Saved result rows of mapped, active parameters with no result yet, not
 * under review / approved / issued, in allocations sent for testing. A
 * non-Director sees only allocations assigned to them.
 */
export async function fetchPendingParameterRows(opts: {
  userId: string | null
  isDirector: boolean
}): Promise<MgLoad<PendingParameterRow[]>> {
  const methods = await listMethods({ activeOnly: true })
  if (methods.status === 'missing') return MISSING
  const methodByParam = new Map(methods.data.map((m) => [m.testParameterId, m]))
  if (methodByParam.size === 0) return ok([])

  type TapRow = {
    id: string
    test_allocation_id: string
    test_parameter_id: string | null
    test_label: string
    results: string | null
    results_review_status: string | null
  }
  const taps: TapRow[] = []
  for (const part of chunks([...methodByParam.keys()])) {
    const { data, error } = await supabase
      .from('test_allocation_parameters')
      .select('id, test_allocation_id, test_parameter_id, test_label, results, results_review_status')
      .in('test_parameter_id', part)
      .or('results.is.null,results.eq.""')
    if (error) {
      if (isMissingSchemaError(error)) return MISSING
      fail(error)
    }
    taps.push(...((data ?? []) as TapRow[]))
  }
  const open = taps.filter(
    (t) =>
      !String(t.results ?? '').trim() &&
      t.results_review_status !== 'under_review' &&
      t.results_review_status !== 'approved',
  )
  if (open.length === 0) return ok([])

  type AllocRow = {
    id: string
    sample_id: string
    srf_number: string | null
    section_code: string | null
    assigned_employee_id: string | null
    assigned_employee_name: string | null
    sent_for_testing: boolean | null
  }
  const allocs = await selectIn<AllocRow>(
    'test_allocations',
    'id, sample_id, srf_number, section_code, assigned_employee_id, assigned_employee_name, sent_for_testing',
    'id',
    cleanIds(open.map((t) => t.test_allocation_id)),
  )
  if (allocs === 'missing') return MISSING
  const allocById = new Map(
    allocs
      .filter((a) => a.sent_for_testing === true)
      .filter((a) => opts.isDirector || (opts.userId && a.assigned_employee_id === opts.userId))
      .map((a) => [a.id, a]),
  )
  const candidates = open.filter((t) => allocById.has(t.test_allocation_id))
  if (candidates.length === 0) return ok([])

  const sampleIds = cleanIds(candidates.map((t) => allocById.get(t.test_allocation_id)?.sample_id))
  const [samples, drafts] = await Promise.all([
    selectIn<{ id: string; stage: string | null }>('samples', 'id, stage', 'id', sampleIds),
    selectIn<{ id: string; analysis_no: string | null; test_allocation_parameter_id: string; status: string }>(
      'metallography_analyses',
      'id, analysis_no, test_allocation_parameter_id, status',
      'test_allocation_parameter_id',
      candidates.map((t) => t.id),
    ),
  ])
  if (samples === 'missing' || drafts === 'missing') return MISSING
  const issued = new Set(samples.filter((s) => s.stage === 'completed').map((s) => s.id))
  const draftByTap = new Map(
    drafts.filter((d) => d.status === 'in_progress').map((d) => [d.test_allocation_parameter_id, d]),
  )

  const out: PendingParameterRow[] = []
  for (const t of candidates) {
    const a = allocById.get(t.test_allocation_id)
    const m = t.test_parameter_id ? methodByParam.get(t.test_parameter_id) : undefined
    if (!a || !m || issued.has(a.sample_id)) continue
    const d = draftByTap.get(t.id)
    out.push({
      paramRowId: t.id,
      testAllocationId: t.test_allocation_id,
      sampleId: a.sample_id,
      srfNumber: a.srf_number,
      sectionCode: a.section_code,
      testParameterId: m.testParameterId,
      testLabel: t.test_label,
      analysisKind: m.analysisKind as AnalysisKind,
      methodId: m.id,
      assignedEmployeeId: a.assigned_employee_id,
      assignedEmployeeName: a.assigned_employee_name,
      inProgressAnalysisId: d?.id ?? null,
      inProgressAnalysisNo: d?.analysis_no ?? null,
    })
  }
  out.sort((x, y) => String(x.srfNumber ?? '').localeCompare(String(y.srfNumber ?? '')) || x.testLabel.localeCompare(y.testLabel))
  return ok(out)
}

/** S1 stat strip: in progress, completed but not used in a result, calibrations expiring soon. */
export async function fetchRegisterStats(): Promise<MgLoad<RegisterStats>> {
  const today = localIsoDate()
  const soon = addDays(today, CALIBRATION_EXPIRY_WARNING_DAYS)
  const [inProgress, completed, expiring] = await Promise.all([
    supabase.from('metallography_analyses').select('id', { count: 'exact', head: true }).eq('status', 'in_progress'),
    supabase
      .from('metallography_analyses')
      .select('id, test_allocation_parameter_id')
      .eq('status', 'completed')
      .eq('purpose', 'sample')
      .limit(1000),
    supabase
      .from('metallography_scale_calibrations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'verified')
      .gte('valid_until', today)
      .lte('valid_until', soon),
  ])
  for (const r of [inProgress, completed, expiring]) {
    if (r.error) {
      if (isMissingSchemaError(r.error)) return MISSING
      fail(r.error)
    }
  }
  const done = (completed.data ?? []) as Array<{ id: string; test_allocation_parameter_id: string | null }>
  const taps = await selectIn<{ id: string; metallography_analysis_id: string | null }>(
    'test_allocation_parameters',
    'id, metallography_analysis_id',
    'id',
    cleanIds(done.map((a) => a.test_allocation_parameter_id)),
  )
  if (taps === 'missing') return MISSING
  const linkByTap = new Map(taps.map((t) => [t.id, t.metallography_analysis_id]))
  const completedNotLinked = done.filter(
    (a) => !a.test_allocation_parameter_id || linkByTap.get(a.test_allocation_parameter_id) !== a.id,
  ).length
  return ok({
    inProgress: inProgress.count ?? 0,
    completedNotLinked,
    calibrationsExpiringSoon: expiring.count ?? 0,
  })
}
