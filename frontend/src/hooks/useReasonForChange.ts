import { createElement, useCallback, useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ReasonForChangeDialog } from '@/components/lims/ReasonForChangeDialog'

export { recordReason } from '@/lib/auditReason'

export type AskReasonOptions = {
  /** Dialog heading, e.g. "Reason for changing submitted results". */
  title?: string
  /** What is being changed, e.g. "SRF 24-0012 · Compressive strength". */
  recordLabel?: string
  /** Optional extra explanation line. */
  description?: string
  /** Primary button text (default "Continue"). */
  confirmLabel?: string
  quickPicks?: readonly string[]
}

/** Resolves to the trimmed reason, or null when the user cancelled. */
export type AskReason = (options?: AskReasonOptions) => Promise<string | null>

type Pending = { root: Root; host: HTMLElement; resolve: (value: string | null) => void }

/**
 * ISO/IEC 17025 clause 7.5.2 — ask why a submitted record is being changed.
 *
 *   const ask = useReasonForChange()
 *   const reason = await ask({ title, recordLabel })
 *   if (!reason) return // cancelled
 *   await save()
 *   await recordReason(table, rowId, reason)
 *
 * The dialog mounts on demand (own React root), so screens need no extra JSX.
 */
export function useReasonForChange(): AskReason {
  const pendingRef = useRef<Pending | null>(null)

  const close = useCallback((value: string | null) => {
    const p = pendingRef.current
    if (!p) return
    pendingRef.current = null
    p.resolve(value)
    // Let Radix finish its close cycle before tearing the root down.
    window.setTimeout(() => {
      p.root.unmount()
      p.host.remove()
    }, 0)
  }, [])

  useEffect(() => () => close(null), [close])

  return useCallback<AskReason>(
    (options = {}) => {
      close(null)
      return new Promise<string | null>((resolve) => {
        const host = document.createElement('div')
        host.setAttribute('data-reason-for-change-root', '')
        document.body.appendChild(host)
        const root = createRoot(host)
        pendingRef.current = { root, host, resolve }
        root.render(
          createElement(ReasonForChangeDialog, {
            open: true,
            ...options,
            onConfirm: (reason: string) => close(reason),
            onCancel: () => close(null),
          }),
        )
      })
    },
    [close],
  )
}
