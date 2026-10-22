import { ComplianceRegisterPage } from '@/features/compliance/ComplianceRegisterPage'

export default function ListOfConsumablesPage() {
  return (
    <ComplianceRegisterPage
      config={{
        moduleKey: 'external.consumables',
        title: 'List of Consumables (legacy)',
        description: 'Register and control consumables procured from external providers for laboratory activities.',
        personLabel: 'Item',
      }}
    />
  )
}