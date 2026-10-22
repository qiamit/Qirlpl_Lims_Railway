import { lazy } from 'react'
import GlobalLayout from '@/components/layout/GlobalLayout'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { RequireLaboratoryDirector } from '@/components/auth/RequireLaboratoryDirector'
import { RequireSampleReceivingAccess } from '@/components/auth/RequireSampleReceivingAccess'
import { RequireSampleAllocationAccess } from '@/components/auth/RequireSampleAllocationAccess'
import { RequireTestAllocationAccess } from '@/components/auth/RequireTestAllocationAccess'


const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const SamplesPage = lazy(() => import('@/features/samples').then((m) => ({ default: m.SamplesPage })))
const SampleReceivingMasterPage = lazy(() => import('@/features/sample-handling/receiving/SampleReceivingMasterPage'))
const SampleAllocationMasterPage = lazy(() => import('@/features/sample-handling/allocation/SampleAllocationMasterPage'))
const TestAllocationMasterPage = lazy(() => import('@/features/sample-handling/test-allocation/TestAllocationMasterPage'))
const SampleUnderTestingMasterPage = lazy(() => import('@/features/sample-handling/sample-under-testing/SampleUnderTestingMasterPage'))
const ResultsUnderReviewMasterPage = lazy(() => import('@/features/sample-handling/results-under-review/ResultsUnderReviewMasterPage'))
const TestReportPreparationMasterPage = lazy(() => import('@/features/sample-handling/report-preparation/TestReportPreparationMasterPage'))
const CompletedResultsMasterPage = lazy(() => import('@/features/sample-handling/completed-results/CompletedResultsMasterPage'))
const RetainDisposedMasterPage = lazy(() => import('@/features/sample-handling/retain-disposed/RetainDisposedMasterPage'))
const ResultValidationPage = lazy(() =>
  import('@/features/quality/ResultValidationPage').then((m) => ({ default: m.default })),
)
const LabSettingsPage = lazy(() => import('@/features/settings/LabSettingsPage'))
const UserManagementPage = lazy(() => import('@/features/settings/UserManagementPage'))
const ModuleAccessPage = lazy(() => import('@/features/settings/ModuleAccessPage'))
const AiSettingsPage = lazy(() => import('@/features/settings/AiSettingsPage'))
const HelpPage = lazy(() => import('@/features/help/HelpPage'))
const ContactUsPage = lazy(() => import('@/features/contact/ContactUsPage'))
const ClientsPage = lazy(() => import('@/features/masters/ClientsPage'))
const IsCodesPage = lazy(() => import('@/features/masters/IsCodesPage'))
const ConsentLetterPage = lazy(() => import('@/features/masters/ConsentLetterPage'))
const ProductServicesPage = lazy(() => import('@/features/masters/ProductServicesPage'))
const TestParameterPage = lazy(() => import('@/features/masters/TestParameterPage'))
const EquipmentPage = lazy(() => import('@/features/masters/EquipmentPage'))
const IqcPage = lazy(() => import('@/features/masters/IqcPage'))
const ManagementDocumentsMasterPage = lazy(() => import('@/features/management-docs/ManagementDocumentsMasterPage'))
const CalibrationEquipmentsPage = lazy(() => import('@/features/calibration/equipments/CalibrationEquipmentsPage'))
const CalibrationHandlingPage = lazy(() => import('@/features/calibration/handling/CalibrationHandlingPage'))
const CalibrationServiceRequestPage = lazy(() => import('@/features/calibration/handling/CalibrationServiceRequestPage'))
const EquipmentForCalibrationPage = lazy(() => import('@/features/calibration/equipment-for-calibration/EquipmentForCalibrationPage'))
const CalibrationNablScopePage = lazy(() => import('@/features/calibration/nabl-scope/CalibrationNablScopePage'))
const MastersForIqcPage = lazy(() => import('@/features/calibration/equipment-for-calibration/MastersForIqcPage'))
const JobAllocationPage = lazy(() => import('@/features/calibration/handling/job-allocation/JobAllocationPage'))
const CalibrationConductPage = lazy(() => import('@/features/calibration/handling/calibration-conduct/CalibrationConductPage'))
const CalibrationConductInsidePage = lazy(() => import('@/features/calibration/handling/calibration-conduct-inside/CalibrationConductInsidePage'))
const CalibrationConductOutsidePage = lazy(() => import('@/features/calibration/handling/calibration-conduct-outside/CalibrationConductOutsidePage'))
const ReviewDataPage = lazy(() => import('@/features/calibration/handling/review-data/ReviewDataPage'))
const CertificatePreparationPage = lazy(() => import('@/features/calibration/handling/certificate-preparation/CertificatePreparationPage'))
const CalibrationCertificatesPage = lazy(() => import('@/features/calibration/handling/certificates/CalibrationCertificatesPage'))
const QuotationPage = lazy(() => import('@/features/finance/sale/quotation/QuotationPage'))
const ProformaInvoicePage = lazy(() => import('@/features/finance/sale/proforma-invoice/ProformaInvoicePage'))
const InvoicePage = lazy(() => import('@/features/finance/sale/invoice/InvoicePage'))
const CreditNotePage = lazy(() => import('@/features/finance/sale/credit-note/CreditNotePage'))
const PaymentReceiptPage = lazy(() => import('@/features/finance/sale/payment-receipt/PaymentReceiptPage'))
const AuditPlanPage = lazy(() => import('@/features/audit-mrm/audit-plan/AuditPlanPage'))
const AuditChecklistPage = lazy(() => import('@/features/audit-mrm/audit-checklist/AuditChecklistPage'))
const AuditSummaryPage = lazy(() => import('@/features/audit-mrm/audit-summary/AuditSummaryPage'))
const NonConformitiesPage = lazy(() => import('@/features/audit-mrm/non-conformities/NonConformitiesPage'))
const MrmAgendaPage = lazy(() => import('@/features/audit-mrm/mrm-agenda/MrmAgendaPage'))
const ManagementReviewMeetingPage = lazy(() => import('@/features/audit-mrm/management-review-meeting/ManagementReviewMeetingPage'))
const CompetencyMatrixPage = lazy(() => import('@/features/training/competency-matrix/CompetencyMatrixPage'))
const TrainingNeedIdentificationPage = lazy(() => import('@/features/training/need-identification/TrainingNeedIdentificationPage'))
const TrainingPlanPage = lazy(() => import('@/features/training/plan/TrainingPlanPage'))
const TrainingCalendarPage = lazy(() => import('@/features/training/calendar/TrainingCalendarPage'))
const TrainingRegisterPage = lazy(() => import('@/features/training/register/TrainingRegisterPage'))
const TrainingEvaluationPage = lazy(() => import('@/features/training/evaluation/TrainingEvaluationPage'))
const InductionTrainingPage = lazy(() => import('@/features/training/induction/InductionTrainingPage'))
const EffectivenessReviewPage = lazy(() => import('@/features/training/effectiveness-review/EffectivenessReviewPage'))
const EmployeeListPage = lazy(() => import('@/features/personnel/employees/EmployeeListPage'))
const EmployeeSelectionPage = lazy(() => import('@/features/personnel/selection/EmployeeSelectionPage'))
const RequiredCompetencyMatrixPage = lazy(() => import('@/features/personnel/required-competency-matrix/RequiredCompetencyMatrixPage'))
const ActualCompetencyMatrixPage = lazy(() => import('@/features/personnel/actual-competency-matrix/ActualCompetencyMatrixPage'))
const RolesResponsibilitiesPage = lazy(() => import('@/features/personnel/roles-responsibilities/RolesResponsibilitiesPage'))
const AuthoritiesPage = lazy(() => import('@/features/personnel/authorities/AuthoritiesPage'))
const CustomerComplaintsRecordsPage = lazy(() => import('@/features/complaints/customer-complaints/CustomerComplaintsRecordsPage'))
const CustomerFeedbackPage = lazy(() => import('@/features/complaints/customer-feedback/CustomerFeedbackPage'))
const FeedbackEvaluationPage = lazy(() => import('@/features/complaints/feedback-evaluation/FeedbackEvaluationPage'))
const EquipmentBreakdownRegisterPage = lazy(() => import('@/features/equipment-management/breakdown-register/EquipmentBreakdownRegisterPage'))
const EquipmentsForIqcPage = lazy(() => import('@/features/equipment-management/iqc/EquipmentsForIqcPage'))
const MaintenanceSchedulePage = lazy(() => import('@/features/equipment-management/maintenance-schedule/MaintenanceSchedulePage'))
const CalibrationSchedulePage = lazy(() => import('@/features/equipment-management/calibration-schedule/CalibrationSchedulePage'))
const NonconformingWorkRecordsPage = lazy(() => import('@/features/nonconforming-work/records/NonconformingWorkRecordsPage'))
const NcWorkEvaluationActionsPage = lazy(() => import('@/features/nonconforming-work/evaluation-actions/NcWorkEvaluationActionsPage'))
const NcWorkCorrectiveActionPage = lazy(() => import('@/features/nonconforming-work/corrective-action/NcWorkCorrectiveActionPage'))
const ListOfObjectivesPage = lazy(() => import('@/features/general-requirements/list-of-objectives/ListOfObjectivesPage'))
const RiskAnalysisPage = lazy(() => import('@/features/general-requirements/risk-analysis/RiskAnalysisPage'))
const ImpartialityRiskRegisterPage = lazy(() => import('@/features/general-requirements/impartiality/ImpartialityRiskRegisterPage'))
const ConfidentialityRecordsPage = lazy(() => import('@/features/general-requirements/confidentiality/ConfidentialityRecordsPage'))
const DeclarationsPage = lazy(() => import('@/features/personnel/declarations/DeclarationsPage'))
const AuditTrailPage = lazy(() => import('@/features/audit-trail/AuditTrailPage'))
const RecycleBinPage = lazy(() => import('@/features/recycle-bin/RecycleBinPage'))
const AuditCoveragePage = lazy(() => import('@/features/audit-mrm/audit-coverage/AuditCoveragePage'))
const OrganisationChartPage = lazy(() => import('@/features/general-requirements/organisation-chart/OrganisationChartPage'))
const ModuleAccessEnforcementPage = lazy(() => import('@/features/settings/module-access-enforcement/ModuleAccessEnforcementPage'))
const AuthorizationMatrixPage = lazy(() => import('@/features/personnel/competence/AuthorizationMatrixPage'))
const EmployeeDossierPage = lazy(() => import('@/features/personnel/competence/EmployeeDossierPage'))
const CompetenceRequirementsPage = lazy(() => import('@/features/personnel/competence/CompetenceRequirementsPage'))
const CompetenceMonitoringPage = lazy(() => import('@/features/personnel/competence/CompetenceMonitoringPage'))
const TrainingRecordsPage = lazy(() => import('@/features/personnel/competence/TrainingRecordsPage'))
const RetentionSchedulePage = lazy(() => import('@/features/records-retention/RetentionSchedulePage'))
const MyDocumentAcknowledgementsPage = lazy(() => import('@/features/management-docs/MyDocumentAcknowledgementsPage'))
const DecisionRulesPage = lazy(() => import('@/features/masters/decision-rules/DecisionRulesPage'))
const PtPlanPage = lazy(() => import('@/features/proficiency-testing/PtPlanPage'))
const ControlChartsPage = lazy(() => import('@/features/quality/control-charts/ControlChartsPage'))
const PtParticipationsPage = lazy(() => import('@/features/proficiency-testing/PtParticipationsPage'))
const MethodVerificationsPage = lazy(() => import('@/features/method-validation/MethodVerificationsPage'))
const ScopeVerificationStatusPage = lazy(() => import('@/features/method-validation/ScopeVerificationStatusPage'))
const SoftwareChangesPage = lazy(() => import('@/features/lims-validation/SoftwareChangesPage'))
const ApprovedSupplierListPage = lazy(() => import('@/features/externally-providers/approved-suppliers/ApprovedSupplierListPage'))
const SupplierEvaluationsPage = lazy(() => import('@/features/externally-providers/evaluations/SupplierEvaluationsPage'))
const ReceiptInspectionPage = lazy(() => import('@/features/externally-providers/receipt-inspection/ReceiptInspectionPage'))
const SubcontractingRegisterPage = lazy(() => import('@/features/externally-providers/subcontracting/SubcontractingRegisterPage'))
const ValidationRunsPage = lazy(() => import('@/features/lims-validation/ValidationRunsPage'))
const ItIncidentsPage = lazy(() => import('@/features/lims-validation/ItIncidentsPage'))
const BackupRestoreTestsPage = lazy(() => import('@/features/lims-validation/BackupRestoreTestsPage'))
const LabAreasPage = lazy(() => import('@/features/environment/AreasPage'))
const EnvironmentLogPage = lazy(() => import('@/features/environment/EnvironmentLogPage'))
const AccessLogPage = lazy(() => import('@/features/environment/AccessLogPage'))
const HousekeepingLogPage = lazy(() => import('@/features/environment/HousekeepingLogPage'))
const ImprovementPage = lazy(() => import('@/features/general-requirements/improvement/ImprovementPage'))
const ExternallySupplierListPage = lazy(() => import('@/features/externally-providers/supplier-list/ExternallySupplierListPage'))
const SupplierEvaluationPage = lazy(() => import('@/features/externally-providers/supplier-evaluation/SupplierEvaluationPage'))
const ListOfConsumablesPage = lazy(() => import('@/features/externally-providers/list-of-consumables/ListOfConsumablesPage'))
const CrmListPage = lazy(() => import('@/features/equipment-management/crm-list/CrmListPage'))

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

export function ModuleAccessRoute() {
  return (
    <RequireLaboratoryDirector>
      <ModuleAccessPage />
    </RequireLaboratoryDirector>
  )
}

export function ModuleAccessEnforcementRoute() {
  return (
    <RequireLaboratoryDirector>
      <ModuleAccessEnforcementPage />
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

export function HelpRoute() {
  return <HelpPage />
}

export function ContactUsRoute() {
  return <ContactUsPage />
}

export function ManagementDocsLevel1Route() {
  return <ManagementDocumentsMasterPage level={1} />
}

export function ManagementDocsLevel2Route() {
  return <ManagementDocumentsMasterPage level={2} />
}

export function ManagementDocsLevel3Route() {
  return <ManagementDocumentsMasterPage level={3} />
}

export function ManagementDocsLevel4Route() {
  return <ManagementDocumentsMasterPage level={4} />
}

export function CalibrationEquipmentsRoute() {
  return <CalibrationEquipmentsPage />
}

export function CalibrationHandlingRoute() {
  return <CalibrationHandlingPage />
}

export function CalibrationServiceRequestRoute() {
  return <CalibrationServiceRequestPage />
}

export function JobAllocationRoute() {
  return <JobAllocationPage />
}

export function CalibrationConductRoute() {
  return <CalibrationConductPage />
}

export function CalibrationConductInsideRoute() {
  return <CalibrationConductInsidePage />
}

export function CalibrationConductOutsideRoute() {
  return <CalibrationConductOutsidePage />
}

export function ReviewDataRoute() {
  return <ReviewDataPage />
}

export function CertificatePreparationRoute() {
  return <CertificatePreparationPage />
}

export function CalibrationCertificatesRoute() {
  return <CalibrationCertificatesPage />
}

export function EquipmentForCalibrationRoute() {
  return <EquipmentForCalibrationPage />
}

export function MastersForIqcRoute() {
  return <MastersForIqcPage />
}

export function CalibrationNablScopeRoute() {
  return <CalibrationNablScopePage />
}

export function SaleQuotationRoute() {
  return <QuotationPage />
}

export function SaleProformaInvoiceRoute() {
  return <ProformaInvoicePage />
}

export function SaleInvoiceRoute() {
  return <InvoicePage />
}

export function SaleCreditNoteRoute() {
  return <CreditNotePage />
}

export function SalePaymentReceiptRoute() {
  return <PaymentReceiptPage />
}

export function AuditPlanRoute() {
  return <AuditPlanPage />
}

export function AuditChecklistRoute() {
  return <AuditChecklistPage />
}

export function AuditSummaryRoute() {
  return <AuditSummaryPage />
}

export function NonConformitiesRoute() {
  return <NonConformitiesPage />
}

export function MrmAgendaRoute() {
  return <MrmAgendaPage />
}

export function ManagementReviewMeetingRoute() {
  return <ManagementReviewMeetingPage />
}

export function CompetencyMatrixRoute() {
  return <CompetencyMatrixPage />
}

export function TrainingNeedIdentificationRoute() {
  return <TrainingNeedIdentificationPage />
}

export function TrainingPlanRoute() {
  return <TrainingPlanPage />
}

export function TrainingCalendarRoute() {
  return <TrainingCalendarPage />
}

export function TrainingRegisterRoute() {
  return <TrainingRegisterPage />
}

export function TrainingEvaluationRoute() {
  return <TrainingEvaluationPage />
}

export function InductionTrainingRoute() {
  return <InductionTrainingPage />
}

export function EffectivenessReviewRoute() {
  return <EffectivenessReviewPage />
}

export function EmployeeListRoute() {
  return <EmployeeListPage />
}

export function EmployeeSelectionRoute() {
  return <EmployeeSelectionPage />
}

export function RequiredCompetencyMatrixRoute() {
  return <RequiredCompetencyMatrixPage />
}

export function ActualCompetencyMatrixRoute() {
  return <ActualCompetencyMatrixPage />
}

export function RolesResponsibilitiesRoute() {
  return <RolesResponsibilitiesPage />
}

export function AuthoritiesRoute() {
  return <AuthoritiesPage />
}

export function CustomerComplaintsRecordsRoute() {
  return <CustomerComplaintsRecordsPage />
}

export function CustomerFeedbackRoute() {
  return <CustomerFeedbackPage />
}

export function FeedbackEvaluationRoute() {
  return <FeedbackEvaluationPage />
}

export function EquipmentBreakdownRegisterRoute() {
  return <EquipmentBreakdownRegisterPage />
}

export function MaintenanceScheduleRoute() {
  return <MaintenanceSchedulePage />
}

export function CalibrationScheduleRoute() {
  return <CalibrationSchedulePage />
}

export function EquipmentsForIqcRoute() {
  return <EquipmentsForIqcPage />
}

export function NonconformingWorkRecordsRoute() {
  return <NonconformingWorkRecordsPage />
}

export function NcWorkEvaluationActionsRoute() {
  return <NcWorkEvaluationActionsPage />
}

export function NcWorkCorrectiveActionRoute() {
  return <NcWorkCorrectiveActionPage />
}

export function ListOfObjectivesRoute() {
  return <ListOfObjectivesPage />
}

export function RiskAnalysisRoute() {
  return <RiskAnalysisPage />
}

export function ImpartialityRiskRegisterRoute() {
  return <ImpartialityRiskRegisterPage />
}

export function ConfidentialityRecordsRoute() {
  return <ConfidentialityRecordsPage />
}

export function DeclarationsRoute() {
  return <DeclarationsPage />
}

export function AuditTrailRoute() {
  return <AuditTrailPage />
}

export function RecycleBinRoute() {
  return <RecycleBinPage />
}

export function AuditCoverageRoute() {
  return <AuditCoveragePage />
}

export function OrganisationChartRoute() {
  return <OrganisationChartPage />
}

export function AuthorizationMatrixRoute() {
  return <AuthorizationMatrixPage />
}

export function EmployeeDossierRoute() {
  return <EmployeeDossierPage />
}

export function CompetenceRequirementsRoute() {
  return <CompetenceRequirementsPage />
}

export function CompetenceMonitoringRoute() {
  return <CompetenceMonitoringPage />
}

export function TrainingRecordsRoute() {
  return <TrainingRecordsPage />
}

export function RetentionScheduleRoute() {
  return <RetentionSchedulePage />
}

export function MyDocumentAcknowledgementsRoute() {
  return <MyDocumentAcknowledgementsPage />
}

export function DecisionRulesRoute() {
  return <DecisionRulesPage />
}

export function PtPlanRoute() {
  return <PtPlanPage />
}

export function ControlChartsRoute() {
  return <ControlChartsPage />
}

export function PtParticipationsRoute() {
  return <PtParticipationsPage />
}

export function MethodVerificationsRoute() {
  return <MethodVerificationsPage />
}

export function ScopeVerificationStatusRoute() {
  return <ScopeVerificationStatusPage />
}

export function SoftwareChangesRoute() {
  return <SoftwareChangesPage />
}

export function ApprovedSupplierListRoute() {
  return <ApprovedSupplierListPage />
}

export function SupplierEvaluationsRoute() {
  return <SupplierEvaluationsPage />
}

export function ReceiptInspectionRoute() {
  return <ReceiptInspectionPage />
}

export function SubcontractingRegisterRoute() {
  return <SubcontractingRegisterPage />
}

export function ValidationRunsRoute() {
  return <ValidationRunsPage />
}

export function ItIncidentsRoute() {
  return <ItIncidentsPage />
}

export function BackupRestoreTestsRoute() {
  return <BackupRestoreTestsPage />
}

export function LabAreasRoute() {
  return <LabAreasPage />
}

export function EnvironmentLogRoute() {
  return <EnvironmentLogPage />
}

export function AccessLogRoute() {
  return <AccessLogPage />
}

export function HousekeepingLogRoute() {
  return <HousekeepingLogPage />
}

export function ImprovementRoute() {
  return <ImprovementPage />
}

export function ExternallySupplierListRoute() {
  return <ExternallySupplierListPage />
}

export function SupplierEvaluationRoute() {
  return <SupplierEvaluationPage />
}

export function ListOfConsumablesRoute() {
  return <ListOfConsumablesPage />
}

export function CrmListRoute() {
  return <CrmListPage />
}

export {
  DashboardPage,
  SamplesPage,
  SampleUnderTestingMasterPage,
  ResultsUnderReviewMasterPage,
  TestReportPreparationMasterPage,
  CompletedResultsMasterPage,
  RetainDisposedMasterPage,
  ResultValidationPage,
  ClientsPage,
  IsCodesPage,
  ConsentLetterPage,
  ProductServicesPage,
  TestParameterPage,
  EquipmentPage,
  IqcPage,
  CalibrationEquipmentsPage,
  CalibrationHandlingPage,
  CalibrationServiceRequestPage,
  EquipmentForCalibrationPage,
  MastersForIqcPage,
}

