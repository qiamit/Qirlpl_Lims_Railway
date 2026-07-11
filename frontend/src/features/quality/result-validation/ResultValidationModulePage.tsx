import { Navigate, useParams } from 'react-router-dom'
import IqcPlanMasterPage from '../iqc-plan/IqcPlanMasterPage'
import ResultValidationMasterPage from './ResultValidationMasterPage'
import {
  DEFAULT_RESULT_VALIDATION_MODULE_SLUG,
  getResultValidationModule,
  resultValidationModulePath,
} from './resultValidationModules'

export default function ResultValidationModulePage() {
  const { moduleSlug } = useParams<{ moduleSlug: string }>()
  const module = getResultValidationModule(moduleSlug)

  if (!moduleSlug?.trim()) {
    return <Navigate to={resultValidationModulePath(DEFAULT_RESULT_VALIDATION_MODULE_SLUG)} replace />
  }

  if (!module) {
    return <Navigate to={resultValidationModulePath(DEFAULT_RESULT_VALIDATION_MODULE_SLUG)} replace />
  }

  if (!module.checkType) {
    return <IqcPlanMasterPage />
  }

  return <ResultValidationMasterPage module={module} />
}
