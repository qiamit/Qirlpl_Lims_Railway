import { cn } from '@/lib/utils'
import { limsPrimaryBtnClass, limsDarkBarSearchClass, limsDarkBarFieldClass, limsDarkBarBtnClass, limsAiTriggerClass } from '@/lib/limsThemeUi'
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
    <div className="flex flex-col gap-3 relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white shadow-sm ring-1 ring-amber-700/20 px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <h1 className="shrink-0 text-lg font-semibold tracking-tight text-white">User Management</h1>

      <div className="flex w-full flex-col gap-3 sm:max-w-xl sm:flex-1 sm:flex-row sm:items-center sm:justify-end">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            aria-hidden
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder=""
            className={cn(limsDarkBarSearchClass, 'pl-9')}
            aria-label="Search team members"
          />
        </div>
        <Button
          type="button"
          className={cn('gap-2 shrink-0', limsPrimaryBtnClass)}
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
