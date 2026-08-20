import type { ElementType } from 'react'
import {
  FileSignature,
  FlaskConical,
  Users,
  TestTube,
  ShieldCheck,
  Shield,
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  Wrench,
  Gauge,
  Wallet,
  Layers3,
  FolderOpen,
  FileText,
  Package,
  Receipt,
  ShoppingCart,
  FileSearch,
  GraduationCap,
  Target,
  CalendarDays,
  ClipboardPen,
  UserRoundCheck,
  ListChecks,
  Award,
  UsersRound,
  IdCard,
  UserCheck,
  Grid3x3,
  Briefcase,
  MessageSquareWarning,
  MessagesSquare,
  Star,
  HardDrive,
  AlertTriangle,
  CircleAlert,
  Scale,
  RefreshCw,
  CalendarClock,
  BookMarked,
  ListTodo,
  Truck,
  Building2,
  BadgeCheck,
  TrendingUp,
} from 'lucide-react'
import {
  RESULT_VALIDATION_MODULES,
  resultValidationModulePath,
} from '@/features/quality/result-validation/resultValidationModules'

/** Sidebar navigation. Module Access catalog is generated from this tree. */
export interface NavItem {
  label: string
  to?: string
  icon: ElementType
  clause?: string
  children?: NavItem[]
  requiredDesignations?: string[]
}

export interface NavSection {
  title: string
  clause: string
  icon: ElementType
  items: NavItem[]
}

export const RESULT_VALIDATION_NAV: NavItem = {
  label: 'Validating the Results',
  icon: ClipboardCheck,
  clause: '7.7',
  children: RESULT_VALIDATION_MODULES.map((module) => ({
    label: module.label,
    to: resultValidationModulePath(module.slug),
    icon: ClipboardCheck,
    clause: module.clause,
  })),
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Management Documentation',
    clause: 'management-documentation',
    icon: FolderOpen,
    items: [
      {
        label: 'Master Document',
        icon: FolderOpen,
        clause: 'master-document',
        children: [
          {
            label: 'Level 1 Documents',
            to: '/management-docs/level-1',
            icon: FileText,
            clause: 'Level 1',
          },
          {
            label: 'Level 2 Documents',
            to: '/management-docs/level-2',
            icon: FileText,
            clause: 'Level 2',
          },
          {
            label: 'Level 3 Documents',
            to: '/management-docs/level-3',
            icon: FileText,
            clause: 'Level 3',
          },
          {
            label: 'Level 4 Documents',
            to: '/management-docs/level-4',
            icon: FileText,
            clause: 'Level 4',
          },
        ],
      },
      {
        label: 'General Requirements',
        icon: BookMarked,
        clause: 'general-requirements',
        children: [
          {
            label: 'List of Objectives',
            to: '/general-requirements/list-of-objectives',
            icon: ListTodo,
            clause: '8.2',
          },
          {
            label: 'Risk Analysis',
            to: '/general-requirements/risk-analysis',
            icon: AlertTriangle,
            clause: '8.5',
          },
          {
            label: 'Improvement',
            to: '/general-requirements/improvement',
            icon: TrendingUp,
            clause: '8.6',
          },
        ],
      },
      {
        label: 'Audit & MRM Management',
        icon: FileSearch,
        clause: 'audit-mrm-management',
        children: [
          {
            label: 'Audit Plan',
            to: '/audit-mrm/audit-plan',
            icon: ClipboardList,
            clause: 'audit',
          },
          {
            label: 'Audit Checklist',
            to: '/audit-mrm/audit-checklist',
            icon: ClipboardCheck,
            clause: 'audit',
          },
          {
            label: 'Audit Summary',
            to: '/audit-mrm/audit-summary',
            icon: FileText,
            clause: 'audit',
          },
          {
            label: 'Non Conformities',
            to: '/audit-mrm/non-conformities',
            icon: ShieldCheck,
            clause: 'audit',
          },
          {
            label: 'MRM Plan & Agenda',
            to: '/audit-mrm/mrm-agenda',
            icon: BookOpen,
            clause: 'mrm',
          },
          {
            label: 'Management Review Meeting',
            to: '/audit-mrm/management-review-meeting',
            icon: Users,
            clause: 'mrm',
          },
        ],
      },
      {
        label: 'Personnel Management',
        icon: UsersRound,
        clause: 'personnel-management',
        children: [
          {
            label: 'List of Employees with All Details',
            to: '/personnel/employees',
            icon: IdCard,
            clause: '6.2',
          },
          {
            label: 'Selection of Employee',
            to: '/personnel/selection',
            icon: UserCheck,
            clause: '6.2',
          },
          {
            label: 'Required Competency Matrix',
            to: '/personnel/required-competency-matrix',
            icon: ListChecks,
            clause: '6.2',
          },
          {
            label: 'Actual Competency Matrix',
            to: '/personnel/actual-competency-matrix',
            icon: Grid3x3,
            clause: '6.2',
          },
          {
            label: 'Roles & Responsibilities',
            to: '/personnel/roles-responsibilities',
            icon: Briefcase,
            clause: '6.2',
          },
          {
            label: 'Authorities',
            to: '/personnel/authorities',
            icon: Shield,
            clause: '6.2',
          },
        ],
      },
      {
        label: 'Complaints Management',
        icon: MessageSquareWarning,
        clause: 'complaints-management',
        children: [
          {
            label: 'Customer Complaints Records',
            to: '/complaints/customer-complaints',
            icon: MessagesSquare,
            clause: '7.9',
          },
          {
            label: 'Customer Feedback',
            to: '/complaints/customer-feedback',
            icon: Star,
            clause: '7.9',
          },
          {
            label: 'Feedback Evaluation',
            to: '/complaints/feedback-evaluation',
            icon: ClipboardPen,
            clause: '7.9',
          },
        ],
      },
      {
        label: 'Non Conforming Work',
        icon: CircleAlert,
        clause: 'nonconforming-work',
        children: [
          {
            label: 'Nonconforming Work Records',
            to: '/nonconforming-work/records',
            icon: ClipboardList,
            clause: '7.10.2',
          },
          {
            label: 'Evaluation, Actions & Decisions',
            to: '/nonconforming-work/evaluation-actions',
            icon: Scale,
            clause: '7.10.1 b–f',
          },
          {
            label: 'Corrective Action',
            to: '/nonconforming-work/corrective-action',
            icon: RefreshCw,
            clause: '7.10.3',
          },
        ],
      },
      {
        label: 'Externally Providers',
        icon: Truck,
        clause: 'externally-providers',
        children: [
          {
            label: 'Externally Supplier List',
            to: '/externally-providers/supplier-list',
            icon: Building2,
            clause: '6.6',
          },
          {
            label: 'Supplier Evaluation',
            to: '/externally-providers/supplier-evaluation',
            icon: BadgeCheck,
            clause: '6.6',
          },
          {
            label: 'List of Consumables',
            to: '/externally-providers/list-of-consumables',
            icon: Package,
            clause: '6.6',
          },
        ],
      },
      {
        label: 'Training Management',
        icon: GraduationCap,
        clause: 'training-management',
        children: [
          {
            label: 'Competency Matrix',
            to: '/training/competency-matrix',
            icon: ListChecks,
            clause: '6.2',
          },
          {
            label: 'Training Need Identification',
            to: '/training/need-identification',
            icon: Target,
            clause: '6.2',
          },
          {
            label: 'Training Plan',
            to: '/training/plan',
            icon: ClipboardList,
            clause: '6.2',
          },
          {
            label: 'Training Calendar',
            to: '/training/calendar',
            icon: CalendarDays,
            clause: '6.2',
          },
          {
            label: 'Training Register',
            to: '/training/register',
            icon: BookOpen,
            clause: '6.2',
          },
          {
            label: 'Training Evaluation',
            to: '/training/evaluation',
            icon: ClipboardPen,
            clause: '6.2',
          },
          {
            label: 'Induction Training',
            to: '/training/induction',
            icon: UserRoundCheck,
            clause: '6.2',
          },
          {
            label: 'Effectiveness Review',
            to: '/training/effectiveness-review',
            icon: Award,
            clause: '6.2',
          },
        ],
      },
    ],
  },
  {
    title: 'Equipment Management',
    clause: 'equipment-management',
    icon: HardDrive,
    items: [
      {
        label: 'Master Equipment Calibration',
        to: '/calibration/equipment-for-calibration',
        icon: Gauge,
        clause: '6.4',
      },
      {
        label: 'Master Equipment Testing',
        to: '/masters/equipment',
        icon: Wrench,
        clause: '6.4',
      },
      {
        label: 'Equipments for IQC',
        to: '/equipment-management/iqc',
        icon: ClipboardCheck,
        clause: '6.4',
      },
      {
        label: 'List of CRM',
        to: '/equipment-management/crm-list',
        icon: FlaskConical,
        clause: '6.4',
      },
      {
        label: 'Maintenance Schedule',
        to: '/equipment-management/maintenance-schedule',
        icon: CalendarClock,
        clause: '6.4',
      },
      {
        label: 'Calibration Schedule',
        to: '/equipment-management/calibration-schedule',
        icon: CalendarDays,
        clause: '6.4',
      },
      {
        label: 'Equipment Breakdown Register',
        to: '/equipment-management/breakdown-register',
        icon: AlertTriangle,
        clause: '6.4',
      },
    ],
  },
  {
    title: 'Testing LIMS',
    clause: 'testing-lims',
    icon: FlaskConical,
    items: [
      {
        label: 'Sample Handling',
        icon: FlaskConical,
        clause: '7.4',
        children: [
          {
            label: 'Sample Receiving',
            to: '/samples/receiving',
            icon: FlaskConical,
            clause: '7.4',
            requiredDesignations: ['Laboratory Director', 'Sample Coordinator'],
          },
          {
            label: 'Sample Allocation',
            to: '/samples/allocation',
            icon: FlaskConical,
            clause: '7.4',
            requiredDesignations: ['Laboratory Director', 'Sample Incharge'],
          },
          {
            label: 'Test Allocation',
            to: '/samples/test-allocation',
            icon: FlaskConical,
            clause: '7.4',
            requiredDesignations: ['Laboratory Director', 'Technical Manager'],
          },
          { label: 'Sample Under Testing', to: '/samples/under-testing', icon: FlaskConical, clause: '7.4' },
          { label: 'Results Under Review', to: '/samples/results-review', icon: FlaskConical, clause: '7.4' },
          {
            label: 'Test Report Preparation',
            to: '/samples/report-preparation',
            icon: FlaskConical,
            clause: '7.4',
          },
          {
            label: 'Issued Test Report',
            to: '/samples/completed',
            icon: FlaskConical,
            clause: '7.8',
          },
          {
            label: 'Retain & Disposed Sample',
            to: '/samples/retain-disposed',
            icon: FlaskConical,
            clause: '7.4',
          },
        ],
      },
      {
        label: 'Consent Letter',
        to: '/masters/consent-letter',
        icon: FileSignature,
        clause: '7.4',
      },
      RESULT_VALIDATION_NAV,
      { label: 'NABL Scope', to: '/masters/nabl-scope', icon: ShieldCheck },
      { label: 'Test Parameter', to: '/masters/test-parameter', icon: TestTube },
    ],
  },
  {
    title: 'Calibration LIMS',
    clause: 'calibration-lims',
    icon: Gauge,
    items: [
      {
        label: 'Calibration Handling',
        icon: Gauge,
        clause: '7.7',
        children: [
          {
            label: 'Service Request',
            to: '/calibration/handling/service-request',
            icon: ClipboardList,
            clause: '7.7',
          },
          {
            label: 'Job Allocation',
            to: '/calibration/handling/job-allocation',
            icon: Package,
            clause: '7.7',
          },
          {
            label: 'Calibration Conduct Inside',
            to: '/calibration/handling/calibration-conduct-inside',
            icon: Gauge,
            clause: '7.7',
          },
          {
            label: 'Calibration Conduct Outside',
            to: '/calibration/handling/calibration-conduct-outside',
            icon: Gauge,
            clause: '7.7',
          },
          {
            label: 'Review Data',
            to: '/calibration/handling/review-data',
            icon: ClipboardList,
            clause: '7.7',
          },
          {
            label: 'Certificate Preparation',
            to: '/calibration/handling/certificate-preparation',
            icon: FileText,
            clause: '7.7',
          },
        ],
      },
      {
        label: 'Calibration Equipments',
        to: '/calibration/equipments',
        icon: Wrench,
        clause: '6.4',
      },
      {
        label: 'NABL Scope',
        to: '/calibration/nabl-scope',
        icon: ShieldCheck,
        clause: '6.4',
      },
    ],
  },
  {
    title: 'Finance Management',
    clause: 'finance-management',
    icon: Wallet,
    items: [
      {
        label: 'Sale',
        icon: ShoppingCart,
        clause: 'sale',
        children: [
          {
            label: 'Quotation',
            to: '/finance/sale/quotation',
            icon: FileText,
            clause: 'sale',
          },
          {
            label: 'Proforma Invoice',
            to: '/finance/sale/proforma-invoice',
            icon: FileText,
            clause: 'sale',
          },
          {
            label: 'Invoice',
            to: '/finance/sale/invoice',
            icon: Receipt,
            clause: 'sale',
          },
          {
            label: 'Credit Note',
            to: '/finance/sale/credit-note',
            icon: FileText,
            clause: 'sale',
          },
          {
            label: 'Payment Receipt',
            to: '/finance/sale/payment-receipt',
            icon: Receipt,
            clause: 'sale',
          },
        ],
      },
    ],
  },
  {
    title: 'Master Managements',
    clause: 'master-managements',
    icon: Layers3,
    items: [
      { label: 'Client Master', to: '/masters/clients', icon: Users },
      { label: 'IS Code Master', to: '/masters/is-codes', icon: BookOpen },
      {
        label: 'Product & Services',
        to: '/masters/product-services',
        icon: Package,
      },
    ],
  },
]

export type FlattenedNavModule = {
  key: string
  label: string
  section: string
}

/** Leaf (and any parent with a route) modules in sidebar order. */
export function flattenNavModules(): FlattenedNavModule[] {
  const out: FlattenedNavModule[] = []
  const seen = new Set<string>()

  const walk = (items: NavItem[], section: string) => {
    for (const item of items) {
      const to = item.to?.trim()
      if (to && !seen.has(to)) {
        seen.add(to)
        out.push({ key: to, label: item.label, section })
      }
      if (item.children?.length) walk(item.children, section)
    }
  }

  for (const section of NAV_SECTIONS) {
    walk(section.items, section.title)
  }

  return out
}
