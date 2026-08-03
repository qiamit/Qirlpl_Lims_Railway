import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'

export function IsCodesHeaderBar({
  search,
  onSearchChange,
  onNew,
  onOpenBIS,
  assistantContext,
  onAssistantDataChanged,
}: {
  search: string
  onSearchChange: (value: string) => void
  onNew: () => void
  onOpenBIS: () => void
  assistantContext: string
  onAssistantDataChanged?: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <h1 className="shrink-0 text-lg font-semibold tracking-tight text-foreground">IS Code Master</h1>
        <div className="relative w-full sm:max-w-sm">
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
            aria-label="Search IS codes"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <QiAssistant
          page="is-codes"
          pageTitle="IS Code Master"
          contextSummary={assistantContext}
          suggestedQuestions={[
            'Add a new IS code IS 1234:2010 titled Sample Standard',
            'Summarize the IS codes in the current list',
            'Update testing charges for the first IS in the list',
            'How do I upload PDFs for an IS code?',
          ]}
          onDataChanged={onAssistantDataChanged}
          enablePdfImport
          triggerVariant="icon"
        />
        <Button type="button" variant="outline" size="sm" onClick={onOpenBIS}>
          BIS Website
        </Button>
        <Button type="button" className="gap-2 shrink-0" size="sm" onClick={onNew} aria-label="Add New IS Code">
          <Plus size={14} />
          Add New IS Code
        </Button>
      </div>
    </div>
  )
}
