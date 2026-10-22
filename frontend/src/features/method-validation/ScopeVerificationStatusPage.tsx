import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Loader2, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { csvCell } from '@/lib/csv'
import { limsDarkBarBtnClass, limsDarkBarSearchClass, limsOutlineBtnClass, limsPageShellClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { CoverageBadge, MvHeader, MvMessage, MvMissingMigrationNotice, MvPanel } from './MethodValidationUi'
import {
  CONCLUSION_LABEL,
  COVERAGE_LABEL,
  MATCH_SOURCE_LABEL,
  METHOD_VERIFICATIONS_PATH,
  STANDARD_STATUS_LABEL,
  fmtDate,
  mvTdClass,
  mvThClass,
  type ScopeCoverage,
  type ScopeVerificationRow,
  type StandardStatus,
} from './methodValidation'
import { useScopeVerificationStatus } from './useScopeVerificationStatus'

type KindFilter = '' | 'testing' | 'calibration'

function recordLink(r: ScopeVerificationRow): string {
  if (r.verification_id) return `${METHOD_VERIFICATIONS_PATH}?id=${encodeURIComponent(r.verification_id)}`
  const qs = new URLSearchParams()
  if (r.method) qs.set('method', r.method)
  if (r.parameter) qs.set('parameter', r.parameter)
  return `${METHOD_VERIFICATIONS_PATH}?${qs.toString()}`
}

export default function ScopeVerificationStatusPage() {
  const [reloadKey, setReloadKey] = useState(0)
  const { rows, loading, missing, error } = useScopeVerificationStatus(reloadKey)
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<KindFilter>('')
  const [coverage, setCoverage] = useState<'' | ScopeCoverage | 'gaps'>('')
  const [accreditedOnly, setAccreditedOnly] = useState(true)

  const scoped = useMemo(
    () => rows.filter((r) => (!kind || r.scope_kind === kind) && (!accreditedOnly || r.scope_status === 'Accredited')),
    [rows, kind, accreditedOnly],
  )

  const totals = useMemo(() => {
    const t: Record<ScopeCoverage, number> = { verified: 0, expired: 0, not_fit: 0, missing: 0 }
    for (const r of scoped) t[r.coverage] = (t[r.coverage] ?? 0) + 1
    return t
  }, [scoped])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scoped.filter((r) => {
      if (coverage === 'gaps' && r.coverage === 'verified') return false
      if (coverage && coverage !== 'gaps' && r.coverage !== coverage) return false
      if (!q) return true
      return `${r.s_no} ${r.discipline ?? ''} ${r.item ?? ''} ${r.parameter ?? ''} ${r.method ?? ''} ${r.record_no ?? ''}`
        .toLowerCase()
        .includes(q)
    })
  }, [scoped, search, coverage])

  const pct = scoped.length ? Math.round((totals.verified / scoped.length) * 100) : 0

  const exportCsv = () => {
    const header = [
      'Scope', 'S.No', 'Discipline', 'Product / group', 'Parameter / measurand', 'Method', 'Scope status',
      'Coverage', 'Record', 'Version', 'Kind', 'Conclusion', 'Approved on', 'Valid until', 'Match', 'Standard status', 'Pending record',
    ]
    const lines = visible.map((r) =>
      [
        r.scope_kind, r.s_no, r.discipline ?? '', r.item ?? '', r.parameter ?? '', r.method ?? '', r.scope_status ?? '',
        COVERAGE_LABEL[r.coverage], r.record_no ?? '', r.version ?? '', r.kind ?? '',
        r.conclusion ? CONCLUSION_LABEL[r.conclusion] : '', r.approved_on ?? '', r.valid_until ?? '',
        r.match_source ? MATCH_SOURCE_LABEL[r.match_source] : '', r.standard_status ?? '', r.pending_record_no ?? '',
      ]
        .map((v) => csvCell(String(v)))
        .join(','),
    )
    const blob = new Blob([[header.map((h) => csvCell(h)).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scope-method-verification-status-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const tiles: Array<{ key: ScopeCoverage; tone: string }> = [
    { key: 'verified', tone: 'border-emerald-700 bg-emerald-50' },
    { key: 'missing', tone: 'border-red-700 bg-red-50' },
    { key: 'expired', tone: 'border-amber-600 bg-amber-50' },
    { key: 'not_fit', tone: 'border-red-700 bg-red-50' },
  ]

  return (
    <div className={limsPageShellClass}>
      <MvHeader
        title="Scope Verification Status"
        clause="7.2.1.5 · 7.2.2 · 7.2.1.4"
        subtitle="Every NABL scope row and the approved verification / validation that covers its method."
        actions={
          <>
            <Button variant="outline" className={limsDarkBarBtnClass} onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {!missing ? (
              <Button variant="outline" className={limsDarkBarBtnClass} onClick={exportCsv} disabled={visible.length === 0}>
                CSV
              </Button>
            ) : null}
            <Button asChild variant="outline" className={limsDarkBarBtnClass}>
              <Link to={METHOD_VERIFICATIONS_PATH}>
                <ExternalLink className="h-4 w-4" /> Records
              </Link>
            </Button>
          </>
        }
      />

      {missing ? <MvMissingMigrationNotice /> : null}
      <MvMessage tone="error" text={error} />

      {!missing ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div className="col-span-2 border-2 border-stone-500 bg-white px-3 py-2 sm:col-span-1">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-stone-500">Covered</p>
              <p className="text-xl font-semibold tabular-nums text-stone-900">
                {pct}% <span className="text-[12px] font-normal text-stone-500">of {scoped.length}</span>
              </p>
              <div className="mt-1 h-1.5 w-full bg-stone-200" aria-hidden>
                <div className="h-1.5 bg-emerald-600" style={{ width: `${pct}%` }} />
              </div>
            </div>
            {tiles.map((t) => (
              <button
                type="button"
                key={t.key}
                onClick={() => setCoverage((c) => (c === t.key ? '' : t.key))}
                className={cn('border-2 px-3 py-2 text-left', t.tone, coverage === t.key && 'ring-2 ring-amber-500')}
                aria-pressed={coverage === t.key}
              >
                <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-stone-600">{COVERAGE_LABEL[t.key]}</p>
                <p className="text-xl font-semibold tabular-nums text-stone-900">{totals[t.key]}</p>
              </button>
            ))}
          </div>

          <MvPanel
            title={`Scope rows (${visible.length})`}
            right={
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-[12px] text-amber-100">
                  <input type="checkbox" className="h-4 w-4" checked={accreditedOnly} onChange={(e) => setAccreditedOnly(e.target.checked)} />
                  Accredited only
                </label>
                <select
                  aria-label="Scope"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as KindFilter)}
                  className="h-8 rounded-none border border-stone-500 bg-stone-900 px-2 text-[12px] text-amber-100"
                >
                  <option value="">Testing + calibration</option>
                  <option value="testing">Testing</option>
                  <option value="calibration">Calibration</option>
                </select>
                <select
                  aria-label="Coverage"
                  value={coverage}
                  onChange={(e) => setCoverage(e.target.value as typeof coverage)}
                  className="h-8 rounded-none border border-stone-500 bg-stone-900 px-2 text-[12px] text-amber-100"
                >
                  <option value="">All coverage</option>
                  <option value="gaps">Gaps only</option>
                  {(Object.keys(COVERAGE_LABEL) as ScopeCoverage[]).map((c) => (
                    <option key={c} value={c}>
                      {COVERAGE_LABEL[c]}
                    </option>
                  ))}
                </select>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search scope"
                  className={cn(limsDarkBarSearchClass, 'h-8 w-40 sm:w-56')}
                />
              </div>
            }
          >
            <p className="mb-2 text-[12px] text-stone-600">
              A row is covered by an approved record linked to it, or one for the same method (and parameter). A
              &quot;different edition&quot; match means the record names the method without the same year: check it is
              the latest valid edition (7.2.1.4). Unverified rows are not blocked; this list shows what still needs a
              record.
            </p>
            {loading && rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
            ) : visible.length === 0 ? (
              <p className="border border-dashed border-stone-400 bg-stone-50 px-3 py-6 text-center text-sm text-stone-600">
                {rows.length === 0 ? 'No NABL scope rows found.' : 'No rows match the filters.'}
              </p>
            ) : (
              <>
                {/* Phone: cards */}
                <div className="space-y-2 md:hidden">
                  {visible.map((r) => (
                    <div key={`${r.scope_kind}-${r.scope_id}`} className="border border-stone-400 bg-white p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">
                          {r.scope_kind} · #{r.s_no}
                        </p>
                        <CoverageBadge coverage={r.coverage} title={r.message ?? undefined} />
                      </div>
                      <p className="font-semibold text-stone-900">{r.parameter || '—'}</p>
                      <p className="text-[12px] text-stone-600">{r.method || '—'}</p>
                      <p className="mt-1 text-[12px] text-stone-700">{r.message}</p>
                      <Link to={recordLink(r)} className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-amber-800 underline">
                        {r.verification_id ? `Open ${r.record_no}` : 'Start a record'}
                      </Link>
                    </div>
                  ))}
                </div>

                {/* Desktop: table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[1080px] border-collapse font-jakarta">
                    <thead>
                      <tr>
                        <th className={mvThClass}>Scope</th>
                        <th className={mvThClass}>Discipline / product</th>
                        <th className={mvThClass}>Parameter / measurand</th>
                        <th className={mvThClass}>Method</th>
                        <th className={mvThClass}>Coverage</th>
                        <th className={mvThClass}>Record</th>
                        <th className={mvThClass}>Approved / valid until</th>
                        <th className={mvThClass}>Note</th>
                        <th className={cn(mvThClass, 'w-24')}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r, i) => (
                        <tr key={`${r.scope_kind}-${r.scope_id}`} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                          <td className={cn(mvTdClass, 'whitespace-nowrap')}>
                            <p className="font-semibold capitalize">{r.scope_kind}</p>
                            <p className="text-[11px] text-stone-600">
                              #{r.s_no} · {r.scope_status}
                            </p>
                          </td>
                          <td className={mvTdClass}>
                            <p>{r.discipline || '—'}</p>
                            <p className="text-[11px] text-stone-600">{r.item || ''}</p>
                          </td>
                          <td className={cn(mvTdClass, 'font-semibold')}>{r.parameter || '—'}</td>
                          <td className={mvTdClass}>{r.method || '—'}</td>
                          <td className={mvTdClass}>
                            <CoverageBadge coverage={r.coverage} title={r.message ?? undefined} />
                            {r.match_source === 'method_edition' ? (
                              <p className="mt-0.5 text-[11px] font-semibold text-amber-800">Different edition</p>
                            ) : null}
                            {r.standard_status && r.standard_status !== 'current' ? (
                              <p className="mt-0.5 text-[11px] font-bold text-red-700">
                                Standard {STANDARD_STATUS_LABEL[r.standard_status as StandardStatus]?.toLowerCase() ?? r.standard_status}
                              </p>
                            ) : null}
                          </td>
                          <td className={cn(mvTdClass, 'whitespace-nowrap')}>
                            {r.record_no ? (
                              <>
                                <p className="font-mono font-semibold text-amber-800">
                                  {r.record_no} v{r.version}
                                </p>
                                <p className="text-[11px] text-stone-600">
                                  {r.match_source ? MATCH_SOURCE_LABEL[r.match_source] : ''}
                                </p>
                              </>
                            ) : r.pending_record_no ? (
                              <p className="text-[12px] text-stone-600">{r.pending_record_no} in progress</p>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className={cn(mvTdClass, 'whitespace-nowrap')}>
                            <p>{fmtDate(r.approved_on)}</p>
                            <p className={cn('text-[11px]', r.coverage === 'expired' ? 'font-bold text-red-700' : 'text-stone-600')}>
                              {r.valid_until ? `until ${fmtDate(r.valid_until)}` : ''}
                            </p>
                          </td>
                          <td className={cn(mvTdClass, 'text-[12px]')}>{r.message}</td>
                          <td className={cn(mvTdClass, 'text-center')}>
                            <Button asChild size="sm" variant="outline" className={cn(limsOutlineBtnClass, 'h-8 px-2 text-xs')}>
                              <Link to={recordLink(r)}>
                                {r.verification_id ? (
                                  'Open'
                                ) : (
                                  <>
                                    <Plus className="h-3.5 w-3.5" /> Record
                                  </>
                                )}
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </MvPanel>
        </>
      ) : null}
    </div>
  )
}
