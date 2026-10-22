import { supabase } from '@/lib/supabaseClient'

/**
 * TOTP two-step verification helpers (GoTrue MFA).
 *
 * Not enforced yet. To enforce later:
 *  - in the app: SessionSecurityGate already asks for the code whenever the
 *    session is aal1 and the user has a verified factor; to require a factor,
 *    also block users with no verified factor (send them to the two-step dialog);
 *  - in the database: add `AND coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'`
 *    to sensitive RLS policies / director-only RPCs (start with
 *    app_is_laboratory_director()), so a stolen password alone is not enough.
 */

const MFA_UNAVAILABLE_KEY = 'lims.mfa.unavailable'

export function isMfaMarkedUnavailable(): boolean {
  try {
    return localStorage.getItem(MFA_UNAVAILABLE_KEY) === '1'
  } catch {
    return false
  }
}

export function markMfaUnavailable(): void {
  try {
    localStorage.setItem(MFA_UNAVAILABLE_KEY, '1')
  } catch {
    // ignore
  }
}

export function isMfaDisabledError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: unknown; status?: unknown; message?: unknown }
  const code = String(e.code ?? '')
  if (code === 'mfa_totp_enroll_not_enabled' || code === 'mfa_totp_verify_not_enabled') return true
  const message = String(e.message ?? '').toLowerCase()
  if (/mfa|factor|totp/.test(message) && /(disabled|not enabled|not supported)/.test(message)) return true
  return e.status === 404
}

/** Session is aal1 but the user has a verified factor, so a code is needed for aal2. */
export async function needsMfaStepUp(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error || !data) return false
    return data.currentLevel === 'aal1' && data.nextLevel === 'aal2'
  } catch {
    return false
  }
}

export interface TotpFactorSummary {
  id: string
  friendlyName: string
  createdAt: string
  status: string
}

export async function listTotpFactors(): Promise<{ factors: TotpFactorSummary[]; unverifiedIds: string[] }> {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error || !data) return { factors: [], unverifiedIds: [] }
  const all = (data.all ?? []).filter((f) => f.factor_type === 'totp')
  return {
    factors: all
      .filter((f) => f.status === 'verified')
      .map((f) => ({
        id: f.id,
        friendlyName: f.friendly_name || 'Authenticator app',
        createdAt: f.created_at,
        status: f.status,
      })),
    unverifiedIds: all.filter((f) => f.status !== 'verified').map((f) => f.id),
  }
}

/** Verifies a 6-digit code against the given factor (or the first verified TOTP factor). */
export async function verifyTotpCode(code: string, factorId?: string): Promise<string | null> {
  const clean = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(clean)) return 'Enter the 6-digit code from your authenticator app.'
  let id = factorId
  if (!id) {
    const { factors } = await listTotpFactors()
    id = factors[0]?.id
  }
  if (!id) return 'No authenticator app is set up for this account.'
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: clean })
  if (error) {
    return error.code === 'mfa_verification_failed' || /invalid/i.test(error.message)
      ? 'That code is not correct or has expired. Try the current code.'
      : error.message || 'Could not verify the code.'
  }
  return null
}
