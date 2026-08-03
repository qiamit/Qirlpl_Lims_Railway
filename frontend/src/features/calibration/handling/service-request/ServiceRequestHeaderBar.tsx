import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'

export function ServiceRequestHeaderBar({
  search,
  onSearchChange,
  onNew,
  assistantContext,
  onAssistantDataChanged,
}: {
  search: string
  onSearchChange: (value: string) => void
  onNew: () => void
  assistantContext: string
  onAssistantDataChanged?: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-sm sm:px-5 sm:py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 md:gap-4">
          <h1 className="shrink-0 text-base font-semibold tracking-tight text-foreground sm:text-lg">
            Service Request Directory
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
              aria-label="Search service requests"
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <QiAssistant
            page="calibration-service-request"
            pageTitle="Service Request"
            contextSummary={assistantContext}
            suggestedQuestions={[
              'Create a new service request for client ABC Labs',
              'List open service requests under review',
              'What Clause 7.1 checks are required before accepting a request?',
            ]}
            onDataChanged={onAssistantDataChanged}
            triggerVariant="icon"
          />
          <Button
            type="button"
            className="gap-2 shrink-0"
            size="sm"
            onClick={onNew}
            aria-label="Add New Service Request"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Add New Request</span>
            <span className="sm:hidden">Add</span>
          </Button>
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
          placeholder="Search service requests…"
          className="h-9 pl-9"
          aria-label="Search service requests"
        />
      </div>
    </div>
  )
}
