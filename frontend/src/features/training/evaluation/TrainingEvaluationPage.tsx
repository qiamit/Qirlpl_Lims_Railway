import { ComplianceRegisterPage } from '@/features/compliance/ComplianceRegisterPage'

export default function TrainingEvaluationPage() {
  return (
    <ComplianceRegisterPage
      config={{
        moduleKey: 'training.evaluation',
        title: 'Training Evaluation',
        description: 'Capture trainee feedback and assess learning outcomes after each training.',
        personLabel: 'Trainee',
      }}
    />
  )
}
