import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'

const ALLOWED_DESIGNATIONS = ['Laboratory Director', 'Sample Incharge']

function canAccessSampleAllocation(designation: string): boolean {
  if (isLaboratoryDirector(designation)) return true
  const d = designation?.trim().toLowerCase() ?? ''
  return ALLOWED_DESIGNATIONS.some((r) => r.trim().toLowerCase() === d)
}

export function RequireSampleAllocationAccess({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading, designation, profileReady } = useAuth()
  const location = useLocation()

  if (loading || !profileReady) return null

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  }

  if (!canAccessSampleAllocation(designation)) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold text-foreground">Access Denied</h1>
        <p className="text-sm text-muted-foreground">
          Sample Allocation is only available to Laboratory Director and Sample Incharge.
        </p>
        <p className="text-xs text-muted-foreground">
          Your designation: <strong>{designation || '(not set)'}</strong>
        </p>
        <button
          type="button"
          className="text-sm font-medium text-primary hover:underline"
          onClick={() => { window.location.href = '/' }}
        >
          Go to Dashboard
        </button>
      </div>
    )
  }

  return <>{children}</>
}
