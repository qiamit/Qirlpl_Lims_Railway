import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChangePasswordDialog } from '@/components/auth/ChangePasswordDialog'
import { IdleTimeoutGuard } from '@/components/auth/IdleTimeoutGuard'
import { MfaCodeField } from '@/components/auth/MfaCodeField'
import { TwoStepVerificationDialog } from '@/components/auth/TwoStepVerificationDialog'
import { signOut, useAuth } from '@/hooks/useAuth'
import { onOpenAccountDialog, type AccountDialogKind } from '@/lib/accountDialogs'
import { clearMustChangePassword, fetchMustChangePassword, logAuthEvent } from '@/lib/authEvents'
import { limsPanelClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { needsMfaStepUp, verifyTotpCode } from '@/lib/mfa'

type GateState = 'checking' | 'mfa' | 'must_change' | 'ok'

/**
 * Runs inside RequireAuth for every signed-in page:
 *  1. two-step code when the user has a verified authenticator and the
 *     session is still aal1 (after password sign-in);
 *  2. forced password change when user_profiles.must_change_password is set
 *     (director reset); the dialog cannot be dismissed;
 *  3. idle sign-out, and the Change password / Two-step dialogs opened from
 *     the profile menu.
 * Before the login-security migration is applied, step 2 is skipped.
 */
export function SessionSecurityGate({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const [gate, setGate] = useState<{ userId: string; state: GateState }>({ userId: '', state: 'checking' })
  const [dialog, setDialog] = useState<AccountDialogKind | null>(null)

  const evaluate = useCallback(async (): Promise<GateState> => {
    if (!userId) return 'checking'
    if (await needsMfaStepUp()) return 'mfa'
    if (await fetchMustChangePassword(userId)) return 'must_change'
    return 'ok'
  }, [userId])

  const recheck = useCallback(async () => {
    const state = await evaluate()
    setGate({ userId, state })
  }, [evaluate, userId])

  useEffect(() => {
    let canceled = false
    void evaluate().then((state) => {
      if (!canceled) setGate({ userId, state })
    })
    return () => {
      canceled = true
    }
  }, [evaluate, userId])

  useEffect(() => onOpenAccountDialog(setDialog), [])

  // Until the check for this user finishes, render nothing (like RequireAuth while loading).
  const state: GateState = gate.userId === userId ? gate.state : 'checking'
  if (state === 'checking') return null

  return (
    <>
      <IdleTimeoutGuard />
      {state === 'mfa' ? (
        <MfaChallengeScreen onVerified={recheck} />
      ) : state === 'must_change' ? (
        <ChangePasswordDialog
          open
          forced
          onOpenChange={() => undefined}
          onChanged={async () => {
            await clearMustChangePassword()
            await recheck()
          }}
        />
      ) : (
        <>
          {children}
          <ChangePasswordDialog open={dialog === 'change-password'} onOpenChange={(open) => setDialog(open ? 'change-password' : null)} />
          <TwoStepVerificationDialog open={dialog === 'two-step'} onOpenChange={(open) => setDialog(open ? 'two-step' : null)} />
        </>
      )}
    </>
  )
}

function MfaChallengeScreen({ onVerified }: { onVerified: () => Promise<void> }) {
  const { user } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const verify = async () => {
    setBusy(true)
    setError(null)
    try {
      const codeError = await verifyTotpCode(code)
      if (codeError) {
        setError(codeError)
        return
      }
      void logAuthEvent('login', { mfa: 'verified' })
      await onVerified()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f7f3eb] px-4">
      <div className={`${limsPanelClass} w-full max-w-sm`}>
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-amber-700" />
            <h1 className="text-lg font-semibold text-stone-900">Two-step verification</h1>
          </div>
          <p className="text-sm text-stone-700">
            Enter the 6-digit code from the authenticator app for{' '}
            <span className="font-medium">{user?.email ?? 'your account'}</span>.
          </p>
          <MfaCodeField id="mfa-signin-code" value={code} onChange={setCode} onEnter={() => void verify()} disabled={busy} />
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" className="h-8 rounded-none" disabled={busy} onClick={() => void signOut()}>
              Sign out
            </Button>
            <Button type="button" className={limsPrimaryBtnClass} disabled={busy || code.length !== 6} onClick={() => void verify()}>
              {busy ? 'Verifying…' : 'Verify'}
            </Button>
          </div>
          <p className="text-xs text-stone-500">Lost your device? Ask the Laboratory Director to reset your account.</p>
        </div>
      </div>
    </div>
  )
}
