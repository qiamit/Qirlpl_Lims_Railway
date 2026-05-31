import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { canAccessSampleAllocation } from '@/lib/moduleAccess'
import { AccessDeniedPage } from '@/components/auth/AccessDeniedPage'

export function RequireSampleAllocationAccess({
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

  if (!canAccessSampleAllocation(ctx)) {
    return (
      <AccessDeniedPage
        message="Sample Allocation is only available to Laboratory Director and Sample Incharge."
        designation={designation}
        departmentName={departmentName}
      />
    )
  }

  return <>{children}</>
}
