import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { canAccessTestAllocation } from '@/lib/moduleAccess'
import { AccessDeniedPage } from '@/components/auth/AccessDeniedPage'

export function RequireTestAllocationAccess({
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

  if (!canAccessTestAllocation(ctx)) {
    return (
      <AccessDeniedPage
        message="Test Allocation is only available to Laboratory Director and Technical Manager."
        designation={designation}
        departmentName={departmentName}
      />
    )
  }

  return <>{children}</>
}
