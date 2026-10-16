import { ComplianceRegisterPage } from '@/features/compliance/ComplianceRegisterPage'

export default function TrainingPlanPage() {
  return (
    <ComplianceRegisterPage
      config={{
        moduleKey: 'training.plan',
        title: 'Training Plan',
        description: 'Plan annual / periodic trainings with topics, trainers, targets, and due dates.',
        personLabel: 'Trainer',
      }}
    />
  )
}
