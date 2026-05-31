import type { ElementType } from 'react'
import { FlaskConical, ArrowRight } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/hooks/useAuth'
import { canAccessPath, isRestrictedModuleRole } from '@/lib/moduleAccess'

interface StatCardProps {
  title: string
  value: string | number
  subtitle: string
  icon: ElementType
  badgeLabel?: string
  badgeVariant?: 'success' | 'warning' | 'destructive' | 'info'
  href?: string
}

function StatCard({ title, value, subtitle, icon: Icon, badgeLabel, badgeVariant = 'info', href }: StatCardProps) {
  const content = (
    <div className="group relative app-card p-5 transition-all duration-200 hover:border-primary/25 hover:shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon size={22} />
        </div>
        {badgeLabel && <Badge variant={badgeVariant}>{badgeLabel}</Badge>}
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
        <p className="mt-1 text-sm font-semibold text-foreground/85">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {href && (
        <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          View details <ArrowRight size={12} />
        </div>
      )}
    </div>
  )

  if (href) {
    return <NavLink to={href} className="block">{content}</NavLink>
  }

  return content
}

function QuickLinkCard({ title, subtitle, href }: { title: string; subtitle: string; href: string }) {
  return (
    <NavLink
      to={href}
      className="group app-card flex items-center justify-between gap-3 p-4 transition-all duration-200 hover:border-primary/25 hover:shadow-card"
    >
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ArrowRight size={16} className="shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </NavLink>
  )
}

const QUICK_LINKS = [
  {
    title: 'Sample Under Testing',
    subtitle: 'Enter test results and technical records',
    href: '/samples/under-testing',
  },
  {
    title: 'Test Allocation',
    subtitle: 'Assign test parameters and employees',
    href: '/samples/test-allocation',
  },
  {
    title: 'Results Under Review',
    subtitle: 'Review and approve test results',
    href: '/samples/results-review',
  },
  {
    title: 'Test Report Preparation',
    subtitle: 'Prepare and issue test reports',
    href: '/samples/report-preparation',
  },
  {
    title: 'Issued Test Report',
    subtitle: 'View completed test reports and records',
    href: '/samples/completed',
  },
  {
    title: 'Sample Allocation',
    subtitle: 'Allocate samples to departments and sections',
    href: '/samples/allocation',
  },
  {
    title: 'Sample Receiving',
    subtitle: 'Register new samples for testing',
    href: '/samples/receiving',
  },
  {
    title: 'Client Master',
    subtitle: 'Manage client directory',
    href: '/masters/clients',
  },
  {
    title: 'Test Parameters',
    subtitle: 'Configure test methods and parameters',
    href: '/masters/test-parameter',
  },
  {
    title: 'IS Code Master',
    subtitle: 'Manage Indian Standards codes',
    href: '/masters/is-codes',
  },
  {
    title: 'NABL Scope',
    subtitle: 'View accredited scope of testing',
    href: '/masters/nabl-scope',
  },
] as const

export default function DashboardPage() {
  const { designation, departmentName } = useAuth()
  const access = { designation, departmentName }
  const restrictedRole = isRestrictedModuleRole(access)

  const visibleQuickLinks = QUICK_LINKS.filter((link) => canAccessPath(link.href, access))

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:space-y-8 sm:p-6">
      <div className="app-card overflow-hidden">
        <div className="border-b border-border/60 bg-gradient-to-r from-lab-800 via-primary to-lab-600 px-5 py-5 text-center text-white sm:px-6">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Dashboard</h1>
          <p className="mt-1 text-sm text-blue-50/90">
            Laboratory management overview — ISO/IEC 17025:2017
          </p>
        </div>
      </div>

      {!restrictedRole && (
        <div className="flex justify-center">
          <div className="grid w-full max-w-xs gap-4">
            <StatCard
              title="Samples In Progress"
              value="—"
              subtitle="Clause 7.4 — Sample Handling"
              icon={FlaskConical}
              badgeLabel="In Testing"
              badgeVariant="info"
              href="/samples/under-testing"
            />
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">Quick Links</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visibleQuickLinks.map((link) => (
            <QuickLinkCard key={link.href} title={link.title} subtitle={link.subtitle} href={link.href} />
          ))}
        </div>
      </div>
    </div>
  )
}
