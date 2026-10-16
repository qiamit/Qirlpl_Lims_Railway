import { ComplianceRegisterPage } from '@/features/compliance/ComplianceRegisterPage'

export default function ActualCompetencyMatrixPage() {
  return (
    <ComplianceRegisterPage
      config={{
        moduleKey: 'personnel.actual-competency',
        title: 'Actual Competency Matrix',
        description: 'Record and review actual employee competencies against required levels for each role and activity.',
        personLabel: 'Employee',
      }}
    />
  )
}
