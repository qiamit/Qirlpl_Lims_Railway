import { Link } from 'react-router-dom'
import { CheckCircle2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { envTdClass, envThClass } from '@/features/environment/EnvironmentUi'
import { ComingLaterChip } from '../MetallographyUi'
import { RING_TEST_ENGINE_VERSION } from '../engines/types'
import { ANALYSIS_KINDS, ANALYSIS_KIND_LABEL, AVAILABLE_ANALYSIS_KINDS, type AnalysisKind } from '../types'

/** Engine version bundled in this build, per kind (null = not built yet). */
const ENGINE_VERSION: Record<AnalysisKind, string | null> = {
  ring_test: RING_TEST_ENGINE_VERSION,
  grain_size: null,
  inclusion: null,
  decarburization: null,
  microstructure: null,
  macro: null,
}

/** S5 Engines: what this build can run. Each analysis stores the version it ran with. */
export function EnginesTab() {
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-stone-600">
        The analyses run in the browser. Each analysis records the engine version it used, and Re-check runs that same
        version again. Validation cases (RT, MC, MF) are run under{' '}
        <Link to="/quality/validation-runs" className="inline-flex items-center gap-1 font-semibold text-amber-800 underline">
          Quality → LIMS Validation Runs <ExternalLink className="h-3 w-3" />
        </Link>
        .
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse font-jakarta">
          <thead>
            <tr>
              <th className={envThClass}>Analysis kind</th>
              <th className={envThClass}>Engine version</th>
              <th className={envThClass}>Status</th>
            </tr>
          </thead>
          <tbody>
            {ANALYSIS_KINDS.map((k, i) => {
              const version = ENGINE_VERSION[k]
              const available = AVAILABLE_ANALYSIS_KINDS.has(k) && version
              return (
                <tr key={k} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                  <td className={cn(envTdClass, 'font-semibold')}>{ANALYSIS_KIND_LABEL[k]}</td>
                  <td className={cn(envTdClass, 'font-mono')}>{version ?? '—'}</td>
                  <td className={envTdClass}>
                    {available ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap border border-emerald-700/40 bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800">
                        <CheckCircle2 className="h-3 w-3" /> Available
                      </span>
                    ) : (
                      <ComingLaterChip />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
