import type { ElementType } from 'react'
import { useState, useEffect } from 'react'
import { 
  FlaskConical, 
  ArrowRight, 
  Clock, 
  ShieldCheck, 
  Layers, 
  AlertTriangle 
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/hooks/useAuth'
import { canAccessPath, isRestrictedModuleRole } from '@/lib/moduleAccess'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { supabase } from '@/lib/supabaseClient'
import { Skeleton } from '@/components/ui/skeleton'

interface StatCardProps {
  title: string
  value: string | number
  subtitle: string
  icon: ElementType
  badgeLabel?: string
  badgeVariant?: 'success' | 'warning' | 'destructive' | 'info'
  href?: string
  colorClass?: string
}

function StatCard({ title, value, subtitle, icon: Icon, badgeLabel, badgeVariant = 'info', href, colorClass = 'bg-primary/10 text-primary' }: StatCardProps) {
  const content = (
    <div className="group relative app-card p-5 transition-all duration-200 hover:scale-[1.01] hover:border-primary/25 hover:shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${colorClass}`}>
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
      className="group app-card flex items-center justify-between gap-3 p-4 transition-all duration-200 hover:scale-[1.01] hover:border-primary/25 hover:shadow-card"
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

interface DashboardStats {
  totalSamples: number
  activeSamples: number
  completedSamples: number
  delayedSamplesCount: number
  onTimeSamplesCount: number
  tatComplianceRate: number
  nablCount: number
  statementConformityCount: number
  witnessTestCount: number
  deviationCount: number
  stageCounts: Record<string, number>
  clientsCount: number
  isCodesCount: number
  delayedSamplesList: Array<{
    id: string
    sample_code: string | null
    description: string | null
    client_name: string | null
    stage: string | null
    tentative_date_by_lab: string | null
  }>
}

export default function DashboardPage() {
  const { designation, departmentName } = useAuth()
  const access = { designation, departmentName }
  const restrictedRole = isRestrictedModuleRole(access)
  const isDirector = isLaboratoryDirector(designation)

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const visibleQuickLinks = QUICK_LINKS.filter((link) => canAccessPath(link.href, access))

  useEffect(() => {
    async function loadStats() {
      try {
        setLoading(true)
        setError(null)

        const todayStr = new Date().toISOString().slice(0, 10)

        // 1. Fetch Samples
        const { data: samples, error: samplesErr } = await supabase
          .from('samples')
          .select('id, stage, tentative_date_by_lab, test_report_nabl_ulr_number, statement_conformity_required, witness_test_required, deviation_from_methods, date_of_sample_receiving, sample_code, description, client_name')

        if (samplesErr) throw samplesErr

        // 2. Fetch Clients Count
        const { count: clientsCount, error: clientsErr } = await supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })

        if (clientsErr) throw clientsErr

        // 3. Fetch IS Codes Count
        const { count: isCodesCount, error: isCodesErr } = await supabase
          .from('is_codes')
          .select('*', { count: 'exact', head: true })

        if (isCodesErr) throw isCodesErr

        let activeSamples = 0
        let completedSamples = 0
        let delayedSamplesCount = 0
        let onTimeSamplesCount = 0
        let nablCount = 0
        let statementConformityCount = 0
        let witnessTestCount = 0
        let deviationCount = 0

        const stageCounts: Record<string, number> = {
          receiving: 0,
          allocation: 0,
          test_allocation: 0,
          under_testing: 0,
          results_review: 0,
          report_preparation: 0,
          completed: 0,
        }

        const delayedSamplesList: any[] = []

        if (samples) {
          samples.forEach((sample) => {
            const stage = sample.stage ?? 'receiving'
            if (stage in stageCounts) {
              stageCounts[stage]++
            }

            if (stage === 'completed') {
              completedSamples++
              if (sample.test_report_nabl_ulr_number) {
                nablCount++
              }
            } else {
              activeSamples++
              
              if (sample.statement_conformity_required) statementConformityCount++
              if (sample.witness_test_required) witnessTestCount++
              if (sample.deviation_from_methods) deviationCount++

              if (sample.tentative_date_by_lab) {
                if (sample.tentative_date_by_lab < todayStr) {
                  delayedSamplesCount++
                  delayedSamplesList.push({
                    id: sample.id,
                    sample_code: sample.sample_code,
                    description: sample.description,
                    client_name: sample.client_name,
                    stage: sample.stage,
                    tentative_date_by_lab: sample.tentative_date_by_lab
                  })
                } else {
                  onTimeSamplesCount++
                }
              }
            }
          })
        }

        // Sort delayed samples by due date
        delayedSamplesList.sort((a, b) => {
          if (!a.tentative_date_by_lab) return 1
          if (!b.tentative_date_by_lab) return -1
          return a.tentative_date_by_lab.localeCompare(b.tentative_date_by_lab)
        })

        const totalWithTat = onTimeSamplesCount + delayedSamplesCount
        const tatComplianceRate = totalWithTat > 0 ? Math.round((onTimeSamplesCount / totalWithTat) * 100) : 100

        setStats({
          totalSamples: samples?.length ?? 0,
          activeSamples,
          completedSamples,
          delayedSamplesCount,
          onTimeSamplesCount,
          tatComplianceRate,
          nablCount,
          statementConformityCount,
          witnessTestCount,
          deviationCount,
          stageCounts,
          clientsCount: clientsCount ?? 0,
          isCodesCount: isCodesCount ?? 0,
          delayedSamplesList,
        })
      } catch (err) {
        console.error('Error loading dashboard stats:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch dashboard statistics')
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [])

  // Render pipeline steps
  const renderPipeline = () => {
    if (!stats) return null

    const steps = [
      { key: 'receiving', label: 'Receiving', desc: 'Sample Registration', clause: '7.4.1' },
      { key: 'allocation', label: 'Allocation', desc: 'Section Assignment', clause: '7.4.2' },
      { key: 'test_allocation', label: 'Test Alloc.', desc: 'Method & Tech Alloc.', clause: '7.2.1' },
      { key: 'under_testing', label: 'Testing', desc: 'Analytical Records', clause: '7.5' },
      { key: 'results_review', label: 'Review', desc: 'Technical Verification', clause: '7.7' },
      { key: 'report_preparation', label: 'Report Prep', desc: 'Drafting Cover Pages', clause: '7.8.2' },
      { key: 'completed', label: 'Completed', desc: 'Issued & Archived', clause: '7.8.8' },
    ]

    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Workflow Pipeline (ISO/IEC 17025 Clause 7.4 - 7.8)
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {steps.map((step) => {
            const count = stats.stageCounts[step.key] ?? 0
            const isActive = count > 0

            return (
              <div 
                key={step.key} 
                className={`app-card flex flex-col justify-between p-3.5 transition-all duration-200 hover:border-primary/20 ${
                  isActive ? 'bg-card border-l-2 border-l-primary' : 'bg-muted/30 opacity-75'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">{step.clause}</span>
                    <Badge variant={isActive ? 'info' : 'secondary'} className="px-1.5 py-0 text-[10px]">
                      {isActive ? 'Active' : 'Idle'}
                    </Badge>
                  </div>
                  <h4 className="mt-2 text-sm font-bold tracking-tight text-foreground">{step.label}</h4>
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{step.desc}</p>
                </div>
                <div className="mt-4 flex items-baseline justify-between border-t border-border/40 pt-2">
                  <span className="text-xs font-semibold text-muted-foreground">Load:</span>
                  <span className={`text-lg font-bold ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                    {count}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Render delayed / attention required samples
  const renderAttentionItems = () => {
    if (!stats) return null

    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle size={16} className="text-warning" />
          Attention Required: Delayed / Overdue Samples
        </h3>
        <div className="app-card overflow-hidden">
          {stats.delayedSamplesList.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border/60 text-muted-foreground font-semibold">
                    <th className="p-3">Sample Code</th>
                    <th className="p-3">Client Name</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Current Stage</th>
                    <th className="p-3 text-right">Target Completion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {stats.delayedSamplesList.map((sample) => (
                    <tr key={sample.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-semibold text-primary">
                        <NavLink to={`/samples/under-testing`} className="hover:underline">
                          {sample.sample_code || '—'}
                        </NavLink>
                      </td>
                      <td className="p-3 truncate max-w-[150px]">{sample.client_name || '—'}</td>
                      <td className="p-3 truncate max-w-[200px]">{sample.description || '—'}</td>
                      <td className="p-3">
                        <Badge variant="warning" className="capitalize text-[10px]">
                          {sample.stage?.replace('_', ' ') || 'Receiving'}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-medium text-destructive">
                        {sample.tentative_date_by_lab || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <ShieldCheck size={28} className="mx-auto text-success mb-2" />
              All active samples are currently meeting target completion timelines.
            </div>
          )}
        </div>
      </div>
    )
  }

  // Render loaders
  const renderSkeletons = () => {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:space-y-8 sm:p-6">
        <div className="app-card h-28 animate-pulse bg-muted" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="app-card p-5 space-y-3" style={{ contentVisibility: 'auto' }}>
              <Skeleton className="h-11 w-11 rounded-xl" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-5 w-48" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="app-card p-3.5 h-32 flex flex-col justify-between">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-full mt-4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return renderSkeletons()
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-xl p-6 text-center space-y-4">
        <AlertTriangle className="mx-auto text-destructive" size={48} />
        <h2 className="text-lg font-bold">Failed to Load Dashboard</h2>
        <p className="text-sm text-muted-foreground">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="px-4 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary/95"
        >
          Retry
        </button>
      </div>
    )
  }

  // If role is Laboratory Director, show the rich executive dashboard
  if (isDirector && stats) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:space-y-8 sm:p-6">
        {/* Welcome Header */}
        <div className="app-card overflow-hidden">
          <div className="border-b border-border/60 bg-gradient-to-r from-lab-800 via-primary to-lab-600 px-5 py-6 text-center text-white sm:px-6">
            <Badge className="bg-white/20 text-white hover:bg-white/20 mb-2 border-none">
              ISO/IEC 17025:2017 Executive Dashboard
            </Badge>
            <h1 className="text-xl font-bold tracking-tight sm:text-3xl">Welcome Back, Laboratory Director</h1>
            <p className="mt-1 text-sm text-blue-50/90">
              Overviewing compliance, testing performance, and quality management systems
            </p>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Active Testing Load"
            value={stats.activeSamples}
            subtitle="Samples currently in process"
            icon={FlaskConical}
            badgeLabel="In Progress"
            badgeVariant="info"
            colorClass="bg-blue-500/10 text-blue-600"
          />
          <StatCard
            title="TAT Compliance Rate"
            value={`${stats.tatComplianceRate}%`}
            subtitle="Samples completed on schedule"
            icon={Clock}
            badgeLabel={stats.tatComplianceRate >= 90 ? 'Healthy' : 'Needs Review'}
            badgeVariant={stats.tatComplianceRate >= 90 ? 'success' : 'warning'}
            colorClass={stats.tatComplianceRate >= 90 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}
          />
          <StatCard
            title="Compliance Risks"
            value={`${stats.deviationCount} / ${stats.witnessTestCount}`}
            subtitle="Deviations / Witness tests active"
            icon={ShieldCheck}
            badgeLabel="Quality Controls"
            badgeVariant="info"
            colorClass="bg-purple-500/10 text-purple-600"
          />
          <StatCard
            title="Directories Overview"
            value={`${stats.clientsCount} / ${stats.isCodesCount}`}
            subtitle="Total Clients / Active IS Codes"
            icon={Layers}
            badgeLabel="Data Masters"
            badgeVariant="info"
            colorClass="bg-indigo-500/10 text-indigo-600"
          />
        </div>

        {/* Workflow Pipeline */}
        {renderPipeline()}

        {/* Attention Items */}
        {renderAttentionItems()}

        {/* Quick Links */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            System Modules & Directories
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {visibleQuickLinks.map((link) => (
              <QuickLinkCard key={link.href} title={link.title} subtitle={link.subtitle} href={link.href} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Standard / simplified view for non-directors
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

      {!restrictedRole && stats && (
        <div className="flex justify-center">
          <div className="grid w-full max-w-xs gap-4">
            <StatCard
              title="Active Samples In Lab"
              value={stats.activeSamples}
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
