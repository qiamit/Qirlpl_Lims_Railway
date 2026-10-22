import { supabase } from '@/lib/supabaseClient'

/** Events a signed-in user may record for themselves (app_log_auth_event). */
export type SelfAuthEvent = 'login' | 'logout' | 'password_changed' | 'idle_logout' | 'mfa_enrolled'

/** sessionStorage note the sign-in page shows after a password reset by email. */
export const RESET_DONE_NOTICE_KEY = 'lims.auth.resetDone'

const LOG_TIMEOUT_MS = 2000

function withTimeout(promise: PromiseLike<unknown>): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, LOG_TIMEOUT_MS)
    Promise.resolve(promise)
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer)
        resolve()
      })
  })
}

/**
 * Best effort: never throws and never waits more than two seconds. Before
 * 20261029100000_login_security.sql is applied the RPC is missing and the
 * call is silently skipped.
 */
export function logAuthEvent(event: SelfAuthEvent, details: Record<string, unknown> = {}): Promise<void> {
  return withTimeout(supabase.rpc('app_log_auth_event', { p_event: event, p_details: details }))
}

/** Anonymous-callable; the database rate-limits it per email. Best effort. */
export function logFailedLogin(email: string): Promise<void> {
  const value = email.trim()
  if (!value) return Promise.resolve()
  return withTimeout(supabase.rpc('app_log_failed_login', { p_email: value }))
}

/** Clears user_profiles.must_change_password for the caller. Returns false when it could not. */
export async function clearMustChangePassword(): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('app_clear_must_change_password')
    return !error
  } catch {
    return false
  }
}

/** True only when the profile row says so; any error (e.g. column missing) means false. */
export async function fetchMustChangePassword(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('must_change_password')
      .eq('id', userId)
      .maybeSingle()
    if (error || !data) return false
    return (data as { must_change_password?: unknown }).must_change_password === true
  } catch {
    return false
  }
}
