import { ComplianceRegisterPage } from '@/features/compliance/ComplianceRegisterPage'

export default function EffectivenessReviewPage() {
  return (
    <ComplianceRegisterPage
      config={{
        moduleKey: 'training.effectiveness-review',
        title: 'Effectiveness Review',
        description: 'Review whether training improved performance — competence reassessment and follow-up actions.',
        personLabel: 'Employee',
      }}
    />
  )
}
