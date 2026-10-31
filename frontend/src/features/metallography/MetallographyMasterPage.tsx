import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarClock, Clock, Link2, Loader2, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { fetchTeamUsers } from '@/lib/fetchTeamUsers'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  limsDarkBarBtnClass,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPanelClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { EnvHeader, EnvPanel, EnvSelect, Field, MessageLine, envInputClass } from '@/features/environment/EnvironmentUi'
import { useCanEditCurrentModule } from '@/features/settings/module-access/useCanEditCurrentModule'
import {
  MetallographyHeaderBar,
  type AnalystOption,
  type RegisterFilters,
  type RegisterTab,
} from './MetallographyHeaderBar'
import { MetallographyAnalysesTable, MetallographyPendingTable } from './MetallographyTable'
import { MetallographyFooterBar } from './MetallographyFooterBar'
import { MetallographyGate, MetallographyMissingNotice } from './MetallographyUi'
import {
  createAnalysis,
  fetchMetallographyPermissions,
  fetchPendingParameterRows,
  fetchRegisterStats,
  listAnalyses,
  listMethods,
  localIsoDate,
  metallographyErrorText,
  voidAnalysis,
} from './metallographyApi'
import { buildAnalysesPrintHtml, downloadAnalysesCsv, printViaIframe } from './metallographyRegisterText'
import { useMetallographySwitch } from './useMetallographySwitch'
import {
  ANALYSIS_KINDS,
  ANALYSIS_KIND_LABEL,
  ANALYSIS_PURPOSE_LABEL,
  ANALYSIS_STATUS_LABEL,
  AVAILABLE_ANALYSIS_KINDS,
  CALIBRATION_EXPIRY_WARNING_DAYS,
  type AnalysisKind,
  type AnalysisListItem,
  type AnalysisPurpose,
  type AnalysisStatus,
  type MetallographyParamRowRef,
  type MetallographyPermissions,
  type MetallographyUseResult,
  type ParameterMethod,
  type PendingParameterRow,
  type RegisterStats,
} from './types'

// The workbench dialog pulls in the image stage and engines: load it only when "Analyse" is used.
const MetallographyAnalysisDialog = lazy(() =>
  import('./workbench/MetallographyAnalysisDialog').then((m) => ({ default: m.MetallographyAnalysisDialog })),
)

const STATUSES: AnalysisStatus[] = ['in_progress', 'completed', 'superseded', 'void']
const NON_SAMPLE_PURPOSES: AnalysisPurpose[] = ['validation', 'iqc', 'training']
const SRF_DEBOUNCE_MS = 400

function filtersFromParams(p: URLSearchParams): RegisterFilters {
  const kind = p.get('kind') as AnalysisKind | null
  const status = p.get('status') as AnalysisStatus | null
  return {
    kind: kind && ANALYSIS_KINDS.includes(kind) ? kind : 'all',
    status: status && STATUSES.includes(status) ? status : 'all',
    from: p.get('from') ?? '',
    to: p.get('to') ?? '',
    srf: p.get('srf') ?? '',
    analyst: p.get('analyst') ?? '',
  }
}

function filterSummary(f: RegisterFilters, analysts: AnalystOption[]): string {
  const parts: string[] = []
  if (f.kind !== 'all') parts.push(ANALYSIS_KIND_LABEL[f.kind])
  if (f.status !== 'all') parts.push(ANALYSIS_STATUS_LABEL[f.status])
  if (f.from || f.to) parts.push(`Test date ${f.from || '…'} to ${f.to || '…'}`)
  if (f.srf) parts.push(`SRF contains "${f.srf}"`)
  if (f.analyst) parts.push(`Analyst ${analysts.find((a) => a.id === f.analyst)?.name ?? 'selected'}`)
  return parts.join(' · ')
}

/** One stat tile of the strip that replaces the old dashboard. */
function StatTile({
  label,
  value,
  icon: Icon,
  tone = 'stone',
  to,
}: {
  label: string
  value: number | null
  icon: typeof Clock
  tone?: 'stone' | 'amber'
  to?: string
}) {
  const body = (
    <div
      className={cn(
        'flex items-center gap-3 border-2 bg-[#fffcf7] px-3 py-2',
        tone === 'amber' && value ? 'border-amber-600 bg-amber-50' : 'border-stone-400',
        to && 'hover:border-amber-600',
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0', tone === 'amber' && value ? 'text-amber-700' : 'text-stone-600')} />
      <div className="min-w-0">
        <p className="font-mono text-xl font-bold leading-none text-stone-900">{value ?? '—'}</p>
        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-stone-600">{label}</p>
      </div>
    </div>
  )
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  )
}

/**
 * S1 Analyses register (design 3.3): stat strip, Pending result rows of
 * mapped parameters, and the analyses list with URL filters. Void, CSV and
 * Print in the footer.
 */
export default function MetallographyMasterPage() {
  const { user, designation } = useAuth()
  const userId = user?.id ?? null
  const isDirector = isLaboratoryDirector(designation)
  const canEditPage = useCanEditCurrentModule()
  const askReason = useReasonForChange()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { state: switchState } = useMetallographySwitch()

  const tab: RegisterTab = params.get('tab') === 'analyses' ? 'analyses' : 'pending'
  const filters = useMemo(() => filtersFromParams(params), [params])
  const [srfDraft, setSrfDraft] = useState(filters.srf)

  const [missing, setMissing] = useState(false)
  const [perms, setPerms] = useState<MetallographyPermissions | null>(null)
  const [methods, setMethods] = useState<ParameterMethod[]>([])
  const [parameterNames, setParameterNames] = useState<Map<string, string>>(new Map())
  const [pending, setPending] = useState<PendingParameterRow[] | null>(null)
  const [analyses, setAnalyses] = useState<AnalysisListItem[] | null>(null)
  const [stats, setStats] = useState<RegisterStats | null>(null)
  const [team, setTeam] = useState<AnalystOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [analyseRow, setAnalyseRow] = useState<PendingParameterRow | null>(null)

  const [newOpen, setNewOpen] = useState(false)
  const [newPurpose, setNewPurpose] = useState<AnalysisPurpose>('validation')
  const [newMethodId, setNewMethodId] = useState('')
  const [newTestDate, setNewTestDate] = useState(localIsoDate())
  const [newError, setNewError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const updateParams = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (!v || v === 'all') next.delete(k)
            else next.set(k, v)
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  // SRF is typed: push it to the URL after a short pause.
  useEffect(() => {
    if (srfDraft.trim() === filters.srf) return
    const t = window.setTimeout(() => updateParams({ srf: srfDraft.trim() }), SRF_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [srfDraft, filters.srf, updateParams])

  /** Permissions, methods, pending rows, stats and the team list (everything except the filtered list). */
  const loadBase = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, m, pend, st] = await Promise.all([
        fetchMetallographyPermissions(),
        listMethods(),
        fetchPendingParameterRows({ userId, isDirector }),
        fetchRegisterStats(),
      ])
      if (p.status === 'missing' || m.status === 'missing' || pend.status === 'missing' || st.status === 'missing') {
        setMissing(true)
        return
      }
      setPerms(p.data)
      setMethods(m.data)
      setPending(pend.data)
      setStats(st.data)
      const ids = [...new Set(m.data.map((x) => x.testParameterId))]
      if (ids.length) {
        const { data } = await supabase.from('test_parameters').select('id, item_name').in('id', ids)
        setParameterNames(
          new Map(((data ?? []) as Array<{ id: string; item_name: string | null }>).map((r) => [r.id, r.item_name ?? ''])),
        )
      }
      try {
        const users = await fetchTeamUsers()
        setTeam(
          users
            .filter((u) => u.full_name)
            .map((u) => ({ id: u.id, name: u.full_name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        )
      } catch {
        // The analyst filter falls back to the names in the list.
      }
    } catch (err) {
      setError(metallographyErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [userId, isDirector])

  const loadAnalyses = useCallback(async () => {
    setError(null)
    try {
      const res = await listAnalyses({
        kind: filters.kind,
        status: filters.status,
        from: filters.from || undefined,
        to: filters.to || undefined,
        srf: filters.srf || undefined,
        performedBy: filters.analyst || undefined,
      })
      if (res.status === 'missing') {
        setMissing(true)
        return
      }
      setAnalyses(res.data)
    } catch (err) {
      setError(metallographyErrorText(err))
    }
  }, [filters])

  useEffect(() => {
    if (switchState === 'on') void loadBase()
  }, [switchState, loadBase])

  useEffect(() => {
    if (switchState === 'on') void loadAnalyses()
  }, [switchState, loadAnalyses])

  const reloadAll = useCallback(async () => {
    await Promise.all([loadBase(), loadAnalyses()])
  }, [loadBase, loadAnalyses])

  const analysts = useMemo(() => {
    const byId = new Map(team.map((a) => [a.id, a]))
    for (const a of analyses ?? []) {
      if (a.performedBy && !byId.has(a.performedBy)) {
        byId.set(a.performedBy, { id: a.performedBy, name: a.performedByName || 'Unknown' })
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [team, analyses])

  const methodById = useMemo(() => new Map(methods.map((m) => [m.id, m])), [methods])
  const methodLabel = (m: ParameterMethod) =>
    `${parameterNames.get(m.testParameterId) || 'Test parameter'} · ${ANALYSIS_KIND_LABEL[m.analysisKind]}`

  const rows = useMemo(() => analyses ?? [], [analyses])
  const selected = useMemo(() => rows.find((a) => a.id === selectedId) ?? null, [rows, selectedId])
  const canRun = perms?.canRun === true

  const voidDisabledReason = (() => {
    if (!selected) return 'Select an analysis first.'
    if (!canEditPage) return 'You have view-only access to this page.'
    if (selected.status !== 'in_progress' && selected.status !== 'completed') {
      return `${ANALYSIS_STATUS_LABEL[selected.status]} analyses cannot be voided.`
    }
    if (selected.linkedToResult) return 'This analysis is the source of a result. Unlink it in Enter Results first.'
    if (!isDirector && selected.performedBy !== userId) return 'Only the analyst or the Laboratory Director can void it.'
    return null
  })()

  const onFiltersChange = (patch: Partial<RegisterFilters>) => {
    setSelectedId(null)
    const { srf, ...rest } = patch
    if (srf !== undefined) setSrfDraft(srf)
    if (Object.keys(rest).length) updateParams(rest)
  }

  const clearFilters = () => {
    setSrfDraft('')
    setSelectedId(null)
    updateParams({ kind: null, status: null, from: null, to: null, srf: null, analyst: null })
  }

  const doVoid = async () => {
    if (!selected || voidDisabledReason) return
    const label = selected.analysisNo ?? 'analysis'
    const reason = await askReason({
      title: `Reason for voiding ${label}`,
      recordLabel: [label, selected.srfNumber, selected.testLabel].filter(Boolean).join(' · '),
      description: 'A void analysis stays in the register and the audit trail; it cannot be used for a result.',
      confirmLabel: 'Void',
      quickPicks: ['Created by mistake', 'Wrong image or specimen', 'Duplicate analysis', 'Repeated on a new specimen'],
    })
    if (!reason) return
    setVoiding(true)
    setError(null)
    try {
      await voidAnalysis(selected.id, reason)
      await recordReason('metallography_analyses', selected.id, reason)
      setMessage(`${label} voided.`)
      setSelectedId(null)
      await reloadAll()
    } catch (err) {
      setError(metallographyErrorText(err))
    } finally {
      setVoiding(false)
    }
  }

  const exportCsv = () => downloadAnalysesCsv(rows)
  const print = () => {
    if (!printViaIframe(buildAnalysesPrintHtml(rows, filterSummary(filters, analysts)))) {
      setError('The print view could not be opened.')
    }
  }

  const paramRowRef = (r: PendingParameterRow): MetallographyParamRowRef => {
    const m = methodById.get(r.methodId)
    return {
      paramRowId: r.paramRowId,
      testParameterId: r.testParameterId,
      testLabel: r.testLabel,
      sampleId: r.sampleId,
      unit: m?.reportedUnit ?? null,
      decimals: m?.decimals ?? null,
    }
  }

  // S1 has no Enter Results row to fill: the completed analysis is picked up there.
  const onUseResult: (r: MetallographyUseResult) => void = () => {
    const row = analyseRow
    setAnalyseRow(null)
    setMessage(
      `Analysis completed${row?.srfNumber ? ` for SRF ${row.srfNumber}` : ''}. Open Sample Under Testing → Enter Results and choose "Use result" on ${row?.testLabel ?? 'the parameter'}.`,
    )
    void reloadAll()
  }

  const availableMethods = methods.filter((m) => m.active)

  const openNew = () => {
    const first = availableMethods.find((m) => AVAILABLE_ANALYSIS_KINDS.has(m.analysisKind))
    setNewPurpose('validation')
    setNewMethodId(first?.id ?? '')
    setNewTestDate(localIsoDate())
    setNewError(null)
    setNewOpen(true)
  }

  const createNew = async () => {
    if (!newMethodId) {
      setNewError('Choose the method (mapped test parameter).')
      return
    }
    if (!newTestDate) {
      setNewError('Enter the test date.')
      return
    }
    setCreating(true)
    setNewError(null)
    try {
      const a = await createAnalysis({ purpose: newPurpose, methodId: newMethodId, testDate: newTestDate })
      setNewOpen(false)
      navigate(`/metallography/analyses/${a.id}`)
    } catch (err) {
      setNewError(metallographyErrorText(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className={limsPageShellClass}>
      <EnvHeader
        title="Metallography Analyses"
        clause="7.5 · 7.2"
        subtitle="Image analyses behind metallography results: what is pending, what was done, on which scale, by whom."
        actions={
          switchState === 'on' && !missing ? (
            <>
              <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void reloadAll()} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              {canRun ? (
                <Button className={limsPrimaryBtnClass} onClick={openNew}>
                  <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New validation / IQC analysis</span>
                  <span className="sm:hidden">New</span>
                </Button>
              ) : null}
            </>
          ) : null
        }
      />

      <MetallographyGate state={switchState}>
        {missing ? (
          <MetallographyMissingNotice />
        ) : (
          <>
            <MessageLine tone="error" text={error} />
            <MessageLine tone="ok" text={message} />

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <StatTile label="In progress" value={stats?.inProgress ?? null} icon={Clock} />
              <StatTile
                label="Completed, not used in a result"
                value={stats?.completedNotLinked ?? null}
                icon={Link2}
                tone="amber"
              />
              <StatTile
                label={`Calibrations expiring in ${CALIBRATION_EXPIRY_WARNING_DAYS} days`}
                value={stats?.calibrationsExpiringSoon ?? null}
                icon={CalendarClock}
                tone="amber"
                to="/metallography/scale-calibrations"
              />
            </div>

            <MetallographyHeaderBar
              tab={tab}
              onTabChange={(t) => {
                setSelectedId(null)
                updateParams({ tab: t === 'pending' ? null : t })
              }}
              pendingCount={pending ? pending.length : null}
              analysesCount={analyses ? analyses.length : null}
              filters={{ ...filters, srf: srfDraft }}
              onFiltersChange={onFiltersChange}
              onClearFilters={clearFilters}
              analysts={analysts}
            />

            {tab === 'pending' ? (
              <EnvPanel title={`Pending result rows (${pending?.length ?? 0})`}>
                <p className="mb-2 text-[12px] text-stone-600">
                  Saved result rows of mapped test parameters with no result yet
                  {isDirector ? '' : ', in allocations assigned to you'}. Under review, approved and issued rows are not
                  listed.
                </p>
                {perms && !canRun ? (
                  <p className="mb-2 text-[12px] text-stone-600">
                    You can view this register. Running an analysis needs Edit access to Metallography Analyses.
                  </p>
                ) : null}
                <MetallographyPendingTable
                  rows={pending ?? []}
                  loading={loading || pending === null}
                  canRun={canRun && canEditPage}
                  onAnalyse={(r) => {
                    setMessage(null)
                    setAnalyseRow(r)
                  }}
                />
              </EnvPanel>
            ) : (
              <EnvPanel title={`Analyses (${rows.length})`}>
                <MetallographyAnalysesTable
                  rows={rows}
                  loading={loading || analyses === null}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onOpen={(a) => navigate(`/metallography/analyses/${a.id}`)}
                />
                {rows.length >= 500 ? (
                  <p className="mt-2 text-[12px] text-stone-600">Showing the newest 500. Narrow the filters to see older ones.</p>
                ) : null}
              </EnvPanel>
            )}

            {tab === 'analyses' ? (
              <MetallographyFooterBar
                rowCount={rows.length}
                selectedLabel={selected ? (selected.analysisNo ?? 'analysis') : null}
                voidDisabledReason={voidDisabledReason}
                voiding={voiding}
                onVoid={() => void doVoid()}
                onExportCsv={exportCsv}
                onPrint={print}
              />
            ) : null}
          </>
        )}
      </MetallographyGate>

      {analyseRow ? (
        <Suspense
          fallback={
            <div className={cn(limsPanelClass, 'fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-card p-3 text-[13px]')}>
              <Loader2 className="h-4 w-4 animate-spin" /> Opening the workbench…
            </div>
          }
        >
          <MetallographyAnalysisDialog
            open
            onOpenChange={(o: boolean) => {
              if (!o) {
                setAnalyseRow(null)
                void reloadAll()
              }
            }}
            paramRow={paramRowRef(analyseRow)}
            analysisId={analyseRow.inProgressAnalysisId}
            canRun={canRun}
            onUseResult={onUseResult}
          />
        </Suspense>
      ) : null}

      <Dialog open={newOpen} onOpenChange={(o) => (!o && !creating ? setNewOpen(false) : undefined)}>
        <DialogContent className={cn(limsDialogClass, 'flex w-[calc(100vw-1rem)] max-w-lg flex-col')}>
          <div className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <DialogHeader className="pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white">New validation / IQC analysis</DialogTitle>
              <DialogDescription className="text-[12px] text-stone-300">
                For method validation, IQC or training. Sample analyses start from Pending or from Enter Results.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-3 bg-[#f7f3eb] p-3 sm:p-4">
            <MessageLine tone="error" text={newError} />
            <Field label="Purpose" htmlFor="mg-new-purpose">
              <EnvSelect
                id="mg-new-purpose"
                value={newPurpose}
                onChange={(v) => setNewPurpose(v as AnalysisPurpose)}
              >
                {NON_SAMPLE_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {ANALYSIS_PURPOSE_LABEL[p]}
                  </option>
                ))}
              </EnvSelect>
            </Field>
            <Field label="Method (mapped test parameter)" htmlFor="mg-new-method">
              <EnvSelect id="mg-new-method" value={newMethodId} onChange={setNewMethodId}>
                <option value="">Choose…</option>
                {availableMethods.map((m) => {
                  const ready = AVAILABLE_ANALYSIS_KINDS.has(m.analysisKind)
                  return (
                    <option key={m.id} value={m.id} disabled={!ready}>
                      {methodLabel(m)}
                      {ready ? '' : ' (coming later)'}
                    </option>
                  )
                })}
              </EnvSelect>
            </Field>
            {availableMethods.length === 0 ? (
              <p className="text-[12px] text-stone-600">
                No test parameter is mapped yet.{' '}
                <Link to="/metallography/methods" className="font-semibold text-amber-800 underline">
                  Open Method Setup
                </Link>
                .
              </p>
            ) : null}
            <Field label="Test date" htmlFor="mg-new-date">
              <Input
                id="mg-new-date"
                type="date"
                value={newTestDate}
                min={isDirector ? undefined : localIsoDate()}
                max={localIsoDate()}
                onChange={(e) => setNewTestDate(e.target.value)}
                className={envInputClass}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t-2 border-stone-500 bg-stone-100 px-3 py-2">
            <Button variant="outline" className={limsOutlineBtnClass} onClick={() => setNewOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button className={limsPrimaryBtnClass} onClick={() => void createNew()} disabled={creating || !newMethodId}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create and open
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
