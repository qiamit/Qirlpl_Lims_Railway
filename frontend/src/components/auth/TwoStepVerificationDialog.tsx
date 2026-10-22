import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { MfaCodeField } from '@/components/auth/MfaCodeField'
import { SecurityDialogFrame } from '@/components/auth/SecurityDialogFrame'
import { logAuthEvent } from '@/lib/authEvents'
import { limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import {
  isMfaDisabledError,
  listTotpFactors,
  markMfaUnavailable,
  verifyTotpCode,
  type TotpFactorSummary,
} from '@/lib/mfa'
import { supabase } from '@/lib/supabaseClient'

type Enrollment = { factorId: string; qrDataUrl: string; secret: string }

/**
 * Two-step verification (TOTP) for the signed-in user: set up an
 * authenticator app (QR code + verify), list and remove factors.
 * Optional for everyone for now (see src/lib/mfa.ts for enforcing it).
 */
export function TwoStepVerificationDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [factors, setFactors] = useState<TotpFactorSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [removing, setRemoving] = useState<TotpFactorSummary | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const { factors: verified } = await listTotpFactors()
      setFactors(verified)
    } catch {
      setFactors([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let canceled = false
    void listTotpFactors()
      .then(({ factors: verified }) => {
        if (!canceled) setFactors(verified)
      })
      .catch(() => undefined)
    return () => {
      canceled = true
    }
  }, [open])

  const close = (value: boolean) => {
    if (!value) {
      // An unverified factor left behind is removed on the next set-up.
      setEnrollment(null)
      setRemoving(null)
      setCode('')
      setError(null)
      setBusy(false)
    }
    onOpenChange(value)
  }

  const startEnroll = async () => {
    setBusy(true)
    setError(null)
    try {
      const { unverifiedIds } = await listTotpFactors()
      for (const id of unverifiedIds) {
        await supabase.auth.mfa.unenroll({ factorId: id }).catch(() => undefined)
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      })
      if (enrollError || !data) {
        if (isMfaDisabledError(enrollError)) {
          markMfaUnavailable()
          setUnavailable(true)
          return
        }
        setError(enrollError?.message || 'Could not start set-up.')
        return
      }
      const qrDataUrl = await QRCode.toDataURL(data.totp.uri, { margin: 1, width: 200 })
      setEnrollment({ factorId: data.id, qrDataUrl, secret: data.totp.secret })
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start set-up.')
    } finally {
      setBusy(false)
    }
  }

  const confirmEnroll = async () => {
    if (!enrollment) return
    setBusy(true)
    setError(null)
    try {
      const codeError = await verifyTotpCode(code, enrollment.factorId)
      if (codeError) {
        setError(codeError)
        return
      }
      await logAuthEvent('mfa_enrolled')
      toast.success('Two-step verification is on. You will be asked for a code at each sign-in.')
      setEnrollment(null)
      setCode('')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const confirmRemove = async () => {
    if (!removing) return
    setBusy(true)
    setError(null)
    try {
      // Removing a verified factor needs an aal2 session; the code provides it.
      const codeError = await verifyTotpCode(code, removing.id)
      if (codeError) {
        setError(codeError)
        return
      }
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: removing.id })
      if (unenrollError) {
        setError(unenrollError.message || 'Could not remove the authenticator.')
        return
      }
      toast.success('Authenticator removed.')
      setRemoving(null)
      setCode('')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  let footer: React.ReactNode = null
  if (!unavailable) {
    if (enrollment) {
      footer = (
        <>
          <Button type="button" variant="outline" className="h-8 rounded-none" disabled={busy} onClick={() => setEnrollment(null)}>
            Cancel
          </Button>
          <Button type="button" className={limsPrimaryBtnClass} disabled={busy} onClick={() => void confirmEnroll()}>
            {busy ? 'Verifying…' : 'Verify and turn on'}
          </Button>
        </>
      )
    } else if (removing) {
      footer = (
        <>
          <Button type="button" variant="outline" className="h-8 rounded-none" disabled={busy} onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button type="button" className={limsPrimaryBtnClass} disabled={busy} onClick={() => void confirmRemove()}>
            {busy ? 'Removing…' : 'Verify and remove'}
          </Button>
        </>
      )
    } else {
      footer = (
        <Button type="button" className={limsPrimaryBtnClass} disabled={busy || loading} onClick={() => void startEnroll()}>
          {busy ? 'Starting…' : factors.length ? 'Add another authenticator' : 'Enable two-step verification'}
        </Button>
      )
    }
  }

  return (
    <SecurityDialogFrame
      open={open}
      onOpenChange={close}
      title="Two-step verification"
      description="A code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy) at each sign-in."
      footer={footer}
    >
      {unavailable ? (
        <p className="text-sm text-stone-700">
          Two-step verification is not enabled on this server yet. Ask the Laboratory Director to turn on TOTP MFA
          for the authentication service.
        </p>
      ) : enrollment ? (
        <div className="space-y-3">
          <p className="text-sm text-stone-700">
            1. Scan this QR code with your authenticator app, or type the key below.
          </p>
          <div className="flex justify-center">
            <img src={enrollment.qrDataUrl} alt="QR code for your authenticator app" className="h-[200px] w-[200px] border border-stone-400 bg-white" />
          </div>
          <p className="break-all text-center font-mono text-xs text-stone-700">{enrollment.secret}</p>
          <p className="text-sm text-stone-700">2. Enter the 6-digit code the app shows.</p>
          <MfaCodeField id="mfa-enroll-code" value={code} onChange={setCode} onEnter={() => void confirmEnroll()} disabled={busy} />
        </div>
      ) : removing ? (
        <div className="space-y-3">
          <p className="text-sm text-stone-700">
            Enter a current code from <span className="font-semibold">{removing.friendlyName}</span> to remove it.
            {factors.length === 1 ? ' Two-step verification will then be off for your account.' : ''}
          </p>
          <MfaCodeField id="mfa-remove-code" value={code} onChange={setCode} onEnter={() => void confirmRemove()} disabled={busy} />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-stone-700">
            Status:{' '}
            <span className={factors.length ? 'font-semibold text-emerald-800' : 'font-semibold text-stone-800'}>
              {loading ? 'checking…' : factors.length ? 'On' : 'Off'}
            </span>
            . Optional for now.
          </p>
          {factors.length ? (
            <ul className="divide-y divide-stone-300 border border-stone-300 bg-white">
              {factors.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium text-stone-800">{f.friendlyName}</span>
                    <span className="block text-xs text-stone-500">Added {new Date(f.createdAt).toLocaleDateString()}</span>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 rounded-none px-2 text-xs"
                    onClick={() => {
                      setRemoving(f)
                      setCode('')
                      setError(null)
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </SecurityDialogFrame>
  )
}
