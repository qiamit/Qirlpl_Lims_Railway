import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { limsFieldClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import type { ManagementDocStatus, ManagementDocumentForm } from './types'
import { MANAGEMENT_DOC_STATUSES, MANAGEMENT_DOC_TYPES } from './types'

export type EmployeeOption = { id: string; name: string; designation?: string }

const NONE = '__none__'

function EmployeeSelect({
  id,
  label,
  value,
  employees,
  onValueChange,
  disabled = false,
}: {
  id: string
  label: string
  value: string
  employees: EmployeeOption[]
  onValueChange: (name: string) => void
  disabled?: boolean
}) {
  const options = employees.filter((e) => e.name.trim().length > 0)
  const hasCurrent = value.trim().length > 0 && options.some((e) => e.name === value)

  return (
    <div className="col-span-12 md:col-span-4 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value.trim() ? value : NONE}
        onValueChange={(v) => onValueChange(v === NONE ? '' : v)}
        disabled={disabled}
      >
        <SelectTrigger id={id} aria-label={label} className={limsFieldClass}>
          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {!hasCurrent && value.trim() ? (
            <SelectItem value={value}>{value}</SelectItem>
          ) : null}
          {options.map((e) => (
            <SelectItem key={e.id} value={e.name}>
              {e.designation?.trim() ? `${e.name} (${e.designation.trim()})` : e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function ManagementDocumentsForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
  editingId,
  employees,
  onNewRevision,
  onNewIssue,
  onNewAmendment,
  readOnly = false,
  signaturesLocked = false,
  allowedStatuses,
  changeButtonsDisabled = false,
  children,
}: {
  form: ManagementDocumentForm
  onChange: (next: ManagementDocumentForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  editingId: string | null
  employees: EmployeeOption[]
  onNewRevision: () => void
  onNewIssue: () => void
  onNewAmendment: () => void
  /** Approved / obsolete controlled document: every field is read-only. */
  readOnly?: boolean
  /** Prepared / Reviewed / Approved are filled by the e-approval workflow. */
  signaturesLocked?: boolean
  /** Statuses the user may pick (document control on); all when omitted. */
  allowedStatuses?: ManagementDocStatus[]
  /** New Revision / Issue / Amendment not allowed for this user. */
  changeButtonsDisabled?: boolean
  /** Extra panel shown above the buttons (workflow, review period). */
  children?: ReactNode
}) {
  const automationDisabled = !editingId || saveLoading || changeButtonsDisabled
  const statusOptions = allowedStatuses
    ? MANAGEMENT_DOC_STATUSES.filter((s) => allowedStatuses.includes(s.id) || s.id === form.status)
    : MANAGEMENT_DOC_STATUSES
  const statusLocked = readOnly || (allowedStatuses ? allowedStatuses.length === 0 : false)

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 space-y-2 md:col-span-4">
            <Label htmlFor="doc-number">Document Number</Label>
            <Input
              id="doc-number"
              disabled={readOnly}
              className={limsFieldClass}
              placeholder="QE/QM"
              value={form.docNumber}
              onChange={(e) => onChange({ ...form, docNumber: e.target.value })}
            />
          </div>

          <div className="col-span-12 space-y-2 md:col-span-4">
            <Label htmlFor="doc-type">Document Type</Label>
            <Select
              value={form.docType}
              onValueChange={(v) => onChange({ ...form, docType: v })}
              disabled={readOnly}
            >
              <SelectTrigger id="doc-type" aria-label="Document type" className={limsFieldClass}>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {MANAGEMENT_DOC_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-12 space-y-2 md:col-span-4">
            <Label htmlFor="status">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => onChange({ ...form, status: v as ManagementDocumentForm['status'] })}
              disabled={statusLocked}
            >
              <SelectTrigger id="status" aria-label="Status" className={limsFieldClass}>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-12 space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              disabled={readOnly}
              className={limsFieldClass}
              placeholder="Enter Document Title"
              value={form.title}
              onChange={(e) => onChange({ ...form, title: e.target.value })}
            />
          </div>

          <div className="col-span-12 space-y-2 md:col-span-4">
            <Label htmlFor="revision-no">Revision No</Label>
            <Input
              id="revision-no"
              disabled={readOnly}
              className={limsFieldClass}
              placeholder="00"
              value={form.revisionNo}
              onChange={(e) => onChange({ ...form, revisionNo: e.target.value })}
            />
          </div>
          <div className="col-span-12 space-y-2 md:col-span-4">
            <Label htmlFor="revision-date">Revision Date</Label>
            <Input
              id="revision-date"
              disabled={readOnly}
              type="date"
              className={limsFieldClass}
              value={form.revisionDate}
              onChange={(e) => onChange({ ...form, revisionDate: e.target.value })}
            />
          </div>
          <div className="col-span-12 space-y-2 md:col-span-4">
            <Label htmlFor="issue-no">Issue No</Label>
            <Input
              id="issue-no"
              disabled={readOnly}
              className={limsFieldClass}
              placeholder="00"
              value={form.issueNo}
              onChange={(e) => onChange({ ...form, issueNo: e.target.value })}
            />
          </div>
          <div className="col-span-12 space-y-2 md:col-span-4">
            <Label htmlFor="issue-date">Issue Date</Label>
            <Input
              id="issue-date"
              disabled={readOnly}
              type="date"
              className={limsFieldClass}
              value={form.issueDate}
              onChange={(e) => onChange({ ...form, issueDate: e.target.value })}
            />
          </div>

          <div className="col-span-12 space-y-2 md:col-span-4">
            <Label htmlFor="amendment-no">Amendment No</Label>
            <Input
              id="amendment-no"
              disabled={readOnly}
              className={limsFieldClass}
              placeholder="00"
              value={form.amendmentNo}
              onChange={(e) => onChange({ ...form, amendmentNo: e.target.value })}
            />
          </div>

          <div className="col-span-12 space-y-2 md:col-span-4">
            <Label htmlFor="amendment-date">Amendment Date</Label>
            <Input
              id="amendment-date"
              disabled={readOnly}
              type="date"
              className={limsFieldClass}
              value={form.amendmentDate}
              onChange={(e) => onChange({ ...form, amendmentDate: e.target.value })}
            />
          </div>

          <EmployeeSelect
            id="prepared-by"
            label="Prepared By"
            value={form.preparedBy}
            employees={employees}
            onValueChange={(name) => onChange({ ...form, preparedBy: name })}
            disabled={readOnly || signaturesLocked}
          />
          <EmployeeSelect
            id="reviewed-by"
            label="Reviewed By"
            value={form.reviewedBy}
            employees={employees}
            onValueChange={(name) => onChange({ ...form, reviewedBy: name })}
            disabled={readOnly || signaturesLocked}
          />
          <EmployeeSelect
            id="approved-by"
            label="Approved By"
            value={form.approvedBy}
            employees={employees}
            onValueChange={(name) => onChange({ ...form, approvedBy: name })}
            disabled={readOnly || signaturesLocked}
          />
        </div>
      </div>

      {children}

      <div className="mt-6 flex flex-col gap-3 border-t-2 border-stone-500 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('h-9', limsOutlineBtnClass)}
            disabled={automationDisabled}
            onClick={onNewRevision}
            title={!editingId ? 'Save the document first' : 'Archive current version and start next revision'}
          >
            New Revision
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('h-9', limsOutlineBtnClass)}
            disabled={automationDisabled}
            onClick={onNewIssue}
            title={!editingId ? 'Save the document first' : 'Archive current version and start next issue'}
          >
            New Issue
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('h-9', limsOutlineBtnClass)}
            disabled={automationDisabled}
            onClick={onNewAmendment}
            title={!editingId ? 'Save the document first' : 'Archive current version and start next amendment'}
          >
            New Amendment
          </Button>
        </div>
        <Button
          type="button"
          className={cn('h-9 min-w-[140px]', limsPrimaryBtnClass)}
          onClick={onSave}
          disabled={!canSave || saveLoading || readOnly}
        >
          {saveLoading ? 'Saving…' : 'Save & Close'}
        </Button>
      </div>
    </div>
  )
}
