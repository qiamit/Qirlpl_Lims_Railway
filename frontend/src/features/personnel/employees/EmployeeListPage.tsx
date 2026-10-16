import { ComplianceRegisterPage } from '@/features/compliance/ComplianceRegisterPage'

export default function EmployeeListPage() {
  return (
    <ComplianceRegisterPage
      config={{
        moduleKey: 'personnel.employees',
        title: 'List of Employees with All Details',
        description: 'Maintain complete employee records including personal, organizational, and competency-related details.',
        personLabel: 'Employee',
      }}
    />
  )
}
