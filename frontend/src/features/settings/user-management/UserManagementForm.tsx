import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
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
  onSave: (formData: UserForm, countryCode?: string) => Promise<void>
  loading?: boolean
}

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
  const [statuses] = useState(['Active', 'Inactive'])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddDesignation = () => {
    if (!newDesignationName.trim()) return
    const formatted = newDesignationName.trim()
    if (props.designations.some((item) => item.toLowerCase() === formatted.toLowerCase())) {
      setNewDesignationName('')
      return
    }
    props.setDesignations((prev) => [...prev, formatted])
    setFormData((prev) => ({ ...prev, designation: formatted }))
    setNewDesignationName('')
    setDesignationDialogOpen(false)
  }

  const handleDeleteDesignation = (label: string) => {
    props.setDesignations((prev) => {
      const next = prev.filter((item) => item !== label)
      if (formData.designation === label) {
        setFormData((prev) => ({ ...prev, designation: next[0] ?? '' }))
      }
      return next
    })
  }

  const handleAddDepartment = () => {
    if (!newDepartmentName.trim()) return
    const formatted = newDepartmentName.trim()
    if (props.departments.some((item) => item.toLowerCase() === formatted.toLowerCase())) {
      setNewDepartmentName('')
      return
    }
    props.setDepartments((prev) => {
      const next = [...prev, formatted]
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('userManagement.departments', JSON.stringify(next))
      }
      return next
    })
    setFormData((prev) => ({ ...prev, department: formatted }))
    setNewDepartmentName('')
    setDepartmentDialogOpen(false)
  }

  const handleDeleteDepartment = (label: string) => {
    props.setDepartments((prev) => {
      const next = prev.filter((item) => item !== label)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('userManagement.departments', JSON.stringify(next))
      }
      if (formData.department === label) {
        setFormData((prev) => ({ ...prev, department: next[0] ?? '' }))
      }
      return next
    })
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

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-4xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{props.mode === 'create' ? 'Add Team Member' : 'Edit Team Member'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="user-name">Full Name</Label>
              <Input
                id="user-name"
                placeholder="e.g., Priya Nair"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            {props.mode === 'create' && (
              <div className="space-y-2">
                <Label htmlFor="user-mobile">Mobile Number</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Select value={selectedCountryCode} onValueChange={setSelectedCountryCode}>
                    <SelectTrigger id="country-code">
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
                    className="col-span-2"
                    placeholder="98765 43210"
                    value={formData.mobile}
                    onChange={(e) => setFormData((prev) => ({ ...prev, mobile: e.target.value }))}
                  />
                </div>
              </div>
            )}
            {props.mode === 'edit' && (
              <div className="space-y-2">
                <Label htmlFor="edit-mobile">Mobile Number</Label>
                <Input
                  id="edit-mobile"
                  value={formData.mobile}
                  onChange={(e) => setFormData((prev) => ({ ...prev, mobile: e.target.value }))}
                />
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="user-email">Email Address</Label>
              <Input
                id="user-email"
                type="email"
                placeholder="name@lab.com"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            {props.mode === 'create' && (
              <div className="space-y-2">
                <Label htmlFor="user-password">Password</Label>
                <Input
                  id="user-password"
                  type="password"
                  placeholder="Enter temporary password"
                  value={formData.password}
                  onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                />
              </div>
            )}
            {props.mode === 'edit' && (
              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value as 'Active' | 'Inactive' }))}>
                  <SelectTrigger id="edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="user-designation">Designation</Label>
                <Dialog open={designationDialogOpen} onOpenChange={setDesignationDialogOpen}>
                  <DialogTrigger asChild>
                    <button className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
                      <Plus size={12} />
                      Add New Designation
                    </button>
                  </DialogTrigger>
                  <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                      <DialogTitle>Add New Designation</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-designation">Designation Name</Label>
                        <Input
                          id="new-designation"
                          placeholder="e.g., Compliance Officer"
                          value={newDesignationName}
                          onChange={(e) => setNewDesignationName(e.target.value)}
                        />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Existing Designations</p>
                        <div className="space-y-1 max-h-40 overflow-auto">
                          {props.designations.map((label) => (
                            <div
                              key={label}
                              className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                            >
                              <span>{label}</span>
                              {props.designations.length > 1 && label !== 'Administrator' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDesignation(label)}
                                  className="text-destructive hover:text-destructive/80"
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
                          setDesignationDialogOpen(false)
                          setNewDesignationName('')
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="button" onClick={handleAddDesignation} disabled={!newDesignationName.trim()}>
                        Save Designation
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <Select
                value={formData.designation}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, designation: value }))}
                disabled={props.designations.length === 0}
              >
                <SelectTrigger id="user-designation">
                  <SelectValue placeholder="Add a designation first" />
                </SelectTrigger>
                <SelectContent>
                  {props.designations.map((label) => (
                    <SelectItem key={label} value={label}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {props.mode === 'create' && (
              <div className="space-y-2">
                <Label htmlFor="user-status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value as 'Active' | 'Inactive' }))}
                >
                  <SelectTrigger id="user-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((label) => (
                      <SelectItem key={label} value={label}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="user-department">Department Name</Label>
                <Dialog open={departmentDialogOpen} onOpenChange={setDepartmentDialogOpen}>
                  <DialogTrigger asChild>
                    <button className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
                      <Plus size={12} />
                      Add New Department
                    </button>
                  </DialogTrigger>
                  <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                      <DialogTitle>Add New Department</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-department">Department Name</Label>
                        <Input
                          id="new-department"
                          placeholder="e.g., Chemistry"
                          value={newDepartmentName}
                          onChange={(e) => setNewDepartmentName(e.target.value)}
                        />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Existing Departments</p>
                        <div className="space-y-1 max-h-40 overflow-auto">
                          {props.departments.map((label) => (
                            <div
                              key={label}
                              className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                            >
                              <span>{label}</span>
                              {props.departments.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDepartment(label)}
                                  className="text-destructive hover:text-destructive/80"
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
                          setDepartmentDialogOpen(false)
                          setNewDepartmentName('')
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="button" onClick={handleAddDepartment} disabled={!newDepartmentName.trim()}>
                        Save Department
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <Select
                value={formData.department}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, department: value }))}
                disabled={props.departments.length === 0}
              >
                <SelectTrigger id="user-department">
                  <SelectValue placeholder="Add a department first" />
                </SelectTrigger>
                <SelectContent>
                  {props.departments.map((label) => (
                    <SelectItem key={label} value={label}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              props.onOpenChange(false)
              setFormData(emptyUserForm)
              setError(null)
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={
              (props.mode === 'create' && (
                !formData.name.trim() ||
                !formData.email.trim() ||
                !formData.mobile.trim() ||
                !formData.password.trim() ||
                !formData.designation ||
                !formData.department
              )) ||
              loading ||
              props.loading
            }
          >
            {loading || props.loading ? (props.mode === 'create' ? 'Creating…' : 'Saving…') : (props.mode === 'create' ? 'Save User' : 'Save Changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
