import { useState, useEffect, type ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ensureLabMasterOptionByLabel, LAB_MASTER_OPTION_DEFAULTS } from '@/features/settings/lab-settings/labMasterOptions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { UserAccount, UserForm } from './types'
import { emptyUserForm } from './types'

type UserManagementFormProps = {
  mode: 'create' | 'edit' | 'delete'
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: UserAccount | null
  designations: string[]
  setDesignations: React.Dispatch<React.SetStateAction<string[]>>
  departments: string[]
  setDepartments: React.Dispatch<React.SetStateAction<string[]>>
  divisions: string[]
  setDivisions: React.Dispatch<React.SetStateAction<string[]>>
  onSave: (formData: UserForm, countryCode?: string) => Promise<void>
  onOptionsChanged?: () => Promise<void>
  loading?: boolean
}

function FormSection({
  step,
  title,
  children,
}: {
  step: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] font-medium tracking-widest text-teal-700/80">{step}</span>
        <div className="h-px flex-1 bg-slate-200" />
        <h3 className="text-[13px] font-semibold tracking-wide text-slate-800">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function Field({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className}`}>{children}</div>
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="text-[12px] font-medium text-slate-600">
      {children}
    </Label>
  )
}

const fieldControlClass =
  'h-10 rounded-none border-0 border-b border-slate-300 bg-transparent px-0 shadow-none text-slate-900 placeholder:text-slate-400 focus-visible:border-teal-600 focus-visible:ring-0'

export function UserManagementForm(props: UserManagementFormProps) {
  const [formData, setFormData] = useState<UserForm>(() => {
    if (props.initialData && props.mode === 'edit') {
      return {
        name: props.initialData.name,
        email: props.initialData.email,
        mobile: props.initialData.mobile,
        password: '',
        designation: props.initialData.designation,
        department: props.initialData.departmentName,
        division: props.initialData.division,
        status: props.initialData.status,
      }
    }
    return emptyUserForm
  })

  const [countryCodes] = useState([
    { value: '+91', label: '+91 (IN)' },
    { value: '+977', label: '+977 (NP)' },
    { value: '+975', label: '+975 (BT)' },
  ])
  const [selectedCountryCode, setSelectedCountryCode] = useState('+91')
  const [designationDialogOpen, setDesignationDialogOpen] = useState(false)
  const [newDesignationName, setNewDesignationName] = useState('')
  const [departmentDialogOpen, setDepartmentDialogOpen] = useState(false)
  const [newDepartmentName, setNewDepartmentName] = useState('')
  const [divisionDialogOpen, setDivisionDialogOpen] = useState(false)
  const [newDivisionName, setNewDivisionName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const designationOptions =
    props.designations.length > 0
      ? props.designations
      : LAB_MASTER_OPTION_DEFAULTS.designation.map((o) => o.label)
  const departmentOptions =
    props.departments.length > 0
      ? props.departments
      : LAB_MASTER_OPTION_DEFAULTS.department.map((o) => o.label)
  const divisionOptions =
    props.divisions.length > 0
      ? props.divisions
      : LAB_MASTER_OPTION_DEFAULTS.division.map((o) => o.label)

  useEffect(() => {
    if (props.mode === 'edit' && props.initialData) {
      const rawMobile = props.initialData.mobile ?? ''
      const codeMatch = rawMobile.match(/^(\+\d{1,4})\s*(.*)$/)
      const base = {
        name: props.initialData.name,
        email: props.initialData.email,
        password: '',
        designation: props.initialData.designation,
        department: props.initialData.departmentName,
        division: props.initialData.division,
        status: props.initialData.status,
      }
      if (codeMatch) {
        setSelectedCountryCode(codeMatch[1])
        setFormData({
          ...base,
          mobile: codeMatch[2].trim() || rawMobile,
        })
      } else {
        setFormData({
          ...base,
          mobile: rawMobile,
        })
      }
    } else if (props.mode === 'create') {
      setFormData(emptyUserForm)
      setSelectedCountryCode('+91')
    }
  }, [props.initialData, props.mode])

  const handleAddDesignation = () => {
    const formatted = newDesignationName.trim()
    if (!formatted) return
    if (props.designations.some((item) => item.toLowerCase() === formatted.toLowerCase())) {
      setNewDesignationName('')
      setDesignationDialogOpen(false)
      return
    }
    void (async () => {
      try {
        await ensureLabMasterOptionByLabel('designation', formatted)
        props.setDesignations((prev) => [...prev, formatted].sort((a, b) => a.localeCompare(b)))
        setFormData((prev) => ({ ...prev, designation: formatted }))
        await props.onOptionsChanged?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to save designation')
      } finally {
        setNewDesignationName('')
        setDesignationDialogOpen(false)
      }
    })()
  }

  const handleDeleteDesignation = (label: string) => {
    const next = props.designations.filter((item) => item !== label)
    props.setDesignations(next)
    if (formData.designation === label) {
      setFormData((prev) => ({ ...prev, designation: next[0] ?? '' }))
    }
  }

  const handleAddDepartment = () => {
    const formatted = newDepartmentName.trim()
    if (!formatted) return
    if (props.departments.some((item) => item.toLowerCase() === formatted.toLowerCase())) {
      setNewDepartmentName('')
      setDepartmentDialogOpen(false)
      return
    }
    void (async () => {
      try {
        await ensureLabMasterOptionByLabel('department', formatted)
        props.setDepartments((prev) => {
          const next = [...prev, formatted].sort((a, b) => a.localeCompare(b))
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('userManagement.departments', JSON.stringify(next))
          }
          return next
        })
        setFormData((prev) => ({ ...prev, department: formatted }))
        await props.onOptionsChanged?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to save department')
      } finally {
        setNewDepartmentName('')
        setDepartmentDialogOpen(false)
      }
    })()
  }

  const handleDeleteDepartment = (label: string) => {
    const next = props.departments.filter((item) => item !== label)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('userManagement.departments', JSON.stringify(next))
    }
    props.setDepartments(next)
    if (formData.department === label) {
      setFormData((prev) => ({ ...prev, department: next[0] ?? '' }))
    }
  }

  const handleAddDivision = () => {
    const formatted = newDivisionName.trim()
    if (!formatted) return
    if (props.divisions.some((item) => item.toLowerCase() === formatted.toLowerCase())) {
      setNewDivisionName('')
      setDivisionDialogOpen(false)
      return
    }
    void (async () => {
      try {
        await ensureLabMasterOptionByLabel('division', formatted)
        props.setDivisions((prev) => {
          const next = [...prev, formatted].sort((a, b) => a.localeCompare(b))
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('userManagement.divisions', JSON.stringify(next))
          }
          return next
        })
        setFormData((prev) => ({ ...prev, division: formatted }))
        await props.onOptionsChanged?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to save division')
      } finally {
        setNewDivisionName('')
        setDivisionDialogOpen(false)
      }
    })()
  }

  const handleDeleteDivision = (label: string) => {
    const next = props.divisions.filter((item) => item !== label)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('userManagement.divisions', JSON.stringify(next))
    }
    props.setDivisions(next)
    if (formData.division === label) {
      setFormData((prev) => ({ ...prev, division: next[0] ?? '' }))
    }
  }

  const handleSave = async () => {
    setError(null)

    if (props.mode === 'create') {
      if (
        !formData.name.trim() ||
        !formData.email.trim() ||
        !formData.mobile.trim() ||
        !formData.password.trim() ||
        !formData.designation ||
        !formData.department
      ) {
        setError('All fields are required')
        return
      }
    }

    setLoading(true)
    try {
      await props.onSave(formData, selectedCountryCode)
      props.onOpenChange(false)
      setFormData(emptyUserForm)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save')
    } finally {
      setLoading(false)
    }
  }

  const renderOptionManager = ({
    open,
    onOpenChange,
    triggerLabel,
    title,
    fieldId,
    placeholder,
    value,
    onChange,
    options,
    onSave,
    onDelete,
    canDelete,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    triggerLabel: string
    title: string
    fieldId: string
    placeholder: string
    value: string
    onChange: (value: string) => void
    options: string[]
    onSave: () => void
    onDelete: (label: string) => void
    canDelete: (label: string) => boolean
  }) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-teal-700 transition-colors hover:text-teal-900"
        >
          <Plus size={11} />
          {triggerLabel}
        </button>
      </DialogTrigger>
      <DialogContent layer="nested" className="border-slate-200 sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor={fieldId}>Name</FieldLabel>
            <Input
              id={fieldId}
              className={fieldControlClass}
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          </Field>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Existing</p>
            <div className="max-h-40 space-y-1 overflow-auto">
              {options.map((label) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm"
                >
                  <span>{label}</span>
                  {canDelete(label) && (
                    <button
                      type="button"
                      onClick={() => onDelete(label)}
                      className="text-destructive hover:text-destructive/80"
                      aria-label={`Remove ${label}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onOpenChange(false)
              onChange('')
            }}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={!value.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  if (props.mode === 'delete') {
    return (
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Remove Team Member</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently remove the user entry from the list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleSave} disabled={loading}>
              {loading ? 'Removing…' : 'Remove User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  const isCreate = props.mode === 'create'
  const saveDisabled =
    (isCreate &&
      (!formData.name.trim() ||
        !formData.email.trim() ||
        !formData.mobile.trim() ||
        !formData.password.trim() ||
        !formData.designation ||
        !formData.department)) ||
    loading ||
    props.loading

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        className="max-h-[92vh] max-w-2xl gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:opacity-100 [&>button]:hover:bg-white/10"
        aria-describedby={undefined}
      >
        <div className="relative bg-slate-900 px-6 py-5 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(45,212,191,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.35) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
          <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-8 text-left">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
              {isCreate ? 'User Registry · New Entry' : 'User Registry · Edit Entry'}
            </p>
            <DialogTitle className="text-2xl font-semibold tracking-tight text-white">
              {isCreate ? 'Add Team Member' : 'Edit Team Member'}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="max-h-[min(62vh,520px)] space-y-7 overflow-y-auto bg-[#fafbfc] px-6 py-6">
          {error && (
            <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <FormSection step="01" title="Contact Details">
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="user-name">Full Name</FieldLabel>
                <Input
                  id="user-name"
                  className={fieldControlClass}
                  placeholder="Amit Kumar"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="user-mobile">Mobile Number</FieldLabel>
                <div className="grid grid-cols-3 gap-3">
                  <Select value={selectedCountryCode} onValueChange={setSelectedCountryCode}>
                    <SelectTrigger id="country-code" aria-label="Country code" className={fieldControlClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {countryCodes.map((code) => (
                        <SelectItem key={code.value} value={code.value}>
                          {code.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="user-mobile"
                    className={`col-span-2 ${fieldControlClass}`}
                    placeholder="9041063388"
                    value={formData.mobile}
                    onChange={(e) => setFormData((prev) => ({ ...prev, mobile: e.target.value }))}
                  />
                </div>
              </Field>
              <Field className={isCreate ? '' : 'md:col-span-2'}>
                <FieldLabel htmlFor="user-email">Email Address</FieldLabel>
                <Input
                  id="user-email"
                  type="email"
                  className={fieldControlClass}
                  placeholder="amitrajput183@gmail.com"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                />
              </Field>
              {isCreate ? (
                <Field>
                  <FieldLabel htmlFor="user-password">Password</FieldLabel>
                  <Input
                    id="user-password"
                    type="password"
                    className={fieldControlClass}
                    placeholder="Enter Password"
                    value={formData.password}
                    onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                  />
                </Field>
              ) : null}
            </div>
          </FormSection>

          <FormSection step="02" title="Lab Assignment">
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-3">
              <Field>
                <div className="flex items-center justify-between gap-1">
                  <FieldLabel htmlFor="user-division">Division</FieldLabel>
                  {renderOptionManager({
                    open: divisionDialogOpen,
                    onOpenChange: setDivisionDialogOpen,
                    triggerLabel: 'Add New',
                    title: 'Add New Division',
                    fieldId: 'new-division',
                    placeholder: 'e.g., Calibration Division',
                    value: newDivisionName,
                    onChange: setNewDivisionName,
                    options: divisionOptions,
                    onSave: handleAddDivision,
                    onDelete: handleDeleteDivision,
                    canDelete: () => divisionOptions.length > 1,
                  })}
                </div>
                <Select
                  value={formData.division || '__none__'}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      division: value === '__none__' ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger id="user-division" className={fieldControlClass}>
                    <SelectValue placeholder="Select Division" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select Division</SelectItem>
                    {divisionOptions.map((label) => (
                      <SelectItem key={label} value={label}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <div className="flex items-center justify-between gap-1">
                  <FieldLabel htmlFor="user-designation">Designation</FieldLabel>
                  {renderOptionManager({
                    open: designationDialogOpen,
                    onOpenChange: setDesignationDialogOpen,
                    triggerLabel: 'Add New',
                    title: 'Add New Designation',
                    fieldId: 'new-designation',
                    placeholder: 'e.g., Compliance Officer',
                    value: newDesignationName,
                    onChange: setNewDesignationName,
                    options: designationOptions,
                    onSave: handleAddDesignation,
                    onDelete: handleDeleteDesignation,
                    canDelete: (label) => designationOptions.length > 1 && label !== 'Administrator',
                  })}
                </div>
                <Select
                  value={formData.designation || '__none__'}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      designation: value === '__none__' ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger id="user-designation" className={fieldControlClass}>
                    <SelectValue placeholder="Select Designation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select Designation</SelectItem>
                    {designationOptions.map((label) => (
                      <SelectItem key={label} value={label}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <div className="flex items-center justify-between gap-1">
                  <FieldLabel htmlFor="user-department">Department</FieldLabel>
                  {renderOptionManager({
                    open: departmentDialogOpen,
                    onOpenChange: setDepartmentDialogOpen,
                    triggerLabel: 'Add New',
                    title: 'Add New Department',
                    fieldId: 'new-department',
                    placeholder: 'e.g., Chemistry',
                    value: newDepartmentName,
                    onChange: setNewDepartmentName,
                    options: departmentOptions,
                    onSave: handleAddDepartment,
                    onDelete: handleDeleteDepartment,
                    canDelete: () => departmentOptions.length > 1,
                  })}
                </div>
                <Select
                  value={formData.department || '__none__'}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      department: value === '__none__' ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger id="user-department" className={fieldControlClass}>
                    <SelectValue placeholder="Select Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select Department</SelectItem>
                    {departmentOptions.map((label) => (
                      <SelectItem key={label} value={label}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FormSection>
        </div>

        <DialogFooter className="gap-2 border-t border-slate-200 bg-white px-6 py-4 sm:justify-end">
          <Button
            type="button"
            className="min-w-[140px] rounded-sm bg-teal-700 text-white hover:bg-teal-800"
            onClick={handleSave}
            disabled={saveDisabled}
          >
            {loading || props.loading ? 'Saving…' : 'Save & Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
