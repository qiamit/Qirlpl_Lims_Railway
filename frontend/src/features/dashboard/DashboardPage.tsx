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
  Receipt,
  FileSpreadsheet,
  Wallet,
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
import {
  limsDarkBarAccentClass,
  limsDarkBarGlowStyle,
  limsPageShellClass,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: ElementType
  badgeLabel?: string
  badgeVariant?: 'success' | 'warning' | 'destructive' | 'info'
  href?: string
  colorClass?: string
}

type DashboardSection = {
  id: string
  title: string
  cards: StatCardProps[]
}

type HeroTone = 'neutral' | 'ok' | 'warn' | 'danger'

type HeroKpi = {
  id: string
  label: string
  value: string | number
  icon: ElementType
  tone: HeroTone
  href?: string
}

const heroToneClass: Record<HeroTone, string> = {
  neutral: 'border-stone-500 bg-white text-stone-900',
  ok: 'border-emerald-700/50 bg-emerald-50/80 text-emerald-950',
  warn: 'border-amber-600/60 bg-amber-50 text-amber-950',
  danger: 'border-red-700/50 bg-red-50 text-red-950',
}

const heroIconClass: Record<HeroTone, string> = {
  neutral: 'bg-stone-800 text-amber-200',
  ok: 'bg-emerald-700 text-white',
  warn: 'bg-amber-700 text-white',
  danger: 'bg-red-700 text-white',
}

function HeroKpiCard({ label, value, icon: Icon, tone, href }: HeroKpi) {
  const body = (
    <div
      className={cn(
        'group flex h-full min-h-[7.5rem] flex-col justify-between border-2 p-4 transition-colors',
        heroToneClass[tone],
        href && 'hover:ring-2 hover:ring-amber-600/30',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center',
            heroIconClass[tone],
          )}
        >
          <Icon size={18} aria-hidden />
        </div>
        {href ? (
          <ArrowRight
            size={16}
            className="shrink-0 text-stone-400 opacity-0 transition-opacity group-hover:opacity-100"
          />
        ) : null}
      </div>
      <div className="mt-3 min-w-0">
        <p className="text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">{value}</p>
        <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-stone-700">{label}</p>
      </div>
    </div>
  )

  if (href) {
    return (
      <NavLink to={href} className="block h-full" aria-label={`${label}: ${value}`}>
        {body}
      </NavLink>
    )
  }
  return body
}

function MetricTile({
  title,
  value,
  icon: Icon,
  badgeLabel,
  badgeVariant = 'info',
  href,
}: StatCardProps) {
  const content = (
    <div
      className={cn(
        'group flex h-full items-center gap-3 border border-stone-400 bg-[#fffcf7] px-3 py-3 transition-colors',
        href && 'hover:border-amber-600 hover:bg-amber-50/60',
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-stone-800 text-amber-200">
        <Icon size={16} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-lg font-bold tabular-nums text-stone-900">{value}</p>
          {badgeLabel ? (
            <Badge
              variant={badgeVariant}
              className="max-w-[5rem] shrink-0 truncate rounded-none px-1.5 py-0 text-[9px]"
            >
              {badgeLabel}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] font-semibold text-stone-600">{title}</p>
      </div>
      {href ? (
        <ArrowRight
          size={14}
          className="shrink-0 text-amber-700 opacity-0 transition-opacity group-hover:opacity-100"
        />
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
  quotationsCount: number
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
  const { designation, departmentName } = useAuth()
  const access: UserAccessContext = { designation, departmentName }
  const isDirector = isLaboratoryDirector(designation)
  const role = useMemo(
    () => resolveRoleProfile(access, designation, departmentName),
    [designation, departmentName],
  )

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
            'id, stage, tentative_date_by_lab, test_report_nabl_ulr_number, statement_conformity_required, witness_test_required, deviation_from_methods, date_of_sample_receiving',
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
          quotationsRes,
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
          supabase.from('quotations').select('*', { count: 'exact', head: true }),
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
                } else {
                  onTimeSamplesCount++
                  if (due <= dueSoonEnd) dueSoonCount++
                }
              }
            }
          }
        }

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
          quotationsCount: quotationsRes.error ? 0 : (quotationsRes.count ?? 0),
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

  const dashboardSections = useMemo((): DashboardSection[] => {
    if (!stats) return []

    const link = (path: string) => (canAccessPath(path, access) ? path : undefined)
    const keep = (card: StatCardProps) => !card.href || canAccessPath(card.href, access)

    const testingCommon: StatCardProps[] = [
      {
        title: 'Received Today',
        value: stats.receivedToday,
        icon: Inbox,
        href: link('/samples/receiving'),
        badgeLabel: 'Today',
        colorClass: 'bg-cyan-500/10 text-cyan-700',
      },
      {
        title: 'Due in 7 Days',
        value: stats.dueSoonCount,
        icon: CalendarClock,
        badgeLabel: 'Upcoming',
        badgeVariant: stats.dueSoonCount > 0 ? 'warning' : 'info',
        colorClass: 'bg-orange-500/10 text-orange-600',
      },
      {
        title: 'Overdue Samples',
        value: stats.delayedSamplesCount,
        icon: AlertTriangle,
        badgeLabel: stats.delayedSamplesCount > 0 ? 'Attention' : 'Clear',
        badgeVariant: stats.delayedSamplesCount > 0 ? 'warning' : 'success',
        colorClass: 'bg-amber-500/10 text-amber-600',
      },
    ]

    const tatCard: StatCardProps = {
      title: 'TAT Compliance',
      value: `${stats.tatComplianceRate}%`,
      icon: Clock,
      badgeLabel: stats.tatComplianceRate >= 90 ? 'Healthy' : 'Review',
      badgeVariant: stats.tatComplianceRate >= 90 ? 'success' : 'warning',
      colorClass:
        stats.tatComplianceRate >= 90
          ? 'bg-emerald-500/10 text-emerald-600'
          : 'bg-amber-500/10 text-amber-600',
    }

    const administrative: StatCardProps[] = []
    const management: StatCardProps[] = []
    const testing: StatCardProps[] = []
    const calibration: StatCardProps[] = []

    if (isDirector) {
      administrative.push(
        {
          title: 'Lab Users',
          value: stats.usersCount,
          icon: UserRound,
          href: link('/lab-settings/user-management'),
          badgeLabel: 'Team',
          colorClass: 'bg-stone-500/10 text-stone-700',
        },
        {
          title: 'Clients / IS Codes',
          value: `${stats.clientsCount}/${stats.isCodesCount}`,
          icon: Layers,
          badgeLabel: 'Masters',
          colorClass: 'bg-slate-500/10 text-slate-700',
        },
        {
          title: 'Consent Letters',
          value: stats.consentLettersCount,
          icon: FileSignature,
          href: link('/masters/consent-letter'),
          badgeLabel: 'BIS',
          colorClass: 'bg-lime-500/10 text-lime-700',
        },
      )
      management.push(
        {
          title: 'NABL / ULR',
          value: stats.nablCount,
          icon: ShieldCheck,
          badgeLabel: 'Accreditation',
          colorClass: 'bg-violet-500/10 text-violet-600',
        },
        {
          title: 'IQC / Validity',
          value: `${stats.iqcMastersCount}/${stats.resultChecksCount}`,
          icon: ClipboardCheck,
          href: link('/samples/result-validation'),
          badgeLabel: '7.7',
          colorClass: 'bg-purple-500/10 text-purple-600',
        },
        {
          title: 'Deviations / Witness',
          value: `${stats.deviationCount}/${stats.witnessTestCount}`,
          icon: Gauge,
          badgeLabel: 'QC',
          colorClass: 'bg-rose-500/10 text-rose-600',
        },
        tatCard,
        {
          title: 'Test Parameters',
          value: stats.testParametersCount,
          icon: BookOpen,
          href: link('/masters/test-parameter'),
          badgeLabel: 'Methods',
          colorClass: 'bg-amber-500/10 text-amber-800',
        },
      )
      testing.push(
        {
          title: 'Active Load',
          value: stats.activeSamples,
          icon: FlaskConical,
          badgeLabel: 'In Progress',
          colorClass: 'bg-blue-500/10 text-blue-600',
        },
        ...testingCommon,
        {
          title: 'Under Testing',
          value: stats.stageCounts.under_testing,
          icon: TestTube,
          href: link('/samples/under-testing'),
          badgeLabel: 'Testing',
          colorClass: 'bg-sky-500/10 text-sky-600',
        },
        {
          title: 'Results Review',
          value: stats.stageCounts.results_review,
          icon: ClipboardCheck,
          href: link('/samples/results-review'),
          badgeLabel: 'Review',
          colorClass: 'bg-indigo-500/10 text-indigo-600',
        },
        {
          title: 'Report Prep',
          value: stats.stageCounts.report_preparation,
          icon: FileText,
          href: link('/samples/report-preparation'),
          badgeLabel: 'Reports',
          colorClass: 'bg-fuchsia-500/10 text-fuchsia-600',
        },
        {
          title: 'Issued Reports',
          value: stats.completedSamples,
          icon: CheckCircle2,
          href: link('/samples/completed'),
          badgeLabel: 'Issued',
          colorClass: 'bg-emerald-500/10 text-emerald-600',
        },
      )
      calibration.push(
        {
          title: 'Equipment Active',
          value: `${stats.equipmentActiveCount}/${stats.equipmentCount}`,
          icon: Wrench,
          href: link('/masters/equipment'),
          badgeLabel: 'Assets',
          colorClass: 'bg-blue-500/10 text-blue-700',
        },
        {
          title: 'Cal. Overdue',
          value: stats.calibrationOverdue,
          icon: CalendarClock,
          href: link('/masters/equipment'),
          badgeLabel: stats.calibrationOverdue > 0 ? 'Due' : 'OK',
          badgeVariant: stats.calibrationOverdue > 0 ? 'destructive' : 'success',
          colorClass: 'bg-red-500/10 text-red-600',
        },
        {
          title: 'IC / Maint. Overdue',
          value: `${stats.intermediateOverdue}/${stats.maintenanceOverdue}`,
          icon: Wrench,
          href: link('/masters/equipment'),
          badgeLabel:
            stats.intermediateOverdue + stats.maintenanceOverdue > 0 ? 'Attention' : 'OK',
          badgeVariant:
            stats.intermediateOverdue + stats.maintenanceOverdue > 0 ? 'warning' : 'success',
          colorClass: 'bg-orange-500/10 text-orange-700',
        },
      )
    } else if (isSampleCellReceptionist(access)) {
      administrative.push(
        {
          title: 'Clients',
          value: stats.clientsCount,
          icon: Users,
          href: link('/masters/clients'),
          badgeLabel: 'Directory',
          colorClass: 'bg-emerald-500/10 text-emerald-600',
        },
        {
          title: 'IS Codes',
          value: stats.isCodesCount,
          icon: BookOpen,
          href: link('/masters/is-codes'),
          badgeLabel: 'Masters',
          colorClass: 'bg-amber-500/10 text-amber-800',
        },
      )
      testing.push(
        {
          title: 'Receiving Queue',
          value: stats.stageCounts.receiving,
          icon: Inbox,
          href: link('/samples/receiving'),
          badgeLabel: 'Receiving',
          colorClass: 'bg-blue-500/10 text-blue-600',
        },
        {
          title: 'Active in Lab',
          value: stats.activeSamples,
          icon: FlaskConical,
          badgeLabel: 'In Progress',
          colorClass: 'bg-sky-500/10 text-sky-600',
        },
        ...testingCommon,
        {
          title: 'Issued Reports',
          value: stats.completedSamples,
          icon: CheckCircle2,
          badgeLabel: 'Issued',
          colorClass: 'bg-emerald-500/10 text-emerald-700',
        },
      )
    } else if (isSampleCellSampleIncharge(access)) {
      administrative.push(
        {
          title: 'Consent Letters',
          value: stats.consentLettersCount,
          icon: FileSignature,
          href: link('/masters/consent-letter'),
          badgeLabel: 'BIS',
          colorClass: 'bg-lime-500/10 text-lime-700',
        },
        {
          title: 'IS Codes',
          value: stats.isCodesCount,
          icon: BookOpen,
          href: link('/masters/is-codes'),
          badgeLabel: 'Masters',
          colorClass: 'bg-amber-500/10 text-amber-800',
        },
      )
      testing.push(
        {
          title: 'Allocation Backlog',
          value: stats.stageCounts.allocation + stats.stageCounts.receiving,
          icon: Layers,
          href: link('/samples/allocation'),
          badgeLabel: 'Allocate',
          colorClass: 'bg-blue-500/10 text-blue-600',
        },
        {
          title: 'Under Testing',
          value: stats.stageCounts.under_testing,
          icon: TestTube,
          badgeLabel: 'In Lab',
          colorClass: 'bg-sky-500/10 text-sky-600',
        },
        ...testingCommon,
      )
      calibration.push({
        title: 'Equipment',
        value: stats.equipmentCount,
        icon: Wrench,
        href: link('/masters/equipment'),
        badgeLabel: 'Assets',
        colorClass: 'bg-slate-500/10 text-slate-700',
      })
    } else if (isChemicalTechnicalManager(access) || isMechanicalTechnicalManager(access)) {
      management.push(tatCard, {
        title: 'Test Parameters',
        value: stats.testParametersCount,
        icon: BookOpen,
        href: link('/masters/test-parameter'),
        badgeLabel: 'Methods',
        colorClass: 'bg-amber-500/10 text-amber-800',
      })
      testing.push(
        {
          title: 'Test Allocation',
          value: stats.stageCounts.test_allocation,
          icon: ClipboardCheck,
          href: link('/samples/test-allocation'),
          badgeLabel: 'Assign',
          colorClass: 'bg-blue-500/10 text-blue-600',
        },
        {
          title: 'Results Review',
          value: stats.stageCounts.results_review,
          icon: ShieldCheck,
          href: link('/samples/results-review'),
          badgeLabel: 'Review',
          colorClass: 'bg-violet-500/10 text-violet-600',
        },
        {
          title: 'Under Testing',
          value: stats.stageCounts.under_testing,
          icon: FlaskConical,
          badgeLabel: 'Testing',
          colorClass: 'bg-sky-500/10 text-sky-600',
        },
        ...testingCommon,
      )
      calibration.push({
        title: 'Cal. Overdue',
        value: stats.calibrationOverdue,
        icon: Wrench,
        href: link('/masters/equipment'),
        badgeVariant: stats.calibrationOverdue > 0 ? 'destructive' : 'success',
        badgeLabel: stats.calibrationOverdue > 0 ? 'Due' : 'OK',
        colorClass: 'bg-red-500/10 text-red-600',
      })
    } else if (isChemicalTestingEngineer(access) || isMechanicalTestingEngineer(access)) {
      management.push({
        title: 'IQC Masters',
        value: stats.iqcMastersCount,
        icon: Layers,
        href: link('/masters/iqc'),
        badgeLabel: 'IQC',
        colorClass: 'bg-purple-500/10 text-purple-600',
      })
      testing.push(
        {
          title: 'Testing Queue',
          value: stats.stageCounts.under_testing,
          icon: FlaskConical,
          href: link('/samples/under-testing'),
          badgeLabel: 'Enter Results',
          colorClass: 'bg-blue-500/10 text-blue-600',
        },
        {
          title: 'In Review',
          value: stats.stageCounts.results_review,
          icon: ClipboardCheck,
          badgeLabel: 'Review',
          colorClass: 'bg-violet-500/10 text-violet-600',
        },
        ...testingCommon,
      )
      calibration.push(
        {
          title: 'Equipment',
          value: stats.equipmentCount,
          icon: Wrench,
          href: link('/masters/equipment'),
          badgeLabel: 'Assets',
          colorClass: 'bg-sky-500/10 text-sky-600',
        },
        {
          title: 'IC Overdue',
          value: stats.intermediateOverdue,
          icon: CalendarClock,
          href: link('/masters/equipment'),
          badgeVariant: stats.intermediateOverdue > 0 ? 'warning' : 'success',
          badgeLabel: stats.intermediateOverdue > 0 ? 'Due' : 'OK',
          colorClass: 'bg-orange-500/10 text-orange-600',
        },
      )
    } else if (isQualityAssuranceQualityManager(access)) {
      administrative.push({
        title: 'Consent Letters',
        value: stats.consentLettersCount,
        icon: FileSignature,
        href: link('/masters/consent-letter'),
        badgeLabel: 'BIS',
        colorClass: 'bg-lime-500/10 text-lime-700',
      })
      management.push(
        {
          title: 'NABL / ULR',
          value: stats.nablCount,
          icon: ShieldCheck,
          badgeLabel: 'Accreditation',
          colorClass: 'bg-violet-500/10 text-violet-600',
        },
        {
          title: 'Validity Checks',
          value: stats.resultChecksCount,
          icon: ClipboardCheck,
          href: link('/samples/result-validation'),
          badgeLabel: '7.7',
          colorClass: 'bg-purple-500/10 text-purple-600',
        },
      )
      testing.push(
        {
          title: 'Report Preparation',
          value: stats.stageCounts.report_preparation,
          icon: FileText,
          href: link('/samples/report-preparation'),
          badgeLabel: 'Prepare',
          colorClass: 'bg-blue-500/10 text-blue-600',
        },
        {
          title: 'Issued Reports',
          value: stats.completedSamples,
          icon: CheckCircle2,
          href: link('/samples/completed'),
          badgeLabel: 'Issued',
          colorClass: 'bg-emerald-500/10 text-emerald-600',
        },
        ...testingCommon,
      )
      calibration.push({
        title: 'Cal. Overdue',
        value: stats.calibrationOverdue,
        icon: Wrench,
        href: link('/masters/equipment'),
        badgeVariant: stats.calibrationOverdue > 0 ? 'destructive' : 'success',
        badgeLabel: stats.calibrationOverdue > 0 ? 'Due' : 'OK',
        colorClass: 'bg-red-500/10 text-red-600',
      })
    } else {
      management.push(tatCard)
      testing.push(
        {
          title: 'Active Samples',
          value: stats.activeSamples,
          icon: FlaskConical,
          badgeLabel: 'In Progress',
          colorClass: 'bg-blue-500/10 text-blue-600',
        },
        {
          title: 'Under Testing',
          value: stats.stageCounts.under_testing,
          icon: TestTube,
          href: link('/samples/under-testing'),
          badgeLabel: 'Testing',
          colorClass: 'bg-sky-500/10 text-sky-600',
        },
        ...testingCommon,
      )
    }

    const financePaths = [
      '/finance/sale/quotation',
      '/finance/sale/proforma-invoice',
      '/finance/sale/invoice',
      '/finance/sale/credit-note',
      '/finance/sale/payment-receipt',
    ] as const
    const canSeeFinance = financePaths.some((p) => canAccessPath(p, access))
    const finance: StatCardProps[] = canSeeFinance
      ? [
          {
            title: 'Quotations',
            value: stats.quotationsCount,
            icon: FileSpreadsheet,
            href: link('/finance/sale/quotation'),
            badgeLabel: 'Sale',
            colorClass: 'bg-emerald-500/10 text-emerald-700',
          },
          {
            title: 'Proforma Invoice',
            value: 0,
            icon: Receipt,
            href: link('/finance/sale/proforma-invoice'),
            badgeLabel: 'Sale',
            colorClass: 'bg-amber-500/10 text-amber-800',
          },
          {
            title: 'Invoice',
            value: 0,
            icon: FileText,
            href: link('/finance/sale/invoice'),
            badgeLabel: 'Sale',
            colorClass: 'bg-blue-500/10 text-blue-700',
          },
          {
            title: 'Credit Note',
            value: 0,
            icon: FileSignature,
            href: link('/finance/sale/credit-note'),
            badgeLabel: 'Sale',
            colorClass: 'bg-rose-500/10 text-rose-700',
          },
          {
            title: 'Payment Receipt',
            value: 0,
            icon: Wallet,
            href: link('/finance/sale/payment-receipt'),
            badgeLabel: 'Sale',
            colorClass: 'bg-amber-500/10 text-amber-700',
          },
        ].filter(keep)
      : []

    return [
      { id: 'administrative', title: 'Administrative', cards: administrative.filter(keep) },
      { id: 'management', title: 'Management System', cards: management.filter(keep) },
      { id: 'testing', title: 'Testing LIMS', cards: testing.filter(keep) },
      { id: 'calibration', title: 'Calibration LIMS', cards: calibration.filter(keep) },
      { id: 'finance', title: 'Finance', cards: finance },
    ].filter((section) => section.cards.length > 0)
  }, [stats, access, isDirector])

  const heroKpis = useMemo((): HeroKpi[] => {
    if (!stats) return []

    const samplePaths = [
      '/samples/receiving',
      '/samples/allocation',
      '/samples/test-allocation',
      '/samples/under-testing',
      '/samples/results-review',
      '/samples/report-preparation',
      '/samples/completed',
    ]
    const canSamples = isDirector || samplePaths.some((p) => canAccessPath(p, access))
    const canEquipment = isDirector || canAccessPath('/masters/equipment', access)
    const overdueHref = samplePaths.find((p) => canAccessPath(p, access))
    const receivingHref = canAccessPath('/samples/receiving', access)
      ? '/samples/receiving'
      : overdueHref

    const kpis: HeroKpi[] = []

    if (canSamples) {
      kpis.push(
        {
          id: 'overdue',
          label: 'Overdue Samples',
          value: stats.delayedSamplesCount,
          icon: AlertTriangle,
          tone: stats.delayedSamplesCount > 0 ? 'danger' : 'ok',
          href: overdueHref,
        },
        {
          id: 'due-soon',
          label: 'Due in 7 Days',
          value: stats.dueSoonCount,
          icon: CalendarClock,
          tone: stats.dueSoonCount > 0 ? 'warn' : 'neutral',
          href: overdueHref,
        },
        {
          id: 'active',
          label: 'Active Load',
          value: stats.activeSamples,
          icon: FlaskConical,
          tone: 'neutral',
          href: receivingHref,
        },
        {
          id: 'tat',
          label: 'TAT Compliance',
          value: `${stats.tatComplianceRate}%`,
          icon: Clock,
          tone: stats.tatComplianceRate >= 90 ? 'ok' : 'warn',
        },
      )
    } else if (canEquipment) {
      kpis.push(
        {
          id: 'cal-overdue',
          label: 'Cal. Overdue',
          value: stats.calibrationOverdue,
          icon: CalendarClock,
          tone: stats.calibrationOverdue > 0 ? 'danger' : 'ok',
          href: '/masters/equipment',
        },
        {
          id: 'ic-maint',
          label: 'IC / Maint. Overdue',
          value: `${stats.intermediateOverdue}/${stats.maintenanceOverdue}`,
          icon: Wrench,
          tone:
            stats.intermediateOverdue + stats.maintenanceOverdue > 0 ? 'warn' : 'ok',
          href: '/masters/equipment',
        },
        {
          id: 'equipment',
          label: 'Equipment Active',
          value: `${stats.equipmentActiveCount}/${stats.equipmentCount}`,
          icon: Wrench,
          tone: 'neutral',
          href: '/masters/equipment',
        },
      )
    }

    return kpis
  }, [stats, access, isDirector])

  const moduleSections = useMemo(() => {
    const heroTitles = new Set([
      'Overdue Samples',
      'Due in 7 Days',
      'Active Load',
      'TAT Compliance',
      'Cal. Overdue',
      'IC / Maint. Overdue',
      'Equipment Active',
    ])
    return dashboardSections
      .map((section) => ({
        ...section,
        cards: section.cards.filter((card) => !heroTitles.has(card.title)),
      }))
      .filter((section) => section.cards.length > 0)
  }, [dashboardSections])

  const focusLinks = useMemo(() => {
    return role.focusStages
      .map((stage) => {
        const href = stageHref(stage)
        if (!href || !canAccessPath(href, access)) return null
        return {
          stage,
          href,
          label: stage.replace(/_/g, ' '),
          count: stats?.stageCounts[stage] ?? 0,
        }
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
  }, [role.focusStages, access, stats])

  if (loading) {
    return (
      <div className={cn(limsPageShellClass, 'min-h-0')}>
        <Skeleton className="h-16 w-full rounded-none" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[7.5rem] w-full rounded-none" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-none" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn(limsPageShellClass, 'flex min-h-[50vh] items-center justify-center')}>
        <div className={cn(limsPanelClass, 'max-w-md space-y-3 p-6 text-center')}>
          <AlertTriangle className="mx-auto text-red-700" size={40} />
          <h2 className="text-lg font-bold text-stone-900">Failed to Load Dashboard</h2>
          <p className="text-sm text-stone-600">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-none bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className={cn(limsPageShellClass, 'min-h-0 overflow-auto')}>
      <div className={cn(limsPanelClass)}>
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white sm:px-5 sm:py-4">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className={limsDarkBarAccentClass} />
          <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">{role.title}</h1>
            </div>
            <p className="shrink-0 text-[11px] tabular-nums text-amber-100/80">
              {stats.totalSamples} samples · {stats.activeSamples} active · {stats.tatComplianceRate}% TAT
            </p>
          </div>
        </div>
      </div>

      {heroKpis.length > 0 ? (
        <section aria-label="Operations overview">
          <div
            className={cn(
              'grid gap-3',
              heroKpis.length >= 4
                ? 'grid-cols-2 lg:grid-cols-4'
                : heroKpis.length === 3
                  ? 'grid-cols-1 sm:grid-cols-3'
                  : 'grid-cols-1 sm:grid-cols-2',
            )}
          >
            {heroKpis.map((kpi) => (
              <HeroKpiCard key={kpi.id} {...kpi} />
            ))}
          </div>
        </section>
      ) : null}

      {focusLinks.length > 0 ? (
        <section aria-label="Your focus stages" className={cn(limsPanelClass, 'p-3 sm:p-4')}>
          <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
            Your focus
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {focusLinks.map((item) => (
              <NavLink
                key={item.stage}
                to={item.href}
                className="inline-flex items-center gap-2 border-2 border-stone-500 bg-white px-3 py-1.5 text-xs font-semibold capitalize text-stone-800 transition-colors hover:border-amber-600 hover:bg-amber-50"
              >
                <span>{item.label}</span>
                <span className="bg-stone-800 px-1.5 py-0.5 text-[10px] tabular-nums text-amber-200">
                  {item.count}
                </span>
              </NavLink>
            ))}
          </div>
        </section>
      ) : null}

      {moduleSections.length > 0 ? (
        <section aria-label="Module metrics" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {moduleSections.map((section) => (
            <div key={section.id} className={cn(limsPanelClass)}>
              <div className="border-b-2 border-stone-500 bg-stone-800 px-4 py-2">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                  {section.title}
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-2 bg-gradient-to-b from-stone-100/80 to-white p-3 sm:grid-cols-2">
                {section.cards.map((card) => (
                  <MetricTile key={`${section.id}-${card.title}`} {...card} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  )
}
