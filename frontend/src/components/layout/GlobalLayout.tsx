import { useEffect, useMemo, useState, type ElementType } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  FlaskConical,
  Users,
  TestTube,
  Boxes,
  Ruler,
  BarChart3,
  FileText,
  BookOpen,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  Settings,
  HelpCircle,
  Mail,
  LogOut,
  ChevronsRight,
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

function canAccessNavItem(item: NavItem, designation: string): boolean {
  if (isLaboratoryDirector(designation) && item.to?.startsWith('/samples/')) return true
  if (!item.requiredDesignations || item.requiredDesignations.length === 0) return true
  const d = designation?.trim().toLowerCase() ?? ''
  return item.requiredDesignations.some((r) => r.trim().toLowerCase() === d)
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Resource Requirements',
    clause: 'Clause 6',
    items: [
      { label: 'Personnel', to: '/personnel', icon: Users, clause: '6.2' },
    ],
  },
  {
    title: 'Process Requirements',
    clause: 'Clause 7',
    items: [
      { label: 'Sampling', to: '/sampling', icon: Boxes, clause: '7.3' },
      {
        label: 'Sample Handling',
        icon: FlaskConical,
        clause: '7.4',
        children: [
          { label: 'Sample Receiving', to: '/samples/receiving', icon: FlaskConical, requiredDesignations: ['Laboratory Director', 'Sample Coordinator'] },
          { label: 'Sample Allocation', to: '/samples/allocation', icon: FlaskConical, requiredDesignations: ['Laboratory Director', 'Sample Incharge'] },
          { label: 'Test Allocation', to: '/samples/test-allocation', icon: FlaskConical, requiredDesignations: ['Laboratory Director', 'Technical Manager'] },
          { label: 'Sample Under Testing', to: '/samples/under-testing', icon: FlaskConical },
          { label: 'Results Under Review', to: '/samples/results-review', icon: FlaskConical },
          { label: 'Test Report Preparation', to: '/samples/report-preparation', icon: FlaskConical },
          { label: 'Completed Results', to: '/samples/completed', icon: FlaskConical },
        ],
      },
      { label: 'Technical Records', to: '/testing', icon: Ruler, clause: '7.5' },
      { label: 'Results Validity', to: '/validity', icon: BarChart3, clause: '7.7' },
      { label: 'Reports', to: '/reports', icon: FileText, clause: '7.8' },
    ],
  },
  {
    title: 'Masters Management',
    clause: 'Masters',
    items: [
      { label: 'Client Master', to: '/masters/clients', icon: Users },
      { label: 'IS Code Master', to: '/masters/is-codes', icon: BookOpen },
      { label: 'Product & Services', to: '/masters/product-services', icon: Boxes },
      { label: 'Test Parameter', to: '/masters/test-parameter', icon: TestTube },
    ],
  },
]

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/personnel': 'Personnel',
  '/sampling': 'Sampling',
  '/samples': 'Samples',
  '/samples/receiving': 'Sample Receiving',
  '/samples/allocation': 'Sample Allocation',
  '/samples/test-allocation': 'Test Allocation',
  '/samples/under-testing': 'Sample Under Testing',
  '/samples/results-review': 'Results Under Review',
  '/samples/report-preparation': 'Test Report Preparation',
  '/samples/completed': 'Completed Results',
  '/testing': 'Technical Records',
  '/validity': 'Results Validity',
  '/reports': 'Reports',
  '/masters/clients': 'Client Master',
  '/masters/is-codes': 'IS Code Master',
  '/masters/product-services': 'Product & Services',
  '/masters/test-parameter': 'Test Parameter',
  '/lab-settings': 'Lab Settings',
  '/lab-settings/user-management': 'User Management',
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
  designation,
}: {
  section: NavSection
  collapsed: boolean
  designation: string
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="mb-1">
      {!collapsed && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold tracking-widest uppercase text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
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
          {section.items.map((item) => (
            <li key={item.to ?? item.label}>
              {item.children && item.children.length > 0 ? (
                <NavItemGroup item={item} collapsed={collapsed} designation={designation} />
              ) : (
                <NavItemLink item={item} collapsed={collapsed} designation={designation} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NavItemGroup({ item, collapsed, designation }: { item: NavItem; collapsed: boolean; designation: string }) {
  const location = useLocation()
  const Icon = item.icon

  const children = item.children ?? []
  const visibleChildren = useMemo(
    () => children.filter((c) => canAccessNavItem(c, designation)),
    [children, designation],
  )
  const isAnyChildActive = useMemo(() => {
    return visibleChildren.some((c) => (c.to ? location.pathname === c.to : false))
  }, [visibleChildren, location.pathname])

  const [open, setOpen] = useState(isAnyChildActive)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-150',
          'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
          isAnyChildActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
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
              <NavItemLink item={c} collapsed={false} designation={designation} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NavItemLink({ item, collapsed, designation }: { item: NavItem; collapsed: boolean; designation: string }) {
  const Icon = item.icon

  if (!item.to) return null
  if (!canAccessNavItem(item, designation)) return null

  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-150',
          'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm',
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
  const { profileName, designation } = useAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
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

  const initials = useMemo(() => {
    const name = profileName || ''
    const parts = name.split(' ').filter(Boolean)
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return 'U'
  }, [profileName])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside
        className={cn(
          'flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out',
          sidebarCollapsed ? 'w-[56px]' : 'w-[260px]',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-3 border-b border-sidebar-border/50 px-3 h-14 shrink-0',
            sidebarCollapsed && 'justify-center px-2',
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-lab-500 to-lab-700 text-white shadow-md">
            <FlaskConical size={15} />
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold leading-tight text-sidebar-foreground">
                QIRLPL
              </p>
              <p className="truncate text-[10px] leading-tight text-sidebar-foreground/40">
                ISO 17025:2017 LIMS
              </p>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 py-2">
          <nav className="px-2 space-y-1">
            <div className="mb-1">
              <NavItemLink
                item={{ label: 'Dashboard', to: '/', icon: LayoutDashboard }}
                collapsed={sidebarCollapsed}
                designation={designation ?? ''}
              />
            </div>

            <Separator className="!my-2 bg-sidebar-border/30" />

            {NAV_SECTIONS.map((section) => (
              <NavSectionGroup
                key={section.clause}
                section={section}
                collapsed={sidebarCollapsed}
                designation={designation ?? ''}
              />
            ))}
          </nav>
        </ScrollArea>

        <div className={cn(
          'border-t border-sidebar-border/50 px-2 py-2 shrink-0',
          sidebarCollapsed && 'px-1',
        )}>
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-150',
              'text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              sidebarCollapsed && 'justify-center px-2',
            )}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            {!sidebarCollapsed && <span className="flex-1 text-left truncate">Collapse</span>}
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6">
          <div className="flex items-center gap-4">
            <Breadcrumbs />
            {!ROUTE_LABELS[location.pathname] && (
              <span className="text-sm font-semibold text-foreground">
                {labName || 'Quality International Research & Laboratories Pvt. Ltd.'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 rounded-full bg-success/10 px-3 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-[11px] font-semibold text-success">Accredited</span>
            </div>

            <Separator orientation="vertical" className="h-6 bg-border" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent transition-colors">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                    {initials}
                  </div>
                  <div className="hidden sm:block text-left leading-tight">
                    <p className="text-xs font-semibold text-foreground">{profileName || 'User'}</p>
                    <p className="text-[10px] text-muted-foreground">{designation || 'Staff'}</p>
                  </div>
                  <ChevronDown size={14} className="text-muted-foreground hidden sm:block" />
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

        <main className="flex-1 overflow-auto bg-muted/30">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
