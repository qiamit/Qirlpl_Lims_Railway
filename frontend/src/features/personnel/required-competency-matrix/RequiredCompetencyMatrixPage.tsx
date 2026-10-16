import { ComplianceRegisterPage } from '@/features/compliance/ComplianceRegisterPage'

export default function RequiredCompetencyMatrixPage() {
  return (
    <ComplianceRegisterPage
      config={{
        moduleKey: 'personnel.required-competency',
        title: 'Required Competency Matrix',
        description: 'Define required competencies by designation, department, and activity for ISO 17025 personnel competence.',
        personLabel: 'Role',
      }}
    />
  )
}
