import type { ElementType } from 'react'
import { useMemo, useState, useEffect } from 'react'
import {
  FlaskConical,
  ArrowRight,
  Clock,
  ShieldCheck,
  Layers,
  AlertTriangle,
  ClipboardCheck,
  FileText,
  Users,
  TestTube,
  Inbox,
  CheckCircle2,
  Wrench,
  CalendarClock,
  BookOpen,
  FileSignature,
  UserRound,
  Gauge,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/hooks/useAuth'
import {
  canAccessPath,
  isChemicalTechnicalManager,
  isChemicalTestingEngineer,
  isMechanicalTechnicalManager,
  isMechanicalTestingEngineer,
  isQualityAssuranceQualityManager,
  isSampleCellReceptionist,
  isSampleCellSampleIncharge,
  type UserAccessContext,
} from '@/lib/moduleAccess'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { supabase } from '@/lib/supabaseClient'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

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

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  badgeLabel,
  badgeVariant = 'info',
  href,
  colorClass = 'bg-primary/10 text-primary',
}: StatCardProps) {
  const content = (
    <div className="group relative flex h-full flex-col app-card p-3.5 transition-all duration-200 hover:border-primary/25 hover:shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', colorClass)}>
          <Icon size={18} />
        </div>
        {badgeLabel ? (
          <Badge variant={badgeVariant} className="max-w-[7.5rem] truncate px-1.5 py-0 text-[10px]">
            {badgeLabel}
          </Badge>
        ) : null}
      </div>
      <div className="mt-2.5 min-w-0 flex-1">
        <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
        <p className="mt-0.5 truncate text-xs font-semibold text-foreground/85">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{subtitle}</p>
      </div>
      {href ? (
        <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          Open <ArrowRight size={11} />
        </div>
      ) : null}
    </div>
  )

  if (href) {
    return (
      <NavLink to={href} className="block h-full">
        {content}
      </NavLink>
    )
  }
  return content
}

function QuickLinkCard({ title, subtitle, href }: { title: string; subtitle: string; href: string }) {
  return (
    <NavLink
      to={href}
      className="group app-card flex items-center justify-between gap-2 px-3 py-2.5 transition-all duration-200 hover:border-primary/25 hover:shadow-card"
    >
      <div className="min-w-0">
        <h3 className="truncate text-xs font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      <ArrowRight
        size={14}
        className="shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
      />
    </NavLink>
  )
}

const QUICK_LINKS = [
  { title: 'Sample Under Testing', subtitle: 'Enter test results', href: '/samples/under-testing' },
  { title: 'Test Allocation', subtitle: 'Assign methods & staff', href: '/samples/test-allocation' },
  { title: 'Results Under Review', subtitle: 'Technical verification', href: '/samples/results-review' },
  { title: 'Test Report Preparation', subtitle: 'Prepare & issue reports', href: '/samples/report-preparation' },
  { title: 'Issued Test Report', subtitle: 'Completed records', href: '/samples/completed' },
  { title: 'Retain & Disposed', subtitle: 'Retention & disposal', href: '/samples/retain-disposed' },
  { title: 'Sample Allocation', subtitle: 'Section assignment', href: '/samples/allocation' },
  { title: 'Sample Receiving', subtitle: 'Register new samples', href: '/samples/receiving' },
  { title: 'Validating the Results', subtitle: 'IQC & validity checks', href: '/samples/result-validation' },
  { title: 'Client Master', subtitle: 'Client directory', href: '/masters/clients' },
  { title: 'Test Parameters', subtitle: 'Methods & parameters', href: '/masters/test-parameter' },
  { title: 'IS Code Master', subtitle: 'Indian Standards', href: '/masters/is-codes' },
  { title: 'Consent Letter', subtitle: 'BIS consent letters', href: '/masters/consent-letter' },
  { title: 'Equipment Master', subtitle: 'Calibration & maintenance', href: '/masters/equipment' },
  { title: 'Masters for IQC', subtitle: 'IQC materials', href: '/masters/iqc' },
  { title: 'NABL Scope', subtitle: 'Accredited scope', href: '/masters/nabl-scope' },
] as const

interface DashboardStats {
  totalSamples: number
  activeSamples: number
  completedSamples: number
  delayedSamplesCount: number
  onTimeSamplesCount: number
  dueSoonCount: number
  receivedToday: number
  tatComplianceRate: number
  nablCount: number
  statementConformityCount: number
  witnessTestCount: number
  deviationCount: number
  stageCounts: Record<string, number>
  clientsCount: number
  isCodesCount: number
  equipmentCount: number
  equipmentActiveCount: number
  calibrationOverdue: number
  intermediateOverdue: number
  maintenanceOverdue: number
  consentLettersCount: number
  testParametersCount: number
  iqcMastersCount: number
  resultChecksCount: number
  usersCount: number
  delayedSamplesList: Array<{
    id: string
    sample_code: string | null
    description: string | null
    client_name: string | null
    stage: string | null
    tentative_date_by_lab: string | null
  }>
}

type RoleDashboardProfile = {
  badge: string
  title: string
  subtitle: string
  focusStages: string[]
  primaryHref?: string
}

function resolveRoleProfile(
  access: UserAccessContext,
  designation: string,
  departmentName: string,
): RoleDashboardProfile {
  if (isLaboratoryDirector(designation)) {
    return {
      badge: 'ISO/IEC 17025:2017 Executive Dashboard',
      title: 'Welcome Back, Laboratory Director',
      subtitle: 'Lab-wide compliance, testing performance, and quality oversight',
      focusStages: [
        'receiving',
        'allocation',
        'test_allocation',
        'under_testing',
        'results_review',
        'report_preparation',
        'completed',
      ],
    }
  }
  if (isSampleCellReceptionist(access)) {
    return {
      badge: 'Sample Cell · Receptionist',
      title: `Welcome, ${designation || 'Receptionist'}`,
      subtitle: 'Sample registration, clients, and retention intake',
      focusStages: ['receiving', 'completed'],
      primaryHref: '/samples/receiving',
    }
  }
  if (isSampleCellSampleIncharge(access)) {
    return {
      badge: 'Sample Cell · Sample Incharge',
      title: `Welcome, ${designation || 'Sample Incharge'}`,
      subtitle: 'Section allocation, retain/disposal, and validation support',
      focusStages: ['allocation', 'receiving'],
      primaryHref: '/samples/allocation',
    }
  }
  if (isChemicalTechnicalManager(access) || isMechanicalTechnicalManager(access)) {
    return {
      badge: `${departmentName.trim() || 'Department'} · Technical Manager`,
      title: 'Welcome, Technical Manager',
      subtitle: 'Test allocation, results review, and technical verification',
      focusStages: ['test_allocation', 'results_review', 'under_testing'],
      primaryHref: '/samples/test-allocation',
    }
  }
  if (isChemicalTestingEngineer(access) || isMechanicalTestingEngineer(access)) {
    return {
      badge: `${departmentName.trim() || 'Department'} · Testing Engineer`,
      title: 'Welcome, Testing Engineer',
      subtitle: 'Enter results, manage section tests, keep records current',
      focusStages: ['under_testing', 'results_review'],
      primaryHref: '/samples/under-testing',
    }
  }
  if (isQualityAssuranceQualityManager(access)) {
    return {
      badge: 'Quality Assurance · Quality Manager',
      title: 'Welcome, Quality Manager',
      subtitle: 'Report preparation, issued reports, retain/disposal, IQC',
      focusStages: ['report_preparation', 'completed', 'results_review'],
      primaryHref: '/samples/report-preparation',
    }
  }
  return {
    badge: [departmentName, designation].filter(Boolean).join(' · ') || 'Laboratory Staff',
    title: `Welcome${designation ? `, ${designation}` : ''}`,
    subtitle: 'Your role-based laboratory overview — ISO/IEC 17025:2017',
    focusStages: ['under_testing', 'results_review', 'report_preparation'],
  }
}

function stageHref(stageKey: string): string | undefined {
  const map: Record<string, string> = {
    receiving: '/samples/receiving',
    allocation: '/samples/allocation',
    test_allocation: '/samples/test-allocation',
    under_testing: '/samples/under-testing',
    results_review: '/samples/results-review',
    report_preparation: '/samples/report-preparation',
    completed: '/samples/completed',
  }
  return map[stageKey]
}

function addDaysIso(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function DashboardPage() {
  const { designation, departmentName, profileName } = useAuth()
  const access: UserAccessContext = { designation, departmentName }
  const isDirector = isLaboratoryDirector(designation)
  const role = useMemo(
    () => resolveRoleProfile(access, designation, departmentName),
    [designation, departmentName],
  )

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
        const dueSoonEnd = addDaysIso(todayStr, 7)

        const { data: samples, error: samplesErr } = await supabase
          .from('samples')
          .select(
            'id, stage, tentative_date_by_lab, test_report_nabl_ulr_number, statement_conformity_required, witness_test_required, deviation_from_methods, date_of_sample_receiving, sample_code, description, client_name',
          )
        if (samplesErr) throw samplesErr

        const [
          clientsRes,
          isCodesRes,
          equipmentRes,
          consentRes,
          testParamRes,
          iqcRes,
          resultCheckRes,
          usersRes,
        ] = await Promise.all([
          supabase.from('clients').select('*', { count: 'exact', head: true }),
          supabase.from('is_codes').select('*', { count: 'exact', head: true }),
          supabase
            .from('equipment_master')
            .select(
              'id, equipment_status, next_calibration_due, next_intermediate_check_date, next_maintenance_date',
            ),
          supabase.from('consent_letters').select('*', { count: 'exact', head: true }),
          supabase.from('test_parameters').select('*', { count: 'exact', head: true }),
          supabase.from('iqc_masters').select('*', { count: 'exact', head: true }),
          supabase.from('result_validity_checks').select('*', { count: 'exact', head: true }),
          supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
        ])

        if (clientsRes.error) throw clientsRes.error
        if (isCodesRes.error) throw isCodesRes.error

        const equipmentRows = equipmentRes.data ?? []
        let equipmentActiveCount = 0
        let calibrationOverdue = 0
        let intermediateOverdue = 0
        let maintenanceOverdue = 0
        for (const eq of equipmentRows) {
          const status = String((eq as { equipment_status?: string | null }).equipment_status ?? '')
            .trim()
            .toLowerCase()
          if (!status || status === 'active') equipmentActiveCount++
          const cal = (eq as { next_calibration_due?: string | null }).next_calibration_due
          const ic = (eq as { next_intermediate_check_date?: string | null }).next_intermediate_check_date
          const mt = (eq as { next_maintenance_date?: string | null }).next_maintenance_date
          if (cal && cal < todayStr) calibrationOverdue++
          if (ic && ic < todayStr) intermediateOverdue++
          if (mt && mt < todayStr) maintenanceOverdue++
        }

        let activeSamples = 0
        let completedSamples = 0
        let delayedSamplesCount = 0
        let onTimeSamplesCount = 0
        let dueSoonCount = 0
        let receivedToday = 0
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

        const delayedSamplesList: DashboardStats['delayedSamplesList'] = []

        if (samples) {
          for (const sample of samples) {
            const stage = sample.stage ?? 'receiving'
            if (stage in stageCounts) stageCounts[stage]++

            if (sample.date_of_sample_receiving === todayStr) receivedToday++

            if (stage === 'completed') {
              completedSamples++
              if (sample.test_report_nabl_ulr_number) nablCount++
            } else {
              activeSamples++
              if (sample.statement_conformity_required) statementConformityCount++
              if (sample.witness_test_required) witnessTestCount++
              if (sample.deviation_from_methods) deviationCount++

              if (sample.tentative_date_by_lab) {
                const due = sample.tentative_date_by_lab
                if (due < todayStr) {
                  delayedSamplesCount++
                  delayedSamplesList.push({
                    id: sample.id,
                    sample_code: sample.sample_code,
                    description: sample.description,
                    client_name: sample.client_name,
                    stage: sample.stage,
                    tentative_date_by_lab: sample.tentative_date_by_lab,
                  })
                } else {
                  onTimeSamplesCount++
                  if (due <= dueSoonEnd) dueSoonCount++
                }
              }
            }
          }
        }

        delayedSamplesList.sort((a, b) => {
          if (!a.tentative_date_by_lab) return 1
          if (!b.tentative_date_by_lab) return -1
          return a.tentative_date_by_lab.localeCompare(b.tentative_date_by_lab)
        })

        const totalWithTat = onTimeSamplesCount + delayedSamplesCount
        const tatComplianceRate =
          totalWithTat > 0 ? Math.round((onTimeSamplesCount / totalWithTat) * 100) : 100

        setStats({
          totalSamples: samples?.length ?? 0,
          activeSamples,
          completedSamples,
          delayedSamplesCount,
          onTimeSamplesCount,
          dueSoonCount,
          receivedToday,
          tatComplianceRate,
          nablCount,
          statementConformityCount,
          witnessTestCount,
          deviationCount,
          stageCounts,
          clientsCount: clientsRes.count ?? 0,
          isCodesCount: isCodesRes.count ?? 0,
          equipmentCount: equipmentRows.length,
          equipmentActiveCount,
          calibrationOverdue,
          intermediateOverdue,
          maintenanceOverdue,
          consentLettersCount: consentRes.count ?? 0,
          testParametersCount: testParamRes.count ?? 0,
          iqcMastersCount: iqcRes.count ?? 0,
          resultChecksCount: resultCheckRes.count ?? 0,
          usersCount: usersRes.count ?? 0,
          delayedSamplesList,
        })
      } catch (err) {
        console.error('Error loading dashboard stats:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch dashboard statistics')
      } finally {
        setLoading(false)
      }
    }

    void loadStats()
  }, [])

  const roleStatCards = useMemo((): StatCardProps[] => {
    if (!stats) return []

    const commonOps: StatCardProps[] = [
      {
        title: 'Received Today',
        value: stats.receivedToday,
        subtitle: 'Samples registered today',
        icon: Inbox,
        href: canAccessPath('/samples/receiving', access) ? '/samples/receiving' : undefined,
        badgeLabel: 'Today',
        colorClass: 'bg-cyan-500/10 text-cyan-700',
      },
      {
        title: 'Due in 7 Days',
        value: stats.dueSoonCount,
        subtitle: 'Active samples nearing TAT',
        icon: CalendarClock,
        badgeLabel: 'Upcoming',
        badgeVariant: stats.dueSoonCount > 0 ? 'warning' : 'info',
        colorClass: 'bg-orange-500/10 text-orange-600',
      },
      {
        title: 'Overdue Samples',
        value: stats.delayedSamplesCount,
        subtitle: 'Past tentative lab date',
        icon: AlertTriangle,
        badgeLabel: stats.delayedSamplesCount > 0 ? 'Attention' : 'Clear',
        badgeVariant: stats.delayedSamplesCount > 0 ? 'warning' : 'success',
        colorClass: 'bg-amber-500/10 text-amber-600',
      },
    ]

    if (isDirector) {
      return [
        {
          title: 'Active Load',
          value: stats.activeSamples,
          subtitle: 'Samples currently in process',
          icon: FlaskConical,
          badgeLabel: 'In Progress',
          colorClass: 'bg-blue-500/10 text-blue-600',
        },
        {
          title: 'TAT Compliance',
          value: `${stats.tatComplianceRate}%`,
          subtitle: 'Active samples on schedule',
          icon: Clock,
          badgeLabel: stats.tatComplianceRate >= 90 ? 'Healthy' : 'Review',
          badgeVariant: stats.tatComplianceRate >= 90 ? 'success' : 'warning',
          colorClass:
            stats.tatComplianceRate >= 90
              ? 'bg-emerald-500/10 text-emerald-600'
              : 'bg-amber-500/10 text-amber-600',
        },
        ...commonOps,
        {
          title: 'Issued Reports',
          value: stats.completedSamples,
          subtitle: 'Completed / archived SRFs',
          icon: CheckCircle2,
          href: '/samples/completed',
          badgeLabel: 'Issued',
          colorClass: 'bg-emerald-500/10 text-emerald-600',
        },
        {
          title: 'NABL / ULR',
          value: stats.nablCount,
          subtitle: 'Issued with NABL ULR',
          icon: ShieldCheck,
          badgeLabel: 'Accreditation',
          colorClass: 'bg-violet-500/10 text-violet-600',
        },
        {
          title: 'Under Testing',
          value: stats.stageCounts.under_testing,
          subtitle: 'Analytical workload',
          icon: TestTube,
          href: '/samples/under-testing',
          badgeLabel: 'Testing',
          colorClass: 'bg-sky-500/10 text-sky-600',
        },
        {
          title: 'Results Review',
          value: stats.stageCounts.results_review,
          subtitle: 'Awaiting verification',
          icon: ClipboardCheck,
          href: '/samples/results-review',
          badgeLabel: 'Review',
          colorClass: 'bg-indigo-500/10 text-indigo-600',
        },
        {
          title: 'Report Prep',
          value: stats.stageCounts.report_preparation,
          subtitle: 'Drafts pending issue',
          icon: FileText,
          href: '/samples/report-preparation',
          badgeLabel: 'Reports',
          colorClass: 'bg-fuchsia-500/10 text-fuchsia-600',
        },
        {
          title: 'Deviations / Witness',
          value: `${stats.deviationCount}/${stats.witnessTestCount}`,
          subtitle: 'Active quality flags',
          icon: Gauge,
          badgeLabel: 'QC',
          colorClass: 'bg-rose-500/10 text-rose-600',
        },
        {
          title: 'Clients / IS Codes',
          value: `${stats.clientsCount}/${stats.isCodesCount}`,
          subtitle: 'Directory masters',
          icon: Layers,
          badgeLabel: 'Masters',
          colorClass: 'bg-slate-500/10 text-slate-700',
        },
        {
          title: 'Test Parameters',
          value: stats.testParametersCount,
          subtitle: 'Configured methods',
          icon: BookOpen,
          href: '/masters/test-parameter',
          badgeLabel: 'Methods',
          colorClass: 'bg-teal-500/10 text-teal-700',
        },
        {
          title: 'Equipment Active',
          value: `${stats.equipmentActiveCount}/${stats.equipmentCount}`,
          subtitle: 'Active / total assets',
          icon: Wrench,
          href: '/masters/equipment',
          badgeLabel: 'Assets',
          colorClass: 'bg-blue-500/10 text-blue-700',
        },
        {
          title: 'Cal. Overdue',
          value: stats.calibrationOverdue,
          subtitle: 'Next calibration past due',
          icon: CalendarClock,
          href: '/masters/equipment',
          badgeLabel: stats.calibrationOverdue > 0 ? 'Due' : 'OK',
          badgeVariant: stats.calibrationOverdue > 0 ? 'destructive' : 'success',
          colorClass: 'bg-red-500/10 text-red-600',
        },
        {
          title: 'IC / Maint. Overdue',
          value: `${stats.intermediateOverdue}/${stats.maintenanceOverdue}`,
          subtitle: 'Intermediate / maintenance',
          icon: Wrench,
          href: '/masters/equipment',
          badgeLabel:
            stats.intermediateOverdue + stats.maintenanceOverdue > 0 ? 'Attention' : 'OK',
          badgeVariant:
            stats.intermediateOverdue + stats.maintenanceOverdue > 0 ? 'warning' : 'success',
          colorClass: 'bg-orange-500/10 text-orange-700',
        },
        {
          title: 'Consent Letters',
          value: stats.consentLettersCount,
          subtitle: 'Generated consent records',
          icon: FileSignature,
          href: '/masters/consent-letter',
          badgeLabel: 'BIS',
          colorClass: 'bg-lime-500/10 text-lime-700',
        },
        {
          title: 'IQC / Validity',
          value: `${stats.iqcMastersCount}/${stats.resultChecksCount}`,
          subtitle: 'IQC masters / checks logged',
          icon: ClipboardCheck,
          href: '/samples/result-validation',
          badgeLabel: '7.7',
          colorClass: 'bg-purple-500/10 text-purple-600',
        },
        {
          title: 'Lab Users',
          value: stats.usersCount,
          subtitle: 'Active user profiles',
          icon: UserRound,
          href: '/lab-settings/user-management',
          badgeLabel: 'Team',
          colorClass: 'bg-stone-500/10 text-stone-700',
        },
      ]
    }

    if (isSampleCellReceptionist(access)) {
      return [
        {
          title: 'Receiving Queue',
          value: stats.stageCounts.receiving,
          subtitle: 'At receiving stage',
          icon: Inbox,
          href: '/samples/receiving',
          badgeLabel: 'Receiving',
          colorClass: 'bg-blue-500/10 text-blue-600',
        },
        {
          title: 'Active in Lab',
          value: stats.activeSamples,
          subtitle: 'Non-completed samples',
          icon: FlaskConical,
          badgeLabel: 'In Progress',
          colorClass: 'bg-sky-500/10 text-sky-600',
        },
        ...commonOps,
        {
          title: 'Clients',
          value: stats.clientsCount,
          subtitle: 'Registered clients',
          icon: Users,
          href: '/masters/clients',
          badgeLabel: 'Directory',
          colorClass: 'bg-emerald-500/10 text-emerald-600',
        },
        {
          title: 'IS Codes',
          value: stats.isCodesCount,
          subtitle: 'Standards available',
          icon: BookOpen,
          href: '/masters/is-codes',
          badgeLabel: 'Masters',
          colorClass: 'bg-teal-500/10 text-teal-700',
        },
        {
          title: 'Issued Reports',
          value: stats.completedSamples,
          subtitle: 'Completed SRFs',
          icon: CheckCircle2,
          badgeLabel: 'Issued',
          colorClass: 'bg-emerald-500/10 text-emerald-700',
        },
      ]
    }

    if (isSampleCellSampleIncharge(access)) {
      return [
        {
          title: 'Allocation Backlog',
          value: stats.stageCounts.allocation + stats.stageCounts.receiving,
          subtitle: 'Receiving + allocation',
          icon: Layers,
          href: '/samples/allocation',
          badgeLabel: 'Allocate',
          colorClass: 'bg-blue-500/10 text-blue-600',
        },
        {
          title: 'Under Testing',
          value: stats.stageCounts.under_testing,
          subtitle: 'Sections testing',
          icon: TestTube,
          badgeLabel: 'In Lab',
          colorClass: 'bg-sky-500/10 text-sky-600',
        },
        ...commonOps,
        {
          title: 'Equipment',
          value: stats.equipmentCount,
          subtitle: 'Assets in register',
          icon: Wrench,
          href: '/masters/equipment',
          badgeLabel: 'Assets',
          colorClass: 'bg-slate-500/10 text-slate-700',
        },
        {
          title: 'Consent Letters',
          value: stats.consentLettersCount,
          subtitle: 'BIS consent records',
          icon: FileSignature,
          href: '/masters/consent-letter',
          badgeLabel: 'BIS',
          colorClass: 'bg-lime-500/10 text-lime-700',
        },
        {
          title: 'IS Codes',
          value: stats.isCodesCount,
          subtitle: 'Standards available',
          icon: BookOpen,
          href: '/masters/is-codes',
          badgeLabel: 'Masters',
          colorClass: 'bg-teal-500/10 text-teal-700',
        },
      ]
    }

    if (isChemicalTechnicalManager(access) || isMechanicalTechnicalManager(access)) {
      return [
        {
          title: 'Test Allocation',
          value: stats.stageCounts.test_allocation,
          subtitle: 'Awaiting assign',
          icon: ClipboardCheck,
          href: '/samples/test-allocation',
          badgeLabel: 'Assign',
          colorClass: 'bg-blue-500/10 text-blue-600',
        },
        {
          title: 'Results Review',
          value: stats.stageCounts.results_review,
          subtitle: 'Pending verification',
          icon: ShieldCheck,
          href: '/samples/results-review',
          badgeLabel: 'Review',
          colorClass: 'bg-violet-500/10 text-violet-600',
        },
        {
          title: 'Under Testing',
          value: stats.stageCounts.under_testing,
          subtitle: 'Analytical workload',
          icon: FlaskConical,
          badgeLabel: 'Testing',
          colorClass: 'bg-sky-500/10 text-sky-600',
        },
        {
          title: 'TAT Compliance',
          value: `${stats.tatComplianceRate}%`,
          subtitle: 'On-schedule active',
          icon: Clock,
          badgeVariant: stats.tatComplianceRate >= 90 ? 'success' : 'warning',
          badgeLabel: stats.tatComplianceRate >= 90 ? 'Healthy' : 'Review',
          colorClass:
            stats.tatComplianceRate >= 90
              ? 'bg-emerald-500/10 text-emerald-600'
              : 'bg-amber-500/10 text-amber-600',
        },
        ...commonOps,
        {
          title: 'Cal. Overdue',
          value: stats.calibrationOverdue,
          subtitle: 'Equipment calibration',
          icon: Wrench,
          href: '/masters/equipment',
          badgeVariant: stats.calibrationOverdue > 0 ? 'destructive' : 'success',
          badgeLabel: stats.calibrationOverdue > 0 ? 'Due' : 'OK',
          colorClass: 'bg-red-500/10 text-red-600',
        },
        {
          title: 'Test Parameters',
          value: stats.testParametersCount,
          subtitle: 'Configured methods',
          icon: BookOpen,
          href: '/masters/test-parameter',
          badgeLabel: 'Methods',
          colorClass: 'bg-teal-500/10 text-teal-700',
        },
      ]
    }

    if (isChemicalTestingEngineer(access) || isMechanicalTestingEngineer(access)) {
      return [
        {
          title: 'Testing Queue',
          value: stats.stageCounts.under_testing,
          subtitle: 'Samples under testing',
          icon: FlaskConical,
          href: '/samples/under-testing',
          badgeLabel: 'Enter Results',
          colorClass: 'bg-blue-500/10 text-blue-600',
        },
        {
          title: 'In Review',
          value: stats.stageCounts.results_review,
          subtitle: 'Sent for review',
          icon: ClipboardCheck,
          badgeLabel: 'Review',
          colorClass: 'bg-violet-500/10 text-violet-600',
        },
        ...commonOps,
        {
          title: 'Equipment',
          value: stats.equipmentCount,
          subtitle: 'Register entries',
          icon: Wrench,
          href: canAccessPath('/masters/equipment', access) ? '/masters/equipment' : undefined,
          badgeLabel: 'Assets',
          colorClass: 'bg-sky-500/10 text-sky-600',
        },
        {
          title: 'IC Overdue',
          value: stats.intermediateOverdue,
          subtitle: 'Intermediate checks due',
          icon: CalendarClock,
          href: canAccessPath('/masters/equipment', access) ? '/masters/equipment' : undefined,
          badgeVariant: stats.intermediateOverdue > 0 ? 'warning' : 'success',
          badgeLabel: stats.intermediateOverdue > 0 ? 'Due' : 'OK',
          colorClass: 'bg-orange-500/10 text-orange-600',
        },
        {
          title: 'IQC Masters',
          value: stats.iqcMastersCount,
          subtitle: 'IQC material records',
          icon: Layers,
          href: canAccessPath('/masters/iqc', access) ? '/masters/iqc' : undefined,
          badgeLabel: 'IQC',
          colorClass: 'bg-purple-500/10 text-purple-600',
        },
      ]
    }

    if (isQualityAssuranceQualityManager(access)) {
      return [
        {
          title: 'Report Preparation',
          value: stats.stageCounts.report_preparation,
          subtitle: 'Drafts awaiting issue',
          icon: FileText,
          href: '/samples/report-preparation',
          badgeLabel: 'Prepare',
          colorClass: 'bg-blue-500/10 text-blue-600',
        },
        {
          title: 'Issued Reports',
          value: stats.completedSamples,
          subtitle: 'Completed / archived',
          icon: CheckCircle2,
          href: '/samples/completed',
          badgeLabel: 'Issued',
          colorClass: 'bg-emerald-500/10 text-emerald-600',
        },
        {
          title: 'NABL / ULR',
          value: stats.nablCount,
          subtitle: 'With NABL ULR',
          icon: ShieldCheck,
          badgeLabel: 'Accreditation',
          colorClass: 'bg-violet-500/10 text-violet-600',
        },
        ...commonOps,
        {
          title: 'Consent Letters',
          value: stats.consentLettersCount,
          subtitle: 'BIS consent records',
          icon: FileSignature,
          href: '/masters/consent-letter',
          badgeLabel: 'BIS',
          colorClass: 'bg-lime-500/10 text-lime-700',
        },
        {
          title: 'Validity Checks',
          value: stats.resultChecksCount,
          subtitle: 'Result validity logs',
          icon: ClipboardCheck,
          href: '/samples/result-validation',
          badgeLabel: '7.7',
          colorClass: 'bg-purple-500/10 text-purple-600',
        },
        {
          title: 'Cal. Overdue',
          value: stats.calibrationOverdue,
          subtitle: 'Equipment calibration',
          icon: Wrench,
          href: '/masters/equipment',
          badgeVariant: stats.calibrationOverdue > 0 ? 'destructive' : 'success',
          badgeLabel: stats.calibrationOverdue > 0 ? 'Due' : 'OK',
          colorClass: 'bg-red-500/10 text-red-600',
        },
      ]
    }

    return [
      {
        title: 'Active Samples',
        value: stats.activeSamples,
        subtitle: 'In laboratory process',
        icon: FlaskConical,
        badgeLabel: 'In Progress',
        colorClass: 'bg-blue-500/10 text-blue-600',
      },
      {
        title: 'Under Testing',
        value: stats.stageCounts.under_testing,
        subtitle: 'Analytical work',
        icon: TestTube,
        href: canAccessPath('/samples/under-testing', access) ? '/samples/under-testing' : undefined,
        badgeLabel: 'Testing',
        colorClass: 'bg-sky-500/10 text-sky-600',
      },
      {
        title: 'TAT Compliance',
        value: `${stats.tatComplianceRate}%`,
        subtitle: 'On-schedule active',
        icon: Clock,
        badgeVariant: stats.tatComplianceRate >= 90 ? 'success' : 'warning',
        badgeLabel: stats.tatComplianceRate >= 90 ? 'Healthy' : 'Review',
        colorClass:
          stats.tatComplianceRate >= 90
            ? 'bg-emerald-500/10 text-emerald-600'
            : 'bg-amber-500/10 text-amber-600',
      },
      ...commonOps,
    ]
  }, [stats, access, isDirector])

  const renderPipeline = () => {
    if (!stats) return null
    const steps = [
      { key: 'receiving', label: 'Receiving', desc: 'Registration', clause: '7.4.1' },
      { key: 'allocation', label: 'Allocation', desc: 'Sections', clause: '7.4.2' },
      { key: 'test_allocation', label: 'Test Alloc.', desc: 'Methods', clause: '7.2' },
      { key: 'under_testing', label: 'Testing', desc: 'Records', clause: '7.5' },
      { key: 'results_review', label: 'Review', desc: 'Verify', clause: '7.7' },
      { key: 'report_preparation', label: 'Report', desc: 'Draft', clause: '7.8' },
      { key: 'completed', label: 'Issued', desc: 'Archive', clause: '7.8.8' },
    ]
    const visibleSteps = isDirector
      ? steps
      : steps.filter((s) => role.focusStages.includes(s.key) || (stats.stageCounts[s.key] ?? 0) > 0)

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isDirector ? 'Workflow Pipeline' : 'Focus Stages'}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Total {stats.totalSamples} · Active {stats.activeSamples}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {visibleSteps.map((step) => {
            const count = stats.stageCounts[step.key] ?? 0
            const isFocus = role.focusStages.includes(step.key)
            const href = stageHref(step.key)
            const canLink = href ? canAccessPath(href, access) : false
            const card = (
              <div
                className={cn(
                  'app-card flex h-full flex-col justify-between p-2.5 transition-all hover:border-primary/20',
                  isFocus || count > 0 ? 'border-l-2 border-l-primary bg-card' : 'bg-muted/30 opacity-80',
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-semibold text-muted-foreground">{step.clause}</span>
                    <Badge variant={isFocus ? 'info' : 'secondary'} className="px-1 py-0 text-[9px]">
                      {isFocus ? 'Focus' : count > 0 ? 'Active' : 'Idle'}
                    </Badge>
                  </div>
                  <h4 className="mt-1 text-xs font-bold text-foreground">{step.label}</h4>
                  <p className="text-[10px] text-muted-foreground">{step.desc}</p>
                </div>
                <div className="mt-2 flex items-baseline justify-between border-t border-border/40 pt-1.5">
                  <span className="text-[10px] font-semibold text-muted-foreground">Load</span>
                  <span className={cn('text-base font-bold tabular-nums', count > 0 ? 'text-primary' : 'text-muted-foreground')}>
                    {count}
                  </span>
                </div>
              </div>
            )
            return canLink && href ? (
              <NavLink key={step.key} to={href} className="block">
                {card}
              </NavLink>
            ) : (
              <div key={step.key}>{card}</div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderAttentionItems = () => {
    if (!stats) return null
    const list = stats.delayedSamplesList.slice(0, isDirector ? 10 : 8)
    return (
      <div className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <AlertTriangle size={14} className="text-warning" />
          Overdue Samples
          {stats.delayedSamplesCount > 0 ? (
            <Badge variant="warning" className="ml-1 px-1.5 py-0 text-[10px]">
              {stats.delayedSamplesCount}
            </Badge>
          ) : null}
        </h3>
        <div className="app-card overflow-hidden">
          {list.length > 0 ? (
            <div className="max-h-[220px] overflow-auto">
              <table className="w-full border-collapse text-left text-[11px]">
                <thead className="sticky top-0 z-[1] bg-muted/90 backdrop-blur-sm">
                  <tr className="border-b border-border/60 font-semibold text-muted-foreground">
                    <th className="px-3 py-2">Sample</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="hidden px-3 py-2 md:table-cell">Description</th>
                    <th className="px-3 py-2">Stage</th>
                    <th className="px-3 py-2 text-right">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {list.map((sample) => {
                    const stagePath = stageHref(sample.stage ?? '')
                    const href =
                      stagePath && canAccessPath(stagePath, access)
                        ? stagePath
                        : role.primaryHref && canAccessPath(role.primaryHref, access)
                          ? role.primaryHref
                          : '/'
                    return (
                      <tr key={sample.id} className="hover:bg-muted/20">
                        <td className="px-3 py-1.5 font-semibold text-primary">
                          <NavLink to={href} className="hover:underline">
                            {sample.sample_code || '—'}
                          </NavLink>
                        </td>
                        <td className="max-w-[120px] truncate px-3 py-1.5">{sample.client_name || '—'}</td>
                        <td className="hidden max-w-[180px] truncate px-3 py-1.5 md:table-cell">
                          {sample.description || '—'}
                        </td>
                        <td className="px-3 py-1.5">
                          <Badge variant="warning" className="text-[9px] capitalize">
                            {(sample.stage ?? 'receiving').replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium text-destructive tabular-nums">
                          {sample.tentative_date_by_lab || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-5 text-center text-xs text-muted-foreground">
              <ShieldCheck size={22} className="mx-auto mb-1.5 text-success" />
              All active samples are within target timelines.
            </div>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full w-full space-y-3 p-3 sm:p-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto flex h-full w-full max-w-xl flex-col items-center justify-center space-y-3 p-6 text-center">
        <AlertTriangle className="text-destructive" size={40} />
        <h2 className="text-lg font-bold">Failed to Load Dashboard</h2>
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/95"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!stats) return null

  const displayName = profileName?.trim() || designation || 'User'

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3 overflow-auto p-3 sm:p-4">
      <div className="app-card shrink-0 overflow-hidden">
        <div className="flex flex-col gap-2 bg-gradient-to-r from-lab-800 via-primary to-lab-600 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0 text-left">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge className="border-none bg-white/20 text-[10px] text-white hover:bg-white/20">
                {role.badge}
              </Badge>
            </div>
            <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">{role.title}</h1>
            <p className="mt-0.5 line-clamp-1 text-xs text-blue-50/90">{role.subtitle}</p>
          </div>
          <div className="shrink-0 text-left text-[11px] text-blue-100/80 sm:text-right">
            <p className="font-medium text-white/95">{displayName}</p>
            <p>
              {[departmentName, designation].filter(Boolean).join(' · ') || 'Laboratory Staff'}
            </p>
            <p className="mt-0.5 tabular-nums text-blue-100/70">
              {stats.totalSamples} samples · {stats.activeSamples} active · {stats.tatComplianceRate}% TAT
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-6">
        {roleStatCards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-3">
          {renderPipeline()}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Modules Available to You
            </h2>
            {visibleQuickLinks.length > 0 ? (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {visibleQuickLinks.map((link) => (
                  <QuickLinkCard key={link.href} title={link.title} subtitle={link.subtitle} href={link.href} />
                ))}
              </div>
            ) : (
              <div className="app-card p-4 text-center text-xs text-muted-foreground">
                No module shortcuts assigned to this role yet.
              </div>
            )}
          </div>
        </div>
        {renderAttentionItems()}
      </div>
    </div>
  )
}
