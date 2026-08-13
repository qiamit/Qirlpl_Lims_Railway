/** Sidebar / route modules that Laboratory Director can assign permissions to. */

export type ModuleAccessLevel = 'none' | 'view' | 'edit'

export type ModuleAccessSubjectType = 'division' | 'department' | 'designation' | 'user'

export type ModuleCatalogEntry = {
  key: string
  label: string
  section: string
}

export const MODULE_ACCESS_LEVELS: { value: ModuleAccessLevel; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'view', label: 'View' },
  { value: 'edit', label: 'Edit' },
]

/** Flattened catalog of navigable modules (path = key). */
export const MODULE_CATALOG: ModuleCatalogEntry[] = [
  { key: '/', label: 'Dashboard', section: 'General' },

  { key: '/management-docs/level-1', label: 'Level 1 Documents', section: 'Management Documentation' },
  { key: '/management-docs/level-2', label: 'Level 2 Documents', section: 'Management Documentation' },
  { key: '/management-docs/level-3', label: 'Level 3 Documents', section: 'Management Documentation' },
  { key: '/management-docs/level-4', label: 'Level 4 Documents', section: 'Management Documentation' },

  { key: '/audit-mrm/audit-plan', label: 'Audit Plan', section: 'Audit & MRM' },
  { key: '/audit-mrm/audit-checklist', label: 'Audit Checklist', section: 'Audit & MRM' },
  { key: '/audit-mrm/audit-summary', label: 'Audit Summary', section: 'Audit & MRM' },
  { key: '/audit-mrm/non-conformities', label: 'Non Conformities', section: 'Audit & MRM' },
  { key: '/audit-mrm/mrm-agenda', label: 'MRM Agenda', section: 'Audit & MRM' },
  { key: '/audit-mrm/management-review-meeting', label: 'Management Review Meeting', section: 'Audit & MRM' },

  { key: '/training/competency-matrix', label: 'Competency Matrix', section: 'Training' },
  { key: '/training/need-identification', label: 'Training Need Identification', section: 'Training' },
  { key: '/training/plan', label: 'Training Plan', section: 'Training' },
  { key: '/training/calendar', label: 'Training Calendar', section: 'Training' },
  { key: '/training/register', label: 'Training Register', section: 'Training' },
  { key: '/training/evaluation', label: 'Training Evaluation', section: 'Training' },
  { key: '/training/induction', label: 'Induction Training', section: 'Training' },
  { key: '/training/effectiveness-review', label: 'Effectiveness Review', section: 'Training' },

  { key: '/samples/receiving', label: 'Sample Receiving', section: 'Testing LIMS' },
  { key: '/samples/allocation', label: 'Sample Allocation', section: 'Testing LIMS' },
  { key: '/samples/test-allocation', label: 'Test Allocation', section: 'Testing LIMS' },
  { key: '/samples/under-testing', label: 'Sample Under Testing', section: 'Testing LIMS' },
  { key: '/samples/results-review', label: 'Results Under Review', section: 'Testing LIMS' },
  { key: '/samples/report-preparation', label: 'Test Report Preparation', section: 'Testing LIMS' },
  { key: '/samples/completed', label: 'Issued Test Report', section: 'Testing LIMS' },
  { key: '/samples/retain-disposed', label: 'Retain & Disposed Sample', section: 'Testing LIMS' },
  { key: '/masters/consent-letter', label: 'Consent Letter', section: 'Testing LIMS' },
  { key: '/samples/result-validation', label: 'Validating the Results', section: 'Testing LIMS' },
  { key: '/masters/nabl-scope', label: 'NABL Scope', section: 'Testing LIMS' },
  { key: '/masters/test-parameter', label: 'Test Parameter', section: 'Testing LIMS' },
  { key: '/masters/equipment', label: 'Equipment Master', section: 'Testing LIMS' },
  { key: '/masters/iqc', label: 'Masters for IQC', section: 'Testing LIMS' },

  { key: '/calibration/handling/service-request', label: 'Service Request', section: 'Calibration LIMS' },
  { key: '/calibration/handling/job-allocation', label: 'Job Allocation', section: 'Calibration LIMS' },
  { key: '/calibration/handling/calibration-conduct-inside', label: 'Calibration Conduct Inside', section: 'Calibration LIMS' },
  { key: '/calibration/handling/calibration-conduct-outside', label: 'Calibration Conduct Outside', section: 'Calibration LIMS' },
  { key: '/calibration/handling/review-data', label: 'Review Data', section: 'Calibration LIMS' },
  { key: '/calibration/handling/certificate-preparation', label: 'Certificate Preparation', section: 'Calibration LIMS' },
  { key: '/calibration/equipments', label: 'Calibration Equipments', section: 'Calibration LIMS' },
  { key: '/calibration/equipment-for-calibration', label: 'Master Equipments', section: 'Calibration LIMS' },
  { key: '/calibration/masters-for-iqc', label: 'Masters for IQC (Calibration)', section: 'Calibration LIMS' },

  { key: '/finance/sale/quotation', label: 'Quotation', section: 'Finance' },
  { key: '/finance/sale/proforma-invoice', label: 'Proforma Invoice', section: 'Finance' },
  { key: '/finance/sale/invoice', label: 'Invoice', section: 'Finance' },
  { key: '/finance/sale/credit-note', label: 'Credit Note', section: 'Finance' },
  { key: '/finance/sale/payment-receipt', label: 'Payment Receipt', section: 'Finance' },

  { key: '/masters/clients', label: 'Client Master', section: 'Masters' },
  { key: '/masters/is-codes', label: 'IS Code Master', section: 'Masters' },
  { key: '/masters/product-services', label: 'Product & Services', section: 'Masters' },
]

export function moduleSections(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of MODULE_CATALOG) {
    if (seen.has(m.section)) continue
    seen.add(m.section)
    out.push(m.section)
  }
  return out
}

export function normalizeAccessKey(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}
