import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  fetchModuleAccessRules,
  type ModuleAccessRuleRow,
} from './moduleAccessApi'
import {
  canAccessNavItemWithRules,
  canAccessPathWithRules,
  canEditPathWithRules,
  resolveModuleAccessLevel,
  type ModuleAccessUserContext,
} from './resolveModuleAccess'
import type { ModuleAccessLevel } from './moduleCatalog'

type ModuleAccessState = {
  rules: ModuleAccessRuleRow[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  ctx: ModuleAccessUserContext
  canAccessPath: (pathname: string) => boolean
  canEditPath: (pathname: string) => boolean
  canAccessNavItem: (requiredDesignations: string[] | undefined, to: string | undefined) => boolean
  accessLevelFor: (pathname: string) => ModuleAccessLevel
}

const ModuleAccessContext = createContext<ModuleAccessState | null>(null)

export function ModuleAccessProvider({ children }: { children: ReactNode }) {
  const { user, designation, departmentName, division, profileReady } = useAuth()
  const [rules, setRules] = useState<ModuleAccessRuleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Whose rules are loaded. Until the signed-in user's rules arrive, access is
  // "loading", never "denied" (Access Denied right after sign-in, 23 Oct 2026).
  const [rulesUserId, setRulesUserId] = useState<string | null>(null)
  const userId = user?.id ?? null

  const refresh = useCallback(async () => {
    setError(null)
    let lastError: unknown = null
    // A failed load is tried again before falling back to the designation rules.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
      try {
        const rows = await fetchModuleAccessRules()
        setRules(rows)
        lastError = null
        break
      } catch (err) {
        lastError = err
      }
    }
    if (lastError) {
      setError(lastError instanceof Error ? lastError.message : 'Unable to load module access rules')
      setRules([])
    }
    setRulesUserId(userId)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    if (!profileReady) return
    if (!userId) {
      setRules([])
      setRulesUserId(null)
      setLoading(false)
      return
    }
    setLoading(true)
    void refresh()
  }, [userId, profileReady, refresh])

  const rulesLoading = userId ? loading || rulesUserId !== userId : false

  const ctx = useMemo<ModuleAccessUserContext>(
    () => ({
      designation,
      departmentName,
      division: division ?? '',
      userId: user?.id ?? null,
    }),
    [designation, departmentName, division, user?.id],
  )

  const value = useMemo<ModuleAccessState>(
    () => ({
      rules,
      loading: rulesLoading,
      error,
      refresh,
      ctx,
      canAccessPath: (pathname: string) => canAccessPathWithRules(pathname, ctx, rules),
      canEditPath: (pathname: string) => canEditPathWithRules(pathname, ctx, rules),
      canAccessNavItem: (requiredDesignations, to) =>
        canAccessNavItemWithRules(requiredDesignations, to, ctx, rules),
      accessLevelFor: (pathname: string) => resolveModuleAccessLevel(pathname, ctx, rules),
    }),
    [rules, rulesLoading, error, refresh, ctx],
  )

  return createElement(ModuleAccessContext.Provider, { value }, children)
}

export function useModuleAccess(): ModuleAccessState {
  const value = useContext(ModuleAccessContext)
  if (!value) {
    throw new Error('useModuleAccess must be used within ModuleAccessProvider')
  }
  return value
}

/** Safe for components that may render outside provider during auth boot. */
export function useModuleAccessOptional(): ModuleAccessState | null {
  return useContext(ModuleAccessContext)
}
