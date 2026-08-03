import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type UserManagementHeaderBarProps = {
  searchQuery: string
  onSearchChange: (value: string) => void
  setUserDialogOpen: (open: boolean) => void
}

export function UserManagementHeaderBar({
  searchQuery,
  onSearchChange,
  setUserDialogOpen,
}: UserManagementHeaderBarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <h1 className="shrink-0 text-lg font-semibold tracking-tight text-foreground">User Management</h1>

      <div className="flex w-full flex-col gap-3 sm:max-w-xl sm:flex-1 sm:flex-row sm:items-center sm:justify-end">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder=""
            className="h-9 pl-9"
            aria-label="Search team members"
          />
        </div>
        <Button
          type="button"
          className="gap-2 shrink-0"
          size="sm"
          onClick={() => setUserDialogOpen(true)}
          aria-label="Add User"
        >
          <Plus size={14} />
          Add User
        </Button>
      </div>
    </div>
  )
}
