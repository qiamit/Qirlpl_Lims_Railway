import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { SessionSecurityGate } from '@/components/auth/SessionSecurityGate'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return null

  if (!user) {
    if (location.pathname === '/') {
      return <Navigate to="/home" replace />
    }
    return (
      <Navigate
        to="/auth"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }

  // Two-step code, forced password change, idle sign-out, account dialogs.
  return <SessionSecurityGate>{children}</SessionSecurityGate>
}
