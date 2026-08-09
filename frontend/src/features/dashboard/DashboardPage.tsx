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

function StatCard({
  title,
  value,
  icon: Icon,
  badgeLabel,
  badgeVariant = 'info',
  href,
  colorClass = 'bg-primary/10 text-primary',
}: StatCardProps) {
  const content = (
    <div className="group relative flex h-full items-start gap-1.5 app-card px-2 py-1.5 transition-all duration-200 hover:border-primary/25 hover:shadow-card">
      <div className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md', colorClass)}>
        <Icon size={11} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-1">
          <p className="text-sm font-bold leading-none tracking-tight text-foreground tabular-nums">
            {value}
          </p>
          {badgeLabel ? (
            <Badge
              variant={badgeVariant}
              className="max-w-[4.5rem] shrink-0 truncate px-1 py-0 text-[8px] leading-tight"
            >
              {badgeLabel}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[10px] font-semibold leading-tight text-foreground/85">
          {title}
        </p>
      </div>
      {href ? (
        <ArrowRight
          size={10}
          className="mt-0.5 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100"
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
  delayedSamplesList: Array<{
    id: string
    sample_code: string | null
    description: string | null
    client_name: string | null
    stage: string | null
    tentative_date_by_lab: string | null
  }>
  calibrationOverdueList: Array<{
    id: string
    asset_code: string | null
    equipment_name: string | null
    next_calibration_due: string | null
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
          quotationsRes,
        ] = await Promise.all([
          supabase.from('clients').select('*', { count: 'exact', head: true }),
          supabase.from('is_codes').select('*', { count: 'exact', head: true }),
          supabase
            .from('equipment_master')
            .select(
              'id, asset_code, equipment_name, equipment_status, next_calibration_due, next_intermediate_check_date, next_maintenance_date',
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
        const calibrationOverdueList: DashboardStats['calibrationOverdueList'] = []
        for (const eq of equipmentRows) {
          const status = String((eq as { equipment_status?: string | null }).equipment_status ?? '')
            .trim()
            .toLowerCase()
          if (!status || status === 'active') equipmentActiveCount++
          const cal = (eq as { next_calibration_due?: string | null }).next_calibration_due
          const ic = (eq as { next_intermediate_check_date?: string | null }).next_intermediate_check_date
          const mt = (eq as { next_maintenance_date?: string | null }).next_maintenance_date
          if (cal && cal < todayStr) {
            calibrationOverdue++
            calibrationOverdueList.push({
              id: String((eq as { id: string }).id),
              asset_code: (eq as { asset_code?: string | null }).asset_code ?? null,
              equipment_name: (eq as { equipment_name?: string | null }).equipment_name ?? null,
              next_calibration_due: cal,
            })
          }
          if (ic && ic < todayStr) intermediateOverdue++
          if (mt && mt < todayStr) maintenanceOverdue++
        }
        calibrationOverdueList.sort((a, b) => {
          if (!a.next_calibration_due) return 1
          if (!b.next_calibration_due) return -1
          return a.next_calibration_due.localeCompare(b.next_calibration_due)
        })

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
          quotationsCount: quotationsRes.error ? 0 : (quotationsRes.count ?? 0),
          delayedSamplesList,
          calibrationOverdueList,
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

  const renderOverdueCard = () => {
    if (!stats) return null
    const sampleLimit = isDirector ? 10 : 8
    const calLimit = isDirector ? 10 : 8
    const sampleList = stats.delayedSamplesList.slice(0, sampleLimit)
    const calList = stats.calibrationOverdueList.slice(0, calLimit)
    const equipmentHref = canAccessPath('/masters/equipment', access) ? '/masters/equipment' : undefined
    const totalOverdue = stats.delayedSamplesCount + stats.calibrationOverdue

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <AlertTriangle size={14} className="text-warning" />
            Overdue Attention
            {totalOverdue > 0 ? (
              <Badge variant="warning" className="ml-1 px-1.5 py-0 text-[10px]">
                {totalOverdue}
              </Badge>
            ) : null}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Samples {stats.delayedSamplesCount} · Calibration {stats.calibrationOverdue}
          </p>
        </div>

        <div className="app-card overflow-hidden">
          <div className="grid grid-cols-1 divide-y divide-border/60 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <section className="min-w-0">
              <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/40 px-3 py-2">
                <h4 className="text-xs font-semibold text-foreground">Overdue Samples</h4>
                <Badge
                  variant={stats.delayedSamplesCount > 0 ? 'warning' : 'success'}
                  className="px-1.5 py-0 text-[10px]"
                >
                  {stats.delayedSamplesCount}
                </Badge>
              </div>
              {sampleList.length > 0 ? (
                <div className="max-h-[280px] overflow-auto">
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
                      {sampleList.map((sample) => {
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
                            <td className="max-w-[120px] truncate px-3 py-1.5">
                              {sample.client_name || '—'}
                            </td>
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
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                  <ShieldCheck size={22} className="mx-auto mb-1.5 text-success" />
                  All active samples are within target timelines.
                </div>
              )}
            </section>

            <section className="min-w-0">
              <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/40 px-3 py-2">
                <h4 className="text-xs font-semibold text-foreground">Overdue Calibration</h4>
                <Badge
                  variant={stats.calibrationOverdue > 0 ? 'destructive' : 'success'}
                  className="px-1.5 py-0 text-[10px]"
                >
                  {stats.calibrationOverdue}
                </Badge>
              </div>
              {calList.length > 0 ? (
                <div className="max-h-[280px] overflow-auto">
                  <table className="w-full border-collapse text-left text-[11px]">
                    <thead className="sticky top-0 z-[1] bg-muted/90 backdrop-blur-sm">
                      <tr className="border-b border-border/60 font-semibold text-muted-foreground">
                        <th className="px-3 py-2">Asset</th>
                        <th className="px-3 py-2">Equipment</th>
                        <th className="px-3 py-2 text-right">Cal. Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {calList.map((eq) => (
                        <tr key={eq.id} className="hover:bg-muted/20">
                          <td className="px-3 py-1.5 font-semibold text-primary">
                            {equipmentHref ? (
                              <NavLink to={equipmentHref} className="hover:underline">
                                {eq.asset_code || '—'}
                              </NavLink>
                            ) : (
                              eq.asset_code || '—'
                            )}
                          </td>
                          <td className="max-w-[220px] truncate px-3 py-1.5">
                            {eq.equipment_name || '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium text-destructive tabular-nums">
                            {eq.next_calibration_due || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                  <ShieldCheck size={22} className="mx-auto mb-1.5 text-success" />
                  No equipment calibration is overdue.
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full w-full space-y-3 p-3 sm:p-4">
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, sectionIdx) => (
            <div key={sectionIdx} className="space-y-1.5">
              <Skeleton className="h-3 w-24 rounded" />
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            </div>
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

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3 overflow-auto p-3 sm:p-4">
      <div className="app-card shrink-0 overflow-hidden">
        <div className="flex flex-col gap-2 bg-gradient-to-r from-stone-800 via-stone-900 to-amber-900 px-4 py-2.5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <h1 className="min-w-0 truncate text-base font-bold tracking-tight sm:text-lg">
            {role.title}
          </h1>
          <p className="shrink-0 text-[11px] tabular-nums text-amber-100/80">
            {stats.totalSamples} samples · {stats.activeSamples} active · {stats.tatComplianceRate}% TAT
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {dashboardSections.map((section) => (
          <section key={section.id} className="min-w-0 space-y-1.5">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h2>
            <div className="flex flex-col gap-1.5">
              {section.cards.map((card) => (
                <StatCard key={`${section.id}-${card.title}`} {...card} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="min-h-0 flex-1">{renderOverdueCard()}</div>
    </div>
  )
}
