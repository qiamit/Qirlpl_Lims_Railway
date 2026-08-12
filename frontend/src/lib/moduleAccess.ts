import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'

export interface UserAccessContext {
  designation: string
  departmentName: string
}

const SAMPLE_CELL_DEPARTMENT = 'sample cell'
const MECHANICAL_DEPARTMENT = 'mechanical'
const CHEMICAL_DEPARTMENT = 'chemical'
const QUALITY_ASSURANCE_DEPARTMENT = 'quality assurance'
const RECEPTIONIST_DESIGNATION = 'receptionist'
const SAMPLE_INCHARGE_DESIGNATION = 'sample incharge'
const TECHNICAL_MANAGER_DESIGNATION = 'technical manager'
const TESTING_ENGINEER_DESIGNATION = 'testing engineer'
const QUALITY_MANAGER_DESIGNATION = 'quality manager'

/** Routes Sample Cell Receptionist may open (nav + direct URL). */
export const RECEPTIONIST_ALLOWED_PATHS = [
  '/',
  '/samples/receiving',
  '/samples/retain-disposed',
  '/masters/clients',
  '/masters/is-codes',
  '/masters/nabl-scope',
  '/masters/product-services',
  '/masters/test-parameter',
] as const

/** Routes Sample Cell Sample Incharge may open (nav + direct URL). */
export const SAMPLE_INCHARGE_ALLOWED_PATHS = [
  '/',
  '/samples/allocation',
  '/samples/retain-disposed',
  '/samples/result-validation',
  '/masters/is-codes',
  '/masters/consent-letter',
  '/masters/nabl-scope',
  '/masters/product-services',
  '/masters/test-parameter',
  '/masters/equipment',
  '/masters/iqc',
  '/calibration/equipments',
  '/calibration/handling',
  '/calibration/handling/service-request',
  '/calibration/equipment-for-calibration',
  '/calibration/masters-for-iqc',
] as const

/** Routes Mechanical Technical Manager may open (nav + direct URL). */
export const MECHANICAL_TECHNICAL_MANAGER_ALLOWED_PATHS = [
  '/',
  '/samples/test-allocation',
  '/samples/results-review',
  '/samples/result-validation',
  '/masters/is-codes',
  '/masters/consent-letter',
  '/masters/nabl-scope',
  '/masters/product-services',
  '/masters/test-parameter',
  '/masters/equipment',
  '/masters/iqc',
  '/calibration/equipments',
  '/calibration/handling',
] as const

/** Routes Chemical Technical Manager may open (nav + direct URL). */
export const CHEMICAL_TECHNICAL_MANAGER_ALLOWED_PATHS = [
  '/',
  '/samples/test-allocation',
  '/samples/results-review',
  '/samples/result-validation',
  '/masters/is-codes',
  '/masters/consent-letter',
  '/masters/nabl-scope',
  '/masters/product-services',
  '/masters/test-parameter',
  '/masters/equipment',
  '/masters/iqc',
  '/calibration/equipments',
  '/calibration/handling',
] as const

/** Routes Chemical Testing Engineer may open (nav + direct URL). */
export const CHEMICAL_TESTING_ENGINEER_ALLOWED_PATHS = [
  '/',
  '/samples/under-testing',
  '/samples/result-validation',
  '/masters/is-codes',
  '/masters/nabl-scope',
  '/masters/product-services',
  '/masters/equipment',
  '/masters/iqc',
  '/calibration/equipments',
  '/calibration/handling',
] as const

/** Routes Mechanical Testing Engineer may open (nav + direct URL). */
export const MECHANICAL_TESTING_ENGINEER_ALLOWED_PATHS = [
  '/',
  '/samples/under-testing',
  '/samples/result-validation',
  '/masters/is-codes',
  '/masters/nabl-scope',
  '/masters/equipment',
  '/masters/iqc',
  '/calibration/equipments',
  '/calibration/handling',
] as const

/** Routes Quality Assurance Quality Manager may open (nav + direct URL). */
export const QUALITY_ASSURANCE_QUALITY_MANAGER_ALLOWED_PATHS = [
  '/',
  '/samples/report-preparation',
  '/samples/completed',
  '/samples/retain-disposed',
  '/samples/result-validation',
  '/masters/clients',
  '/masters/is-codes',
  '/masters/consent-letter',
  '/masters/nabl-scope',
  '/masters/test-parameter',
  '/masters/equipment',
  '/masters/iqc',
  '/calibration/equipments',
  '/calibration/handling',
] as const

function norm(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function pathMatchesAllowlist(pathname: string, allowed: readonly string[]): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  return allowed.some((entry) => {
    if (entry === '/') return path === '/'
    return path === entry || path.startsWith(`${entry}/`)
  })
}

export function isSampleCellReceptionist(ctx: UserAccessContext): boolean {
  return norm(ctx.departmentName) === SAMPLE_CELL_DEPARTMENT && norm(ctx.designation) === RECEPTIONIST_DESIGNATION
}

export function isSampleCellSampleIncharge(ctx: UserAccessContext): boolean {
  return norm(ctx.departmentName) === SAMPLE_CELL_DEPARTMENT && norm(ctx.designation) === SAMPLE_INCHARGE_DESIGNATION
}

export function isMechanicalTechnicalManager(ctx: UserAccessContext): boolean {
  return norm(ctx.departmentName) === MECHANICAL_DEPARTMENT && norm(ctx.designation) === TECHNICAL_MANAGER_DESIGNATION
}

export function isChemicalTechnicalManager(ctx: UserAccessContext): boolean {
  return norm(ctx.departmentName) === CHEMICAL_DEPARTMENT && norm(ctx.designation) === TECHNICAL_MANAGER_DESIGNATION
}

export function isChemicalTestingEngineer(ctx: UserAccessContext): boolean {
  return norm(ctx.departmentName) === CHEMICAL_DEPARTMENT && norm(ctx.designation) === TESTING_ENGINEER_DESIGNATION
}

export function isMechanicalTestingEngineer(ctx: UserAccessContext): boolean {
  return norm(ctx.departmentName) === MECHANICAL_DEPARTMENT && norm(ctx.designation) === TESTING_ENGINEER_DESIGNATION
}

export function isQualityAssuranceQualityManager(ctx: UserAccessContext): boolean {
  return (
    norm(ctx.departmentName) === QUALITY_ASSURANCE_DEPARTMENT &&
    norm(ctx.designation) === QUALITY_MANAGER_DESIGNATION
  )
}

/**
 * Consent Letter module visibility:
 * Chemical/Mechanical Technical Manager, Sample Cell Sample Incharge, QA Quality Manager (+ Laboratory Director).
 */
export function canAccessConsentLetter(ctx: UserAccessContext): boolean {
  if (isLaboratoryDirector(ctx.designation)) return true
  return (
    isChemicalTechnicalManager(ctx) ||
    isMechanicalTechnicalManager(ctx) ||
    isSampleCellSampleIncharge(ctx) ||
    isQualityAssuranceQualityManager(ctx)
  )
}

function isConsentLetterPath(pathname: string | undefined): boolean {
  if (!pathname) return false
  const path = pathname.replace(/\/+$/, '') || '/'
  return path === '/masters/consent-letter' || path.startsWith('/masters/consent-letter/')
}

/**
 * Retain & Disposed Sample visibility (Sample Handling):
 * Sample Cell Receptionist / Sample Incharge, QA Quality Manager (+ Laboratory Director).
 */
export function canAccessRetainDisposed(ctx: UserAccessContext): boolean {
  if (isLaboratoryDirector(ctx.designation)) return true
  return (
    isSampleCellReceptionist(ctx) ||
    isSampleCellSampleIncharge(ctx) ||
    isQualityAssuranceQualityManager(ctx)
  )
}

function isRetainDisposedPath(pathname: string | undefined): boolean {
  if (!pathname) return false
  const path = pathname.replace(/\/+$/, '') || '/'
  return path === '/samples/retain-disposed' || path.startsWith('/samples/retain-disposed/')
}

/**
 * Equipment Master, Masters for IQC, and Validating the Results visibility:
 * Chemical/Mechanical Testing Engineer & Technical Manager,
 * Sample Cell Sample Incharge, QA Quality Manager (+ Laboratory Director).
 */
export function canAccessEquipmentIqcAndResultValidation(ctx: UserAccessContext): boolean {
  if (isLaboratoryDirector(ctx.designation)) return true
  return (
    isChemicalTestingEngineer(ctx) ||
    isChemicalTechnicalManager(ctx) ||
    isMechanicalTestingEngineer(ctx) ||
    isMechanicalTechnicalManager(ctx) ||
    isSampleCellSampleIncharge(ctx) ||
    isQualityAssuranceQualityManager(ctx)
  )
}

function isEquipmentIqcOrResultValidationPath(pathname: string | undefined): boolean {
  if (!pathname) return false
  const path = pathname.replace(/\/+$/, '') || '/'
  return (
    path === '/masters/equipment' ||
    path.startsWith('/masters/equipment/') ||
    path === '/calibration/equipments' ||
    path.startsWith('/calibration/equipments/') ||
    path === '/calibration/handling' ||
    path.startsWith('/calibration/handling/') ||
    path === '/calibration/equipment-for-calibration' ||
    path.startsWith('/calibration/equipment-for-calibration/') ||
    path === '/calibration/masters-for-iqc' ||
    path.startsWith('/calibration/masters-for-iqc/') ||
    path === '/masters/iqc' ||
    path.startsWith('/masters/iqc/') ||
    path === '/samples/result-validation' ||
    path.startsWith('/samples/result-validation/')
  )
}

/** Testing engineers only see their own assigned sections in Sample Under Testing. */
export function isDepartmentTestingEngineer(ctx: UserAccessContext): boolean {
  return isChemicalTestingEngineer(ctx) || isMechanicalTestingEngineer(ctx)
}

/** Department + designation roles with a fixed module allowlist. */
export function isRestrictedModuleRole(ctx: UserAccessContext): boolean {
  return getAllowedPaths(ctx) !== null
}

/** @deprecated Use isRestrictedModuleRole */
export function isSampleCellRestrictedRole(ctx: UserAccessContext): boolean {
  return isRestrictedModuleRole(ctx)
}

function getAllowedPaths(ctx: UserAccessContext): readonly string[] | null {
  if (isSampleCellReceptionist(ctx)) return RECEPTIONIST_ALLOWED_PATHS
  if (isSampleCellSampleIncharge(ctx)) return SAMPLE_INCHARGE_ALLOWED_PATHS
  if (isMechanicalTechnicalManager(ctx)) return MECHANICAL_TECHNICAL_MANAGER_ALLOWED_PATHS
  if (isChemicalTechnicalManager(ctx)) return CHEMICAL_TECHNICAL_MANAGER_ALLOWED_PATHS
  if (isChemicalTestingEngineer(ctx)) return CHEMICAL_TESTING_ENGINEER_ALLOWED_PATHS
  if (isMechanicalTestingEngineer(ctx)) return MECHANICAL_TESTING_ENGINEER_ALLOWED_PATHS
  if (isQualityAssuranceQualityManager(ctx)) return QUALITY_ASSURANCE_QUALITY_MANAGER_ALLOWED_PATHS
  return null
}

export function canAccessPath(pathname: string, ctx: UserAccessContext): boolean {
  if (isLaboratoryDirector(ctx.designation)) return true
  if (isConsentLetterPath(pathname)) return canAccessConsentLetter(ctx)
  if (isRetainDisposedPath(pathname)) return canAccessRetainDisposed(ctx)
  if (isEquipmentIqcOrResultValidationPath(pathname)) {
    return canAccessEquipmentIqcAndResultValidation(ctx)
  }
  const allowed = getAllowedPaths(ctx)
  if (!allowed) return true
  return pathMatchesAllowlist(pathname, allowed)
}

export function canAccessNavPath(to: string | undefined, ctx: UserAccessContext): boolean {
  if (!to) return false
  if (isConsentLetterPath(to)) return canAccessConsentLetter(ctx)
  if (isRetainDisposedPath(to)) return canAccessRetainDisposed(ctx)
  if (isEquipmentIqcOrResultValidationPath(to)) {
    return canAccessEquipmentIqcAndResultValidation(ctx)
  }
  const allowed = getAllowedPaths(ctx)
  if (!allowed) return true
  return pathMatchesAllowlist(to, allowed)
}

const SAMPLE_RECEIVING_ROLES = ['sample coordinator']

export function canAccessSampleReceiving(ctx: UserAccessContext): boolean {
  if (isLaboratoryDirector(ctx.designation)) return true
  if (isSampleCellReceptionist(ctx)) return true
  const d = norm(ctx.designation)
  return SAMPLE_RECEIVING_ROLES.some((r) => r === d)
}

export function canAccessSampleAllocation(ctx: UserAccessContext): boolean {
  if (isLaboratoryDirector(ctx.designation)) return true
  if (isSampleCellSampleIncharge(ctx)) return true
  const d = norm(ctx.designation)
  return d === SAMPLE_INCHARGE_DESIGNATION
}

export function canAccessTestAllocation(ctx: UserAccessContext): boolean {
  if (isLaboratoryDirector(ctx.designation)) return true
  if (isMechanicalTechnicalManager(ctx)) return true
  if (isChemicalTechnicalManager(ctx)) return true
  const d = norm(ctx.designation)
  return d === TECHNICAL_MANAGER_DESIGNATION
}

/** Designation-only nav gate used for sample workflow stages (non-restricted users). */
export function canAccessByRequiredDesignations(
  requiredDesignations: string[] | undefined,
  designation: string,
): boolean {
  if (!requiredDesignations || requiredDesignations.length === 0) return true
  if (isLaboratoryDirector(designation)) return true
  const d = norm(designation)
  return requiredDesignations.some((r) => norm(r) === d)
}

export function canAccessNavItem(
  requiredDesignations: string[] | undefined,
  to: string | undefined,
  ctx: UserAccessContext,
): boolean {
  if (isConsentLetterPath(to)) return canAccessConsentLetter(ctx)
  if (isRetainDisposedPath(to)) return canAccessRetainDisposed(ctx)
  if (isEquipmentIqcOrResultValidationPath(to)) {
    return canAccessEquipmentIqcAndResultValidation(ctx)
  }
  if (getAllowedPaths(ctx)) {
    return canAccessNavPath(to, ctx)
  }
  if (isLaboratoryDirector(ctx.designation) && to?.startsWith('/samples/')) return true
  return canAccessByRequiredDesignations(requiredDesignations, ctx.designation)
}
