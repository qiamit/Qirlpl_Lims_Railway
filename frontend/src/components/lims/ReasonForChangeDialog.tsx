import { useId, useRef, useState } from 'react'
import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  limsDarkBarAccentClass,
  limsDarkBarClass,
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export const REASON_FOR_CHANGE_MIN_LENGTH = 5

export const REASON_FOR_CHANGE_QUICK_PICKS = [
  'Transcription error corrected',
  'Customer request',
  'Recalculation',
  'Re-test',
  'Reviewer comment addressed',
  'Duplicate / entered in error',
] as const

export type ReasonForChangeDialogProps = {
  open: boolean
  /** Dialog heading, e.g. "Reason for changing submitted results". */
  title?: string
  /** What is being changed, e.g. "SRF 24-0012 · Compressive strength". */
  recordLabel?: string
  /** Optional extra line under the heading. */
  description?: string
  /** Primary button text (default "Continue"). */
  confirmLabel?: string
  /** Quick-pick chips; defaults to REASON_FOR_CHANGE_QUICK_PICKS. */
  quickPicks?: readonly string[]
  onConfirm: (reason: string) => void
  onCancel: () => void
}

/**
 * ISO/IEC 17025 clause 7.5.2: ask why a submitted / reviewed / approved record
 * is being changed or deleted. Reason is required (min 5 characters).
 */
export function ReasonForChangeDialog({
  open,
  title = 'Reason for change',
  recordLabel,
  description,
  confirmLabel = 'Continue',
  quickPicks = REASON_FOR_CHANGE_QUICK_PICKS,
  onConfirm,
  onCancel,
}: ReasonForChangeDialogProps) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fieldId = useId()

  // Start blank each time the dialog opens (state adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setReason('')
      setTouched(false)
    }
  }

  const trimmed = reason.trim()
  const valid = trimmed.length >= REASON_FOR_CHANGE_MIN_LENGTH

  const submit = () => {
    setTouched(true)
    if (!valid) {
      textareaRef.current?.focus()
      return
    }
    onConfirm(trimmed)
  }

  const pick = (text: string) => {
    setReason((prev) => {
      const p = prev.trim()
      if (!p) return text
      if (p.toLowerCase().includes(text.toLowerCase())) return prev
      return `${p}; ${text}`
    })
    setTouched(true)
    textareaRef.current?.focus()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent
        layer="top"
        className={cn(limsDialogClass, 'max-w-md')}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          textareaRef.current?.focus()
        }}
      >
        <div className={cn(limsDarkBarClass, 'px-4 py-3 pr-12')}>
          <div className="pointer-events-none absolute inset-0 opacity-90" style={limsDarkBarGlowStyle} aria-hidden />
          <div className={limsDarkBarAccentClass} aria-hidden />
          <div className="relative flex items-start gap-2">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
            <div className="min-w-0">
              <DialogTitle className="text-sm font-bold uppercase tracking-[0.12em] text-amber-100">
                {title}
              </DialogTitle>
              {recordLabel ? (
                <p className="mt-1 break-words text-xs font-medium text-stone-200">{recordLabel}</p>
              ) : null}
            </div>
          </div>
        </div>

        <form
          className="space-y-3 overflow-y-auto px-4 py-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <DialogDescription className="text-xs text-stone-600">
            {description ??
              'This record has already been submitted. The change is kept in the audit trail together with the reason you give here.'}
          </DialogDescription>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Common reasons">
            {quickPicks.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => pick(q)}
                className="min-h-8 rounded-none border border-stone-400 bg-stone-50 px-2 py-1 text-left text-[11px] font-semibold text-stone-800 transition-colors hover:border-amber-600 hover:bg-amber-50 hover:text-amber-900"
              >
                {q}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <Label htmlFor={fieldId} className="text-xs font-semibold text-stone-800">
              Reason <span className="text-red-700">*</span>
            </Label>
            <Textarea
              id={fieldId}
              ref={textareaRef}
              rows={3}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder="Why is this record being changed?"
              className="min-h-[72px] resize-y border-stone-500 text-base sm:text-sm"
              aria-invalid={touched && !valid}
            />
            {touched && !valid ? (
              <p className="text-xs text-red-700">
                Enter a reason of at least {REASON_FOR_CHANGE_MIN_LENGTH} characters.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-stone-200 pt-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className={limsOutlineBtnClass} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" className={limsPrimaryBtnClass} disabled={touched && !valid}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
