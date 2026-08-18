import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEnterTogglesCheckbox } from '@/hooks/useEnterTogglesCheckbox'
import { RoutePersistence } from '@/components/routing/RoutePersistence'
import AuthPage from '@/features/auth/AuthPage'
import PublicSiteLayout from '@/features/public-site/PublicSiteLayout'
import PublicHomePage from '@/features/public-site/PublicHomePage'
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
  HelpRoute,
  ContactUsRoute,
  ManagementDocsLevel1Route,
  ManagementDocsLevel2Route,
  ManagementDocsLevel3Route,
  ManagementDocsLevel4Route,
  CalibrationEquipmentsRoute,
  CalibrationServiceRequestRoute,
  EquipmentForCalibrationRoute,
  JobAllocationRoute,
  CalibrationConductRoute,
  CalibrationConductInsideRoute,
  CalibrationConductOutsideRoute,
  ReviewDataRoute,
  CertificatePreparationRoute,
  CalibrationCertificatesRoute,
  CalibrationNablScopeRoute,
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
  EmployeeListRoute,
  EmployeeSelectionRoute,
  RequiredCompetencyMatrixRoute,
  ActualCompetencyMatrixRoute,
  RolesResponsibilitiesRoute,
  AuthoritiesRoute,
  CustomerComplaintsRecordsRoute,
  CustomerFeedbackRoute,
  FeedbackEvaluationRoute,
  EquipmentBreakdownRegisterRoute,
  MaintenanceScheduleRoute,
  CalibrationScheduleRoute,
  EquipmentsForIqcRoute,
  NonconformingWorkRecordsRoute,
  NcWorkEvaluationActionsRoute,
  NcWorkCorrectiveActionRoute,
  ListOfObjectivesRoute,
  RiskAnalysisRoute,
  ImprovementRoute,
  ExternallySupplierListRoute,
  SupplierEvaluationRoute,
  ListOfConsumablesRoute,
  CrmListRoute,
} from '@/routes/routeElements'

export default function App() {
  useEnterTogglesCheckbox()
  return (
    <BrowserRouter>
      <RoutePersistence />
      <Routes>
        <Route element={<PublicSiteLayout />}>
          <Route path="home" element={<PublicHomePage />} />
          <Route path="about" element={<Navigate to="/home#about" replace />} />
          <Route path="testing" element={<Navigate to="/home" replace />} />
          <Route path="calibration" element={<Navigate to="/home" replace />} />
          <Route path="resources" element={<Navigate to="/home" replace />} />
          <Route path="news" element={<Navigate to="/home" replace />} />
          <Route path="contact" element={<Navigate to="/home#contact" replace />} />
          <Route path="auth" element={<AuthPage />} />
        </Route>

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
          <Route
            path="masters/iqc"
            element={<Navigate to="/equipment-management/iqc" replace />}
          />

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

          {/* Personnel Management (ISO 17025 §6.2) */}
          <Route path="personnel" element={<Navigate to="/personnel/employees" replace />} />
          <Route path="personnel/employees" element={<EmployeeListRoute />} />
          <Route path="personnel/selection" element={<EmployeeSelectionRoute />} />
          <Route
            path="personnel/required-competency-matrix"
            element={<RequiredCompetencyMatrixRoute />}
          />
          <Route
            path="personnel/actual-competency-matrix"
            element={<ActualCompetencyMatrixRoute />}
          />
          <Route
            path="personnel/roles-responsibilities"
            element={<RolesResponsibilitiesRoute />}
          />
          <Route path="personnel/authorities" element={<AuthoritiesRoute />} />

          {/* General Requirements (ISO 17025 related) */}
          <Route
            path="general-requirements"
            element={<Navigate to="/general-requirements/list-of-objectives" replace />}
          />
          <Route
            path="general-requirements/list-of-objectives"
            element={<ListOfObjectivesRoute />}
          />
          <Route path="general-requirements/risk-analysis" element={<RiskAnalysisRoute />} />
          <Route path="general-requirements/improvement" element={<ImprovementRoute />} />

          {/* Externally Providers (ISO 17025 §6.6) */}
          <Route
            path="externally-providers"
            element={<Navigate to="/externally-providers/supplier-list" replace />}
          />
          <Route
            path="externally-providers/supplier-list"
            element={<ExternallySupplierListRoute />}
          />
          <Route
            path="externally-providers/supplier-evaluation"
            element={<SupplierEvaluationRoute />}
          />
          <Route
            path="externally-providers/list-of-consumables"
            element={<ListOfConsumablesRoute />}
          />

          {/* Complaints Management (ISO 17025 §7.9) */}
          <Route
            path="complaints"
            element={<Navigate to="/complaints/customer-complaints" replace />}
          />
          <Route
            path="complaints/customer-complaints"
            element={<CustomerComplaintsRecordsRoute />}
          />
          <Route
            path="complaints/customer-feedback"
            element={<CustomerFeedbackRoute />}
          />
          <Route
            path="complaints/feedback-evaluation"
            element={<FeedbackEvaluationRoute />}
          />

          {/* Non Conforming Work (ISO 17025 §7.10) */}
          <Route
            path="nonconforming-work"
            element={<Navigate to="/nonconforming-work/records" replace />}
          />
          <Route
            path="nonconforming-work/records"
            element={<NonconformingWorkRecordsRoute />}
          />
          <Route
            path="nonconforming-work/evaluation-actions"
            element={<NcWorkEvaluationActionsRoute />}
          />
          <Route
            path="nonconforming-work/corrective-action"
            element={<NcWorkCorrectiveActionRoute />}
          />

          {/* Equipment Management (ISO 17025 §6.4) */}
          <Route
            path="equipment-management"
            element={<Navigate to="/equipment-management/iqc" replace />}
          />
          <Route path="equipment-management/iqc" element={<EquipmentsForIqcRoute />} />
          <Route path="equipment-management/crm-list" element={<CrmListRoute />} />
          <Route
            path="equipment-management/maintenance-schedule"
            element={<MaintenanceScheduleRoute />}
          />
          <Route
            path="equipment-management/calibration-schedule"
            element={<CalibrationScheduleRoute />}
          />
          <Route
            path="equipment-management/breakdown-register"
            element={<EquipmentBreakdownRegisterRoute />}
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
          <Route path="calibration/nabl-scope" element={<CalibrationNablScopeRoute />} />
          <Route
            path="calibration/equipment-for-calibration"
            element={<EquipmentForCalibrationRoute />}
          />
          <Route
            path="calibration/masters-for-iqc"
            element={<Navigate to="/equipment-management/iqc" replace />}
          />

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
