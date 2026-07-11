import { fetchIqcPlanAcceptanceCriteriaByCheckTypeSlug } from '@/features/quality/iqc-plan/iqcPlanDb'
import { getResultValidationModuleByCheckType } from './resultValidationModules'
import type { ResultValidityCheckForm, ResultValidityCheckType } from './types'

export async function resolveAcceptanceCriteriaFromIqcPlan(
  checkType: ResultValidityCheckType,
): Promise<string | null> {
  const module = getResultValidationModuleByCheckType(checkType)
  if (!module?.slug) return null
  return fetchIqcPlanAcceptanceCriteriaByCheckTypeSlug(module.slug)
}

export async function withIqcPlanAcceptanceCriteria(
  form: ResultValidityCheckForm,
): Promise<ResultValidityCheckForm> {
  const criteria = await resolveAcceptanceCriteriaFromIqcPlan(form.checkType)
  if (!criteria) return form
  return { ...form, predefinedCriteria: criteria }
}
