/**
 * Idle sign-out. A signed-in user who has not used the app (mouse, keyboard,
 * touch, scroll, or returning to the tab) for IDLE_TIMEOUT_MS is signed out
 * of this browser; a warning appears at IDLE_WARNING_MS. Activity is shared
 * across tabs through localStorage and a BroadcastChannel, so working in one
 * tab keeps the others signed in, and an idle sign-out in one signs out all.
 * 60 minutes (lab decision 25 Oct 2026; was 30): long tests keep staff away
 * from the screen.
 */
export const IDLE_TIMEOUT_MS = 60 * 60 * 1000
export const IDLE_WARNING_MS = 58 * 60 * 1000
export const IDLE_CHECK_INTERVAL_MS = 15 * 1000
/** Activity is written to storage at most this often. */
export const IDLE_ACTIVITY_WRITE_THROTTLE_MS = 10 * 1000

export const IDLE_STORAGE_KEY = 'lims.idle.lastActivityAt'
export const IDLE_LOGOUT_KEY = 'lims.idle.logoutAt'
export const IDLE_CHANNEL_NAME = 'lims-idle-timeout'
/** sessionStorage note shown on the sign-in page after an idle sign-out. */
export const IDLE_NOTICE_KEY = 'lims.idle.notice'

export const IDLE_ACTIVITY_EVENTS = [
  'pointerdown',
  'mousemove',
  'keydown',
  'wheel',
  'scroll',
  'touchstart',
] as const

let memoryLastActivity = 0

export function readLastActivity(): number {
  let stored = 0
  try {
    stored = Number(localStorage.getItem(IDLE_STORAGE_KEY) || 0)
  } catch {
    stored = 0
  }
  return Math.max(Number.isFinite(stored) ? stored : 0, memoryLastActivity)
}

export function writeLastActivity(at: number = Date.now()): void {
  memoryLastActivity = Math.max(memoryLastActivity, at)
  try {
    localStorage.setItem(IDLE_STORAGE_KEY, String(at))
  } catch {
    // storage unavailable: memory only (this tab)
  }
}

/** Call right after a successful sign-in so an old timestamp cannot sign the new session out. */
export function markActivityNow(): void {
  memoryLastActivity = Date.now()
  writeLastActivity(memoryLastActivity)
}

/**
 * The first tab to time out claims the sign-out so only one idle_logout
 * event is recorded. Returns true for the tab that should record it.
 */
export function claimIdleLogout(now: number = Date.now()): boolean {
  try {
    const prev = Number(localStorage.getItem(IDLE_LOGOUT_KEY) || 0)
    if (prev && now - prev < 60_000) return false
    localStorage.setItem(IDLE_LOGOUT_KEY, String(now))
  } catch {
    // ignore
  }
  return true
}
