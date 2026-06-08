import GlobalLayout from '@/components/layout/GlobalLayout'
import DashboardPage from '@/features/dashboard/DashboardPage'
import { SamplesPage } from '@/features/samples'
import SampleReceivingMasterPage from '@/features/sample-handling/receiving/SampleReceivingMasterPage'
import SampleAllocationMasterPage from '@/features/sample-handling/allocation/SampleAllocationMasterPage'
import TestAllocationMasterPage from '@/features/sample-handling/test-allocation/TestAllocationMasterPage'
import SampleUnderTestingMasterPage from '@/features/sample-handling/sample-under-testing/SampleUnderTestingMasterPage'
import ResultsUnderReviewMasterPage from '@/features/sample-handling/results-under-review/ResultsUnderReviewMasterPage'
import TestReportPreparationMasterPage from '@/features/sample-handling/report-preparation/TestReportPreparationMasterPage'
import CompletedResultsMasterPage from '@/features/sample-handling/completed-results/CompletedResultsMasterPage'
import LabSettingsPage from '@/features/settings/LabSettingsPage'
import UserManagementPage from '@/features/settings/UserManagementPage'
import AiSettingsPage from '@/features/settings/AiSettingsPage'
import ClientsPage from '@/features/masters/ClientsPage'
import IsCodesPage from '@/features/masters/IsCodesPage'
import ProductServicesPage from '@/features/masters/ProductServicesPage'
import TestParameterPage from '@/features/masters/TestParameterPage'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { RequireLaboratoryDirector } from '@/components/auth/RequireLaboratoryDirector'
import { RequireSampleReceivingAccess } from '@/components/auth/RequireSampleReceivingAccess'
import { RequireSampleAllocationAccess } from '@/components/auth/RequireSampleAllocationAccess'
import { RequireTestAllocationAccess } from '@/components/auth/RequireTestAllocationAccess'

/** Stable route shells — avoid remount when App re-renders after auth/session updates. */
export function AuthenticatedShell() {
  return (
    <RequireAuth>
      <GlobalLayout />
    </RequireAuth>
  )
}

export function SampleReceivingRoute() {
  return (
    <RequireSampleReceivingAccess>
      <SampleReceivingMasterPage />
    </RequireSampleReceivingAccess>
  )
}

export function SampleAllocationRoute() {
  return (
    <RequireSampleAllocationAccess>
      <SampleAllocationMasterPage />
    </RequireSampleAllocationAccess>
  )
}

export function TestAllocationRoute() {
  return (
    <RequireTestAllocationAccess>
      <TestAllocationMasterPage />
    </RequireTestAllocationAccess>
  )
}

export function LabSettingsRoute() {
  return (
    <RequireLaboratoryDirector>
      <LabSettingsPage />
    </RequireLaboratoryDirector>
  )
}

export function UserManagementRoute() {
  return (
    <RequireLaboratoryDirector>
      <UserManagementPage />
    </RequireLaboratoryDirector>
  )
}

export function AiSettingsRoute() {
  return (
    <RequireLaboratoryDirector>
      <AiSettingsPage />
    </RequireLaboratoryDirector>
  )
}

export {
  DashboardPage,
  SamplesPage,
  SampleUnderTestingMasterPage,
  ResultsUnderReviewMasterPage,
  TestReportPreparationMasterPage,
  CompletedResultsMasterPage,
  ClientsPage,
  IsCodesPage,
  ProductServicesPage,
  TestParameterPage,
}
