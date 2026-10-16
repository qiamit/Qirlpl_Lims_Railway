import { ComplianceRegisterPage } from '@/features/compliance/ComplianceRegisterPage'

export default function TrainingRegisterPage() {
  return (
    <ComplianceRegisterPage
      config={{
        moduleKey: 'training.register',
        title: 'Training Register',
        description: 'Maintain training attendance records, certificates, and evidence of completion.',
        personLabel: 'Trainee',
      }}
    />
  )
}
