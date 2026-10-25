import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
  limsFieldClass,
  limsPageShellClass,
  limsPanelClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { ConfirmLoginPasswordDialog } from '@/features/sample-handling/shared/ConfirmLoginPasswordDialog'
import { MODULE_CATALOG, type ModuleAccessLevel } from '@/features/settings/module-access/moduleCatalog'
import { useModuleAccess } from '@/features/settings/module-access/ModuleAccessProvider'
import { resolveModuleAccessLevel } from '@/features/settings/module-access/resolveModuleAccess'
import {
  ENFORCEMENT_MODES,
  enforcementErrorText,
  fetchCatalogKeys,
  fetchDbLevels,
  fetchDenials,
  fetchDryRun,
  fetchDryRunSummary,
  fetchEnforcementState,
  fetchProfiles,
  groupDenials,
  isEnforcementMissingError,
  setEnforcementMode,
  syncCatalog,
  type DenialRow,
  type DryRunRow,
  type DryRunSummaryRow,
  type EnforcementMode,
  type EnforcementState,
  type ProfileLite,
} from './moduleAccessEnforcementApi'

const th =
  'border border-stone-300 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-amber-100'
const td = 'border border-stone-200 px-2 py-1.5 align-top text-[13px]'
const sectionTitle = 'text-sm font-semibold text-stone-800'

function formatWhen(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function modeLabel(mode: string | null | undefined): string {
  return ENFORCEMENT_MODES.find((m) => m.value === mode)?.label ?? mode ?? '—'
}

function modeTone(mode: string | null | undefined): string {
  if (mode === 'enforce') return 'bg-emerald-100 text-emerald-900 border-emerald-400'
  if (mode === 'enforce_writes') return 'bg-sky-100 text-sky-900 border-sky-400'
  if (mode === 'log') return 'bg-amber-100 text-amber-900 border-amber-400'
  return 'bg-stone-200 text-stone-800 border-stone-400'
}

type PendingAction =
  | { kind: 'mode'; mode: EnforcementMode; reason: string }
  | { kind: 'sync' }

/**
 * Database-level module access (ISO/IEC 17025 7.11.3 a): enforcement mode,
 * would-be denials recorded in log mode, and a per-user dry run that also
 * checks the database decision against the app's own module-access decision.
 */
export default function ModuleAccessEnforcementPage() {
  const { designation, user } = useAuth()
  const isDirector = isLaboratoryDirector(designation)
  const { rules, loading: rulesLoading } = useModuleAccess()

  const [available, setAvailable] = useState<boolean | null>(null)
  const [state, setState] = useState<EnforcementState | null>(null)
  const [profiles, setProfiles] = useState<ProfileLite[]>([])
  const [denials, setDenials] = useState<DenialRow[]>([])
  const [denialDays, setDenialDays] = useState(14)
  const [summary, setSummary] = useState<DryRunSummaryRow[]>([])
  const [catalogKeys, setCatalogKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [nextMode, setNextMode] = useState<EnforcementMode>('log')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [busy, setBusy] = useState(false)

  const [selectedUser, setSelectedUser] = useState<string>('')
  const [dryRun, setDryRun] = useState<DryRunRow[]>([])
  const [dbLevels, setDbLevels] = useState<Map<string, ModuleAccessLevel>>(new Map())
  const [dryLoading, setDryLoading] = useState(false)
  const [onlyRestricted, setOnlyRestricted] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await fetchEnforcementState()
      setState(s)
      setNextMode(s.mode)
      setAvailable(true)
      const [p, d, sum, keys] = await Promise.all([
        fetchProfiles(),
        fetchDenials(denialDays),
        fetchDryRunSummary(),
        fetchCatalogKeys(),
      ])
      setProfiles(p)
      setDenials(d)
      setSummary(sum)
      setCatalogKeys(keys)
    } catch (err) {
      if (isEnforcementMissingError(err)) setAvailable(false)
      else setError(enforcementErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [denialDays])

  useEffect(() => {
    if (!isDirector) {
      setLoading(false)
      return
    }
    void load()
  }, [isDirector, load])

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles])
  const groups = useMemo(() => groupDenials(denials), [denials])

  const uiCatalogKeys = useMemo(() => MODULE_CATALOG.map((m) => m.key), [])
  const drift = useMemo(() => {
    const db = new Set(catalogKeys)
    const ui = new Set(uiCatalogKeys)
    return {
      missingInDb: uiCatalogKeys.filter((k) => !db.has(k)),
      extraInDb: catalogKeys.filter((k) => !ui.has(k)),
    }
  }, [catalogKeys, uiCatalogKeys])
  const hasDrift = drift.missingInDb.length > 0 || drift.extraInDb.length > 0

  const loadDryRun = useCallback(async (userId: string) => {
    setSelectedUser(userId)
    setDryRun([])
    setDbLevels(new Map())
    if (!userId) return
    setDryLoading(true)
    try {
      const [rows, levels] = await Promise.all([fetchDryRun(userId), fetchDbLevels(userId)])
      setDryRun(rows)
      setDbLevels(levels)
    } catch (err) {
      setError(enforcementErrorText(err))
    } finally {
      setDryLoading(false)
    }
  }, [])

  // Browser decision for the selected user, compared with the database's.
  const parity = useMemo(() => {
    const p = profileById.get(selectedUser)
    if (!p || dbLevels.size === 0) return null
    const ctx = {
      designation: (p.designation ?? '').trim(),
      departmentName: (p.department_name ?? '').trim(),
      division: (p.division ?? '').trim(),
      userId: p.id,
    }
    const mismatches: { path: string; ui: ModuleAccessLevel; db: ModuleAccessLevel }[] = []
    for (const [path, db] of dbLevels) {
      const ui = resolveModuleAccessLevel(path, ctx, rules)
      if (ui !== db) mismatches.push({ path, ui, db })
    }
    return { checked: dbLevels.size, mismatches }
  }, [profileById, selectedUser, dbLevels, rules])

  const shownDryRun = useMemo(
    () => (onlyRestricted ? dryRun.filter((r) => !r.can_view || !r.can_edit) : dryRun),
    [dryRun, onlyRestricted],
  )

  const requestModeChange = () => {
    if (!state || nextMode === state.mode) return
    if (nextMode !== 'log' && reason.trim().length < 5) {
      setError('Give a reason (at least 5 characters) for this change.')
      return
    }
    setError(null)
    setPending({ kind: 'mode', mode: nextMode, reason: reason.trim() })
  }

  const runPending = async () => {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      if (pending.kind === 'mode') {
        await setEnforcementMode(pending.mode, pending.reason)
        setMessage(`Database module access is now "${modeLabel(pending.mode)}".`)
        setReason('')
      } else {
        const n = await syncCatalog(MODULE_CATALOG.map((m) => ({ key: m.key, label: m.label, section: m.section })))
        setMessage(`Module catalog synced (${n} modules).`)
      }
      setPending(null)
      await load()
    } catch (err) {
      setError(enforcementErrorText(err))
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  const header = (
    <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
      <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
      <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">ISO/IEC 17025 · 7.11.3 a</p>
          <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">Database module access</h1>
          <p className="text-[11px] text-stone-300">
            Applies the Module Access matrix inside the database, not only in the screens.
          </p>
        </div>
        {isDirector && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn('h-8 gap-1.5 text-xs', limsDarkBarBtnClass)}
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
          </Button>
        )}
      </div>
    </div>
  )

  if (!isDirector) {
    return (
      <div className={limsPageShellClass}>
        <div className={limsPanelClass}>
          {header}
          <p className="p-4 text-sm text-stone-700">Only the Laboratory Director can open this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={limsPageShellClass}>
      <div className={limsPanelClass}>
        {header}
        <div className="space-y-5 p-3 sm:p-4">
          {error && (
            <div className="flex items-start gap-2 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
          {message && (
            <div className="flex items-start gap-2 border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> {message}
            </div>
          )}
          {available === false && (
            <div className="border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              The database part is not installed yet (migration 20261029100200_db_module_access.sql). Screens still apply
              Module Access as before.
            </div>
          )}

          {available && state && (
            <>
              {/* Mode */}
              <section className="space-y-2">
                <h2 className={sectionTitle}>Enforcement mode</h2>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={cn('inline-flex items-center gap-1 border px-2 py-0.5 font-semibold', modeTone(state.mode))}>
                    <ShieldCheck size={14} /> {modeLabel(state.mode)}
                  </span>
                  <span className="text-stone-600">
                    since {formatWhen(state.changed_at)}
                    {state.changed_by ? ` by ${profileById.get(state.changed_by)?.full_name ?? 'unknown user'}` : ''}
                    {state.reason ? ` — ${state.reason}` : ''}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {ENFORCEMENT_MODES.map((m) => (
                    <label
                      key={m.value}
                      className={cn(
                        'cursor-pointer border p-2 text-[13px]',
                        nextMode === m.value ? 'border-amber-600 bg-amber-50 ring-1 ring-amber-500/40' : 'border-stone-300 bg-card',
                      )}
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <input
                          type="radio"
                          name="enforcement-mode"
                          checked={nextMode === m.value}
                          onChange={() => setNextMode(m.value)}
                        />
                        {m.label}
                        {state.mode === m.value && <span className="text-[11px] font-normal text-stone-500">(current)</span>}
                      </span>
                      <span className="mt-1 block text-stone-600">{m.help}</span>
                    </label>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="space-y-1">
                    <Label htmlFor="enforcement-reason" className="text-xs">
                      Reason (required for Off and the enforce modes)
                    </Label>
                    <Textarea
                      id="enforcement-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      className={cn(limsFieldClass, 'h-auto')}
                      placeholder="e.g. Reviewed 10 working days of log; no unexpected denials"
                    />
                  </div>
                  <Button
                    type="button"
                    className={limsPrimaryBtnClass}
                    disabled={busy || nextMode === state.mode}
                    onClick={requestModeChange}
                  >
                    Apply mode
                  </Button>
                </div>
                <p className="text-[12px] text-stone-500">
                  Roll-out: keep Log only for at least 10 working days, review the denials and the dry run for every user,
                  correct Module Access rules, then Enforce writes, then Enforce. Switching back to Off takes effect at once.
                </p>
              </section>

              {/* Catalog drift */}
              <section className="space-y-1">
                <h2 className={sectionTitle}>Module catalog</h2>
                {hasDrift ? (
                  <div className="space-y-2 border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                    <p>
                      The database list of modules differs from the sidebar. Paths of a module the database does not know
                      fall back to the legacy role lists, so decisions may differ from the screens until you sync.
                    </p>
                    {drift.missingInDb.length > 0 && <p>Missing in database: {drift.missingInDb.join(', ')}</p>}
                    {drift.extraInDb.length > 0 && <p>No longer in sidebar: {drift.extraInDb.join(', ')}</p>}
                    <Button type="button" size="sm" className={limsPrimaryBtnClass} disabled={busy} onClick={() => setPending({ kind: 'sync' })}>
                      Sync catalog from sidebar
                    </Button>
                  </div>
                ) : (
                  <p className="text-[13px] text-stone-600">
                    In step with the sidebar ({catalogKeys.length} modules).
                  </p>
                )}
              </section>

              {/* Denials */}
              <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className={sectionTitle}>Would-be denials (writes)</h2>
                  <label className="flex items-center gap-1.5 text-xs text-stone-700">
                    Last
                    <select
                      className={cn(limsFieldClass, 'h-7 px-1 text-xs')}
                      value={denialDays}
                      onChange={(e) => setDenialDays(Number(e.target.value))}
                    >
                      {[1, 7, 14, 30, 90].map((d) => (
                        <option key={d} value={d}>
                          {d} day{d > 1 ? 's' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="text-[12px] text-stone-500">
                  Each line is a user and a table: writes that would be refused under Enforce. Reads are not recorded (the
                  database cannot write during a read); use the dry run below for reads.
                </p>
                {groups.length === 0 ? (
                  <p className="text-[13px] text-stone-600">No would-be denials in this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className={th}>User</th>
                          <th className={th}>Table</th>
                          <th className={th}>Operations</th>
                          <th className={th}>Attempts</th>
                          <th className={th}>Last</th>
                          <th className={th}>Modules that would allow it (user's level)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map((g) => {
                          const p = g.user_id ? profileById.get(g.user_id) : undefined
                          return (
                            <tr key={g.key}>
                              <td className={td}>
                                <div className="font-medium">{p?.full_name ?? g.user_id ?? '—'}</div>
                                <div className="text-[11px] text-stone-500">
                                  {[p?.designation, p?.department_name].filter(Boolean).join(' · ')}
                                </div>
                              </td>
                              <td className={cn(td, 'font-mono text-[12px]')}>{g.table_name}</td>
                              <td className={td}>{g.ops.join(', ')}</td>
                              <td className={td}>{g.hits}</td>
                              <td className={td}>{formatWhen(g.last_at)}</td>
                              <td className={cn(td, 'text-[12px]')}>
                                {g.paths.map((path) => `${path} (${g.levels[path] ?? 'none'})`).join(', ')}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Dry run */}
              <section className="space-y-2">
                <h2 className={sectionTitle}>Dry run per user (what Enforce would mean)</h2>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={th}>User</th>
                        <th className={th}>Rules</th>
                        <th className={th}>Tables without read</th>
                        <th className={th}>Tables without write</th>
                        <th className={th}> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.map((s) => (
                        <tr key={s.user_id} className={selectedUser === s.user_id ? 'bg-amber-50' : undefined}>
                          <td className={td}>
                            <div className="font-medium">{s.full_name || s.user_id}</div>
                            <div className="text-[11px] text-stone-500">
                              {[s.designation, s.department_name].filter(Boolean).join(' · ')}
                            </div>
                          </td>
                          <td className={td}>{s.has_user_rules ? 'Per-user matrix' : 'Role / legacy'}</td>
                          <td className={td}>
                            {s.tables_no_view} / {s.tables_mapped}
                          </td>
                          <td className={td}>
                            {s.tables_no_edit} / {s.tables_mapped}
                          </td>
                          <td className={td}>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-none text-xs"
                              onClick={() => void loadDryRun(s.user_id)}
                            >
                              Details
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {selectedUser && (
                  <div className="space-y-2 border border-stone-300 p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {profileById.get(selectedUser)?.full_name ?? selectedUser}
                      </p>
                      <label className="inline-flex items-center gap-1.5 text-xs text-stone-700">
                        <input type="checkbox" checked={onlyRestricted} onChange={(e) => setOnlyRestricted(e.target.checked)} />
                        Only tables with a restriction
                      </label>
                    </div>
                    {dryLoading || rulesLoading ? (
                      <p className="flex items-center gap-2 text-[13px] text-stone-600">
                        <Loader2 size={14} className="animate-spin" /> Loading…
                      </p>
                    ) : (
                      <>
                        {parity && (
                          parity.mismatches.length === 0 ? (
                            <p className="text-[13px] text-emerald-800">
                              Database and screens agree on all {parity.checked} module paths for this user.
                            </p>
                          ) : (
                            <div className="border border-red-300 bg-red-50 px-2 py-1 text-[13px] text-red-800">
                              Database and screens differ on {parity.mismatches.length} of {parity.checked} paths — do not
                              enforce until this is fixed:{' '}
                              {parity.mismatches
                                .slice(0, 12)
                                .map((m) => `${m.path} (screens ${m.ui}, database ${m.db})`)
                                .join('; ')}
                            </div>
                          )
                        )}
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr>
                                <th className={th}>Table</th>
                                <th className={th}>Read</th>
                                <th className={th}>Write</th>
                                <th className={th}>Granted through</th>
                                <th className={th}>Modules that use the table</th>
                              </tr>
                            </thead>
                            <tbody>
                              {shownDryRun.map((r) => (
                                <tr key={r.table_name}>
                                  <td className={cn(td, 'font-mono text-[12px]')}>{r.table_name}</td>
                                  <td className={cn(td, r.can_view ? 'text-emerald-800' : 'font-semibold text-red-700')}>
                                    {r.can_view ? (r.read_open ? 'Yes (open)' : 'Yes') : 'No'}
                                  </td>
                                  <td className={cn(td, r.can_edit ? 'text-emerald-800' : 'font-semibold text-red-700')}>
                                    {r.can_edit ? 'Yes' : 'No'}
                                  </td>
                                  <td className={cn(td, 'text-[12px]')}>
                                    {(r.edit_paths.length ? r.edit_paths : r.view_paths).join(', ') || '—'}
                                  </td>
                                  <td className={cn(td, 'text-[12px] text-stone-600')}>{r.mapped_paths.join(', ')}</td>
                                </tr>
                              ))}
                              {shownDryRun.length === 0 && (
                                <tr>
                                  <td className={td} colSpan={5}>
                                    No restrictions for this user.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      <ConfirmLoginPasswordDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null)
        }}
        title={pending?.kind === 'sync' ? 'Sync module catalog' : 'Change database module access'}
        confirmLabel={busy ? 'Saving…' : 'Confirm'}
        statement={
          pending?.kind === 'mode'
            ? `I change database module access from "${modeLabel(state?.mode)}" to "${modeLabel(pending.mode)}".`
            : 'I replace the database module catalog with the current sidebar modules.'
        }
        onConfirmed={() => void runPending()}
      >
        {pending?.kind === 'mode' && pending.reason ? (
          <p className="text-sm text-stone-700">Reason: {pending.reason}</p>
        ) : null}
        {pending?.kind === 'mode' && pending.mode === 'enforce' ? (
          <p className="text-sm text-red-700">
            Users without View on a module will no longer read its tables. Check the dry run first.
          </p>
        ) : null}
        {user?.email ? <p className="text-xs text-stone-500">Signed in as {user.email}</p> : null}
      </ConfirmLoginPasswordDialog>
    </div>
  )
}
