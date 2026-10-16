import { ComplianceRegisterPage } from '@/features/compliance/ComplianceRegisterPage'

export default function EmployeeSelectionPage() {
  return (
    <ComplianceRegisterPage
      config={{
        moduleKey: 'personnel.selection',
        title: 'Selection of Employee',
        description: 'Manage employee selection criteria, shortlisting, and appointment records for laboratory roles.',
        personLabel: 'Candidate',
      }}
    />
  )
}
