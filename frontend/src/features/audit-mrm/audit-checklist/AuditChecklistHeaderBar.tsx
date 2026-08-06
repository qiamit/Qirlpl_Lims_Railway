import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export function AuditChecklistHeaderBar({
  search,
  onSearchChange,
}: {
  search: string
  onSearchChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-sm sm:px-5 sm:py-4">
      <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
        <h1 className="shrink-0 text-base font-semibold tracking-tight text-foreground sm:text-lg">
          Audit Checklist
        </h1>
        <div className="relative hidden min-w-0 flex-1 sm:block sm:max-w-xs md:max-w-sm lg:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder=""
            className="h-9 pl-9"
            aria-label="Search planned audits"
          />
        </div>
      </div>

      <div className="relative w-full sm:hidden">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search planned audits…"
          className="h-9 pl-9"
          aria-label="Search planned audits"
        />
      </div>
    </div>
  )
}
