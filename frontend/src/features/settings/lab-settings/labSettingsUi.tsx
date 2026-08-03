import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Underline field style — matches User Management / AI Settings registry forms */
export const labFieldControlClass =
  'h-10 rounded-none border-0 border-b border-slate-300 bg-transparent px-2.5 shadow-none text-slate-900 placeholder:text-slate-400 focus-visible:border-teal-600 focus-visible:ring-0'

export const labAddLinkClass =
  'inline-flex shrink-0 items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 hover:underline whitespace-nowrap'

/** Themes nested Label / Input / SelectTrigger / Textarea without per-field edits */
export const labRegistryFormClass = cn(
  'lab-registry-form',
  '[&_label]:text-[12px] [&_label]:font-medium [&_label]:text-slate-600',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:h-10',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:rounded-none',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:border-0',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:border-b',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:border-slate-300',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:bg-transparent',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:px-2.5',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:shadow-none',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:focus-visible:border-teal-600',
  '[&_input:not([type=checkbox]):not([type=file]):not([type=radio])]:focus-visible:ring-0',
  '[&_button[role=combobox]]:h-10',
  '[&_button[role=combobox]]:rounded-none',
  '[&_button[role=combobox]]:border-0',
  '[&_button[role=combobox]]:border-b',
  '[&_button[role=combobox]]:border-slate-300',
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
  '[&_textarea]:border-slate-300',
  '[&_textarea]:bg-transparent',
  '[&_textarea]:px-2.5',
  '[&_textarea]:py-2',
  '[&_textarea]:shadow-none',
  '[&_textarea]:focus-visible:border-teal-600',
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
        'overflow-hidden rounded-xl border border-slate-200 bg-[linear-gradient(165deg,#f8fbff_0%,#eef4fb_45%,#f7f9fc_100%)] shadow-sm',
        className,
      )}
    >
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
        <div className="relative">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">{title}</h2>
        </div>
      </div>
      <div className={cn('space-y-5 bg-[#fafbfc] px-5 py-5', labRegistryFormClass)}>{children}</div>
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
    <section className={cn('overflow-hidden rounded-xl border border-slate-200/90 bg-white/80 shadow-sm', className)}>
      <div className="flex items-center gap-3 border-b border-slate-200/80 bg-slate-900 px-4 py-3 text-white">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-teal-300/90">{step}</span>
        <h3 className="text-sm font-semibold tracking-tight text-white">{title}</h3>
      </div>
      <div className="space-y-5 px-4 py-5">{children}</div>
    </section>
  )
}
