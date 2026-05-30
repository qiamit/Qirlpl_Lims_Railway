import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  designation: string
  profileName: string
  profileReady: boolean
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [designation, setDesignation] = useState<string>('')
  const [profileName, setProfileName] = useState<string>('')
  const [profileReady, setProfileReady] = useState(false)

  const clearAuthStorage = () => {
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i)
        if (k) keys.push(k)
      }

      for (const k of keys) {
        if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
          localStorage.removeItem(k)
        }
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    let canceled = false

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) {
          const message = String((error as { message?: unknown }).message ?? '')
          if (message.toLowerCase().includes('refresh token')) {
            clearAuthStorage()
          }

          if (!canceled) {
            setSession(null)
            setUser(null)
            setLoading(false)
          }
          return
        }

        if (!canceled) {
          setSession(data.session)
          setUser(data.session?.user ?? null)
          setLoading(false)
        }
      } catch {
        clearAuthStorage()
        if (!canceled) {
          setSession(null)
          setUser(null)
          setLoading(false)
        }
      }
    }

    void init()

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (String(event) === 'TOKEN_REFRESH_FAILED') {
        clearAuthStorage()
        setSession(null)
        setUser(null)
        setLoading(false)
        return
      }

      setSession(newSession)
      setUser(newSession?.user ?? null)
      setLoading(false)
    })

    return () => {
      canceled = true
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setDesignation('')
      setProfileName('')
      setProfileReady(true)
      try { localStorage.removeItem('userDesignation') } catch { /* ignore */ }
      return
    }

    setProfileReady(false)
    let canceled = false

    const meta = user.user_metadata as Record<string, unknown>
    const metaDes = typeof meta?.designation === 'string' ? meta.designation.trim() : ''
    const metaName = typeof meta?.full_name === 'string' ? meta.full_name.trim() : ''

    if (metaDes) {
      setDesignation(metaDes)
      setProfileName(metaName || user.email || '')
      setProfileReady(true)
      try { localStorage.setItem('userDesignation', metaDes) } catch { /* ignore */ }
      return
    }

    const applyFromProfile = (profileDes: string, profileNameVal: string) => {
      if (canceled) return
      setDesignation(profileDes)
      setProfileName(profileNameVal || metaName || user?.email || '')
      setProfileReady(true)
      if (profileDes) {
        try { localStorage.setItem('userDesignation', profileDes) } catch { /* ignore */ }
      }
    }

    const cached = (() => {
      try {
        return localStorage.getItem('userDesignation')
      } catch {
        return null
      }
    })()

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('designation, full_name')
        .eq('id', user.id)
        .maybeSingle()

      if (canceled) return
      if (error) {
        applyFromProfile(String(cached ?? ''), metaName || user.email || '')
        return
      }

      const row = data as { designation?: unknown; full_name?: unknown } | null
      const profileDes = typeof row?.designation === 'string' ? row.designation.trim() : ''
      const profileFullName = typeof row?.full_name === 'string' ? row.full_name.trim() : ''
      const finalDes = profileDes || String(cached ?? '')
      applyFromProfile(finalDes, profileFullName || metaName || user.email || '')
    }

    void fetchProfile()

    return () => {
      canceled = true
    }
  }, [user])

  return { user, session, loading, designation, profileName, profileReady }
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUp(
  email: string,
  password: string,
  metadata?: Record<string, unknown>,
) {
  return supabase.auth.signUp({
    email,
    password,
    options: metadata ? { data: metadata } : undefined,
  })
}

export async function signOut() {
  return supabase.auth.signOut()
}
