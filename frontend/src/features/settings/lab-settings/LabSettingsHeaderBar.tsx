import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { getCompanyInitials } from './brandMark'

type LabSettingsHeaderBarProps = {
  labName?: string
  saveLoading: boolean
  saveMessage: string | null
  onSave: () => void
}

const tabTriggerClass =
  'rounded-md text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:text-sm'

export function LabSettingsHeaderBar({
  labName = '',
  saveLoading,
  saveMessage,
  onSave,
}: LabSettingsHeaderBarProps) {
  const initials = getCompanyInitials(labName)

  return (
    <div className="space-y-4 overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
      <div className="relative border-b border-slate-200/80 bg-slate-900 px-5 py-4 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.1]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(45,212,191,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.4) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />

        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400/30 to-cyan-600/20 text-sm font-bold tracking-wide text-teal-100 shadow-inner ring-1 ring-teal-300/40"
              aria-hidden
            >
              {initials}
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">Lab Registry</p>
              <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-white">Lab Setting</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {saveMessage ? (
              <p
                className={cn(
                  'text-sm',
                  saveMessage.toLowerCase().includes('saved') ? 'text-emerald-300' : 'text-red-300',
                )}
              >
                {saveMessage}
              </p>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="gap-2 shrink-0 bg-teal-600 text-white hover:bg-teal-500"
              onClick={onSave}
              disabled={saveLoading}
              aria-label="Save lab settings"
            >
              <Save size={14} />
              {saveLoading ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-[#fafbfc] px-4 pb-4 pt-3">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg border border-slate-200/80 bg-slate-100/80 p-1 sm:grid-cols-3 lg:grid-cols-7">
          <TabsTrigger value="laboratory-details" className={tabTriggerClass}>
            Laboratory Details
          </TabsTrigger>
          <TabsTrigger value="bank-details" className={tabTriggerClass}>
            Bank Details
          </TabsTrigger>
          <TabsTrigger value="legal-documents" className={tabTriggerClass}>
            Legal Documents
          </TabsTrigger>
          <TabsTrigger value="logos-signatures" className={tabTriggerClass}>
            Registration Documents
          </TabsTrigger>
          <TabsTrigger value="prefixes" className={tabTriggerClass}>
            Prefix&apos;s
          </TabsTrigger>
          <TabsTrigger value="letterhead" className={tabTriggerClass}>
            Letter Head Templates
          </TabsTrigger>
          <TabsTrigger value="settings" className={tabTriggerClass}>
            Setting
          </TabsTrigger>
        </TabsList>
      </div>
    </div>
  )
}
