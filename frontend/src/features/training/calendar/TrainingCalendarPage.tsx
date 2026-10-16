import { ComplianceRegisterPage } from '@/features/compliance/ComplianceRegisterPage'

export default function TrainingCalendarPage() {
  return (
    <ComplianceRegisterPage
      config={{
        moduleKey: 'training.calendar',
        title: 'Training Calendar',
        description: 'Schedule and track upcoming training events, venues, and attendees.',
        personLabel: 'Trainer',
      }}
    />
  )
}
