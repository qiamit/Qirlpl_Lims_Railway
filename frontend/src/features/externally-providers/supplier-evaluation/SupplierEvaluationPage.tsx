import { ComplianceRegisterPage } from '@/features/compliance/ComplianceRegisterPage'

export default function SupplierEvaluationPage() {
  return (
    <ComplianceRegisterPage
      config={{
        moduleKey: 'external.supplier-evaluation',
        title: 'Supplier Evaluation (legacy)',
        description: 'Evaluate and monitor external providers for quality, delivery, and suitability for laboratory use.',
        personLabel: 'Supplier',
      }}
    />
  )
}
