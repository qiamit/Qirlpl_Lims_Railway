import { ComplianceRegisterPage } from '@/features/compliance/ComplianceRegisterPage'

export default function TrainingNeedIdentificationPage() {
  return (
    <ComplianceRegisterPage
      config={{
        moduleKey: 'training.need-identification',
        title: 'Training Need Identification',
        description: 'Identify skill gaps from competency matrix, role changes, NCs, and new methods.',
        personLabel: 'Employee',
      }}
    />
  )
}
