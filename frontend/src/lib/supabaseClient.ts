import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Railway API environment variables. ' +
    'Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY point to the Railway gateway in your .env file.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export type SupabaseClient = typeof supabase

/**
 * Password-recovery links land on /auth/reset with `#...type=recovery`
 * (or `#error=...` when the link is used or expired). supabase-js reads and
 * removes the hash during start-up and fires PASSWORD_RECOVERY, possibly
 * before the reset page subscribes, so both are captured here at load.
 */
function readRecoveryHash(): { recovery: boolean; error: string | null } {
  if (typeof window === 'undefined') return { recovery: false, error: null }
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const error = params.get('error_description') || params.get('error')
  return { recovery: params.get('type') === 'recovery', error: error ? error.replace(/\+/g, ' ') : null }
}

const initialRecovery = readRecoveryHash()

export const passwordRecoveryState: { active: boolean; linkError: string | null } = {
  active: initialRecovery.recovery,
  linkError: initialRecovery.error,
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') passwordRecoveryState.active = true
  if (event === 'SIGNED_OUT') passwordRecoveryState.active = false
})
