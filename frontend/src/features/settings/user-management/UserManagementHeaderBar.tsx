import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogTrigger,
} from '@/components/ui/dialog'

type UserManagementHeaderBarProps = {
  userDialogOpen: boolean
  setUserDialogOpen: (open: boolean) => void
}

export function UserManagementHeaderBar({ userDialogOpen, setUserDialogOpen }: UserManagementHeaderBarProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">User Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">Invite New Team Members & Control Their Access</p>
      </div>
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogTrigger asChild>
          <Button className="gap-2" size="sm">
            <Plus size={14} />
            Add User
          </Button>
        </DialogTrigger>
      </Dialog>
    </div>
  )
}
