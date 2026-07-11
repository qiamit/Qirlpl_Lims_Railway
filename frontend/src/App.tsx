import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Construction } from 'lucide-react'
import AuthPage from '@/features/auth/AuthPage'
import {
  DEFAULT_RESULT_VALIDATION_MODULE_SLUG,
  resultValidationModulePath,
} from '@/features/quality/result-validation/resultValidationModules'
import {
  AiSettingsRoute,
  AuthenticatedShell,
  ClientsPage,
  ConsentLetterPage,
  EquipmentPage,
  IqcPage,
  CompletedResultsMasterPage,
  RetainDisposedMasterPage,
  ResultValidationPage,
  DashboardPage,
  IsCodesPage,
  LabSettingsRoute,
  ProductServicesPage,
  ResultsUnderReviewMasterPage,
  SampleAllocationRoute,
  SampleReceivingRoute,
  SamplesPage,
  SampleUnderTestingMasterPage,
  TestAllocationRoute,
  TestParameterPage,
  TestReportPreparationMasterPage,
  UserManagementRoute,
} from '@/routes/routeElements'

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

function HelpRoute() {
  return <PlaceholderPage title="Help" clause="Help" />
}

function ContactUsRoute() {
  return <PlaceholderPage title="Contact Us" clause="Support" />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="auth" element={<AuthPage />} />

        <Route element={<AuthenticatedShell />}>
          <Route index element={<DashboardPage />} />

          {/* Clause 7 – Process Requirements */}
          <Route path="samples" element={<SamplesPage />} />
          <Route path="samples/receiving" element={<SampleReceivingRoute />} />
          <Route path="samples/allocation" element={<SampleAllocationRoute />} />
          <Route path="samples/test-allocation" element={<TestAllocationRoute />} />
          <Route path="samples/under-testing" element={<SampleUnderTestingMasterPage />} />
          <Route path="samples/results-review" element={<ResultsUnderReviewMasterPage />} />
          <Route path="samples/report-preparation" element={<TestReportPreparationMasterPage />} />
          <Route path="samples/completed" element={<CompletedResultsMasterPage />} />
          <Route path="samples/retain-disposed" element={<RetainDisposedMasterPage />} />
          <Route
            path="samples/result-validation"
            element={
              <Navigate
                to={resultValidationModulePath(DEFAULT_RESULT_VALIDATION_MODULE_SLUG)}
                replace
              />
            }
          />
          <Route path="samples/result-validation/:moduleSlug" element={<ResultValidationPage />} />

          {/* Masters Management */}
          <Route path="masters/clients" element={<ClientsPage />} />
          <Route path="masters/is-codes" element={<IsCodesPage />} />
          <Route path="masters/consent-letter" element={<ConsentLetterPage />} />
          <Route path="masters/nabl-scope" element={<ProductServicesPage />} />
          <Route path="masters/product-services" element={<Navigate to="/masters/nabl-scope" replace />} />
          <Route path="masters/test-parameter" element={<TestParameterPage />} />
          <Route path="masters/equipment" element={<EquipmentPage />} />
          <Route path="masters/iqc" element={<IqcPage />} />

          {/* Top Bar Pages */}
          <Route path="lab-settings" element={<LabSettingsRoute />} />
          <Route path="lab-settings/user-management" element={<UserManagementRoute />} />
          <Route path="lab-settings/ai-settings" element={<AiSettingsRoute />} />
          <Route path="help" element={<HelpRoute />} />
          <Route path="contact-us" element={<ContactUsRoute />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
