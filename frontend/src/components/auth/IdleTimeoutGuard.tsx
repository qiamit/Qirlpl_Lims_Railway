import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SecurityDialogFrame } from '@/components/auth/SecurityDialogFrame'
import { signOut } from '@/hooks/useAuth'
import { logAuthEvent } from '@/lib/authEvents'
import {
  IDLE_ACTIVITY_EVENTS,
  IDLE_ACTIVITY_WRITE_THROTTLE_MS,
  IDLE_CHANNEL_NAME,
  IDLE_CHECK_INTERVAL_MS,
  IDLE_LOGOUT_KEY,
  IDLE_NOTICE_KEY,
  IDLE_STORAGE_KEY,
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
  claimIdleLogout,
  readLastActivity,
  writeLastActivity,
} from '@/lib/idleTimeout'
import { limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'

type IdleMessage = { type: 'activity'; at: number } | { type: 'logout' }

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Signs the user out after IDLE_TIMEOUT_MS without activity, warning at IDLE_WARNING_MS. Mount once per signed-in shell. */
export function IdleTimeoutGuard() {
  const [warning, setWarning] = useState(false)
  const [remainingMs, setRemainingMs] = useState(IDLE_TIMEOUT_MS - IDLE_WARNING_MS)
  const warningRef = useRef(false)
  const loggingOutRef = useRef(false)
  const lastWriteRef = useRef(0)
  const channelRef = useRef<BroadcastChannel | null>(null)

  const post = (message: IdleMessage) => {
    try {
      channelRef.current?.postMessage(message)
    } catch {
      // channel closed
    }
  }

  const logout = useCallback(async (origin: 'self' | 'remote') => {
    if (loggingOutRef.current) return
    loggingOutRef.current = true
    warningRef.current = false
    setWarning(false)
    try {
      sessionStorage.setItem(IDLE_NOTICE_KEY, '1')
    } catch {
      // ignore
    }
    if (origin === 'self') {
      if (claimIdleLogout()) {
        await logAuthEvent('idle_logout', { idle_minutes: Math.round(IDLE_TIMEOUT_MS / 60000) })
      }
      post({ type: 'logout' })
    }
    // Local scope: this browser only; the user's other devices stay signed in.
    // RequireAuth then sends the user to the sign-in page.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
  }, [])

  const evaluate = useCallback(() => {
    if (loggingOutRef.current) return
    const idle = Date.now() - readLastActivity()
    if (idle >= IDLE_TIMEOUT_MS) {
      void logout('self')
      return
    }
    if (idle >= IDLE_WARNING_MS) {
      warningRef.current = true
      setWarning(true)
      setRemainingMs(IDLE_TIMEOUT_MS - idle)
    } else if (warningRef.current) {
      // Activity in another tab, or "Stay signed in" there.
      warningRef.current = false
      setWarning(false)
    }
  }, [logout])

  const recordActivity = useCallback(
    (force = false) => {
      if (loggingOutRef.current) return
      if (warningRef.current && !force) return // only "Stay signed in" dismisses the warning
      const now = Date.now()
      if (!force && now - lastWriteRef.current < IDLE_ACTIVITY_WRITE_THROTTLE_MS) return
      // Coming back after the limit (e.g. a throttled background tab) signs out, not in.
      if (now - readLastActivity() >= IDLE_TIMEOUT_MS) {
        void logout('self')
        return
      }
      lastWriteRef.current = now
      writeLastActivity(now)
      post({ type: 'activity', at: now })
    },
    [logout],
  )

  useEffect(() => {
    // A session restored long after the last activity (browser reopened) is ended.
    if (readLastActivity() === 0) writeLastActivity()
    const initial = window.setTimeout(evaluate, 0)

    let channel: BroadcastChannel | null = null
    try {
      channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(IDLE_CHANNEL_NAME)
    } catch {
      channel = null
    }
    channelRef.current = channel
    if (channel) {
      channel.onmessage = (event: MessageEvent<IdleMessage>) => {
        const data = event.data
        if (data?.type === 'activity') {
          writeLastActivity(data.at)
          evaluate()
        } else if (data?.type === 'logout') {
          void logout('remote')
        }
      }
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === IDLE_STORAGE_KEY) evaluate()
      if (event.key === IDLE_LOGOUT_KEY && event.newValue) void logout('remote')
    }
    const onActivity = () => recordActivity()
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      evaluate() // first: sign out if the limit passed while hidden
      recordActivity()
    }

    for (const name of IDLE_ACTIVITY_EVENTS) {
      window.addEventListener(name, onActivity, { passive: true, capture: true })
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)
    window.addEventListener('storage', onStorage)
    const timer = window.setInterval(evaluate, IDLE_CHECK_INTERVAL_MS)

    return () => {
      for (const name of IDLE_ACTIVITY_EVENTS) {
        window.removeEventListener(name, onActivity, { capture: true })
      }
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
      window.removeEventListener('storage', onStorage)
      window.clearTimeout(initial)
      window.clearInterval(timer)
      channel?.close()
      channelRef.current = null
    }
  }, [evaluate, logout, recordActivity])

  // Countdown while the warning is open.
  useEffect(() => {
    if (!warning) return
    const timer = window.setInterval(evaluate, 1000)
    return () => window.clearInterval(timer)
  }, [warning, evaluate])

  const stay = () => {
    warningRef.current = false
    setWarning(false)
    recordActivity(true)
  }

  return (
    <SecurityDialogFrame
      open={warning}
      onOpenChange={() => undefined}
      dismissable={false}
      title="Still there?"
      footer={
        <>
          <Button type="button" variant="outline" className="h-8 rounded-none" onClick={() => {
              loggingOutRef.current = true
              warningRef.current = false
              setWarning(false)
              void signOut()
            }}>
            Sign out now
          </Button>
          <Button type="button" className={limsPrimaryBtnClass} onClick={stay} autoFocus>
            Stay signed in
          </Button>
        </>
      }
    >
      <p className="text-sm text-stone-700">
        You have not used the LIMS for {Math.round(IDLE_WARNING_MS / 60000)} minutes. For security you will be signed
        out in <span className="font-semibold tabular-nums">{formatRemaining(remainingMs)}</span>. Unsaved changes on
        this page will be lost.
      </p>
    </SecurityDialogFrame>
  )
}
