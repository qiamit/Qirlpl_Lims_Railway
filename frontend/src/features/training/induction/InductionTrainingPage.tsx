import { ComplianceRegisterPage } from '@/features/compliance/ComplianceRegisterPage'

export default function InductionTrainingPage() {
  return (
    <ComplianceRegisterPage
      config={{
        moduleKey: 'training.induction',
        title: 'Induction Training',
        description: 'Onboard new personnel with lab policies, safety, quality system, and role orientation.',
        personLabel: 'Trainee',
      }}
    />
  )
}
