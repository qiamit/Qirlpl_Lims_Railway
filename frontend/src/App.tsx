import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEnterTogglesCheckbox } from '@/hooks/useEnterTogglesCheckbox'
import { RoutePersistence } from '@/components/routing/RoutePersistence'
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
  ModuleAccessRoute,
  ManagementDocsLevel1Route,
  ManagementDocsLevel2Route,
  ManagementDocsLevel3Route,
  ManagementDocsLevel4Route,
  CalibrationEquipmentsRoute,
  CalibrationServiceRequestRoute,
  EquipmentForCalibrationRoute,
  MastersForIqcRoute,
  JobAllocationRoute,
  CalibrationConductRoute,
  CalibrationConductInsideRoute,
  CalibrationConductOutsideRoute,
  ReviewDataRoute,
  CertificatePreparationRoute,
  CalibrationCertificatesRoute,
  SaleQuotationRoute,
  SaleProformaInvoiceRoute,
  SaleInvoiceRoute,
  SaleCreditNoteRoute,
  SalePaymentReceiptRoute,
  AuditPlanRoute,
  AuditChecklistRoute,
  AuditSummaryRoute,
  NonConformitiesRoute,
  MrmAgendaRoute,
  ManagementReviewMeetingRoute,
  CompetencyMatrixRoute,
  TrainingNeedIdentificationRoute,
  TrainingPlanRoute,
  TrainingCalendarRoute,
  TrainingRegisterRoute,
  TrainingEvaluationRoute,
  InductionTrainingRoute,
  EffectivenessReviewRoute,
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
  useEnterTogglesCheckbox()
  return (
    <BrowserRouter>
      <RoutePersistence />
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
          <Route path="masters/product-services" element={<ProductServicesPage />} />
          <Route path="masters/test-parameter" element={<TestParameterPage />} />
          <Route path="masters/equipment" element={<EquipmentPage />} />
          <Route path="masters/iqc" element={<IqcPage />} />

          {/* Management Documentation */}
          <Route path="management-docs/level-1" element={<ManagementDocsLevel1Route />} />
          <Route path="management-docs/level-2" element={<ManagementDocsLevel2Route />} />
          <Route path="management-docs/level-3" element={<ManagementDocsLevel3Route />} />
          <Route path="management-docs/level-4" element={<ManagementDocsLevel4Route />} />

          {/* Audit & MRM Management */}
          <Route
            path="audit-mrm"
            element={<Navigate to="/audit-mrm/audit-plan" replace />}
          />
          <Route path="audit-mrm/audit-plan" element={<AuditPlanRoute />} />
          <Route path="audit-mrm/audit-checklist" element={<AuditChecklistRoute />} />
          <Route path="audit-mrm/audit-summary" element={<AuditSummaryRoute />} />
          <Route path="audit-mrm/non-conformities" element={<NonConformitiesRoute />} />
          <Route path="audit-mrm/mrm-agenda" element={<MrmAgendaRoute />} />
          <Route
            path="audit-mrm/management-review-meeting"
            element={<ManagementReviewMeetingRoute />}
          />

          {/* Training Management (ISO 17025 §6.2) */}
          <Route path="training" element={<Navigate to="/training/competency-matrix" replace />} />
          <Route path="training/competency-matrix" element={<CompetencyMatrixRoute />} />
          <Route
            path="training/need-identification"
            element={<TrainingNeedIdentificationRoute />}
          />
          <Route path="training/plan" element={<TrainingPlanRoute />} />
          <Route path="training/calendar" element={<TrainingCalendarRoute />} />
          <Route path="training/register" element={<TrainingRegisterRoute />} />
          <Route path="training/evaluation" element={<TrainingEvaluationRoute />} />
          <Route path="training/induction" element={<InductionTrainingRoute />} />
          <Route
            path="training/effectiveness-review"
            element={<EffectivenessReviewRoute />}
          />

          {/* Calibration LIMS */}
          <Route
            path="calibration/handling"
            element={<Navigate to="/calibration/handling/service-request" replace />}
          />
          <Route
            path="calibration/handling/service-request"
            element={<CalibrationServiceRequestRoute />}
          />
          <Route
            path="calibration/handling/job-allocation"
            element={<JobAllocationRoute />}
          />
          <Route
            path="calibration/handling/calibration-conduct"
            element={<CalibrationConductRoute />}
          />
          <Route
            path="calibration/handling/calibration-conduct-inside"
            element={<CalibrationConductInsideRoute />}
          />
          <Route
            path="calibration/handling/calibration-conduct-outside"
            element={<CalibrationConductOutsideRoute />}
          />
          <Route path="calibration/handling/review-data" element={<ReviewDataRoute />} />
          <Route
            path="calibration/handling/certificate-preparation"
            element={<CertificatePreparationRoute />}
          />
          <Route
            path="calibration/handling/certificates"
            element={<CalibrationCertificatesRoute />}
          />
          <Route path="calibration/equipments" element={<CalibrationEquipmentsRoute />} />
          <Route
            path="calibration/equipment-for-calibration"
            element={<EquipmentForCalibrationRoute />}
          />
          <Route path="calibration/masters-for-iqc" element={<MastersForIqcRoute />} />

          {/* Finance Management · Sale */}
          <Route
            path="finance/sale"
            element={<Navigate to="/finance/sale/quotation" replace />}
          />
          <Route path="finance/sale/quotation" element={<SaleQuotationRoute />} />
          <Route
            path="finance/sale/proforma-invoice"
            element={<SaleProformaInvoiceRoute />}
          />
          <Route path="finance/sale/invoice" element={<SaleInvoiceRoute />} />
          <Route path="finance/sale/credit-note" element={<SaleCreditNoteRoute />} />
          <Route
            path="finance/sale/payment-receipt"
            element={<SalePaymentReceiptRoute />}
          />

          {/* Top Bar Pages */}
          <Route path="lab-settings" element={<LabSettingsRoute />} />
          <Route path="lab-settings/user-management" element={<UserManagementRoute />} />
          <Route path="lab-settings/module-access" element={<ModuleAccessRoute />} />
          <Route path="lab-settings/ai-settings" element={<AiSettingsRoute />} />
          <Route path="help" element={<HelpRoute />} />
          <Route path="contact-us" element={<ContactUsRoute />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
