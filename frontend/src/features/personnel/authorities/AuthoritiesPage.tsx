import { ComplianceRegisterPage } from '@/features/compliance/ComplianceRegisterPage'

export default function AuthoritiesPage() {
  return (
    <ComplianceRegisterPage
      config={{
        moduleKey: 'personnel.authorities',
        title: 'Authorities',
        description: 'Define authorities and decision rights for laboratory personnel within the management system.',
        personLabel: 'Role',
      }}
    />
  )
}
