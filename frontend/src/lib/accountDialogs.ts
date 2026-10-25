/** Opens the account dialogs (mounted once by SessionSecurityGate) from anywhere, e.g. the profile menu. */
export type AccountDialogKind = 'change-password' | 'two-step'

const EVENT_NAME = 'lims:open-account-dialog'

export function openAccountDialog(kind: AccountDialogKind): void {
  // Deferred so a closing dropdown menu releases focus first.
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent<AccountDialogKind>(EVENT_NAME, { detail: kind }))
  }, 0)
}

export function onOpenAccountDialog(listener: (kind: AccountDialogKind) => void): () => void {
  const handler = (event: Event) => {
    const kind = (event as CustomEvent<AccountDialogKind>).detail
    if (kind === 'change-password' || kind === 'two-step') listener(kind)
  }
  window.addEventListener(EVENT_NAME, handler)
  return () => window.removeEventListener(EVENT_NAME, handler)
}
