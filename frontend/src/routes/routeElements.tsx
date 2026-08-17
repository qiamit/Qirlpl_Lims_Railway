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
import RetainDisposedMasterPage from '@/features/sample-handling/retain-disposed/RetainDisposedMasterPage'
import ResultValidationPage from '@/features/quality/ResultValidationPage'
import LabSettingsPage from '@/features/settings/LabSettingsPage'
import UserManagementPage from '@/features/settings/UserManagementPage'
import ModuleAccessPage from '@/features/settings/ModuleAccessPage'
import AiSettingsPage from '@/features/settings/AiSettingsPage'
import HelpPage from '@/features/help/HelpPage'
import ContactUsPage from '@/features/contact/ContactUsPage'
import ClientsPage from '@/features/masters/ClientsPage'
import IsCodesPage from '@/features/masters/IsCodesPage'
import ConsentLetterPage from '@/features/masters/ConsentLetterPage'
import ProductServicesPage from '@/features/masters/ProductServicesPage'
import TestParameterPage from '@/features/masters/TestParameterPage'
import EquipmentPage from '@/features/masters/EquipmentPage'
import IqcPage from '@/features/masters/IqcPage'
import ManagementDocumentsMasterPage from '@/features/management-docs/ManagementDocumentsMasterPage'
import CalibrationEquipmentsPage from '@/features/calibration/equipments/CalibrationEquipmentsPage'
import CalibrationHandlingPage from '@/features/calibration/handling/CalibrationHandlingPage'
import CalibrationServiceRequestPage from '@/features/calibration/handling/CalibrationServiceRequestPage'
import EquipmentForCalibrationPage from '@/features/calibration/equipment-for-calibration/EquipmentForCalibrationPage'
import CalibrationNablScopePage from '@/features/calibration/nabl-scope/CalibrationNablScopePage'
import MastersForIqcPage from '@/features/calibration/equipment-for-calibration/MastersForIqcPage'
import JobAllocationPage from '@/features/calibration/handling/job-allocation/JobAllocationPage'
import CalibrationConductPage from '@/features/calibration/handling/calibration-conduct/CalibrationConductPage'
import CalibrationConductInsidePage from '@/features/calibration/handling/calibration-conduct-inside/CalibrationConductInsidePage'
import CalibrationConductOutsidePage from '@/features/calibration/handling/calibration-conduct-outside/CalibrationConductOutsidePage'
import ReviewDataPage from '@/features/calibration/handling/review-data/ReviewDataPage'
import CertificatePreparationPage from '@/features/calibration/handling/certificate-preparation/CertificatePreparationPage'
import CalibrationCertificatesPage from '@/features/calibration/handling/certificates/CalibrationCertificatesPage'
import QuotationPage from '@/features/finance/sale/quotation/QuotationPage'
import ProformaInvoicePage from '@/features/finance/sale/proforma-invoice/ProformaInvoicePage'
import InvoicePage from '@/features/finance/sale/invoice/InvoicePage'
import CreditNotePage from '@/features/finance/sale/credit-note/CreditNotePage'
import PaymentReceiptPage from '@/features/finance/sale/payment-receipt/PaymentReceiptPage'
import AuditPlanPage from '@/features/audit-mrm/audit-plan/AuditPlanPage'
import AuditChecklistPage from '@/features/audit-mrm/audit-checklist/AuditChecklistPage'
import AuditSummaryPage from '@/features/audit-mrm/audit-summary/AuditSummaryPage'
import NonConformitiesPage from '@/features/audit-mrm/non-conformities/NonConformitiesPage'
import MrmAgendaPage from '@/features/audit-mrm/mrm-agenda/MrmAgendaPage'
import ManagementReviewMeetingPage from '@/features/audit-mrm/management-review-meeting/ManagementReviewMeetingPage'
import CompetencyMatrixPage from '@/features/training/competency-matrix/CompetencyMatrixPage'
import TrainingNeedIdentificationPage from '@/features/training/need-identification/TrainingNeedIdentificationPage'
import TrainingPlanPage from '@/features/training/plan/TrainingPlanPage'
import TrainingCalendarPage from '@/features/training/calendar/TrainingCalendarPage'
import TrainingRegisterPage from '@/features/training/register/TrainingRegisterPage'
import TrainingEvaluationPage from '@/features/training/evaluation/TrainingEvaluationPage'
import InductionTrainingPage from '@/features/training/induction/InductionTrainingPage'
import EffectivenessReviewPage from '@/features/training/effectiveness-review/EffectivenessReviewPage'
import EmployeeListPage from '@/features/personnel/employees/EmployeeListPage'
import EmployeeSelectionPage from '@/features/personnel/selection/EmployeeSelectionPage'
import RequiredCompetencyMatrixPage from '@/features/personnel/required-competency-matrix/RequiredCompetencyMatrixPage'
import ActualCompetencyMatrixPage from '@/features/personnel/actual-competency-matrix/ActualCompetencyMatrixPage'
import RolesResponsibilitiesPage from '@/features/personnel/roles-responsibilities/RolesResponsibilitiesPage'
import AuthoritiesPage from '@/features/personnel/authorities/AuthoritiesPage'
import CustomerComplaintsRecordsPage from '@/features/complaints/customer-complaints/CustomerComplaintsRecordsPage'
import CustomerFeedbackPage from '@/features/complaints/customer-feedback/CustomerFeedbackPage'
import FeedbackEvaluationPage from '@/features/complaints/feedback-evaluation/FeedbackEvaluationPage'
import EquipmentBreakdownRegisterPage from '@/features/equipment-management/breakdown-register/EquipmentBreakdownRegisterPage'
import EquipmentsForIqcPage from '@/features/equipment-management/iqc/EquipmentsForIqcPage'
import MaintenanceSchedulePage from '@/features/equipment-management/maintenance-schedule/MaintenanceSchedulePage'
import CalibrationSchedulePage from '@/features/equipment-management/calibration-schedule/CalibrationSchedulePage'
import NonconformingWorkRecordsPage from '@/features/nonconforming-work/records/NonconformingWorkRecordsPage'
import NcWorkEvaluationActionsPage from '@/features/nonconforming-work/evaluation-actions/NcWorkEvaluationActionsPage'
import NcWorkCorrectiveActionPage from '@/features/nonconforming-work/corrective-action/NcWorkCorrectiveActionPage'
import ListOfObjectivesPage from '@/features/general-requirements/list-of-objectives/ListOfObjectivesPage'
import RiskAnalysisPage from '@/features/general-requirements/risk-analysis/RiskAnalysisPage'
import ImprovementPage from '@/features/general-requirements/improvement/ImprovementPage'
import ExternallySupplierListPage from '@/features/externally-providers/supplier-list/ExternallySupplierListPage'
import SupplierEvaluationPage from '@/features/externally-providers/supplier-evaluation/SupplierEvaluationPage'
import ListOfConsumablesPage from '@/features/externally-providers/list-of-consumables/ListOfConsumablesPage'
import CrmListPage from '@/features/equipment-management/crm-list/CrmListPage'
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

export function ModuleAccessRoute() {
  return (
    <RequireLaboratoryDirector>
      <ModuleAccessPage />
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

