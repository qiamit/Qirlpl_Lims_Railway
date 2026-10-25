import CustomerComplaintsMasterPage from './CustomerComplaintsMasterPage'
import { ComplaintsKpiPanel } from './ComplaintsKpiPanel'

export default function CustomerComplaintsRecordsPage() {
  return (
    <>
      <ComplaintsKpiPanel />
      <CustomerComplaintsMasterPage />
    </>
  )
}
