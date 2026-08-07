/** Calibration Handling — shared stage / job types (ISO 17025 Clause 7.7) */

export type CalibrationJobLocation = 'In Lab' | 'On Site'

/** Unified pipeline (Inside/Outside decided at Job Allocation, not separate nav trees). */
export type CalibrationJobStage =
  | 'job_allocation'
  | 'calibration_conduct'
  | 'review_data'
  | 'certificate_preparation'
  | 'certificates'

export const CALIBRATION_JOB_STAGES: CalibrationJobStage[] = [
  'job_allocation',
  'calibration_conduct',
  'review_data',
  'certificate_preparation',
  'certificates',
]

export const CALIBRATION_JOB_STAGE_LABELS: Record<CalibrationJobStage, string> = {
  job_allocation: 'Job Allocation',
  calibration_conduct: 'Calibration Conduct',
  review_data: 'Review Data',
  certificate_preparation: 'Certificate Preparation',
  certificates: 'Calibration Certificates',
}

export const CALIBRATION_JOB_STAGE_SLUGS: Record<CalibrationJobStage, string> = {
  job_allocation: 'job-allocation',
  calibration_conduct: 'calibration-conduct',
  review_data: 'review-data',
  certificate_preparation: 'certificate-preparation',
  certificates: 'certificates',
}

export function stagePath(stage: CalibrationJobStage): string {
  return `/calibration/handling/${CALIBRATION_JOB_STAGE_SLUGS[stage]}`
}

/** New jobs from Accepted SRF always start at Job Allocation. */
export function initialCalibrationJobStage(): CalibrationJobStage {
  return 'job_allocation'
}

export function nextCalibrationJobStage(stage: CalibrationJobStage): CalibrationJobStage | null {
  const idx = CALIBRATION_JOB_STAGES.indexOf(stage)
  if (idx < 0) return null
  return CALIBRATION_JOB_STAGES[idx + 1] ?? null
}

export function previousCalibrationJobStage(stage: CalibrationJobStage): CalibrationJobStage | null {
  const idx = CALIBRATION_JOB_STAGES.indexOf(stage)
  if (idx <= 0) return null
  return CALIBRATION_JOB_STAGES[idx - 1] ?? null
}

/** Outside Conduct checklist payload stored on calibration_jobs jsonb columns. */
export type CalibrationJobOutsideChecklist = {
  completed: boolean
  completedAt: string | null
  remarks: string
  items: Array<{ id: string; label: string; checked: boolean }>
}

export type CalibrationJobRow = {
  id: string
  service_request_id: string
  equipment_line_index: number
  srf_number: string
  client_id: string | null
  client_name: string | null
  equipment_label: string
  equipment_detail: string
  equipment_master_id: string | null
  calibration_location: CalibrationJobLocation
  /** Free-text place/site of calibration (Conduct — required before Raw Data Sheet). */
  location_of_calibration?: string | null
  stage: CalibrationJobStage
  stage_entered_at: string
  remarks: string | null
  allocated_engineer_id: string | null
  allocated_engineer_name: string | null
  /** Outside Conduct — pre-cal outgoing checklist (jsonb). */
  outgoing_checklist?: CalibrationJobOutsideChecklist | Record<string, unknown> | null
  /** Outside Conduct — post-cal inward checklist (jsonb). */
  inward_checklist?: CalibrationJobOutsideChecklist | Record<string, unknown> | null
  /** Certificate Preparation draft (jsonb) — header fields + notes. */
  certificate_draft?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

export type ParsedDucLine = {
  lineIndex: number
  label: string
  detail: string
  location: CalibrationJobLocation
  equipmentMasterId: string | null
}

/** Token embedded in SRF equipment_description for job → equipment_master FK. */
export const EQUIPMENT_MASTER_ID_PREFIX = 'EQID'

const EQID_RE = /\bEQID\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i

export function extractEquipmentMasterIdFromDetail(detail: string): string | null {
  const m = detail.match(EQID_RE)
  return m?.[1] ? m[1].toLowerCase() : null
}

/** Parse SRF equipment_description into per-DUC lines.
 * Inside/Outside is decided later at Job Allocation — default In Lab. */
export function parseDucLinesFromEquipmentDescription(
  description: string | null | undefined,
): ParsedDucLine[] {
  const text = (description ?? '').trim()
  if (!text) return []

  return text
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, lineIndex) => {
      const equipmentMasterId = extractEquipmentMasterIdFromDetail(chunk)
      const parts = chunk.split('·').map((p) => p.trim()).filter(Boolean)
      const head = (parts[0] ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim()
      return {
        lineIndex,
        label: head || `Equipment ${lineIndex + 1}`,
        detail: chunk,
        location: 'In Lab' as CalibrationJobLocation,
        equipmentMasterId,
      }
    })
}
