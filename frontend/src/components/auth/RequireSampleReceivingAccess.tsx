import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { canAccessSampleReceiving } from '@/lib/moduleAccess'
import { AccessDeniedPage } from '@/components/auth/AccessDeniedPage'

export function RequireSampleReceivingAccess({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading, designation, departmentName, profileReady } = useAuth()
  const location = useLocation()

  if (loading || !profileReady) return null

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  }

  const ctx = { designation, departmentName }

  if (!canAccessSampleReceiving(ctx)) {
    return (
      <AccessDeniedPage
        message="Sample Receiving is only available to Laboratory Director, Sample Coordinator, and Sample Cell Receptionist."
        designation={designation}
        departmentName={departmentName}
      />
    )
  }

  return <>{children}</>
}
