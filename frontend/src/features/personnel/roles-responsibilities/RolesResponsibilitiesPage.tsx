import { ComplianceRegisterPage } from '@/features/compliance/ComplianceRegisterPage'

export default function RolesResponsibilitiesPage() {
  return (
    <ComplianceRegisterPage
      config={{
        moduleKey: 'personnel.roles',
        title: 'Roles & Responsibilities',
        description: 'Document roles and responsibilities for laboratory personnel aligned with the quality management system.',
        personLabel: 'Role',
      }}
    />
  )
}
