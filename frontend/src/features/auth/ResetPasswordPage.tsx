import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MfaCodeField } from '@/components/auth/MfaCodeField'
import { RESET_DONE_NOTICE_KEY, clearMustChangePassword, logAuthEvent } from '@/lib/authEvents'
import {
  limsDarkBarAccentClass,
  limsDarkBarClass,
  limsDarkBarGlowStyle,
  limsFieldClass,
  limsPageShellClass,
  limsPanelClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { needsMfaStepUp, verifyTotpCode } from '@/lib/mfa'
import { PASSWORD_POLICY_HINT, validatePassword } from '@/lib/passwordPolicy'
import { passwordRecoveryState, supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'

type Phase = 'waiting' | 'ready' | 'invalid'

const RECOVERY_WAIT_MS = 8000

/**
 * Public page at /auth/reset, opened from the password-reset email
 * (supabase.auth.resetPasswordForEmail with redirectTo = <origin>/auth/reset).
 * Accepts a new password only for a recovery session (PASSWORD_RECOVERY);
 * then ends every session and sends the user to sign in.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>(() =>
    passwordRecoveryState.linkError ? 'invalid' : passwordRecoveryState.active ? 'waiting' : 'invalid',
  )
  const [email, setEmail] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [needCode, setNeedCode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (phase !== 'waiting') return
    let canceled = false
    const accept = (sessionEmail: string | undefined) => {
      if (canceled) return
      setEmail(sessionEmail ?? '')
      setPhase('ready')
    }
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session && passwordRecoveryState.active) accept(data.session.user.email)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || passwordRecoveryState.active)) accept(session.user.email)
    })
    const timer = window.setTimeout(() => {
      if (!canceled) setPhase((p) => (p === 'waiting' ? 'invalid' : p))
    }, RECOVERY_WAIT_MS)
    return () => {
      canceled = true
      window.clearTimeout(timer)
      listener.subscription.unsubscribe()
    }
  }, [phase])

  const submit = async () => {
    setError(null)
    if (needCode) {
      setBusy(true)
      try {
        const codeError = await verifyTotpCode(code)
        if (codeError) {
          setError(codeError)
          return
        }
        await save()
      } finally {
        setBusy(false)
      }
      return
    }
    const policyError = validatePassword(next, { email })
    if (policyError) {
      setError(policyError)
      return
    }
    if (next !== confirm) {
      setError('The passwords do not match.')
      return
    }
    setBusy(true)
    try {
      // Users with a verified authenticator need aal2 to change the password.
      if (await needsMfaStepUp()) {
        setNeedCode(true)
        return
      }
      await save()
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    const { error: updateError } = await supabase.auth.updateUser({ password: next })
    if (updateError) {
      setError(
        updateError.code === 'same_password'
          ? 'Choose a password different from your previous one.'
          : updateError.message || 'Could not set the new password.',
      )
      return
    }
    await logAuthEvent('password_changed', { via: 'email_reset' })
    await clearMustChangePassword()
    // End every session (including this recovery one); sign in again.
    await supabase.auth.signOut().catch(() => undefined)
    passwordRecoveryState.active = false
    try {
      sessionStorage.setItem(RESET_DONE_NOTICE_KEY, '1')
    } catch {
      // ignore
    }
    navigate('/auth', { replace: true })
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !busy) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <div className={cn(limsPageShellClass, 'flex flex-1 flex-col items-center justify-center gap-6 py-10')}>
      <div className="w-full max-w-md">
        <div className={limsPanelClass}>
          <div className={cn(limsDarkBarClass, 'px-5 py-3.5')}>
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className={limsDarkBarAccentClass} />
            <div className="relative flex items-center justify-center gap-2">
              <KeyRound size={18} className="text-amber-300" />
              <h1 className="text-lg font-semibold tracking-tight text-white">Set a new password</h1>
            </div>
          </div>

          <div className={cn(limsRegistryFormClass, 'space-y-4 p-5')}>
            {phase === 'waiting' ? (
              <p className="text-sm text-stone-700">Checking your reset link…</p>
            ) : phase === 'invalid' ? (
              <>
                <p className="text-sm text-stone-700">
                  {passwordRecoveryState.linkError
                    ? 'This reset link is invalid or has expired. Links work once and only for a limited time.'
                    : 'Open this page from the link in your password-reset email.'}{' '}
                  Request a new link from the sign-in page. If you are signed in, use Change password in the profile
                  menu instead.
                </p>
                <Link to="/auth" className="text-sm font-medium text-amber-800 hover:underline">
                  Back to sign in
                </Link>
              </>
            ) : (
              <>
                {needCode ? (
                  <>
                    <p className="text-sm text-stone-700">
                      Two-step verification is on for this account. Enter the current code from your authenticator
                      app.
                    </p>
                    <MfaCodeField id="reset-mfa-code" value={code} onChange={setCode} onEnter={() => void submit()} disabled={busy} />
                  </>
                ) : (
                  <div className="space-y-4" onKeyDown={onEnter}>
                    {email ? <p className="text-sm text-stone-700">Account: {email}</p> : null}
                    <div className="space-y-2">
                      <Label htmlFor="reset-new-password">New password</Label>
                      <Input
                        id="reset-new-password"
                        type="password"
                        autoComplete="new-password"
                        autoFocus
                        value={next}
                        onChange={(e) => setNext(e.target.value)}
                        className={limsFieldClass}
                        disabled={busy}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reset-confirm-password">Confirm new password</Label>
                      <Input
                        id="reset-confirm-password"
                        type="password"
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className={limsFieldClass}
                        disabled={busy}
                      />
                    </div>
                    <p className="text-xs text-stone-600">{PASSWORD_POLICY_HINT}</p>
                  </div>
                )}
                {error ? (
                  <div className="rounded-none border border-red-500/40 bg-red-50 px-3 py-2.5">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                ) : null}
                <div className="flex justify-end">
                  <Button
                    type="button"
                    className={cn(limsPrimaryBtnClass, 'h-8 w-auto min-w-[7.5rem] px-5')}
                    onClick={() => void submit()}
                    disabled={busy}
                  >
                    {busy ? 'Saving…' : 'Save password'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
