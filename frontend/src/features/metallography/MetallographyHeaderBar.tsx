import { RotateCcw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { limsOutlineBtnClass, limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { EnvSelect, Field, envInputClass } from '@/features/environment/EnvironmentUi'
import {
  ANALYSIS_KINDS,
  ANALYSIS_KIND_LABEL,
  ANALYSIS_STATUS_LABEL,
  type AnalysisKind,
  type AnalysisStatus,
} from './types'

export type RegisterTab = 'pending' | 'analyses'

/** S1 filters; every one lives in the URL (?tab=&kind=&status=&from=&to=&srf=&analyst=). */
export type RegisterFilters = {
  kind: AnalysisKind | 'all'
  status: AnalysisStatus | 'all'
  from: string
  to: string
  srf: string
  analyst: string
}

export type AnalystOption = { id: string; name: string }

const STATUSES: AnalysisStatus[] = ['in_progress', 'completed', 'superseded', 'void']

/** Tabs (Pending / Analyses) and, on the Analyses tab, the kind chips and filters. */
export function MetallographyHeaderBar({
  tab,
  onTabChange,
  pendingCount,
  analysesCount,
  filters,
  onFiltersChange,
  onClearFilters,
  analysts,
}: {
  tab: RegisterTab
  onTabChange: (tab: RegisterTab) => void
  pendingCount: number | null
  analysesCount: number | null
  filters: RegisterFilters
  onFiltersChange: (patch: Partial<RegisterFilters>) => void
  onClearFilters: () => void
  analysts: AnalystOption[]
}) {
  const tabBtn = (value: RegisterTab, label: string, count: number | null) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => onTabChange(value)}
      className={cn(
        'h-9 border-b-2 px-3 text-[12px] font-bold uppercase tracking-[0.12em] transition-colors',
        tab === value
          ? 'border-amber-500 bg-stone-900 text-amber-200'
          : 'border-transparent text-stone-300 hover:bg-stone-700 hover:text-amber-100',
      )}
    >
      {label}
      {count !== null ? <span className="ml-1.5 font-mono text-[11px] text-stone-400">({count})</span> : null}
    </button>
  )

  const filtered =
    filters.kind !== 'all' || filters.status !== 'all' || filters.from || filters.to || filters.srf || filters.analyst

  return (
    <section className={limsPanelClass}>
      <div role="tablist" className="flex flex-wrap items-end gap-1 border-b-2 border-stone-500 bg-stone-800 px-2 pt-1">
        {tabBtn('pending', 'Pending', pendingCount)}
        {tabBtn('analyses', 'Analyses', analysesCount)}
      </div>

      {tab === 'analyses' ? (
        <div className="space-y-2 bg-[#fffcf7] p-2 sm:p-3">
          {/* Quick filter by kind */}
          <div className="flex flex-wrap gap-1" aria-label="Analysis kind">
            {(['all', ...ANALYSIS_KINDS] as Array<AnalysisKind | 'all'>).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onFiltersChange({ kind: k })}
                aria-pressed={filters.kind === k}
                className={cn(
                  'h-8 border px-2.5 text-[12px] font-semibold',
                  filters.kind === k
                    ? 'border-amber-700 bg-amber-700 text-white'
                    : 'border-stone-400 bg-stone-50 text-stone-800 hover:bg-amber-50',
                )}
              >
                {k === 'all' ? 'All' : ANALYSIS_KIND_LABEL[k]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="Status" htmlFor="mg-f-status">
              <EnvSelect
                id="mg-f-status"
                value={filters.status}
                onChange={(v) => onFiltersChange({ status: v as RegisterFilters['status'] })}
              >
                <option value="all">All</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ANALYSIS_STATUS_LABEL[s]}
                  </option>
                ))}
              </EnvSelect>
            </Field>
            <Field label="Test date from" htmlFor="mg-f-from">
              <Input
                id="mg-f-from"
                type="date"
                value={filters.from}
                onChange={(e) => onFiltersChange({ from: e.target.value })}
                className={envInputClass}
              />
            </Field>
            <Field label="Test date to" htmlFor="mg-f-to">
              <Input
                id="mg-f-to"
                type="date"
                value={filters.to}
                onChange={(e) => onFiltersChange({ to: e.target.value })}
                className={envInputClass}
              />
            </Field>
            <Field label="SRF" htmlFor="mg-f-srf">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-500" />
                <Input
                  id="mg-f-srf"
                  value={filters.srf}
                  onChange={(e) => onFiltersChange({ srf: e.target.value })}
                  placeholder="SRF number"
                  className={cn(envInputClass, 'pl-7')}
                />
              </div>
            </Field>
            <Field label="Analyst" htmlFor="mg-f-analyst">
              <EnvSelect id="mg-f-analyst" value={filters.analyst} onChange={(v) => onFiltersChange({ analyst: v })}>
                <option value="">All</option>
                {analysts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </EnvSelect>
            </Field>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                className={cn(limsOutlineBtnClass, 'h-10 w-full sm:h-8')}
                onClick={onClearFilters}
                disabled={!filtered}
              >
                <RotateCcw className="h-4 w-4" /> Clear filters
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
