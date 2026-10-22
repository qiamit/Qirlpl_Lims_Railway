import { ComplianceRegisterPage } from '@/features/compliance/ComplianceRegisterPage'

export default function ExternallySupplierListPage() {
  return (
    <ComplianceRegisterPage
      config={{
        moduleKey: 'external.supplier-list',
        title: 'Externally Supplier List (legacy)',
        description: 'Maintain the approved list of external suppliers for products and services used in laboratory activities.',
        personLabel: 'Supplier',
      }}
    />
  )
}
