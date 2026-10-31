import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Link2, Loader2, Pencil, Power, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  limsDarkBarBtnClass,
  limsDarkBarSearchClass,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPanelClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { EnvHeader, EnvPanel, MessageLine, envTdClass, envThClass } from '@/features/environment/EnvironmentUi'
import { useCanEditCurrentModule } from '@/features/settings/module-access/useCanEditCurrentModule'
import { resolveReportScopeFromAccreditationIds } from '@/features/sample-handling/report-preparation/reportScope'
import { ComingLaterChip, MetallographyGate, MetallographyMissingNotice } from '../MetallographyUi'
import {
  deleteMethod,
  fetchMetallographyPermissions,
  fetchSettings,
  listMethodVerificationOptions,
  listMethods,
  metallographyErrorText,
  setMethodActive,
} from '../metallographyApi'
import { useMetallographySwitch } from '../useMetallographySwitch'
import {
  ANALYSIS_KIND_LABEL,
  AVAILABLE_ANALYSIS_KINDS,
  type MetallographySettings,
  type MethodVerificationOption,
  type ParameterMethod,
} from '../types'
import { EnginesTab } from './EnginesTab'
import { MethodMappingDialog, type MappableParameter } from './MethodMappingDialog'
import { MethodValidationTab } from './MethodValidationTab'
import { ModuleSettingsTab } from './ModuleSettingsTab'

type SetupTab = 'parameters' | 'validation' | 'settings' | 'engines'

const TABS: Array<{ value: SetupTab; label: string }> = [
  { value: 'parameters', label: 'Test parameters' },
  { value: 'validation', label: 'Method validation' },
  { value: 'settings', label: 'Module settings' },
  { value: 'engines', label: 'Engines' },
]

type ParameterRow = {
  id: string
  item_name: string
  is_code_label: string | null
  clause_no: string | null
  test_method: string | null
  unit_value: string | null
  under_accreditation_ids: string[] | null
}

const toMappable = (p: ParameterRow): MappableParameter => ({
  id: p.id,
  itemName: p.item_name,
  testMethod: p.test_method,
  unitValue: p.unit_value,
})

/** Ring test mapping whose limits are not yet confirmed against IS 1786. */
const needsLimitCheck = (m: ParameterMethod) => m.analysisKind === 'ring_test' && m.settings.limits_verified !== true

/**
 * S5 Method Setup (design 3.3): which Test Parameters are metallography
 * tests and how they are run, the method validation link, the module switch
 * (Director) and the bundled engine versions.
 */
export default function MethodSetupPage() {
  const { designation } = useAuth()
  const isDirector = isLaboratoryDirector(designation)
  const canEditPage = useCanEditCurrentModule()
  const askReason = useReasonForChange()
  const [params, setParams] = useSearchParams()
  const { state: switchState, reload: reloadSwitch } = useMetallographySwitch()

  const tabParam = params.get('tab') as SetupTab | null
  const tab: SetupTab = tabParam && TABS.some((t) => t.value === tabParam) ? tabParam : 'parameters'

  const [missing, setMissing] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [parameters, setParameters] = useState<ParameterRow[]>([])
  const [accreditationById, setAccreditationById] = useState<Map<string, string>>(new Map())
  const [methods, setMethods] = useState<ParameterMethod[]>([])
  const [options, setOptions] = useState<MethodVerificationOption[]>([])
  const [settings, setSettings] = useState<MetallographySettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [mappedOnly, setMappedOnly] = useState(false)
  const [editing, setEditing] = useState<{ parameter: MappableParameter; method: ParameterMethod | null } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [perm, m, opts, st, tp, ab] = await Promise.all([
        fetchMetallographyPermissions(),
        listMethods(),
        listMethodVerificationOptions(),
        fetchSettings(),
        supabase
          .from('test_parameters')
          .select('id, item_name, is_code_label, clause_no, test_method, unit_value, under_accreditation_ids')
          .order('item_name', { ascending: true }),
        supabase.from('accreditation_bodies').select('id, name'),
      ])
      if (perm.status === 'missing' || m.status === 'missing' || st.status === 'missing') {
        setMissing(true)
        return
      }
      if (tp.error) throw tp.error
      setCanManage(perm.data.canManageMethods)
      setMethods(m.data)
      setOptions(opts.status === 'ok' ? opts.data : [])
      setSettings(st.data)
      setParameters((tp.data ?? []) as ParameterRow[])
      setAccreditationById(
        new Map(((ab.data ?? []) as Array<{ id: string; name: string | null }>).map((b) => [b.id, b.name ?? ''])),
      )
    } catch (err) {
      setError(metallographyErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // While the module is off, only the Director gets the page (to switch it on).
  const pageOpen = switchState === 'on' || (switchState === 'off' && isDirector)
  useEffect(() => {
    if (pageOpen) void load()
  }, [pageOpen, load])

  const manage = canManage && canEditPage
  const methodByParam = useMemo(() => new Map(methods.map((m) => [m.testParameterId, m])), [methods])
  const parameterById = useMemo(() => new Map(parameters.map((p) => [p.id, p])), [parameters])
  const parameterName = useCallback(
    (id: string) => parameterById.get(id)?.item_name || 'Test parameter',
    [parameterById],
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return parameters.filter((p) => {
      if (mappedOnly && !methodByParam.has(p.id)) return false
      if (!q) return true
      return `${p.item_name} ${p.is_code_label ?? ''} ${p.clause_no ?? ''} ${p.test_method ?? ''}`.toLowerCase().includes(q)
    })
  }, [parameters, methodByParam, search, mappedOnly])

  const methodsSorted = useMemo(
    () => [...methods].sort((a, b) => parameterName(a.testParameterId).localeCompare(parameterName(b.testParameterId))),
    [methods, parameterName],
  )

  const setTab = (t: SetupTab) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (t === 'parameters') next.delete('tab')
        else next.set('tab', t)
        return next
      },
      { replace: true },
    )
  }

  const replaceMethod = (saved: ParameterMethod) =>
    setMethods((list) => (list.some((x) => x.id === saved.id) ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved]))

  const toggleActive = async (p: ParameterRow, m: ParameterMethod) => {
    const next = !m.active
    const reason = await askReason({
      title: `Reason for ${next ? 'activating' : 'deactivating'} the method of ${p.item_name}`,
      recordLabel: `${p.item_name} · ${ANALYSIS_KIND_LABEL[m.analysisKind]}`,
      description: next
        ? 'The Metallography link comes back in Enter Results for this parameter.'
        : 'Enter Results no longer offers Metallography for this parameter. Past analyses are kept.',
      confirmLabel: next ? 'Activate' : 'Deactivate',
      quickPicks: next ? ['Method back in use'] : ['Method no longer used', 'Under revision', 'Mapped by mistake'],
    })
    if (!reason) return
    setBusyId(m.id)
    setError(null)
    try {
      const saved = await setMethodActive(m.id, next)
      await recordReason('metallography_parameter_methods', m.id, reason)
      replaceMethod(saved)
      setMessage(`${p.item_name}: method ${next ? 'activated' : 'deactivated'}.`)
    } catch (err) {
      setError(metallographyErrorText(err))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (p: ParameterRow, m: ParameterMethod) => {
    const reason = await askReason({
      title: `Reason for removing the mapping of ${p.item_name}`,
      recordLabel: `${p.item_name} · ${ANALYSIS_KIND_LABEL[m.analysisKind]}`,
      description: 'Only a mapping no analysis has used can be removed; otherwise deactivate it.',
      confirmLabel: 'Remove',
      quickPicks: ['Mapped by mistake', 'Not a metallography test'],
    })
    if (!reason) return
    setBusyId(m.id)
    setError(null)
    try {
      await deleteMethod(m.id)
      await recordReason('metallography_parameter_methods', m.id, reason)
      setMethods((list) => list.filter((x) => x.id !== m.id))
      setMessage(`${p.item_name}: mapping removed.`)
    } catch (err) {
      setError(metallographyErrorText(err))
    } finally {
      setBusyId(null)
    }
  }

  const mappingCell = (m: ParameterMethod | undefined) => {
    if (!m) return <span className="text-stone-500">Not mapped</span>
    return (
      <div className="space-y-1">
        <p className="font-semibold">
          {ANALYSIS_KIND_LABEL[m.analysisKind]}
          {m.active ? null : <span className="ml-1 text-[11px] font-normal text-stone-500">(inactive)</span>}
        </p>
        <p className="text-[11px] text-stone-600">
          {m.standardRef}
          {m.reportedUnit ? ` · ${m.reportedUnit}` : ''}
          {m.decimals !== null ? ` · ${m.decimals} dp` : ''}
          {` · ${m.scaleMode === 'in_image_reference' ? 'in-image scale' : 'µm/px calibration'}`}
        </p>
        <div className="flex flex-wrap gap-1">
          {!AVAILABLE_ANALYSIS_KINDS.has(m.analysisKind) ? <ComingLaterChip /> : null}
          {needsLimitCheck(m) ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap border border-amber-700/50 bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-900">
              <AlertTriangle className="h-3 w-3" /> Verify against IS 1786
            </span>
          ) : null}
        </div>
      </div>
    )
  }

  const rowActions = (p: ParameterRow, m: ParameterMethod | undefined) => {
    if (!manage) return null
    if (!m) {
      return (
        <Button
          type="button"
          className={cn(limsPrimaryBtnClass, 'h-10 px-3 sm:h-8')}
          onClick={() => setEditing({ parameter: toMappable(p), method: null })}
        >
          <Link2 className="h-4 w-4" /> Map
        </Button>
      )
    }
    const busy = busyId === m.id
    return (
      <div className="flex justify-center gap-1">
        <Button
          size="icon"
          variant="outline"
          className={limsOutlineBtnClass}
          onClick={() => setEditing({ parameter: toMappable(p), method: m })}
          aria-label={`Edit the method of ${p.item_name}`}
          title="Edit"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className={limsOutlineBtnClass}
          onClick={() => void toggleActive(p, m)}
          disabled={busy}
          aria-label={`${m.active ? 'Deactivate' : 'Activate'} the method of ${p.item_name}`}
          title={m.active ? 'Deactivate' : 'Activate'}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className={cn('h-4 w-4', m.active ? 'text-emerald-700' : 'text-stone-500')} />}
        </Button>
        <Button
          size="icon"
          variant="outline"
          className={limsOutlineBtnClass}
          onClick={() => void remove(p, m)}
          disabled={busy}
          aria-label={`Remove the mapping of ${p.item_name}`}
          title="Remove mapping"
        >
          <Trash2 className="h-4 w-4 text-red-700" />
        </Button>
      </div>
    )
  }

  const scope = (p: ParameterRow) => resolveReportScopeFromAccreditationIds(p.under_accreditation_ids, accreditationById)

  const parametersTab = (
    <EnvPanel
      title={`Test parameters (${visible.length})`}
      right={
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-amber-100">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={mappedOnly}
              onChange={(e) => setMappedOnly(e.target.checked)}
            />
            Mapped only
          </label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search parameters"
            className={cn(limsDarkBarSearchClass, 'h-8 w-40 sm:w-56')}
          />
        </div>
      }
    >
      {!manage ? (
        <p className="mb-2 text-[12px] text-stone-600">
          Mapping parameters needs the Laboratory Director or Edit access to Method Setup.
        </p>
      ) : null}

      {/* Phone: cards */}
      <div className="space-y-2 md:hidden">
        {visible.map((p) => {
          const m = methodByParam.get(p.id)
          return (
            <div key={p.id} className="border border-stone-400 bg-white p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-stone-900">{p.item_name}</p>
                  <p className="text-[12px] text-stone-600">
                    {[p.is_code_label, p.clause_no ? `Cl. ${p.clause_no}` : null].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div className="shrink-0">{rowActions(p, m)}</div>
              </div>
              <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-[12.5px]">
                <dt className="text-stone-500">Test method</dt>
                <dd className="break-words">{p.test_method || '—'}</dd>
                <dt className="text-stone-500">Scope</dt>
                <dd>{scope(p)}</dd>
                <dt className="text-stone-500">Metallography</dt>
                <dd>{mappingCell(m)}</dd>
              </dl>
            </div>
          )
        })}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1000px] border-collapse font-jakarta">
          <thead>
            <tr>
              <th className={envThClass}>Test parameter</th>
              <th className={envThClass}>IS code</th>
              <th className={envThClass}>Clause</th>
              <th className={envThClass}>Test method</th>
              <th className={envThClass}>NABL scope</th>
              <th className={envThClass}>Metallography</th>
              <th className={cn(envThClass, 'w-32')}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p, i) => {
              const m = methodByParam.get(p.id)
              return (
                <tr key={p.id} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                  <td className={cn(envTdClass, 'font-semibold')}>
                    {p.item_name}
                    {p.unit_value ? <span className="ml-1 font-normal text-stone-500">({p.unit_value})</span> : null}
                  </td>
                  <td className={envTdClass}>{p.is_code_label || '—'}</td>
                  <td className={envTdClass}>{p.clause_no || '—'}</td>
                  <td className={envTdClass}>{p.test_method || '—'}</td>
                  <td className={cn(envTdClass, 'whitespace-nowrap')}>{scope(p)}</td>
                  <td className={envTdClass}>{mappingCell(m)}</td>
                  <td className={cn(envTdClass, 'text-center')}>{rowActions(p, m)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!loading && visible.length === 0 ? (
        <p className="p-4 text-center text-[13px] text-stone-600">
          {parameters.length === 0 ? 'No test parameters in the master yet.' : 'No parameters match.'}
        </p>
      ) : null}
    </EnvPanel>
  )

  return (
    <div className={limsPageShellClass}>
      <EnvHeader
        title="Metallography Method Setup"
        clause="7.2"
        subtitle="Which test parameters are metallography tests, how they are run, and whether the method is validated."
        actions={
          pageOpen && !missing ? (
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          ) : null
        }
      />

      <MetallographyGate state={switchState} allowWhenOff={isDirector}>
        {missing ? (
          <MetallographyMissingNotice />
        ) : (
          <>
            <MessageLine tone="error" text={error} />
            <MessageLine tone="ok" text={message} />

            <section className={limsPanelClass}>
              <div role="tablist" className="flex flex-wrap items-end gap-1 bg-stone-800 px-2 pt-1">
                {TABS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.value}
                    onClick={() => setTab(t.value)}
                    className={cn(
                      'h-9 border-b-2 px-3 text-[12px] font-bold uppercase tracking-[0.12em] transition-colors',
                      tab === t.value
                        ? 'border-amber-500 bg-stone-900 text-amber-200'
                        : 'border-transparent text-stone-300 hover:bg-stone-700 hover:text-amber-100',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </section>

            {tab === 'parameters' ? parametersTab : null}

            {tab === 'validation' ? (
              <EnvPanel title={`Method validation (${methods.length})`}>
                <MethodValidationTab
                  methods={methodsSorted}
                  options={options}
                  parameterName={parameterName}
                  canManage={manage}
                  onChanged={(saved, text) => {
                    replaceMethod(saved)
                    setMessage(text)
                  }}
                  onError={setError}
                />
              </EnvPanel>
            ) : null}

            {tab === 'settings' ? (
              <EnvPanel title="Module settings">
                {settings ? (
                  <ModuleSettingsTab
                    key={settings.updatedAt}
                    settings={settings}
                    isDirector={isDirector}
                    onSaved={(saved, text) => {
                      setSettings(saved)
                      setMessage(text)
                      void reloadSwitch()
                    }}
                  />
                ) : (
                  <p className="flex items-center gap-2 text-[13px] text-stone-600">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </p>
                )}
              </EnvPanel>
            ) : null}

            {tab === 'engines' ? (
              <EnvPanel title="Engines">
                <EnginesTab />
              </EnvPanel>
            ) : null}
          </>
        )}
      </MetallographyGate>

      {editing ? (
        <MethodMappingDialog
          parameter={editing.parameter}
          method={editing.method}
          onClose={() => setEditing(null)}
          onSaved={(saved, text) => {
            replaceMethod(saved)
            setEditing(null)
            setMessage(text)
          }}
        />
      ) : null}
    </div>
  )
}
