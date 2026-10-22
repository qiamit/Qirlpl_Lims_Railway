import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SecurityDialogFrame } from '@/components/auth/SecurityDialogFrame'
import { useAuth } from '@/hooks/useAuth'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { limsFieldClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { PASSWORD_POLICY_HINT, validatePassword } from '@/lib/passwordPolicy'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'

type ResetResult = {
  temporaryPassword: string | null
  mustChange: boolean
  warnings: string[]
}

/**
 * "Reset password" for a Laboratory Director on another user's row (User
 * Management). Calls the functions route POST /reset-user-password, which
 * sets a temporary password, forces a change at next sign-in and ends the
 * user's sessions. Renders nothing for anyone who is not a director, and for
 * the director's own row.
 */
export function DirectorResetPasswordButton({
  userId,
  userEmail,
  userName,
  className,
  label = 'Reset password',
  onReset,
}: {
  userId: string
  userEmail?: string | null
  userName?: string | null
  className?: string
  label?: string
  onReset?: () => void
}) {
  const { user, designation } = useAuth()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'generate' | 'manual'>('generate')
  const [password, setPassword] = useState('')
  const [removeMfa, setRemoveMfa] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ResetResult | null>(null)

  if (!isLaboratoryDirector(designation) || !userId || userId === user?.id) return null

  const who = userName?.trim() || userEmail?.trim() || 'this user'

  const close = (value: boolean) => {
    if (!value) {
      setMode('generate')
      setPassword('')
      setRemoveMfa(false)
      setBusy(false)
      setError(null)
      setResult(null)
    }
    setOpen(value)
  }

  const submit = async () => {
    setError(null)
    if (mode === 'manual') {
      const policyError = validatePassword(password, { email: userEmail ?? '' })
      if (policyError) {
        setError(policyError)
        return
      }
    }
    setBusy(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Session expired. Please sign in again.')
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-user-password`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'x-user-jwt': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          ...(mode === 'manual' ? { password } : {}),
          ...(removeMfa ? { remove_mfa: true } : {}),
        }),
      })
      const payload = (await response.json().catch(() => null)) as {
        error?: string
        temporary_password?: string
        must_change_password?: boolean
        warnings?: string[]
      } | null
      if (!response.ok) {
        throw new Error(
          payload?.error ||
            (response.status === 404 ? 'The reset service is not deployed yet.' : `Reset failed (${response.status})`),
        )
      }
      setResult({
        temporaryPassword: payload?.temporary_password ?? (mode === 'manual' ? password : null),
        mustChange: payload?.must_change_password === true,
        warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
      })
      setPassword('')
      onReset?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Copied.')
    } catch {
      toast.error('Copy failed; select the password and copy it.')
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn('h-8 gap-1.5 rounded-none', className)}
        onClick={() => setOpen(true)}
        title={`Reset password for ${who}`}
      >
        <KeyRound size={14} />
        {label}
      </Button>
      <SecurityDialogFrame
        open={open}
        onOpenChange={close}
        title={`Reset password: ${who}`}
        footer={
          result ? (
            <Button type="button" className={limsPrimaryBtnClass} onClick={() => close(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" className="h-8 rounded-none" disabled={busy} onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="button" className={limsPrimaryBtnClass} disabled={busy} onClick={() => void submit()}>
                {busy ? 'Resetting…' : 'Reset password'}
              </Button>
            </>
          )
        }
      >
        {result ? (
          <div className="space-y-3">
            {result.temporaryPassword ? (
              <>
                <p className="text-sm text-stone-700">
                  Temporary password (shown once). Give it to {who} in person or by phone, not by email:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 select-all break-all border border-stone-400 bg-white px-3 py-2 font-mono text-sm">
                    {result.temporaryPassword}
                  </code>
                  <Button type="button" variant="outline" className="h-8 rounded-none" onClick={() => void copy(result.temporaryPassword ?? '')}>
                    Copy
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-stone-700">The password has been reset.</p>
            )}
            <p className="text-sm text-stone-700">
              {result.mustChange
                ? `${who} must choose a new password at the next sign-in. Existing sessions have been ended where possible.`
                : `${who} is not forced to change it at the next sign-in; ask them to use Change password.`}
            </p>
            {result.warnings.length ? (
              <ul className="list-disc space-y-1 pl-5 text-xs text-amber-900">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-stone-700">
              Sets a temporary password for {userEmail || who}. Their current password stops working and they must
              pick a new one at the next sign-in.
            </p>
            <div className="space-y-2 text-sm text-stone-800">
              <label className="flex items-center gap-2">
                <input type="radio" name="reset-mode" checked={mode === 'generate'} onChange={() => setMode('generate')} disabled={busy} />
                Generate a temporary password
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="reset-mode" checked={mode === 'manual'} onChange={() => setMode('manual')} disabled={busy} />
                Type a temporary password
              </label>
            </div>
            {mode === 'manual' ? (
              <div className="space-y-2">
                <Label htmlFor="director-reset-password" className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                  Temporary password
                </Label>
                <Input
                  id="director-reset-password"
                  type="text"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={limsFieldClass}
                  disabled={busy}
                />
                <p className="text-xs text-stone-600">{PASSWORD_POLICY_HINT}</p>
              </div>
            ) : null}
            <label className="flex items-start gap-2 text-sm text-stone-800">
              <input type="checkbox" className="mt-1" checked={removeMfa} onChange={(e) => setRemoveMfa(e.target.checked)} disabled={busy} />
              Also remove two-step verification (the user lost their authenticator device)
            </label>
          </div>
        )}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </SecurityDialogFrame>
    </>
  )
}

export default DirectorResetPasswordButton
