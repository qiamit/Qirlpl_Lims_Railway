import { ComplianceRegisterPage } from '@/features/compliance/ComplianceRegisterPage'

export default function CompetencyMatrixPage() {
  return (
    <ComplianceRegisterPage
      config={{
        moduleKey: 'training.competency-matrix',
        title: 'Competency Matrix',
        description: 'Map personnel competencies against tests, methods, and equipment authorizations.',
        personLabel: 'Employee',
      }}
    />
  )
}
