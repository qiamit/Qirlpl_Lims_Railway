import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

/** Underline field style — stone/amber Client Master accents */
export const labFieldControlClass =
  'h-10 rounded-none border-0 border-b border-stone-400 bg-transparent px-2.5 shadow-none text-stone-900 placeholder:text-stone-400 focus-visible:border-amber-600 focus-visible:ring-0'

export const labAddLinkClass =
  'inline-flex shrink-0 items-center gap-1 text-xs font-medium text-amber-800 hover:text-amber-950 hover:underline whitespace-nowrap'

/** Themes nested Label / Input / SelectTrigger / Textarea without per-field edits */
export const labRegistryFormClass = cn(
  'lab-registry-form',
  '[&_label]:text-[12px] [&_label]:font-medium [&_label]:text-stone-600',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:h-10',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:rounded-none',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:border-0',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:border-b',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:border-stone-400',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:bg-transparent',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:px-2.5',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:shadow-none',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:focus-visible:border-amber-600',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:focus-visible:ring-0',
  '[&_button[role=combobox]]:h-10',
  '[&_button[role=combobox]]:rounded-none',
  '[&_button[role=combobox]]:border-0',
  '[&_button[role=combobox]]:border-b',
  '[&_button[role=combobox]]:border-stone-400',
  '[&_button[role=combobox]]:bg-transparent',
  '[&_button[role=combobox]]:px-2.5',
  '[&_button[role=combobox]]:shadow-none',
  '[&_button[role=combobox]]:focus:ring-0',
  '[&_button[role=combobox]]:focus:ring-offset-0',
  '[&_textarea]:h-10',
  '[&_textarea]:min-h-10',
  '[&_textarea]:resize-none',
  '[&_textarea]:rounded-none',
  '[&_textarea]:border-0',
  '[&_textarea]:border-b',
  '[&_textarea]:border-stone-400',
  '[&_textarea]:bg-transparent',
  '[&_textarea]:px-2.5',
  '[&_textarea]:py-2',
  '[&_textarea]:shadow-none',
  '[&_textarea]:focus-visible:border-amber-600',
  '[&_textarea]:focus-visible:ring-0',
  '[&_textarea]:focus-visible:ring-offset-0',
)

type LabSettingsPanelProps = {
  eyebrow: string
  title: string
  children: ReactNode
  className?: string
}

export function LabSettingsPanel({ eyebrow, title, children, className }: LabSettingsPanelProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-b from-stone-50 to-white shadow-sm ring-1 ring-amber-700/20',
        className,
      )}
    >
      <div className="relative border-b border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-5 py-4 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
          }}
        />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <div className="relative">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-200/90">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">{title}</h2>
        </div>
      </div>
      <div className={cn('space-y-5 bg-[#f7f3eb]/90 px-5 py-5', labRegistryFormClass)}>{children}</div>
    </div>
  )
}

type LabFormSectionProps = {
  step: string
  title: string
  children: ReactNode
  className?: string
}

export function LabFormSection({ step, title, children, className }: LabFormSectionProps) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-none border-2 border-stone-400 bg-white/90 shadow-sm ring-1 ring-amber-700/10',
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-200/90">{step}</span>
        <h3 className="text-sm font-semibold tracking-tight text-white">{title}</h3>
      </div>
      <div className="space-y-5 px-4 py-5">{children}</div>
    </section>
  )
}
