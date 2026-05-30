import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { UserAccount } from './types'

type UserManagementTableProps = {
  users: UserAccount[]
  designations: string[]
  departments: string[]
  userUpdateLoadingId: string | null
  passwordResetLoadingId: string | null
  updateUser: (userId: string, patch: { status?: 'Active' | 'Inactive'; designation?: string; departmentName?: string }) => Promise<void>
  onEdit: (user: UserAccount) => void
  onDelete: (user: UserAccount) => void
  onResetPassword: (user: UserAccount) => void
}

export function UserManagementTable(props: UserManagementTableProps) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {props.users.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs text-center">Select</TableHead>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs text-center">Email</TableHead>
              <TableHead className="text-xs text-center">Mobile</TableHead>
              <TableHead className="text-xs text-center">Department</TableHead>
              <TableHead className="text-xs text-center">Designation</TableHead>
              <TableHead className="text-xs text-center">Status</TableHead>
              <TableHead className="text-xs text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Select ${user.name}`}
                  />
                </TableCell>
                <TableCell className="font-medium text-foreground">{user.name}</TableCell>
                <TableCell className="text-center text-muted-foreground">{user.email}</TableCell>
                <TableCell className="text-center text-muted-foreground">{user.mobile}</TableCell>
                <TableCell className="text-center">
                  <Select
                    value={user.departmentName}
                    onValueChange={(value) => void props.updateUser(user.id, { departmentName: value })}
                    disabled={
                      (props.departments.length === 0 && !user.departmentName) ||
                      props.userUpdateLoadingId === user.id
                    }
                  >
                    <SelectTrigger className="mx-auto w-[200px]">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(
                        new Set([...(props.departments ?? []), user.departmentName].filter((d) => d && d.trim().length > 0)),
                      ).map((label) => (
                        <SelectItem key={label} value={label}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-center">
                  <Select
                    value={user.designation}
                    onValueChange={(value) => void props.updateUser(user.id, { designation: value })}
                    disabled={
                      props.designations.length === 0 ||
                      props.userUpdateLoadingId === user.id
                    }
                  >
                    <SelectTrigger className="mx-auto w-[200px]">
                      <SelectValue placeholder="Select designation" />
                    </SelectTrigger>
                    <SelectContent>
                      {props.designations.map((label) => (
                        <SelectItem key={label} value={label}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-center">
                  <Select
                    value={user.status}
                    onValueChange={(value) => void props.updateUser(user.id, { status: value as 'Active' | 'Inactive' })}
                    disabled={props.userUpdateLoadingId === user.id}
                  >
                    <SelectTrigger className="mx-auto w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => props.onResetPassword(user)}
                    disabled={
                      props.userUpdateLoadingId === user.id ||
                      props.passwordResetLoadingId === user.id
                    }
                    className="mr-1"
                  >
                    {props.passwordResetLoadingId === user.id ? 'Sending…' : 'Reset'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => props.onEdit(user)}
                    disabled={props.userUpdateLoadingId === user.id}
                    className="mr-1"
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => props.onDelete(user)}
                    disabled={props.userUpdateLoadingId === user.id}
                  >
                    <Trash2 size={16} className="text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No team members added yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Use "Add User" to invite your first colleague.</p>
        </div>
      )}
    </div>
  )
}
