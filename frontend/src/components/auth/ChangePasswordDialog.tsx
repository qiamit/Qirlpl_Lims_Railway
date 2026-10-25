import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MfaCodeField } from '@/components/auth/MfaCodeField'
import { SecurityDialogFrame } from '@/components/auth/SecurityDialogFrame'
import { signIn, signOut, useAuth } from '@/hooks/useAuth'
import { logAuthEvent, logFailedLogin } from '@/lib/authEvents'
import { limsFieldClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { needsMfaStepUp, verifyTotpCode } from '@/lib/mfa'
import { PASSWORD_POLICY_HINT, validatePassword } from '@/lib/passwordPolicy'
import { supabase } from '@/lib/supabaseClient'

const labelClass = 'text-[11px] font-semibold uppercase tracking-wide text-stone-600'

/**
 * Change your own password: current password (re-checked with GoTrue), new
 * password (policy), then updateUser and sign out every other session.
 * forced = after a director reset; the dialog cannot be dismissed (Sign out
 * is offered instead).
 */
export function ChangePasswordDialog({
  open,
  onOpenChange,
  forced = false,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  forced?: boolean
  onChanged?: () => void | Promise<void>
}) {
  const { user } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [needCode, setNeedCode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setCurrent('')
    setNext('')
    setConfirm('')
    setCode('')
    setNeedCode(false)
    setError(null)
    setBusy(false)
  }

  const handleOpenChange = (value: boolean) => {
    if (!value) reset()
    onOpenChange(value)
  }

  const finish = async () => {
    const { error: updateError } = await supabase.auth.updateUser({ password: next })
    if (updateError) {
      setError(
        updateError.code === 'same_password'
          ? 'The new password must be different from the current one.'
          : updateError.code === 'weak_password'
            ? `The server rejected this password as too weak. ${updateError.message}`
            : updateError.message || 'Could not change the password.',
      )
      return false
    }
    // Other browsers and devices must sign in again with the new password.
    try {
      await supabase.auth.signOut({ scope: 'others' })
    } catch {
      // the password is changed; other sessions end when their tokens expire
    }
    await logAuthEvent('password_changed', { forced })
    await onChanged?.()
    toast.success('Password changed. Other sessions have been signed out.')
    handleOpenChange(false)
    return true
  }

  const handleSubmit = async () => {
    const email = user?.email ?? ''
    if (!email) {
      setError('No signed-in user email found. Please sign in again.')
      return
    }
    setError(null)

    if (needCode) {
      setBusy(true)
      try {
        const codeError = await verifyTotpCode(code)
        if (codeError) {
          setError(codeError)
          return
        }
        await finish()
      } finally {
        setBusy(false)
      }
      return
    }

    if (!current) {
      setError('Enter your current password.')
      return
    }
    const policyError = validatePassword(next, { email })
    if (policyError) {
      setError(policyError)
      return
    }
    if (next !== confirm) {
      setError('The new passwords do not match.')
      return
    }
    if (next === current) {
      setError('The new password must be different from the current one.')
      return
    }

    setBusy(true)
    try {
      // Re-authenticate: proves the current password and gives a fresh session,
      // which GoTrue accepts for a password change even with
      // GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=true.
      const { error: authError } = await signIn(email, current)
      if (authError) {
        if (authError.code === 'invalid_credentials' || authError.status === 400) {
          void logFailedLogin(email)
          setError('The current password is not correct.')
        } else {
          setError(authError.message || 'Could not verify the current password.')
        }
        return
      }
      // With a verified authenticator the fresh session is aal1; GoTrue wants aal2.
      if (await needsMfaStepUp()) {
        setNeedCode(true)
        return
      }
      await finish()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password.')
    } finally {
      setBusy(false)
    }
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit()
    }
  }

  return (
    <SecurityDialogFrame
      open={open}
      onOpenChange={handleOpenChange}
      dismissable={!forced}
      title={forced ? 'Choose a new password' : 'Change password'}
      description={
        forced
          ? 'Your password was reset by the Laboratory Director. Choose your own password to continue.'
          : undefined
      }
      footer={
        <>
          {forced ? (
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-none"
              disabled={busy}
              onClick={() => void signOut()}
            >
              Sign out
            </Button>
          ) : null}
          <Button type="button" className={limsPrimaryBtnClass} onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? 'Saving…' : needCode ? 'Verify and change' : 'Change password'}
          </Button>
        </>
      }
    >
      {needCode ? (
        <>
          <p className="text-sm text-stone-700">
            Two-step verification is on for your account. Enter the current code from your authenticator app to
            confirm the change.
          </p>
          <MfaCodeField id="change-password-mfa" value={code} onChange={setCode} onEnter={() => void handleSubmit()} disabled={busy} />
        </>
      ) : (
        <div className="space-y-3" onKeyDown={onEnter}>
          <div className="space-y-2">
            <Label htmlFor="change-password-current" className={labelClass}>
              {forced ? 'Temporary password' : 'Current password'}
            </Label>
            <Input
              id="change-password-current"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={limsFieldClass}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="change-password-new" className={labelClass}>
              New password
            </Label>
            <Input
              id="change-password-new"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={limsFieldClass}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="change-password-confirm" className={labelClass}>
              Confirm new password
            </Label>
            <Input
              id="change-password-confirm"
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
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </SecurityDialogFrame>
  )
}
