import { limsPrimaryBtnClass } from '@/lib/limsThemeUi'
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
  'rounded-none text-xs data-[state=active]:bg-white data-[state=active]:text-stone-900 data-[state=active]:shadow-sm sm:text-sm'

export function LabSettingsHeaderBar({
  labName = '',
  saveLoading,
  saveMessage,
  onSave,
}: LabSettingsHeaderBarProps) {
  const initials = getCompanyInitials(labName)

  return (
    <div className="relative space-y-0 overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
      <div className="relative bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-5 py-4 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
          }}
        />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-none bg-gradient-to-br from-amber-500/30 to-amber-700/20 text-sm font-bold tracking-wide text-amber-100 shadow-inner ring-1 ring-amber-300/40"
              aria-hidden
            >
              {initials}
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-200/90">Lab Registry</p>
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
              className={cn('gap-2 shrink-0', limsPrimaryBtnClass)}
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

      <div className="bg-[#f7f3eb] px-4 pb-4 pt-3">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-none border border-stone-300 bg-stone-100/80 p-1 sm:grid-cols-3 lg:grid-cols-7">
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
