import { useCallback, useEffect, useMemo, useState, type ElementType } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAppDateFormat } from '@/lib/AppDateFormatProvider'
import { useAppCurrency } from '@/lib/AppCurrencyProvider'
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
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Menu,
  X,
  Settings,
  HelpCircle,
  Mail,
  LogOut,
  ChevronsRight,
  Bot,
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
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth, signOut } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { canAccessNavItem as checkNavAccess } from '@/lib/moduleAccess'
import { useModuleAccessOptional } from '@/features/settings/module-access/ModuleAccessProvider'
import { RequireModuleAccess } from '@/components/auth/RequireModuleAccess'
import {
  RESULT_VALIDATION_MODULES,
  resultValidationModulePath,
} from '@/features/quality/result-validation/resultValidationModules'
import { getBrandShortName, LAB_NAME_CHANGED_EVENT, LAB_NAME_STORAGE_KEY } from '@/features/settings/lab-settings/brandMark'

interface NavItem {
  label: string
  to?: string
  icon: ElementType
  clause?: string
  children?: NavItem[]
  requiredDesignations?: string[]
}

interface NavSection {
  title: string
  clause: string
  icon: ElementType
  items: NavItem[]
}

const formatNavLabel = (value: string) =>
  value
    .split(' ')
    .map((word) => {
      if (word.length === 0) return ''
      if (word === word.toUpperCase()) return word
      return `${word[0]?.toUpperCase() ?? ''}${word.slice(1).toLowerCase()}`
    })
    .join(' ')

function navItemAccessible(
  item: NavItem,
  canAccess: (requiredDesignations: string[] | undefined, to: string | undefined) => boolean,
): boolean {
  return canAccess(item.requiredDesignations, item.to)
}

function useNavCanAccess() {
  const moduleAccess = useModuleAccessOptional()
  const { designation, departmentName } = useAuth()
  const legacyCtx = useMemo(
    () => ({ designation: designation ?? '', departmentName: departmentName ?? '' }),
    [designation, departmentName],
  )

  return useCallback(
    (requiredDesignations: string[] | undefined, to: string | undefined) => {
      if (moduleAccess) return moduleAccess.canAccessNavItem(requiredDesignations, to)
      return checkNavAccess(requiredDesignations, to, legacyCtx)
    },
    [moduleAccess, legacyCtx],
  )
}

/** Expandable nav: starts closed; stays open until user collapses manually */
function useNavSectionOpen(initialOpen = false) {
  const [open, setOpen] = useState(initialOpen)
  const toggleOpen = () => setOpen((v) => !v)
  return { open, setOpen, toggleOpen }
}

function navItemMatchesPath(item: NavItem, pathname: string): boolean {
  if (item.to && (pathname === item.to || pathname.startsWith(`${item.to}/`))) return true
  return (item.children ?? []).some((c) => navItemMatchesPath(c, pathname))
}

function sectionContainsPath(section: NavSection, pathname: string): boolean {
  return section.items.some((item) => navItemMatchesPath(item, pathname))
}

function SidebarMainNav() {
  const location = useLocation()
  const [openSectionId, setOpenSectionId] = useState<string | null>(null)

  useEffect(() => {
    const match = NAV_SECTIONS.find((s) => sectionContainsPath(s, location.pathname))
    if (match) setOpenSectionId(match.clause)
  }, [location.pathname])

  return (
    <nav className="w-full min-w-0 max-w-full space-y-2 overflow-x-hidden px-2 pb-3" aria-label="Main navigation">
      <div className="min-w-0 max-w-full overflow-hidden rounded-none border border-stone-600/80 bg-stone-900/50 p-1">
        <NavItemLink
          item={{ label: 'Dashboard', to: '/', icon: LayoutDashboard }}
          collapsed={false}
        />
      </div>

      {NAV_SECTIONS.map((section) => (
        <NavSectionGroup
          key={section.clause}
          section={section}
          collapsed={false}
          open={openSectionId === section.clause}
          onToggle={() =>
            setOpenSectionId((prev) => (prev === section.clause ? null : section.clause))
          }
        />
      ))}
    </nav>
  )
}

const RESULT_VALIDATION_NAV: NavItem = {
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

const NAV_SECTIONS: NavSection[] = [
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
        label: 'Master Equipment of Calibration',
        to: '/calibration/equipment-for-calibration',
        icon: Gauge,
        clause: '6.4',
      },
      {
        label: 'Master Equipment of Testing',
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
            clause: '7.4',
          },
          {
            label: 'Retain & Disposed Sample',
            to: '/samples/retain-disposed',
            icon: FlaskConical,
            clause: '7.4',
          },
          {
            label: 'Consent Letter',
            to: '/masters/consent-letter',
            icon: FileSignature,
            clause: '7.4',
          },
        ],
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

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/samples': 'Samples',
  '/samples/receiving': 'Sample Handling / Sample Receiving',
  '/samples/allocation': 'Sample Handling / Sample Allocation',
  '/samples/test-allocation': 'Sample Handling / Test Allocation',
  '/samples/under-testing': 'Sample Handling / Sample Under Testing',
  '/samples/results-review': 'Sample Handling / Results Under Review',
  '/samples/result-validation': 'Validating the Results',
  ...Object.fromEntries(
    RESULT_VALIDATION_MODULES.map((module) => [
      resultValidationModulePath(module.slug),
      module.label,
    ]),
  ),
  '/samples/report-preparation': 'Sample Handling / Test Report Preparation',
  '/samples/completed': 'Sample Handling / Issued Test Report',
  '/samples/retain-disposed': 'Sample Handling / Retain & Disposed Sample',
  '/masters/consent-letter': 'Sample Handling / Consent Letter',
  '/masters/clients': 'Client Master',
  '/masters/is-codes': 'IS Code Master',
  '/masters/nabl-scope': 'NABL Scope',
  '/masters/product-services': 'Master Managements / Product & Services',
  '/masters/test-parameter': 'Test Parameter',
  '/masters/equipment': 'Equipment Management / Master Equipment of Testing',
  '/masters/iqc': 'Equipment Management / Equipments for IQC',
  '/equipment-management/iqc': 'Equipment Management / Equipments for IQC',
  '/calibration/masters-for-iqc': 'Equipment Management / Equipments for IQC',
  '/calibration/masters-for-iqc': 'Equipment Management / Equipments for IQC',
  '/calibration/handling': 'Calibration LIMS / Calibration Handling',
  '/calibration/handling/service-request': 'Calibration Handling / Service Request',
  '/calibration/handling/job-allocation': 'Calibration Handling / Job Allocation',
  '/calibration/handling/calibration-conduct': 'Calibration Handling / Calibration Conduct',
  '/calibration/handling/calibration-conduct-inside':
    'Calibration Handling / Calibration Conduct Inside',
  '/calibration/handling/calibration-conduct-outside':
    'Calibration Handling / Calibration Conduct Outside',
  '/calibration/handling/review-data': 'Calibration Handling / Review Data',
  '/calibration/handling/certificate-preparation':
    'Calibration Handling / Certificate Preparation',
  '/calibration/handling/certificates': 'Calibration Handling / Calibration Certificates',
  '/calibration/equipments': 'Calibration LIMS / Calibration Equipments',
  '/calibration/nabl-scope': 'Calibration LIMS / NABL Scope',
  '/calibration/equipment-for-calibration':
    'Equipment Management / Master Equipment of Calibration',
  '/finance/sale': 'Finance Management / Sale',
  '/finance/sale/quotation': 'Finance Management / Sale / Quotation',
  '/finance/sale/proforma-invoice': 'Finance Management / Sale / Proforma Invoice',
  '/finance/sale/invoice': 'Finance Management / Sale / Invoice',
  '/finance/sale/credit-note': 'Finance Management / Sale / Credit Note',
  '/finance/sale/payment-receipt': 'Finance Management / Sale / Payment Receipt',
  '/general-requirements/list-of-objectives':
    'Management Documentation / General Requirements / List of Objectives',
  '/general-requirements/risk-analysis':
    'Management Documentation / General Requirements / Risk Analysis',
  '/general-requirements/improvement':
    'Management Documentation / General Requirements / Improvement',
  '/management-docs/level-1':
    'Management Documentation / Master Document / Level 1 Documents',
  '/management-docs/level-2':
    'Management Documentation / Master Document / Level 2 Documents',
  '/management-docs/level-3':
    'Management Documentation / Master Document / Level 3 Documents',
  '/management-docs/level-4':
    'Management Documentation / Master Document / Level 4 Documents',
  '/audit-mrm/audit-plan': 'Management Documentation / Audit & MRM Management / Audit Plan',
  '/audit-mrm/audit-checklist':
    'Management Documentation / Audit & MRM Management / Audit Checklist',
  '/audit-mrm/audit-summary':
    'Management Documentation / Audit & MRM Management / Audit Summary',
  '/audit-mrm/non-conformities':
    'Management Documentation / Audit & MRM Management / Non Conformities',
  '/audit-mrm/mrm-agenda':
    'Management Documentation / Audit & MRM Management / MRM Plan & Agenda',
  '/audit-mrm/management-review-meeting':
    'Management Documentation / Audit & MRM Management / Management Review Meeting',
  '/personnel/employees':
    'Management Documentation / Personnel Management / List of Employees with All Details',
  '/personnel/selection':
    'Management Documentation / Personnel Management / Selection of Employee',
  '/personnel/required-competency-matrix':
    'Management Documentation / Personnel Management / Required Competency Matrix',
  '/personnel/actual-competency-matrix':
    'Management Documentation / Personnel Management / Actual Competency Matrix',
  '/personnel/roles-responsibilities':
    'Management Documentation / Personnel Management / Roles & Responsibilities',
  '/personnel/authorities':
    'Management Documentation / Personnel Management / Authorities',
  '/complaints/customer-complaints':
    'Management Documentation / Complaints Management / Customer Complaints Records',
  '/complaints/customer-feedback':
    'Management Documentation / Complaints Management / Customer Feedback',
  '/complaints/feedback-evaluation':
    'Management Documentation / Complaints Management / Feedback Evaluation',
  '/nonconforming-work/records':
    'Management Documentation / Non Conforming Work / Nonconforming Work Records',
  '/nonconforming-work/evaluation-actions':
    'Management Documentation / Non Conforming Work / Evaluation, Actions & Decisions',
  '/nonconforming-work/corrective-action':
    'Management Documentation / Non Conforming Work / Corrective Action',
  '/equipment-management/crm-list': 'Equipment Management / List of CRM',
  '/equipment-management/maintenance-schedule':
    'Equipment Management / Maintenance Schedule',
  '/equipment-management/calibration-schedule':
    'Equipment Management / Calibration Schedule',
  '/equipment-management/breakdown-register':
    'Equipment Management / Equipment Breakdown Register',
  '/externally-providers/supplier-list':
    'Management Documentation / Externally Providers / Externally Supplier List',
  '/externally-providers/supplier-evaluation':
    'Management Documentation / Externally Providers / Supplier Evaluation',
  '/externally-providers/list-of-consumables':
    'Management Documentation / Externally Providers / List of Consumables',
  '/training/competency-matrix':
    'Management Documentation / Training Management / Competency Matrix',
  '/training/need-identification':
    'Management Documentation / Training Management / Training Need Identification',
  '/training/plan': 'Management Documentation / Training Management / Training Plan',
  '/training/calendar': 'Management Documentation / Training Management / Training Calendar',
  '/training/register': 'Management Documentation / Training Management / Training Register',
  '/training/evaluation':
    'Management Documentation / Training Management / Training Evaluation',
  '/training/induction':
    'Management Documentation / Training Management / Induction Training',
  '/training/effectiveness-review':
    'Management Documentation / Training Management / Effectiveness Review',
  '/lab-settings': 'Lab Settings',
  '/lab-settings/user-management': 'User Management',
  '/lab-settings/module-access': 'Module Access',
  '/lab-settings/ai-settings': 'AI Settings',
  '/help': 'Help',
  '/contact-us': 'Contact Us',
}

function Breadcrumbs() {
  const location = useLocation()
  let label = ROUTE_LABELS[location.pathname]
  if (
    location.pathname === '/nonconforming-work/corrective-action' &&
    new URLSearchParams(location.search).get('source') === 'audit'
  ) {
    label = 'Management Documentation / Audit & MRM Management / Non Conformities (Corrective Action)'
  }

  if (!label || location.pathname === '/') return null

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-stone-300">
      <NavLink to="/" className="transition-colors hover:text-amber-200">
        Dashboard
      </NavLink>
      <ChevronsRight size={14} className="text-stone-500" />
      <span className="font-medium text-white">{label}</span>
    </nav>
  )
}

function NavSectionGroup({
  section,
  collapsed,
  open,
  onToggle,
}: {
  section: NavSection
  collapsed: boolean
  open: boolean
  onToggle: () => void
}) {
  const SectionIcon = section.icon
  const canAccess = useNavCanAccess()

  const visibleItems = useMemo(
    () =>
      section.items.filter((item) => {
        if (item.children && item.children.length > 0) {
          return item.children.some((c) => navItemAccessible(c, canAccess))
        }
        return navItemAccessible(item, canAccess)
      }),
    [section.items, canAccess],
  )

  if (visibleItems.length === 0 && section.items.length > 0) return null

  if (collapsed) {
    return (
      <div className="space-y-0.5">
        <div className="mx-2 my-2 h-px bg-stone-600/80" />
        {visibleItems.map((item) => (
          <div key={item.to ?? item.label}>
            {item.children && item.children.length > 0 ? (
              <NavItemGroup item={item} collapsed={collapsed} />
            ) : (
              <NavItemLink item={item} collapsed={collapsed} />
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="sidebar-section-panel">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full min-w-0 max-w-full items-center gap-1.5 rounded-none px-1.5 py-2 text-left transition-colors hover:bg-white/10"
        aria-expanded={open}
        title={formatNavLabel(section.title)}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-none bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30">
          <SectionIcon size={13} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-wide text-stone-300">
          {formatNavLabel(section.title)}
        </span>
        <span className="shrink-0 text-stone-500">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>

      {open && visibleItems.length === 0 ? (
        <p className="mx-1 mb-1 rounded-none bg-stone-800/60 px-2.5 py-2 text-[11px] text-stone-400">
          Coming soon
        </p>
      ) : null}

      {open && visibleItems.length > 0 ? (
        <ul className="mt-0.5 space-y-0.5">
          {visibleItems.map((item) => (
            <li key={item.to ?? item.label}>
              {item.children && item.children.length > 0 ? (
                <NavItemGroup item={item} collapsed={collapsed} />
              ) : (
                <NavItemLink item={item} collapsed={collapsed} />
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function NavItemGroup({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const location = useLocation()
  const Icon = item.icon
  const canAccess = useNavCanAccess()

  const children = item.children ?? []
  const visibleChildren = useMemo(
    () => children.filter((c) => navItemAccessible(c, canAccess)),
    [children, canAccess],
  )
  const isAnyChildActive = useMemo(() => {
    return visibleChildren.some((c) => {
      if (!c.to) return false
      return location.pathname === c.to || location.pathname.startsWith(`${c.to}/`)
    })
  }, [visibleChildren, location.pathname])

  const { open, setOpen, toggleOpen } = useNavSectionOpen(isAnyChildActive)

  useEffect(() => {
    if (isAnyChildActive) setOpen(true)
  }, [isAnyChildActive, setOpen])

  if (visibleChildren.length === 0) return null

  // Collapsed rail: flyout menu so nested routes remain reachable
  if (collapsed) {
    return (
      <DropdownMenu>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'sidebar-nav-item w-full justify-center px-2',
                    isAnyChildActive && 'sidebar-nav-active',
                  )}
                  aria-label={formatNavLabel(item.label)}
                >
                  <Icon size={16} className="shrink-0 opacity-80" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {formatNavLabel(item.label)}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent side="right" align="start" sideOffset={10} className="min-w-[12rem]">
          <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {formatNavLabel(item.label)}
          </div>
          <DropdownMenuSeparator />
          {visibleChildren.map((c) => {
            if (!c.to) return null
            const ChildIcon = c.icon
            return (
              <DropdownMenuItem key={c.to} asChild>
                <NavLink to={c.to} className="flex cursor-pointer items-center gap-2">
                  <ChildIcon size={14} className="opacity-70" />
                  <span>{formatNavLabel(c.label)}</span>
                </NavLink>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggleOpen}
        className={cn(
          'sidebar-nav-item w-full',
          isAnyChildActive && 'sidebar-nav-active',
        )}
        aria-expanded={open}
      >
        <Icon size={15} className="shrink-0 opacity-80" />
        <span className="flex-1 truncate text-left">{formatNavLabel(item.label)}</span>
        <span className="opacity-45">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>

      {open && (
        <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-amber-500/25 pl-2">
          {visibleChildren.map((c) => (
            <li key={c.to ?? c.label}>
              <NavItemLink item={c} collapsed={false} nested />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NavItemLink({
  item,
  collapsed,
  nested = false,
}: {
  item: NavItem
  collapsed: boolean
  nested?: boolean
}) {
  const Icon = item.icon
  const canAccess = useNavCanAccess()

  if (!item.to) return null
  if (!navItemAccessible(item, canAccess)) return null

  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'sidebar-nav-item',
          nested && 'py-1.5 text-[12px]',
          isActive && 'sidebar-nav-active',
          collapsed && 'justify-center px-2',
        )
      }
    >
      <Icon size={nested ? 14 : 15} className="shrink-0 opacity-80" />
      {!collapsed && (
        <span className="min-w-0 flex-1 truncate">{formatNavLabel(item.label)}</span>
      )}
    </NavLink>
  )

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {item.label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return link
}

export default function GlobalLayout() {
  // Re-render entire shell when Lab Settings date/time/currency preferences change
  useAppDateFormat()
  useAppCurrency()
  const navigate = useNavigate()
  const location = useLocation()
  const { profileName, designation } = useAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('app.sidebarCollapsed') === '1'
  })
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [labName, setLabName] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(LAB_NAME_STORAGE_KEY) ?? ''
  })

  useEffect(() => {
    let canceled = false

    const loadLabName = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token || canceled) return

      const { data, error } = await supabase
        .from('lab_settings')
        .select('lab_name, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (canceled) return
      if (error || !data) return
      const name = typeof data.lab_name === 'string' ? data.lab_name : ''
      if (!name.trim()) return

      setLabName(name)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LAB_NAME_STORAGE_KEY, name)
      }
    }

    void loadLabName()

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        if (nextSession?.access_token) void loadLabName()
      }
    })

    const onStorage = (e: StorageEvent) => {
      if (e.key !== LAB_NAME_STORAGE_KEY) return
      setLabName(typeof e.newValue === 'string' ? e.newValue : '')
    }

    const onLabNameChanged = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (typeof detail === 'string') setLabName(detail)
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage)
      window.addEventListener(LAB_NAME_CHANGED_EVENT, onLabNameChanged)
    }

    return () => {
      canceled = true
      authListener.subscription.unsubscribe()
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage)
        window.removeEventListener(LAB_NAME_CHANGED_EVENT, onLabNameChanged)
      }
    }
  }, [])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileNavOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileNavOpen])

  useEffect(() => {
    if (!mobileNavOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileNavOpen])

  const initials = useMemo(() => {
    const name = profileName || ''
    const parts = name.split(' ').filter(Boolean)
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return 'U'
  }, [profileName])

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((v) => {
      const next = !v
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('app.sidebarCollapsed', next ? '1' : '0')
      }
      return next
    })
  }

  const brandShortName = useMemo(() => getBrandShortName(labName), [labName])

  const renderSidebar = (collapsed: boolean, options?: { showCollapseToggle?: boolean }) => {
    const showCollapseToggle = options?.showCollapseToggle ?? false
    return (
    <>
      <div
        className={cn(
          'relative flex shrink-0 items-center gap-3 overflow-hidden border-b border-stone-700 px-3 py-3',
          'bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950',
          'min-h-[5.5rem]',
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 10% 30%, rgba(217,119,6,0.4), transparent 40%), radial-gradient(circle at 90% 0%, rgba(251,191,36,0.22), transparent 35%)',
          }}
        />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        <div
          className="relative flex h-14 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-none bg-white px-2 py-1 shadow-md ring-1 ring-amber-500/40"
          title={labName || brandShortName}
        >
          <img
            src="/brand/qi-logo.png"
            alt=""
            className="h-full w-full max-w-[11rem] object-contain"
            draggable={false}
          />
        </div>

        {showCollapseToggle ? (
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            className="relative z-10 shrink-0 rounded-none border border-transparent p-1.5 text-stone-200 transition-colors hover:border-amber-500/40 hover:bg-white/10 hover:text-white"
            aria-label="Hide sidebar"
            title="Hide sidebar"
          >
            <Menu size={18} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className="relative z-10 shrink-0 rounded-none p-1.5 text-stone-200 hover:bg-white/10 hover:text-white md:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <ScrollArea className="min-w-0 flex-1 overflow-hidden py-3">
        <SidebarMainNav />
      </ScrollArea>
    </>
    )
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {mobileNavOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[2px] md:hidden"
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[min(88vw,280px)] max-w-[280px] flex-col overflow-hidden border-r border-stone-700',
          'bg-gradient-to-b from-stone-800 via-stone-900 to-stone-950 shadow-2xl shadow-stone-950/40',
          'transition-transform duration-300 ease-in-out md:hidden',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {renderSidebar(false, { showCollapseToggle: false })}
      </aside>

      {!sidebarCollapsed ? (
        <aside
          className={cn(
            'hidden w-[268px] min-w-0 max-w-[268px] flex-col overflow-hidden border-r border-stone-700 bg-gradient-to-b from-stone-800 via-stone-900 to-stone-950',
            'relative z-[55] shadow-lg shadow-stone-950/30 transition-[width] duration-300 ease-in-out md:flex',
          )}
        >
          {renderSidebar(false, { showCollapseToggle: true })}
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between overflow-hidden border-b border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 text-white shadow-md sm:px-6">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 10% 30%, rgba(217,119,6,0.4), transparent 40%), radial-gradient(circle at 90% 0%, rgba(251,191,36,0.22), transparent 35%)',
            }}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

          <div className="relative flex min-w-0 items-center gap-3">
            <button
              type="button"
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-none border border-stone-500 bg-stone-800/80 text-white shadow-sm transition-colors hover:border-amber-500/50 hover:bg-stone-700',
                !sidebarCollapsed && 'md:hidden',
              )}
              onClick={() => {
                if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
                  if (sidebarCollapsed) toggleSidebarCollapsed()
                  return
                }
                setMobileNavOpen(true)
              }}
              aria-label={sidebarCollapsed ? 'Show sidebar' : 'Open navigation menu'}
              title={sidebarCollapsed ? 'Show sidebar' : 'Open navigation menu'}
            >
              <Menu size={18} aria-hidden />
            </button>
            <div className="min-w-0">
              <Breadcrumbs />
              {!ROUTE_LABELS[location.pathname] && (
                <span className="block truncate text-sm font-semibold text-white sm:text-base">
                  {labName || 'Quality International Research & Laboratories Pvt. Ltd.'}
                </span>
              )}
            </div>
          </div>

          <div className="relative flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-none border border-amber-500/30 bg-amber-500/10 px-3 py-1 md:flex">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              <span className="text-[11px] font-semibold text-amber-200">Accredited</span>
            </div>

            <Separator orientation="vertical" className="hidden h-6 bg-stone-600 md:block" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-none px-2 py-1.5 transition-colors hover:bg-white/10">
                  <div className="flex h-8 w-8 items-center justify-center rounded-none bg-amber-700 text-xs font-bold text-white shadow-sm">
                    {initials}
                  </div>
                  <div className="hidden text-left leading-tight sm:block">
                    <p className="max-w-[140px] truncate text-xs font-semibold text-white lg:max-w-[180px]">
                      {profileName || 'User'}
                    </p>
                    <p className="max-w-[140px] truncate text-[10px] text-stone-300 lg:max-w-[180px]">
                      {designation || 'Staff'}
                    </p>
                  </div>
                  <ChevronDown size={14} className="hidden text-stone-400 sm:block" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-2 sm:hidden">
                  <p className="text-sm font-semibold">{profileName || 'User'}</p>
                  <p className="text-xs text-muted-foreground">{designation || 'Staff'}</p>
                </div>
                <DropdownMenuSeparator className="sm:hidden" />

                {isLaboratoryDirector(designation) && (
                  <>
                    <DropdownMenuItem asChild>
                      <NavLink to="/lab-settings" className="flex items-center gap-2">
                        <Settings size={14} />
                        Lab Settings
                      </NavLink>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <NavLink to="/lab-settings/user-management" className="flex items-center gap-2">
                        <Users size={14} />
                        User Management
                      </NavLink>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <NavLink to="/lab-settings/module-access" className="flex items-center gap-2">
                        <Shield size={14} />
                        Module Access
                      </NavLink>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <NavLink to="/lab-settings/ai-settings" className="flex items-center gap-2">
                        <Bot size={14} />
                        AI Settings
                      </NavLink>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem asChild>
                  <NavLink to="/help" className="flex items-center gap-2">
                    <HelpCircle size={14} />
                    Help
                  </NavLink>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <NavLink to="/contact-us" className="flex items-center gap-2">
                    <Mail size={14} />
                    Contact Us
                  </NavLink>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={async (event) => {
                    event.preventDefault()
                    await signOut()
                    navigate('/auth', { replace: true })
                  }}
                >
                  <LogOut size={14} />
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="app-shell-main">
          <RequireModuleAccess>
            <Outlet />
          </RequireModuleAccess>
        </main>
      </div>
    </div>
  )
}
