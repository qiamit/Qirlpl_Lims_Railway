import { useEffect, useMemo, useState, type ElementType } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  FlaskConical,
  Users,
  TestTube,
  ShieldCheck,
  BookOpen,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
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

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Process Requirements',
    clause: 'Clause 7',
    items: [
      { label: 'Sample Receiving', to: '/samples/receiving', icon: FlaskConical, clause: '7.4', requiredDesignations: ['Laboratory Director', 'Sample Coordinator'] },
      { label: 'Sample Allocation', to: '/samples/allocation', icon: FlaskConical, clause: '7.4', requiredDesignations: ['Laboratory Director', 'Sample Incharge'] },
      { label: 'Test Allocation', to: '/samples/test-allocation', icon: FlaskConical, clause: '7.4', requiredDesignations: ['Laboratory Director', 'Technical Manager'] },
      { label: 'Sample Under Testing', to: '/samples/under-testing', icon: FlaskConical, clause: '7.4' },
      { label: 'Results Under Review', to: '/samples/results-review', icon: FlaskConical, clause: '7.4' },
      { label: 'Test Report Preparation', to: '/samples/report-preparation', icon: FlaskConical, clause: '7.4' },
      { label: 'Issued Test Report', to: '/samples/completed', icon: FlaskConical, clause: '7.8' },
    ],
  },
  {
    title: 'Masters Management',
    clause: 'Masters',
    items: [
      { label: 'Client Master', to: '/masters/clients', icon: Users },
      { label: 'IS Code Master', to: '/masters/is-codes', icon: BookOpen },
      { label: 'NABL Scope', to: '/masters/nabl-scope', icon: ShieldCheck },
      { label: 'Test Parameter', to: '/masters/test-parameter', icon: TestTube },
      { label: 'Equipment Master', to: '/masters/equipment', icon: Wrench },
      { label: 'Masters for IQC', to: '/masters/iqc', icon: Wrench },
    ],
  },
]

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/samples': 'Samples',
  '/samples/receiving': 'Sample Receiving',
  '/samples/allocation': 'Sample Allocation',
  '/samples/test-allocation': 'Test Allocation',
  '/samples/under-testing': 'Sample Under Testing',
  '/samples/results-review': 'Results Under Review',
  '/samples/report-preparation': 'Test Report Preparation',
  '/samples/completed': 'Issued Test Report',
  '/masters/clients': 'Client Master',
  '/masters/is-codes': 'IS Code Master',
  '/masters/nabl-scope': 'NABL Scope',
  '/masters/test-parameter': 'Test Parameter',
  '/masters/equipment': 'Equipment Master',
  '/masters/iqc': 'Masters for IQC',
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
  const [open, setOpen] = useState(true)

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

  if (visibleItems.length === 0) return null

  return (
    <div className="mb-1">
      {!collapsed && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/50 transition-colors hover:bg-sidebar-muted/60 hover:text-sidebar-foreground/80"
        >
          <span className="text-[10px] font-bold tracking-wider">
            {formatNavLabel(section.title)}
          </span>
          <span>
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        </button>
      )}

      {collapsed && (
        <div className="mx-2 my-2 h-px bg-sidebar-border/40" />
      )}

      {(open || collapsed) && (
        <ul className="space-y-0.5">
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
      )}
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
    return visibleChildren.some((c) => (c.to ? location.pathname === c.to : false))
  }, [visibleChildren, location.pathname])

  const [open, setOpen] = useState(isAnyChildActive)

  if (visibleChildren.length === 0) return null

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[13px] font-medium transition-all duration-200',
          'text-sidebar-foreground/70 hover:bg-sidebar-muted/80 hover:text-sidebar-foreground',
          isAnyChildActive && 'sidebar-nav-active',
          collapsed && 'justify-center px-2',
        )}
        aria-expanded={open}
        aria-label={collapsed ? formatNavLabel(item.label) : undefined}
      >
        <Icon size={16} className="shrink-0 opacity-70" />
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-left">{formatNavLabel(item.label)}</span>
            {item.clause && <span className="text-[10px] opacity-40">{item.clause}</span>}
            <span className="opacity-50">
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </>
        )}
      </button>

      {open && !collapsed && (
        <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-sidebar-border/30 pl-2.5">
          {visibleChildren.map((c) => (
            <li key={c.to ?? c.label}>
              <NavItemLink item={c} collapsed={false} access={access} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NavItemLink({ item, collapsed, access }: { item: NavItem; collapsed: boolean; access: UserAccessContext }) {
  const Icon = item.icon

  if (!item.to) return null
  if (!navItemAccessible(item, access)) return null

  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[13px] font-medium transition-all duration-200',
          'text-sidebar-foreground/70 hover:bg-sidebar-muted/80 hover:text-sidebar-foreground',
          isActive && 'sidebar-nav-active',
          collapsed && 'justify-center px-2',
        )
      }
    >
      <Icon size={16} className="shrink-0 opacity-70" />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{formatNavLabel(item.label)}</span>
          {item.clause && <span className="text-[10px] opacity-40">{item.clause}</span>}
        </>
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [labName, setLabName] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem('labSettings.labName') ?? ''
  })

  useEffect(() => {
    let canceled = false

    const loadLabName = async () => {
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
        window.localStorage.setItem('labSettings.labName', name)
      }
    }

    void loadLabName()

    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'labSettings.labName') return
      setLabName(typeof e.newValue === 'string' ? e.newValue : '')
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage)
    }

    return () => {
      canceled = true
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage)
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

  const renderSidebar = (collapsed: boolean) => (
    <>
      <div
        className={cn(
          'relative flex h-14 shrink-0 items-center gap-3 border-b border-sidebar-border/60 px-3',
          'bg-gradient-to-r from-lab-900 via-lab-800 to-lab-700',
          collapsed && 'justify-center px-2',
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-sm">
          <FlaskConical size={16} />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold leading-tight text-white">QIRLPL</p>
            <p className="truncate text-[10px] font-medium leading-tight text-blue-100/70">
              ISO 17025:2017 LIMS
            </p>
          </div>
        )}
        {!collapsed && (
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

      <ScrollArea className="flex-1 py-3">
        <nav className="space-y-1 px-2">
          <div className="mb-1">
            <NavItemLink
              item={{ label: 'Dashboard', to: '/', icon: LayoutDashboard }}
              collapsed={collapsed}
              access={access}
            />
          </div>

          <Separator className="!my-2 bg-sidebar-border/40" />

          {NAV_SECTIONS.map((section) => (
            <NavSectionGroup
              key={section.clause}
              section={section}
              collapsed={collapsed}
              access={access}
            />
          ))}
        </nav>
      </ScrollArea>

      <div
        className={cn(
          'hidden shrink-0 border-t border-sidebar-border/60 px-2 py-2 md:block',
          collapsed && 'px-1',
        )}
      >
        <button
          onClick={() => setSidebarCollapsed((v) => !v)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[13px] font-medium transition-all duration-200',
            'text-sidebar-foreground/60 hover:bg-sidebar-muted/80 hover:text-sidebar-foreground',
            collapsed && 'justify-center px-2',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span className="flex-1 truncate text-left">Collapse</span>}
        </button>
      </div>
    </>
  )

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
          'fixed inset-y-0 left-0 z-50 flex w-[min(88vw,280px)] flex-col border-r border-sidebar-border',
          'bg-gradient-to-b from-sidebar via-sidebar to-lab-950 shadow-2xl shadow-blue-950/30',
          'transition-transform duration-300 ease-in-out md:hidden',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {renderSidebar(false)}
      </aside>

      <aside
        className={cn(
          'hidden flex-col border-r border-sidebar-border bg-gradient-to-b from-sidebar via-sidebar to-lab-950',
          'shadow-lg shadow-blue-950/10 transition-all duration-300 ease-in-out md:flex',
          sidebarCollapsed ? 'w-[60px]' : 'w-[268px]',
        )}
      >
        {renderSidebar(sidebarCollapsed)}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border/80 bg-white/90 px-4 shadow-sm backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-accent md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu size={18} />
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
