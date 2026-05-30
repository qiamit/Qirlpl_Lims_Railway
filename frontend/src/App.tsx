import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Construction } from 'lucide-react'
import GlobalLayout from '@/components/layout/GlobalLayout'
import DashboardPage from '@/features/dashboard/DashboardPage'
import { SamplesPage } from '@/features/samples'
import SampleReceivingMasterPage from '@/features/sample-handling/receiving/SampleReceivingMasterPage'
import SampleStageMasterPage from '@/features/sample-handling/SampleStageMasterPage'
import SampleAllocationMasterPage from '@/features/sample-handling/allocation/SampleAllocationMasterPage'
import TestAllocationMasterPage from '@/features/sample-handling/test-allocation/TestAllocationMasterPage'
import SampleUnderTestingMasterPage from '@/features/sample-handling/sample-under-testing/SampleUnderTestingMasterPage'
import ResultsUnderReviewMasterPage from '@/features/sample-handling/results-under-review/ResultsUnderReviewMasterPage'
import TestReportPreparationMasterPage from '@/features/sample-handling/report-preparation/TestReportPreparationMasterPage'
import { TestingPage } from '@/features/testing'
import { ReportingPage } from '@/features/reporting'
import { PersonnelPage } from '@/features/personnel'
import LabSettingsPage from '@/features/settings/LabSettingsPage'
import UserManagementPage from '@/features/settings/UserManagementPage'
import AuthPage from '@/features/auth/AuthPage'
import ClientsPage from '@/features/masters/ClientsPage'
import IsCodesPage from '@/features/masters/IsCodesPage'
import ProductServicesPage from '@/features/masters/ProductServicesPage'
import TestParameterPage from '@/features/masters/TestParameterPage'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { RequireLaboratoryDirector } from '@/components/auth/RequireLaboratoryDirector'
import { RequireSampleReceivingAccess } from '@/components/auth/RequireSampleReceivingAccess'
import { RequireSampleAllocationAccess } from '@/components/auth/RequireSampleAllocationAccess'
import { RequireTestAllocationAccess } from '@/components/auth/RequireTestAllocationAccess'

function PlaceholderPage({ title, clause }: { title: string; clause: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Construction size={28} className="text-primary" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">
            ISO 17025:2017 — {clause}
          </p>
        </div>
        <p className="text-sm text-muted-foreground/70">
          This module is under development and will be available in an upcoming release.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="auth" element={<AuthPage />} />

        <Route
          element={
            <RequireAuth>
              <GlobalLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />

          {/* Clause 6 – Resource Requirements */}
          <Route path="personnel" element={<PersonnelPage />} />

          {/* Clause 7 – Process Requirements */}
          <Route path="sampling" element={<PlaceholderPage title="Sampling" clause="Clause 7.3" />} />
          <Route path="samples" element={<SamplesPage />} />
          <Route path="samples/receiving" element={<RequireSampleReceivingAccess><SampleReceivingMasterPage /></RequireSampleReceivingAccess>} />
          <Route path="samples/allocation" element={<RequireSampleAllocationAccess><SampleAllocationMasterPage /></RequireSampleAllocationAccess>} />
          <Route path="samples/test-allocation" element={<RequireTestAllocationAccess><TestAllocationMasterPage /></RequireTestAllocationAccess>} />
          <Route path="samples/under-testing" element={<SampleUnderTestingMasterPage />} />
          <Route path="samples/results-review" element={<ResultsUnderReviewMasterPage />} />
          <Route path="samples/report-preparation" element={<TestReportPreparationMasterPage />} />
          <Route path="samples/completed" element={<SampleStageMasterPage stage="completed" title="Completed Results" />} />
          <Route path="testing" element={<TestingPage />} />
          <Route path="validity" element={<PlaceholderPage title="Ensuring Validity of Results" clause="Clause 7.7" />} />
          <Route path="reports" element={<ReportingPage />} />

          {/* Masters Management */}
          <Route path="masters/clients" element={<ClientsPage />} />
          <Route path="masters/is-codes" element={<IsCodesPage />} />
          <Route path="masters/product-services" element={<ProductServicesPage />} />
          <Route path="masters/test-parameter" element={<TestParameterPage />} />

          {/* Top Bar Pages */}
          <Route
            path="lab-settings"
            element={
              <RequireLaboratoryDirector>
                <LabSettingsPage />
              </RequireLaboratoryDirector>
            }
          />
          <Route
            path="lab-settings/user-management"
            element={
              <RequireLaboratoryDirector>
                <UserManagementPage />
              </RequireLaboratoryDirector>
            }
          />
          <Route path="help" element={<PlaceholderPage title="Help" clause="Help" />} />
          <Route path="contact-us" element={<PlaceholderPage title="Contact Us" clause="Support" />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
