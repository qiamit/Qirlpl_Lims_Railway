import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'

/** Debounce before pushing draft text into the parent items array. */
export const TEXT_COMMIT_DEBOUNCE_MS = 500

function PolishAiButton({
  busy,
  disabled,
  label,
  title,
  onClick,
}: {
  busy: boolean
  disabled: boolean
  label: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/80 bg-background/95 text-primary shadow-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {busy ? (
        <Loader2 size={14} className="animate-spin" aria-hidden />
      ) : (
        <Sparkles size={14} aria-hidden />
      )}
    </button>
  )
}

/**
 * Local-draft textarea: keystrokes only update this cell.
 * Parent `items` (and the ~177-row table) update on debounce / blur.
 */
function ChecklistLocalTextarea({
  value,
  onCommit,
  placeholder,
  ariaLabel,
  ariaRequired,
  disabled,
  polishBusy,
  polishDisabled,
  polishLabel,
  polishTitle,
  onPolish,
}: {
  value: string
  onCommit: (next: string) => void
  placeholder: string
  ariaLabel: string
  ariaRequired?: boolean
  disabled?: boolean
  polishBusy: boolean
  polishDisabled: boolean
  polishLabel: string
  polishTitle: string
  onPolish: () => void
}) {
  const [local, setLocal] = useState(value)
  const commitTimer = useRef<number | null>(null)
  const localRef = useRef(local)
  const focusedRef = useRef(false)
  const onCommitRef = useRef(onCommit)
  localRef.current = local
  onCommitRef.current = onCommit

  // Sync external value (AI polish / load) only when not actively editing.
  useEffect(() => {
    if (focusedRef.current) return
    setLocal(value)
  }, [value])

  useEffect(() => {
    return () => {
      if (commitTimer.current != null) window.clearTimeout(commitTimer.current)
    }
  }, [])

  const flush = useCallback(() => {
    if (commitTimer.current != null) {
      window.clearTimeout(commitTimer.current)
      commitTimer.current = null
    }
    onCommitRef.current(localRef.current)
  }, [])

  return (
    <div className="relative w-full text-left">
      <Textarea
        value={local}
        onChange={(e) => {
          const next = e.target.value
          setLocal(next)
          if (commitTimer.current != null) window.clearTimeout(commitTimer.current)
          commitTimer.current = window.setTimeout(() => {
            commitTimer.current = null
            onCommitRef.current(next)
          }, TEXT_COMMIT_DEBOUNCE_MS)
        }}
        onFocus={() => {
          focusedRef.current = true
        }}
        onBlur={() => {
          focusedRef.current = false
          flush()
        }}
        placeholder={placeholder}
        className="min-h-[72px] w-full resize-y pe-9 text-sm text-left"
        aria-label={ariaLabel}
        aria-required={ariaRequired}
        disabled={disabled}
      />
      <PolishAiButton
        busy={polishBusy}
        disabled={polishDisabled || !local.trim()}
        label={polishLabel}
        title={polishTitle}
        onClick={() => {
          flush()
          onPolish()
        }}
      />
    </div>
  )
}

export const ChecklistObservationCell = memo(function ChecklistObservationCell({
  clauseNo,
  conformity,
  value,
  polishBusy,
  polishLocked,
  onCommit,
  onPolish,
}: {
  clauseNo: string
  conformity: string
  value: string
  polishBusy: boolean
  /** True while any AI polish is running (disables other sparkles without remounting textareas). */
  polishLocked: boolean
  onCommit: (next: string) => void
  onPolish: () => void
}) {
  if (conformity === '') {
    return <span className="text-xs text-muted-foreground">Select conformity first</span>
  }

  const observationRequired = conformity === 'yes' || conformity === 'no'
  const observationOptional = conformity === 'na'

  return (
    <ChecklistLocalTextarea
      value={value}
      onCommit={onCommit}
      placeholder={
        observationRequired
          ? 'Observation (required)…'
          : observationOptional
            ? 'Observation (optional)…'
            : 'Observation…'
      }
      ariaLabel={`Observation for clause ${clauseNo}`}
      ariaRequired={observationRequired || undefined}
      disabled={polishBusy}
      polishBusy={polishBusy}
      polishDisabled={polishLocked}
      polishLabel={`Polish observation for clause ${clauseNo} with AI`}
      polishTitle="Polish observation with QI Assistant"
      onPolish={onPolish}
    />
  )
})

export const ChecklistNonConformityCell = memo(function ChecklistNonConformityCell({
  clauseNo,
  show,
  value,
  polishBusy,
  polishLocked,
  onCommit,
  onPolish,
}: {
  clauseNo: string
  show: boolean
  value: string
  polishBusy: boolean
  polishLocked: boolean
  onCommit: (next: string) => void
  onPolish: () => void
}) {
  if (!show) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  return (
    <ChecklistLocalTextarea
      value={value}
      onCommit={onCommit}
      placeholder="Describe non conformity…"
      ariaLabel={`Non conformity for clause ${clauseNo}`}
      ariaRequired
      disabled={polishBusy}
      polishBusy={polishBusy}
      polishDisabled={polishLocked}
      polishLabel={`Polish non conformity for clause ${clauseNo} with AI`}
      polishTitle="Polish non conformity with QI Assistant"
      onPolish={onPolish}
    />
  )
})
