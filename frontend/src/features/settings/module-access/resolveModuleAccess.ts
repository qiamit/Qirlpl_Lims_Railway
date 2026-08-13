import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  canAccessPath as legacyCanAccessPath,
  canAccessNavItem as legacyCanAccessNavItem,
  type UserAccessContext,
} from '@/lib/moduleAccess'
import {
  MODULE_CATALOG,
  normalizeAccessKey,
  type ModuleAccessLevel,
  type ModuleAccessSubjectType,
} from './moduleCatalog'
import type { ModuleAccessRuleRow } from './moduleAccessApi'

export type ModuleAccessUserContext = UserAccessContext & {
  userId?: string | null
  division?: string
}

const SUBJECT_PRIORITY: ModuleAccessSubjectType[] = [
  'user',
  'designation',
  'department',
  'division',
]

function pathToModuleKey(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return '/'

  // Prefer longest matching catalog key (covers nested result-validation routes).
  let best: string | null = null
  for (const entry of MODULE_CATALOG) {
    if (entry.key === '/') continue
    if (path === entry.key || path.startsWith(`${entry.key}/`)) {
      if (!best || entry.key.length > best.length) best = entry.key
    }
  }
  return best
}

function subjectKeyFor(
  type: ModuleAccessSubjectType,
  ctx: ModuleAccessUserContext,
): string {
  if (type === 'user') return (ctx.userId ?? '').trim()
  if (type === 'designation') return normalizeAccessKey(ctx.designation)
  if (type === 'department') return normalizeAccessKey(ctx.departmentName)
  return normalizeAccessKey(ctx.division)
}

/**
 * Resolve access from configurable rules.
 * Priority: user → designation → department → division.
 * Returns null when no DB rule applies for this module (caller should use legacy logic).
 */
export function resolveConfiguredAccessLevel(
  pathname: string,
  ctx: ModuleAccessUserContext,
  rules: ModuleAccessRuleRow[],
): ModuleAccessLevel | null {
  if (isLaboratoryDirector(ctx.designation)) return 'edit'
  if (!rules.length) return null

  const moduleKey = pathToModuleKey(pathname)
  if (!moduleKey) return null

  const moduleRules = rules.filter((r) => r.module_key === moduleKey)
  if (moduleRules.length === 0) return null

  for (const type of SUBJECT_PRIORITY) {
    const key = subjectKeyFor(type, ctx)
    if (!key) continue
    const match = moduleRules.find(
      (r) =>
        r.subject_type === type &&
        (type === 'user'
          ? r.subject_key === key
          : normalizeAccessKey(r.subject_key) === key),
    )
    if (match) return match.access_level
  }

  // Rules exist for this module but none match this user → deny when matrix is intentional.
  // Only deny if at least one non-none rule exists for this module (matrix is in use).
  const hasAnyGrant = moduleRules.some((r) => r.access_level !== 'none')
  if (hasAnyGrant) return 'none'
  return null
}

export function resolveModuleAccessLevel(
  pathname: string,
  ctx: ModuleAccessUserContext,
  rules: ModuleAccessRuleRow[],
): ModuleAccessLevel {
  if (isLaboratoryDirector(ctx.designation)) return 'edit'

  const configured = resolveConfiguredAccessLevel(pathname, ctx, rules)
  if (configured !== null) return configured

  const legacyOk = legacyCanAccessPath(pathname, ctx)
  return legacyOk ? 'edit' : 'none'
}

export function canAccessPathWithRules(
  pathname: string,
  ctx: ModuleAccessUserContext,
  rules: ModuleAccessRuleRow[],
): boolean {
  return resolveModuleAccessLevel(pathname, ctx, rules) !== 'none'
}

export function canEditPathWithRules(
  pathname: string,
  ctx: ModuleAccessUserContext,
  rules: ModuleAccessRuleRow[],
): boolean {
  return resolveModuleAccessLevel(pathname, ctx, rules) === 'edit'
}

export function canAccessNavItemWithRules(
  requiredDesignations: string[] | undefined,
  to: string | undefined,
  ctx: ModuleAccessUserContext,
  rules: ModuleAccessRuleRow[],
): boolean {
  if (!to) return false
  if (isLaboratoryDirector(ctx.designation)) return true

  const configured = resolveConfiguredAccessLevel(to, ctx, rules)
  if (configured !== null) return configured !== 'none'

  return legacyCanAccessNavItem(requiredDesignations, to, ctx)
}
