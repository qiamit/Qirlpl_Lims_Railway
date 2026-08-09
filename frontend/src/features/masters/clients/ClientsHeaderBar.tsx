import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'
import {
  clientAiTriggerClass,
  clientDarkBarSearchClass,
  clientPanelClass,
  clientPrimaryBtnClass,
} from './clientsFormUi'
import { cn } from '@/lib/utils'

export function ClientsHeaderBar({
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
    <div className={cn(clientPanelClass)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
          }}
        />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <div className="relative flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
          <h1 className="shrink-0 text-base font-semibold tracking-tight text-white sm:text-lg">
            Client Directory
          </h1>

          <div className="relative order-3 w-full min-w-0 sm:order-none sm:mx-1 sm:w-[70%] sm:max-w-[19.5rem] sm:flex-none">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search clients…"
              className={cn(clientDarkBarSearchClass, 'pl-9')}
              aria-label="Search clients"
            />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <QiAssistant
              page="clients"
              pageTitle="Client Directory"
              contextSummary={assistantContext}
              suggestedQuestions={[
                'Add a new client ABC Labs Pvt Ltd with Dr balance',
                'Summarize clients in the current list',
                'Update payment term for a client by company name',
                'What is the difference between Dr and Cr balance?',
              ]}
              onDataChanged={onAssistantDataChanged}
              triggerVariant="icon"
              triggerClassName={clientAiTriggerClass}
            />
            <Button
              type="button"
              className={cn('gap-2 shrink-0', clientPrimaryBtnClass)}
              size="sm"
              onClick={onNew}
              aria-label="Add New Client"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Add New Client</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
