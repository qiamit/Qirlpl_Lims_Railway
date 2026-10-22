import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn, formatDateTime } from '@/lib/utils'
import type { MrmInputForm } from './types'

export function MrmInputCard({
  input,
  readOnly,
  pulling,
  onPull,
  onChange,
}: {
  input: MrmInputForm
  readOnly: boolean
  pulling: boolean
  onPull: () => void
  onChange: (patch: Partial<MrmInputForm>) => void
}) {
  const { summary } = input
  const missing = summary.sources.filter((src) => src.status === 'missing')
  const failed = summary.sources.filter((src) => src.status === 'error')
  const noSource = summary.sources.length > 0 && summary.sources.every((src) => src.status !== 'ok')
  const conclusionMissing = !input.conclusion.trim()

  return (
    <section
      className={cn(
        'min-w-0 border-2 border-stone-400 bg-white shadow-sm',
        conclusionMissing ? 'border-l-4 border-l-amber-500' : 'border-l-4 border-l-emerald-600',
      )}
      aria-labelledby={`mrm-input-${input.code}`}
    >
      <header className="flex flex-wrap items-start gap-2 border-b border-stone-300 bg-stone-100 px-3 py-2">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center bg-stone-800 text-xs font-bold uppercase text-amber-200">
          {input.code}
        </span>
        <h3 id={`mrm-input-${input.code}`} className="min-w-0 flex-1 text-sm font-semibold text-stone-900">
          {input.title}
        </h3>
        {!readOnly ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(limsOutlineBtnClass, 'h-7 gap-1 px-2 text-xs')}
            onClick={onPull}
            disabled={pulling}
            aria-label={`Auto-pull figures for input ${input.code}`}
          >
            {pulling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Auto-pull
          </Button>
        ) : null}
      </header>

      <div className="space-y-3 px-3 py-3">
        <div className="space-y-1.5">
          {summary.figures.length > 0 ? (
            <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
              {summary.figures.map((f, idx) => (
                <div
                  key={`${f.label}-${idx}`}
                  className={cn(
                    'border px-2 py-1',
                    f.tone === 'warn'
                      ? 'border-red-300 bg-red-50'
                      : f.tone === 'ok'
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-stone-300 bg-stone-50',
                  )}
                >
                  <dt className="truncate text-[10px] uppercase tracking-wide text-stone-500" title={f.label}>
                    {f.label}
                  </dt>
                  <dd className="text-sm font-semibold tabular-nums text-stone-900">{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-xs text-stone-500">
              {noSource
                ? 'No data source for this input yet — record it from the discussion.'
                : input.pulledAt
                  ? 'Nothing recorded in the LIMS for this period.'
                  : 'No figures pulled yet.'}
            </p>
          )}
          {summary.items.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-stone-700">
              {summary.items.map((t, idx) => (
                <li key={idx} className="break-words">
                  {t}
                </li>
              ))}
            </ul>
          ) : null}
          {missing.length > 0 || failed.length > 0 || input.pulledAt ? (
            <p className="text-[11px] text-stone-500">
              {input.pulledAt ? `Pulled ${formatDateTime(input.pulledAt)}. ` : ''}
              {missing.length > 0 ? `No data source: ${missing.map((m) => m.label).join(', ')}. ` : ''}
              {failed.length > 0 ? `Could not read: ${failed.map((m) => m.label).join(', ')}.` : ''}
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`mrm-disc-${input.code}`} className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
              Discussion
            </Label>
            <Textarea
              id={`mrm-disc-${input.code}`}
              value={input.discussion}
              onChange={(e) => onChange({ discussion: e.target.value })}
              disabled={readOnly}
              rows={3}
              className="min-h-[72px] border-stone-500 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`mrm-conc-${input.code}`} className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
              Conclusion {conclusionMissing ? <span className="text-amber-700">(required to close)</span> : null}
            </Label>
            <Textarea
              id={`mrm-conc-${input.code}`}
              value={input.conclusion}
              onChange={(e) => onChange({ conclusion: e.target.value })}
              disabled={readOnly}
              rows={3}
              placeholder="e.g. Adequate / Not applicable this period / Action raised"
              className="min-h-[72px] border-stone-500 text-sm"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
