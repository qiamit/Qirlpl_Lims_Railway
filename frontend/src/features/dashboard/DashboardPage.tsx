import { useEffect, useState } from 'react'
import type { ElementType } from 'react'
import { FlaskConical, FileText, Users, ArrowRight } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabaseClient'

interface StatCardProps {
  title: string
  value: string | number
  subtitle: string
  icon: ElementType
  badgeLabel?: string
  badgeVariant?: 'success' | 'warning' | 'destructive' | 'info'
  href?: string
  loading?: boolean
}

function StatCard({ title, value, subtitle, icon: Icon, badgeLabel, badgeVariant = 'info', href, loading }: StatCardProps) {
  const content = (
    <div className="group relative rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:shadow-md hover:border-primary/20">
      <div className="flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/8 text-primary">
          <Icon size={22} />
        </div>
        {badgeLabel && <Badge variant={badgeVariant}>{badgeLabel}</Badge>}
      </div>
      <div className="mt-4">
        {loading ? (
          <Skeleton className="h-9 w-20" />
        ) : (
          <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
        )}
        <p className="mt-1 text-sm font-medium text-foreground/80">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {href && (
        <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
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
      className="group rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:shadow-md hover:border-primary/20 flex items-center justify-between"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <ArrowRight size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
    </NavLink>
  )
}

export default function DashboardPage() {
  const [activePersonnelCount, setActivePersonnelCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let canceled = false

    const loadCounts = async () => {
      const { count } = await supabase
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })

      if (canceled) return
      setActivePersonnelCount(typeof count === 'number' ? count : null)
      setLoading(false)
    }

    void loadCounts()

    return () => {
      canceled = true
    }
  }, [])

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Laboratory management overview — ISO/IEC 17025:2017
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard
          title="Samples In Progress"
          value="—"
          subtitle="Clause 7.4 — Sample Handling"
          icon={FlaskConical}
          badgeLabel="In Testing"
          badgeVariant="info"
          href="/samples/under-testing"
        />
        <StatCard
          title="Reports Issued"
          value="—"
          subtitle="Clause 7.8 — Reporting of Results"
          icon={FileText}
          badgeLabel="This Month"
          badgeVariant="info"
          href="/reports"
        />
        <StatCard
          title="Active Personnel"
          value={typeof activePersonnelCount === 'number' ? activePersonnelCount : '—'}
          subtitle="Clause 6.2 — Authorised Staff"
          icon={Users}
          badgeLabel="Active"
          badgeVariant="success"
          href="/personnel"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Quick Links</h2>
          <div className="space-y-2">
            <QuickLinkCard
              title="Sample Receiving"
              subtitle="Register new samples for testing"
              href="/samples/receiving"
            />
            <QuickLinkCard
              title="Client Master"
              subtitle="Manage client directory"
              href="/masters/clients"
            />
            <QuickLinkCard
              title="Test Parameters"
              subtitle="Configure test methods and parameters"
              href="/masters/test-parameter"
            />
            <QuickLinkCard
              title="IS Code Master"
              subtitle="Manage Indian Standards codes"
              href="/masters/is-codes"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
