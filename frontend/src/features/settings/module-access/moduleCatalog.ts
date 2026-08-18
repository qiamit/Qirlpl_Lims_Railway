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

  {
    key: '/general-requirements/list-of-objectives',
    label: 'List of Objectives',
    section: 'General Requirements',
  },
  {
    key: '/general-requirements/risk-analysis',
    label: 'Risk Analysis',
    section: 'General Requirements',
  },
  {
    key: '/general-requirements/improvement',
    label: 'Improvement',
    section: 'General Requirements',
  },

  { key: '/management-docs/level-1', label: 'Level 1 Documents', section: 'Management Documentation' },
  { key: '/management-docs/level-2', label: 'Level 2 Documents', section: 'Management Documentation' },
  { key: '/management-docs/level-3', label: 'Level 3 Documents', section: 'Management Documentation' },
  { key: '/management-docs/level-4', label: 'Level 4 Documents', section: 'Management Documentation' },

  { key: '/audit-mrm/audit-plan', label: 'Audit Plan', section: 'Audit & MRM Management' },
  { key: '/audit-mrm/audit-checklist', label: 'Audit Checklist', section: 'Audit & MRM Management' },
  { key: '/audit-mrm/audit-summary', label: 'Audit Summary', section: 'Audit & MRM Management' },
  { key: '/audit-mrm/non-conformities', label: 'Non Conformities', section: 'Audit & MRM Management' },
  { key: '/audit-mrm/mrm-agenda', label: 'MRM Plan & Agenda', section: 'Audit & MRM Management' },
  {
    key: '/audit-mrm/management-review-meeting',
    label: 'Management Review Meeting',
    section: 'Audit & MRM Management',
  },

  {
    key: '/personnel/employees',
    label: 'List of Employees with All Details',
    section: 'Personnel Management',
  },
  { key: '/personnel/selection', label: 'Selection of Employee', section: 'Personnel Management' },
  {
    key: '/personnel/required-competency-matrix',
    label: 'Required Competency Matrix',
    section: 'Personnel Management',
  },
  {
    key: '/personnel/actual-competency-matrix',
    label: 'Actual Competency Matrix',
    section: 'Personnel Management',
  },
  {
    key: '/personnel/roles-responsibilities',
    label: 'Roles & Responsibilities',
    section: 'Personnel Management',
  },
  { key: '/personnel/authorities', label: 'Authorities', section: 'Personnel Management' },

  {
    key: '/complaints/customer-complaints',
    label: 'Customer Complaints Records',
    section: 'Complaints Management',
  },
  {
    key: '/complaints/customer-feedback',
    label: 'Customer Feedback',
    section: 'Complaints Management',
  },
  {
    key: '/complaints/feedback-evaluation',
    label: 'Feedback Evaluation',
    section: 'Complaints Management',
  },

  {
    key: '/nonconforming-work/records',
    label: 'Nonconforming Work Records',
    section: 'Non Conforming Work',
  },
  {
    key: '/nonconforming-work/evaluation-actions',
    label: 'Evaluation, Actions & Decisions',
    section: 'Non Conforming Work',
  },
  {
    key: '/nonconforming-work/corrective-action',
    label: 'Corrective Action',
    section: 'Non Conforming Work',
  },

  {
    key: '/calibration/equipment-for-calibration',
    label: 'Master Equipment Calibration',
    section: 'Equipment Management',
  },
  {
    key: '/masters/equipment',
    label: 'Master Equipment Testing',
    section: 'Equipment Management',
  },
  {
    key: '/equipment-management/iqc',
    label: 'Equipments for IQC',
    section: 'Equipment Management',
  },
  {
    key: '/equipment-management/crm-list',
    label: 'List of CRM',
    section: 'Equipment Management',
  },
  {
    key: '/equipment-management/maintenance-schedule',
    label: 'Maintenance Schedule',
    section: 'Equipment Management',
  },
  {
    key: '/equipment-management/calibration-schedule',
    label: 'Calibration Schedule',
    section: 'Equipment Management',
  },
  {
    key: '/equipment-management/breakdown-register',
    label: 'Equipment Breakdown Register',
    section: 'Equipment Management',
  },

  {
    key: '/externally-providers/supplier-list',
    label: 'Externally Supplier List',
    section: 'Externally Providers',
  },
  {
    key: '/externally-providers/supplier-evaluation',
    label: 'Supplier Evaluation',
    section: 'Externally Providers',
  },
  {
    key: '/externally-providers/list-of-consumables',
    label: 'List of Consumables',
    section: 'Externally Providers',
  },

  { key: '/training/competency-matrix', label: 'Competency Matrix', section: 'Training Management' },
  {
    key: '/training/need-identification',
    label: 'Training Need Identification',
    section: 'Training Management',
  },
  { key: '/training/plan', label: 'Training Plan', section: 'Training Management' },
  { key: '/training/calendar', label: 'Training Calendar', section: 'Training Management' },
  { key: '/training/register', label: 'Training Register', section: 'Training Management' },
  { key: '/training/evaluation', label: 'Training Evaluation', section: 'Training Management' },
  { key: '/training/induction', label: 'Induction Training', section: 'Training Management' },
  {
    key: '/training/effectiveness-review',
    label: 'Effectiveness Review',
    section: 'Training Management',
  },

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

  { key: '/calibration/handling/service-request', label: 'Service Request', section: 'Calibration LIMS' },
  { key: '/calibration/handling/job-allocation', label: 'Job Allocation', section: 'Calibration LIMS' },
  { key: '/calibration/handling/calibration-conduct-inside', label: 'Calibration Conduct Inside', section: 'Calibration LIMS' },
  { key: '/calibration/handling/calibration-conduct-outside', label: 'Calibration Conduct Outside', section: 'Calibration LIMS' },
  { key: '/calibration/handling/review-data', label: 'Review Data', section: 'Calibration LIMS' },
  { key: '/calibration/handling/certificate-preparation', label: 'Certificate Preparation', section: 'Calibration LIMS' },
  { key: '/calibration/equipments', label: 'Calibration Equipments', section: 'Calibration LIMS' },
  { key: '/calibration/nabl-scope', label: 'NABL Scope', section: 'Calibration LIMS' },

  { key: '/finance/sale/quotation', label: 'Quotation', section: 'Finance Management' },
  {
    key: '/finance/sale/proforma-invoice',
    label: 'Proforma Invoice',
    section: 'Finance Management',
  },
  { key: '/finance/sale/invoice', label: 'Invoice', section: 'Finance Management' },
  { key: '/finance/sale/credit-note', label: 'Credit Note', section: 'Finance Management' },
  {
    key: '/finance/sale/payment-receipt',
    label: 'Payment Receipt',
    section: 'Finance Management',
  },

  { key: '/masters/clients', label: 'Client Master', section: 'Master Managements' },
  { key: '/masters/is-codes', label: 'IS Code Master', section: 'Master Managements' },
  {
    key: '/masters/product-services',
    label: 'Product & Services',
    section: 'Master Managements',
  },
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
