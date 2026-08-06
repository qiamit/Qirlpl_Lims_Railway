/**
 * Per-equipment Calibration Certificate template.
 * Default layout = Universal Testing Machine (UTM) certificate format.
 * Other equipment start with the same template until customized.
 */

import {
  DEFAULT_CERTIFICATE_NOTES,
  DEFAULT_CERTIFICATE_REMARKS,
} from '@/features/calibration/handling/certificate-preparation/certificateDraftTypes'

/** Known certificate layout kinds (extend when new equipment formats are added). */
export type CertificateTemplateKind = 'utm'

export type CalibrationCertificateTemplate = {
  version: 1
  /** Layout engine — currently only UTM certificate sheet. */
  kind: CertificateTemplateKind
  /** Human label for this template (e.g. Universal Testing Machine). */
  layoutName: string
  title: string
  formatNumber: string
  defaultNotes: string
  defaultRemarks: string
  calibratedByLabel: string
  authorizedSignatoryLabel: string
  deviceSectionPrefix: string
  masterSectionTitle: string
  resultsSectionTitle: string
  showSummaryLine: boolean
  showNotesRemarks: boolean
  showSignatures: boolean
}

export const DEFAULT_CALIBRATION_CERTIFICATE_TEMPLATE: CalibrationCertificateTemplate = {
  version: 1,
  kind: 'utm',
  layoutName: 'Universal Testing Machine',
  title: 'Calibration Certificate',
  formatNumber: '',
  defaultNotes: DEFAULT_CERTIFICATE_NOTES,
  defaultRemarks: DEFAULT_CERTIFICATE_REMARKS,
  calibratedByLabel: 'Calibrated By',
  authorizedSignatoryLabel: 'Authorized Signatory',
  deviceSectionPrefix: 'Device under Calibration',
  masterSectionTitle: 'Master Used for Calibration',
  resultsSectionTitle: 'Calibration Results',
  showSummaryLine: true,
  showNotesRemarks: true,
  showSignatures: true,
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  return fallback
}

function asStr(value: unknown, fallback: string): string {
  if (value == null) return fallback
  return String(value)
}

export function defaultCalibrationCertificateTemplate(): CalibrationCertificateTemplate {
  return { ...DEFAULT_CALIBRATION_CERTIFICATE_TEMPLATE }
}

export function parseCalibrationCertificateTemplate(
  raw: unknown,
): CalibrationCertificateTemplate {
  const base = defaultCalibrationCertificateTemplate()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  const kindRaw = String(o.kind ?? '').trim().toLowerCase()
  const kind: CertificateTemplateKind = kindRaw === 'utm' ? 'utm' : 'utm'
  return {
    version: 1,
    kind,
    layoutName: asStr(o.layoutName ?? o.layout_name, base.layoutName).trim() || base.layoutName,
    title: asStr(o.title, base.title).trim() || base.title,
    formatNumber: asStr(o.formatNumber ?? o.format_number, base.formatNumber).trim(),
    defaultNotes: asStr(o.defaultNotes ?? o.default_notes, base.defaultNotes),
    defaultRemarks: asStr(o.defaultRemarks ?? o.default_remarks, base.defaultRemarks),
    calibratedByLabel:
      asStr(o.calibratedByLabel ?? o.calibrated_by_label, base.calibratedByLabel).trim() ||
      base.calibratedByLabel,
    authorizedSignatoryLabel:
      asStr(
        o.authorizedSignatoryLabel ?? o.authorized_signatory_label,
        base.authorizedSignatoryLabel,
      ).trim() || base.authorizedSignatoryLabel,
    deviceSectionPrefix:
      asStr(o.deviceSectionPrefix ?? o.device_section_prefix, base.deviceSectionPrefix).trim() ||
      base.deviceSectionPrefix,
    masterSectionTitle:
      asStr(o.masterSectionTitle ?? o.master_section_title, base.masterSectionTitle).trim() ||
      base.masterSectionTitle,
    resultsSectionTitle:
      asStr(o.resultsSectionTitle ?? o.results_section_title, base.resultsSectionTitle).trim() ||
      base.resultsSectionTitle,
    showSummaryLine: asBool(o.showSummaryLine ?? o.show_summary_line, base.showSummaryLine),
    showNotesRemarks: asBool(o.showNotesRemarks ?? o.show_notes_remarks, base.showNotesRemarks),
    showSignatures: asBool(o.showSignatures ?? o.show_signatures, base.showSignatures),
  }
}

export function serializeCalibrationCertificateTemplate(
  template: CalibrationCertificateTemplate,
): CalibrationCertificateTemplate {
  const parsed = parseCalibrationCertificateTemplate(template)
  return {
    version: 1,
    kind: parsed.kind,
    layoutName: parsed.layoutName.trim() || DEFAULT_CALIBRATION_CERTIFICATE_TEMPLATE.layoutName,
    title: parsed.title.trim() || DEFAULT_CALIBRATION_CERTIFICATE_TEMPLATE.title,
    formatNumber: parsed.formatNumber.trim(),
    defaultNotes: parsed.defaultNotes,
    defaultRemarks: parsed.defaultRemarks,
    calibratedByLabel:
      parsed.calibratedByLabel.trim() ||
      DEFAULT_CALIBRATION_CERTIFICATE_TEMPLATE.calibratedByLabel,
    authorizedSignatoryLabel:
      parsed.authorizedSignatoryLabel.trim() ||
      DEFAULT_CALIBRATION_CERTIFICATE_TEMPLATE.authorizedSignatoryLabel,
    deviceSectionPrefix:
      parsed.deviceSectionPrefix.trim() ||
      DEFAULT_CALIBRATION_CERTIFICATE_TEMPLATE.deviceSectionPrefix,
    masterSectionTitle:
      parsed.masterSectionTitle.trim() ||
      DEFAULT_CALIBRATION_CERTIFICATE_TEMPLATE.masterSectionTitle,
    resultsSectionTitle:
      parsed.resultsSectionTitle.trim() ||
      DEFAULT_CALIBRATION_CERTIFICATE_TEMPLATE.resultsSectionTitle,
    showSummaryLine: parsed.showSummaryLine,
    showNotesRemarks: parsed.showNotesRemarks,
    showSignatures: parsed.showSignatures,
  }
}

/** True when template has been customized beyond empty `{}` storage. */
export function certificateTemplateIsConfigured(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  return Object.keys(raw as Record<string, unknown>).length > 0
}

/** Resolve template from equipment column or nested measurement_ranges. */
export function resolveCertificateTemplateFromEquipment(equipment: {
  certificate_template_config?: unknown
  measurement_ranges?: unknown
} | null | undefined): CalibrationCertificateTemplate {
  if (!equipment) return defaultCalibrationCertificateTemplate()

  const top = equipment.certificate_template_config
  if (certificateTemplateIsConfigured(top)) {
    return parseCalibrationCertificateTemplate(top)
  }

  const ranges = equipment.measurement_ranges
  if (Array.isArray(ranges)) {
    for (const row of ranges) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      const r = row as Record<string, unknown>
      const nested = r.certificate_template_config ?? r.certificateTemplate
      if (certificateTemplateIsConfigured(nested)) {
        return parseCalibrationCertificateTemplate(nested)
      }
    }
  }

  return parseCalibrationCertificateTemplate(top)
}
