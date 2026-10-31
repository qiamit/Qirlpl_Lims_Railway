import { Component, type ErrorInfo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  ANALYSIS_KIND_LABEL,
  AVAILABLE_ANALYSIS_KINDS,
  COMING_LATER_TEXT,
  INDICATIVE_REMARK,
  type AnalysisKind,
  type ParamRowAnalysisInfo,
} from '@/features/metallography/types'

/**
 * Enter Results pieces of the metallography module (design 3.4): the word
 * "Metallography" after "Calculator | Attach", the read-only result box of a
 * row whose result comes from an analysis ("from MA-…", Unlink) and "View
 * analysis" on the review screens. The dialog decides when each one shows.
 */

const wordClass = 'font-semibold leading-tight text-amber-800 hover:text-amber-950 hover:underline disabled:cursor-not-allowed disabled:text-stone-400 disabled:no-underline'
const pipeClass = "before:mr-2 before:font-normal before:text-stone-400 before:content-['|']"

const numberOr = (no: string | null | undefined) => no?.trim() || 'Analysis'

/** Hover text of the "Metallography" word. */
function launchTitle(kind: AnalysisKind, info: ParamRowAnalysisInfo | null, linkedId: string | null): string {
  const kindLabel = ANALYSIS_KIND_LABEL[kind]
  if (!AVAILABLE_ANALYSIS_KINDS.has(kind)) return `${kindLabel} analysis: ${COMING_LATER_TEXT.toLowerCase()}`
  if (info?.inProgress) return `${numberOr(info.inProgress.analysisNo)} in progress (${kindLabel.toLowerCase()})`
  if (info?.completed && info.completed.id !== linkedId) {
    return `${numberOr(info.completed.analysisNo)} completed — Use result`
  }
  return `Start a ${kindLabel.toLowerCase()} analysis on the specimen images`
}

/** "| Metallography" in the result footer. */
export function MetallographyLaunchLink({
  kind,
  info,
  linkedId,
  disabled,
  onOpen,
}: {
  kind: AnalysisKind
  info: ParamRowAnalysisInfo | null
  linkedId: string | null
  disabled?: boolean
  onOpen: () => void
}) {
  const available = AVAILABLE_ANALYSIS_KINDS.has(kind)
  const title = launchTitle(kind, info, linkedId)
  const ready = available && Boolean(info?.completed && info.completed.id !== linkedId) && !info?.inProgress
  return (
    <button
      type="button"
      className={cn(
        wordClass,
        pipeClass,
        'inline-flex items-center text-[10.5px]',
        !available && 'cursor-default text-stone-400 hover:text-stone-400 hover:no-underline',
      )}
      title={title}
      aria-label={title}
      // Kinds without an engine yet: the hover text says "coming later" (a disabled button would hide it).
      aria-disabled={!available || undefined}
      onClick={available ? onOpen : undefined}
      disabled={disabled}
    >
      Metallography
      {ready ? <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden /> : null}
    </button>
  )
}

/**
 * Result of a row linked to an analysis: read-only (the database refuses any
 * other text while linked), labelled "from MA-…". Unlink asks for a reason;
 * Undo drops a link chosen in this session that is not saved yet.
 */
export function MetallographyLinkedResult({
  resultsDisplay,
  resultsTitle,
  analysisNo,
  pending,
  indicative,
  footer,
  busy,
  disabled,
  onOpenAnalysis,
  onUnlink,
}: {
  resultsDisplay: string
  resultsTitle: string
  analysisNo: string | null
  /** Link chosen with Use result in this session, not saved yet. */
  pending: boolean
  indicative: boolean
  /** Attach and, when another analysis is open or completed, "Metallography". */
  footer?: ReactNode
  busy?: boolean
  disabled?: boolean
  onOpenAnalysis: () => void
  onUnlink: () => void
}) {
  const label = `from ${numberOr(analysisNo)}`
  return (
    <div className="flex w-full min-w-0 max-w-[320px] flex-col items-stretch gap-1">
      <div
        className="min-h-8 w-full min-w-0 cursor-default whitespace-pre-wrap break-words rounded-md border border-stone-300 bg-stone-100 px-2 py-1.5 text-center text-xs leading-relaxed text-[#292524]"
        title={`${resultsTitle || resultsDisplay}\n\nResult ${label}. Change it in the analysis, or unlink it to edit by hand.`}
        aria-readonly
      >
        {resultsDisplay || '—'}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[10.5px]">
        <button
          type="button"
          className={wordClass}
          title={`Open ${numberOr(analysisNo)}`}
          onClick={onOpenAnalysis}
          disabled={disabled}
        >
          {label}
        </button>
        {footer}
        <button
          type="button"
          className={cn(wordClass, pipeClass)}
          title={
            pending
              ? 'Drop this result and go back to the previous value'
              : 'Unlink the result from the analysis (reason required); the value stays and can be edited'
          }
          onClick={onUnlink}
          disabled={disabled || busy}
        >
          {busy ? 'Unlinking…' : pending ? 'Undo' : 'Unlink'}
        </button>
      </div>
      {pending ? <span className="text-[10px] leading-tight text-stone-500">Not saved yet</span> : null}
      {indicative ? (
        <span className="text-[10px] leading-tight text-amber-800" title="Suggest Non NABL until the method validation is linked">
          {INDICATIVE_REMARK}
        </span>
      ) : null}
    </div>
  )
}

/** "View analysis" under a linked result on the read-only (review) dialog. */
export function MetallographyViewAnalysisLink({
  analysisNo,
  onOpen,
}: {
  analysisNo: string | null
  onOpen: () => void
}) {
  return (
    <div className="mt-0.5 flex w-full justify-center text-[10.5px]">
      <button
        type="button"
        className={wordClass}
        title={`Result from ${numberOr(analysisNo)}: images, marks, calibration and Re-check`}
        onClick={onOpen}
      >
        View analysis
      </button>
    </div>
  )
}

/**
 * Keeps a failure inside the metallography dialog (or a chunk that did not
 * load after a release) from taking Enter Results down with it.
 */
export class MetallographyDialogBoundary extends Component<
  { onError: (message: string) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Metallography dialog failed', error, info.componentStack)
    this.props.onError(`Metallography could not open: ${error.message || 'unknown error'}. Reload the page and try again.`)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
