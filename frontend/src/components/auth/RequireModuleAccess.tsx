import { useLocation } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { canAccessPath } from '@/lib/moduleAccess'
import { AccessDeniedPage } from '@/components/auth/AccessDeniedPage'

export function RequireModuleAccess({ children }: { children: React.ReactNode }) {
  const { user, loading, designation, departmentName, profileReady } = useAuth()
  const location = useLocation()
  const profileLoadedRef = useRef(false)

  useEffect(() => {
    if (!user) profileLoadedRef.current = false
  }, [user])

  if (profileReady && user) profileLoadedRef.current = true

  const waitingForProfile = loading || !profileReady
  const keepOutletMounted = profileLoadedRef.current && Boolean(user)

  if (waitingForProfile && !keepOutletMounted) {
    return null
  }

  if (waitingForProfile && keepOutletMounted) {
    return <>{children}</>
  }

  const ctx = { designation, departmentName }

  if (!canAccessPath(location.pathname, ctx)) {
    return (
      <AccessDeniedPage
        message="You do not have permission to access this module. Contact your Laboratory Director if you need additional access."
        designation={designation}
        departmentName={departmentName}
      />
    )
  }

  return <>{children}</>
}
