import { useEffect, useMemo, useState, type ElementType } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  FileSignature,
  FlaskConical,
  Users,
  TestTube,
  ShieldCheck,
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
import { canAccessNavItem as checkNavAccess, isRestrictedModuleRole, type UserAccessContext } from '@/lib/moduleAccess'
import { RequireModuleAccess } from '@/components/auth/RequireModuleAccess'
import {
  RESULT_VALIDATION_MODULES,
  resultValidationModulePath,
} from '@/features/quality/result-validation/resultValidationModules'
import { getBrandShortName, getCompanyInitials, LAB_NAME_CHANGED_EVENT, LAB_NAME_STORAGE_KEY } from '@/features/settings/lab-settings/brandMark'

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

function navItemAccessible(item: NavItem, ctx: UserAccessContext): boolean {
  return checkNavAccess(item.requiredDesignations, item.to, ctx)
}

/** Expandable nav: starts closed; stays open until user collapses manually */
function useNavSectionOpen(initialOpen = false) {
  const [open, setOpen] = useState(initialOpen)
  const toggleOpen = () => setOpen((v) => !v)
  return { open, setOpen, toggleOpen }
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
    title: 'Audit & MRM Management',
    clause: 'audit-mrm-management',
    icon: FileSearch,
    items: [
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
        label: 'MRM Agenda',
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
          { label: 'Issued Test Report', to: '/samples/completed', icon: FlaskConical, clause: '7.8' },
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
      { label: 'Equipment Master', to: '/masters/equipment', icon: Wrench },
      { label: 'Masters for IQC', to: '/masters/iqc', icon: Wrench },
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
          {
            label: 'Calibration Certificates',
            to: '/calibration/handling/certificates',
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
        label: 'Master Equipments',
        to: '/calibration/equipment-for-calibration',
        icon: Gauge,
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
  '/masters/equipment': 'Equipment Master',
  '/masters/iqc': 'Masters for IQC',
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
  '/calibration/equipment-for-calibration': 'Calibration LIMS / Master Equipments',
  '/finance/sale': 'Finance Management / Sale',
  '/finance/sale/quotation': 'Finance Management / Sale / Quotation',
  '/finance/sale/proforma-invoice': 'Finance Management / Sale / Proforma Invoice',
  '/finance/sale/invoice': 'Finance Management / Sale / Invoice',
  '/finance/sale/credit-note': 'Finance Management / Sale / Credit Note',
  '/finance/sale/payment-receipt': 'Finance Management / Sale / Payment Receipt',
  '/management-docs/level-1': 'Management Documentation / Level 1 Documents',
  '/management-docs/level-2': 'Management Documentation / Level 2 Documents',
  '/management-docs/level-3': 'Management Documentation / Level 3 Documents',
  '/management-docs/level-4': 'Management Documentation / Level 4 Documents',
  '/audit-mrm/audit-plan': 'Audit & MRM Management / Audit Plan',
  '/audit-mrm/audit-checklist': 'Audit & MRM Management / Audit Checklist',
  '/audit-mrm/audit-summary': 'Audit & MRM Management / Audit Summary',
  '/audit-mrm/non-conformities': 'Audit & MRM Management / Non Conformities',
  '/audit-mrm/mrm-agenda': 'Audit & MRM Management / MRM Agenda',
  '/audit-mrm/management-review-meeting':
    'Audit & MRM Management / Management Review Meeting',
  '/lab-settings': 'Lab Settings',
  '/lab-settings/user-management': 'User Management',
  '/lab-settings/ai-settings': 'AI Settings',
  '/help': 'Help',
  '/contact-us': 'Contact Us',
}

function Breadcrumbs() {
  const location = useLocation()
  const label = ROUTE_LABELS[location.pathname]

  if (!label || location.pathname === '/') return null

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <NavLink to="/" className="hover:text-foreground transition-colors">
        Dashboard
      </NavLink>
      <ChevronsRight size={14} className="text-muted-foreground/50" />
      <span className="font-medium text-foreground">{label}</span>
    </nav>
  )
}

function NavSectionGroup({
  section,
  collapsed,
  access,
}: {
  section: NavSection
  collapsed: boolean
  access: UserAccessContext
}) {
  const { open, toggleOpen } = useNavSectionOpen(false)
  const SectionIcon = section.icon

  const visibleItems = useMemo(
    () =>
      section.items.filter((item) => {
        if (item.children && item.children.length > 0) {
          return item.children.some((c) => navItemAccessible(c, access))
        }
        return navItemAccessible(item, access)
      }),
    [section.items, access],
  )

  if (visibleItems.length === 0 && section.items.length > 0) return null

  if (collapsed) {
    return (
      <div className="space-y-0.5">
        <div className="mx-2 my-2 h-px bg-white/10" />
        {visibleItems.map((item) => (
          <div key={item.to ?? item.label}>
            {item.children && item.children.length > 0 ? (
              <NavItemGroup item={item} collapsed={collapsed} access={access} />
            ) : (
              <NavItemLink item={item} collapsed={collapsed} access={access} />
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
        onClick={toggleOpen}
        className="flex w-full min-w-0 max-w-full items-center gap-1.5 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
        aria-expanded={open}
        title={formatNavLabel(section.title)}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-teal-500/15 text-teal-300/90 ring-1 ring-teal-400/20">
          <SectionIcon size={13} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-wide text-sidebar-foreground/55">
          {formatNavLabel(section.title)}
        </span>
        <span className="shrink-0 text-sidebar-foreground/35">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>

      {open && visibleItems.length === 0 ? (
        <p className="mx-1 mb-1 rounded-md bg-white/[0.03] px-2.5 py-2 text-[11px] text-sidebar-foreground/35">
          Coming soon
        </p>
      ) : null}

      {open && visibleItems.length > 0 ? (
        <ul className="mt-0.5 space-y-0.5">
          {visibleItems.map((item) => (
            <li key={item.to ?? item.label}>
              {item.children && item.children.length > 0 ? (
                <NavItemGroup item={item} collapsed={collapsed} access={access} />
              ) : (
                <NavItemLink item={item} collapsed={collapsed} access={access} />
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function NavItemGroup({ item, collapsed, access }: { item: NavItem; collapsed: boolean; access: UserAccessContext }) {
  const location = useLocation()
  const Icon = item.icon

  const children = item.children ?? []
  const visibleChildren = useMemo(
    () => children.filter((c) => navItemAccessible(c, access)),
    [children, access],
  )
  const isAnyChildActive = useMemo(() => {
    return visibleChildren.some((c) => {
      if (!c.to) return false
      return location.pathname === c.to || location.pathname.startsWith(`${c.to}/`)
    })
  }, [visibleChildren, location.pathname])

  const { open, toggleOpen } = useNavSectionOpen(false)

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
        <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-teal-400/20 pl-2">
          {visibleChildren.map((c) => (
            <li key={c.to ?? c.label}>
              <NavItemLink item={c} collapsed={false} access={access} nested />
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
  access,
  nested = false,
}: {
  item: NavItem
  collapsed: boolean
  access: UserAccessContext
  nested?: boolean
}) {
  const Icon = item.icon

  if (!item.to) return null
  if (!navItemAccessible(item, access)) return null

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
  const navigate = useNavigate()
  const location = useLocation()
  const { profileName, designation, departmentName } = useAuth()
  const access = useMemo(
    () => ({ designation: designation ?? '', departmentName: departmentName ?? '' }),
    [designation, departmentName],
  )
  const restrictedRole = isRestrictedModuleRole(access)
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

  const brandInitials = useMemo(() => getCompanyInitials(labName), [labName])
  const brandShortName = useMemo(() => getBrandShortName(labName), [labName])

  const renderSidebar = (collapsed: boolean, options?: { showCollapseToggle?: boolean }) => {
    const showCollapseToggle = options?.showCollapseToggle ?? false
    return (
    <>
      <div
        className={cn(
          'relative flex shrink-0 items-center gap-2.5 border-b border-sidebar-border/60 px-3 py-2.5',
          'bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950/80',
          'min-h-[4.5rem]',
        )}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-400/25 to-cyan-600/15 text-xs font-bold tracking-wide text-teal-100 shadow-lg ring-1 ring-teal-400/35 backdrop-blur-sm"
          aria-hidden
          title={labName || brandShortName}
        >
          {brandInitials}
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-center justify-center text-center">
          <p className="max-w-full truncate text-center text-sm font-bold leading-tight tracking-wide text-white">
            {brandInitials}
          </p>
          <p className="max-w-full truncate text-center text-[10px] font-semibold leading-tight text-teal-50/85">
            LIMS
          </p>
        </div>

        {showCollapseToggle ? (
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            className="rounded-md p-1.5 text-white/85 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Hide sidebar"
            title="Hide sidebar"
          >
            <Menu size={18} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className="md:hidden rounded-md p-1.5 text-white/80 hover:bg-white/10"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <ScrollArea className="min-w-0 flex-1 overflow-hidden py-3">
        <nav className="w-full min-w-0 max-w-full space-y-2 overflow-x-hidden px-2 pb-3" aria-label="Main navigation">
          <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.07] to-transparent p-1">
            <NavItemLink
              item={{ label: 'Dashboard', to: '/', icon: LayoutDashboard }}
              collapsed={false}
              access={access}
            />
          </div>

          {NAV_SECTIONS.map((section) => (
            <NavSectionGroup
              key={section.clause}
              section={section}
              collapsed={false}
              access={access}
            />
          ))}
        </nav>
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
          'fixed inset-y-0 left-0 z-50 flex w-[min(88vw,280px)] max-w-[280px] flex-col overflow-hidden border-r border-sidebar-border',
          'bg-gradient-to-b from-sidebar via-sidebar to-[#0a1628] shadow-2xl shadow-teal-950/20',
          'transition-transform duration-300 ease-in-out md:hidden',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {renderSidebar(false, { showCollapseToggle: false })}
      </aside>

      {!sidebarCollapsed ? (
        <aside
          className={cn(
            'hidden w-[268px] min-w-0 max-w-[268px] flex-col overflow-hidden border-r border-sidebar-border bg-gradient-to-b from-sidebar via-sidebar to-[#0a1628]',
            'shadow-lg shadow-teal-950/15 transition-[width] duration-300 ease-in-out md:flex',
          )}
        >
          {renderSidebar(false, { showCollapseToggle: true })}
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border/80 bg-white/90 px-4 shadow-sm backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-accent',
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
                <span className="block truncate text-sm font-semibold text-foreground sm:text-base">
                  {labName || 'Quality International Research & Laboratories Pvt. Ltd.'}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-success/20 bg-success/10 px-3 py-1 md:flex">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              <span className="text-[11px] font-semibold text-success">Accredited</span>
            </div>

            <Separator orientation="vertical" className="hidden h-6 bg-border md:block" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm">
                    {initials}
                  </div>
                  <div className="hidden text-left leading-tight sm:block">
                    <p className="max-w-[140px] truncate text-xs font-semibold text-foreground lg:max-w-[180px]">
                      {profileName || 'User'}
                    </p>
                    <p className="max-w-[140px] truncate text-[10px] text-muted-foreground lg:max-w-[180px]">
                      {designation || 'Staff'}
                    </p>
                  </div>
                  <ChevronDown size={14} className="hidden text-muted-foreground sm:block" />
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
                      <NavLink to="/lab-settings/ai-settings" className="flex items-center gap-2">
                        <Bot size={14} />
                        AI Settings
                      </NavLink>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {!restrictedRole && (
                  <>
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
                  </>
                )}

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
