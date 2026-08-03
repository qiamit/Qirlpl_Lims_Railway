export type ManagementDocLevel = 1 | 2 | 3 | 4

export type ManagementDocStatus = 'draft' | 'under_review' | 'active' | 'obsolete'

export type ManagementDocChangeType = 'revision' | 'issue' | 'amendment' | 'manual_save'

export type ManagementDocType =
  | 'Quality Manual'
  | 'Policy'
  | 'Procedure'
  | 'Work Instruction'
  | 'Form / Record'
  | 'Other'

export const MANAGEMENT_DOC_TYPES: ManagementDocType[] = [
  'Quality Manual',
  'Policy',
  'Procedure',
  'Work Instruction',
  'Form / Record',
  'Other',
]

export const MANAGEMENT_DOC_STATUSES: Array<{ id: ManagementDocStatus; label: string }> = [
  { id: 'draft', label: 'Draft' },
  { id: 'under_review', label: 'Under Review' },
  { id: 'active', label: 'Active' },
  { id: 'obsolete', label: 'Obsolete' },
]

export const MANAGEMENT_DOCS_BUCKET = 'management-documents'

export type ManagementDocumentRow = {
  id: string
  level: ManagementDocLevel
  doc_number: string
  title: string
  doc_type: string
  revision_no: string
  revision_date: string | null
  issue_no: string | null
  issue_date: string | null
  amendment_no: string | null
  amendment_date: string | null
  prepared_by: string | null
  reviewed_by: string | null
  approved_by: string | null
  status: ManagementDocStatus
  owner_name: string | null
  remark: string | null
  file_path: string | null
  draft_content: string | null
  created_at: string
  updated_at: string
}

export type ManagementDocumentForm = {
  docNumber: string
  title: string
  docType: ManagementDocType | string
  revisionNo: string
  revisionDate: string
  issueNo: string
  issueDate: string
  amendmentNo: string
  amendmentDate: string
  preparedBy: string
  reviewedBy: string
  approvedBy: string
  status: ManagementDocStatus
  ownerName: string
  remark: string
  filePath: string
}

export function emptyManagementDocumentForm(): ManagementDocumentForm {
  return {
    docNumber: '',
    title: '',
    docType: 'Policy',
    revisionNo: '00',
    revisionDate: '',
    issueNo: '00',
    issueDate: '',
    amendmentNo: '00',
    amendmentDate: '',
    preparedBy: '',
    reviewedBy: '',
    approvedBy: '',
    status: 'draft',
    ownerName: '',
    remark: '',
    filePath: '',
  }
}

export function rowToForm(row: ManagementDocumentRow): ManagementDocumentForm {
  return {
    docNumber: row.doc_number ?? '',
    title: row.title ?? '',
    docType: row.doc_type || 'Policy',
    revisionNo: row.revision_no || '00',
    revisionDate: row.revision_date ?? '',
    issueNo: row.issue_no || '00',
    issueDate: row.issue_date ?? '',
    amendmentNo: row.amendment_no || '00',
    amendmentDate: row.amendment_date ?? '',
    preparedBy: row.prepared_by ?? '',
    reviewedBy: row.reviewed_by ?? '',
    approvedBy: row.approved_by ?? '',
    status: row.status,
    ownerName: row.owner_name ?? '',
    remark: row.remark ?? '',
    filePath: row.file_path ?? '',
  }
}

/** Increment trailing digits: 00→01, Rev-1→Rev-2, blank→01 */
export function nextControlNumber(value: string | null | undefined): string {
  const raw = String(value ?? '').trim()
  if (!raw) return '01'
  const match = /^(.*?)(\d+)$/.exec(raw)
  if (!match) return `${raw}-01`
  const prefix = match[1]
  const digits = match[2]
  const next = String(Number(digits) + 1).padStart(digits.length, '0')
  return `${prefix}${next}`
}

export function todayIsoDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function levelPageTitle(level: ManagementDocLevel): string {
  return `Level ${level} Documents`
}

export function defaultDocTypeForLevel(level: ManagementDocLevel): ManagementDocType {
  if (level === 1) return 'Quality Manual'
  if (level === 2) return 'Procedure'
  if (level === 3) return 'Work Instruction'
  return 'Form / Record'
}

export function statusBadgeClass(status: ManagementDocStatus): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-100 text-emerald-800'
    case 'under_review':
      return 'bg-amber-100 text-amber-900'
    case 'obsolete':
      return 'bg-slate-200 text-slate-700'
    default:
      return 'bg-sky-100 text-sky-900'
  }
}

export function statusLabel(status: ManagementDocStatus): string {
  return MANAGEMENT_DOC_STATUSES.find((s) => s.id === status)?.label ?? status
}

export function formToDbPayload(form: ManagementDocumentForm, level: ManagementDocLevel) {
  return {
    level,
    doc_number: form.docNumber.trim(),
    title: form.title.trim(),
    doc_type: form.docType.trim() || defaultDocTypeForLevel(level),
    revision_no: form.revisionNo.trim() || '00',
    revision_date: form.revisionDate.trim() || null,
    issue_no: form.issueNo.trim() || '00',
    issue_date: form.issueDate.trim() || null,
    amendment_no: form.amendmentNo.trim() || '00',
    amendment_date: form.amendmentDate.trim() || null,
    prepared_by: form.preparedBy.trim() || null,
    reviewed_by: form.reviewedBy.trim() || null,
    approved_by: form.approvedBy.trim() || null,
    status: form.status,
    owner_name: form.ownerName.trim() || null,
    remark: form.remark.trim() || null,
    file_path: form.filePath.trim() || null,
  }
}

export function rowToVersionSnapshot(
  row: ManagementDocumentRow,
  changeType: ManagementDocChangeType,
  changedBy: string | null,
) {
  return {
    document_id: row.id,
    doc_number: row.doc_number,
    title: row.title,
    doc_type: row.doc_type,
    status: row.status,
    revision_no: row.revision_no,
    revision_date: row.revision_date,
    issue_no: row.issue_no,
    issue_date: row.issue_date,
    amendment_no: row.amendment_no,
    amendment_date: row.amendment_date,
    prepared_by: row.prepared_by,
    reviewed_by: row.reviewed_by,
    approved_by: row.approved_by,
    owner_name: row.owner_name,
    remark: row.remark,
    file_path: row.file_path,
    change_type: changeType,
    changed_by: changedBy,
  }
}
