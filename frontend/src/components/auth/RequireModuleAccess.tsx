import { useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { canAccessPath } from '@/lib/moduleAccess'
import { AccessDeniedPage } from '@/components/auth/AccessDeniedPage'

export function RequireModuleAccess({ children }: { children: React.ReactNode }) {
  const { loading, designation, departmentName, profileReady } = useAuth()
  const location = useLocation()

  if (loading || !profileReady) return null

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
