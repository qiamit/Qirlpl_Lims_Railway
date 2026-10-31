import { AlertTriangle, Eye, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { envTdClass, envThClass } from '@/features/environment/EnvironmentUi'
import type { EquipmentOption } from '@/lib/equipmentTraceability'
import { limsOutlineBtnClass, limsPanelClass } from '@/lib/limsThemeUi'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { CalibrationStatusBadge } from '../MetallographyUi'
import type { ScaleCalibration } from '../types'
import {
  calibrationValidity,
  effectiveValidFrom,
  equipmentText,
  fixed,
  resolutionText,
  umPerPxText,
  validityWarningText,
  type CalibrationValidity,
} from './calibrationFormat'

/** "Expires in N days" / "Expired" / "Not yet valid" next to the status. */
export function CalibrationValidityBadge({ validity }: { validity: CalibrationValidity }) {
  const text = validityWarningText(validity)
  if (!text) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap border px-1.5 py-0.5 text-[11px] font-bold',
        validity.state === 'expired'
          ? 'border-red-700/50 bg-red-100 text-red-800'
          : 'border-amber-700/50 bg-amber-100 text-amber-900',
      )}
    >
      <AlertTriangle className="h-3 w-3" /> {text}
    </span>
  )
}

/** Can the user change this row (draft by its performer, or the Director)? Decides the row icon only. */
function rowIsEditable(c: ScaleCalibration, canEdit: boolean, userId: string | null, isDirector: boolean): boolean {
  return canEdit && c.status === 'draft' && (isDirector || (userId !== null && c.performedBy === userId))
}

export function MicroscopeCalibrationTable({
  rows,
  loading,
  error,
  filtered,
  today,
  equipmentById,
  canEdit,
  userId,
  isDirector,
  onOpen,
}: {
  rows: ScaleCalibration[]
  loading: boolean
  error: string | null
  /** A search or filter is active (changes the empty text). */
  filtered: boolean
  /** yyyy-mm-dd, local. */
  today: string
  equipmentById: ReadonlyMap<string, EquipmentOption>
  canEdit: boolean
  userId: string | null
  isDirector: boolean
  onOpen: (c: ScaleCalibration) => void
}) {
  const openLabel = (c: ScaleCalibration) => `${rowIsEditable(c, canEdit, userId, isDirector) ? 'Edit' : 'Open'} ${c.calCode ?? 'calibration'}`

  return (
    <section className={cn(limsPanelClass, 'bg-[#f7f3eb]')}>
      {error ? <p className="px-3 pt-3 text-sm text-red-700">{error}</p> : null}

      {loading && rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-[#78716c]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-[#57534e]">
            {filtered ? 'No calibrations match the filter.' : 'No microscope calibrations recorded yet.'}
          </p>
          {!filtered && canEdit ? (
            <p className="mt-1 text-xs text-[#78716c]">
              Use &quot;New calibration&quot; to record µm per pixel from a stage micrometer image.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          {/* Phone: cards */}
          <div className="space-y-2 p-2 md:hidden">
            {rows.map((c) => {
              const v = calibrationValidity(c, today)
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(c)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onOpen(c)
                    }
                  }}
                  className="block w-full cursor-pointer border border-stone-400 bg-white p-2.5 text-left hover:bg-[#f3e9d8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
                  aria-label={openLabel(c)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="font-mono text-[12.5px] font-semibold text-amber-800">{c.calCode ?? '—'}</span>
                    <span className="flex flex-wrap gap-1">
                      <CalibrationStatusBadge status={c.status} />
                      <CalibrationValidityBadge validity={v} />
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] font-semibold text-stone-900">
                    {equipmentText(c.microscopeEquipmentId, equipmentById)}
                  </p>
                  <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px]">
                    <dt className="text-stone-500">Objective</dt>
                    <dd>
                      {c.objective}
                      {c.totalMagnification ? ` · ${c.totalMagnification}×` : ''}
                    </dd>
                    <dt className="text-stone-500">Resolution</dt>
                    <dd>{resolutionText(c.imageWidthPx, c.imageHeightPx)}</dd>
                    <dt className="text-stone-500">µm/px X · Y</dt>
                    <dd className="font-mono tabular-nums">
                      {umPerPxText(c.umPerPxX)} · {umPerPxText(c.umPerPxY)}
                    </dd>
                    <dt className="text-stone-500">Valid</dt>
                    <dd>
                      {formatDate(effectiveValidFrom(c))} – {formatDate(c.validUntil)}
                    </dd>
                    <dt className="text-stone-500">Performed</dt>
                    <dd>{c.performedByName || '—'}</dd>
                    <dt className="text-stone-500">Verified</dt>
                    <dd>{c.verifiedByName || '—'}</dd>
                  </dl>
                </div>
              )
            })}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1100px] border-collapse font-jakarta">
              <thead>
                <tr>
                  <th className={envThClass}>Cal. No</th>
                  <th className={envThClass}>Microscope</th>
                  <th className={envThClass}>Camera</th>
                  <th className={envThClass}>Stage micrometer</th>
                  <th className={envThClass}>Objective</th>
                  <th className={envThClass}>Resolution</th>
                  <th className={envThClass}>µm/px X</th>
                  <th className={envThClass}>µm/px Y</th>
                  <th className={envThClass}>u rel %</th>
                  <th className={envThClass}>Valid</th>
                  <th className={envThClass}>Status</th>
                  <th className={envThClass}>Performed / verified</th>
                  <th className={cn(envThClass, 'w-12')}>Open</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => {
                  const v = calibrationValidity(c, today)
                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]',
                        'cursor-pointer hover:bg-[#f3e9d8]',
                        c.status === 'withdrawn' && 'opacity-60',
                      )}
                      onClick={() => onOpen(c)}
                    >
                      <td className={cn(envTdClass, 'whitespace-nowrap font-mono font-semibold text-amber-800')}>
                        {c.calCode ?? '—'}
                      </td>
                      <td className={envTdClass}>{equipmentText(c.microscopeEquipmentId, equipmentById)}</td>
                      <td className={envTdClass}>{equipmentText(c.cameraEquipmentId, equipmentById)}</td>
                      <td className={envTdClass}>{equipmentText(c.stageMicrometerEquipmentId, equipmentById)}</td>
                      <td className={cn(envTdClass, 'whitespace-nowrap')}>
                        {c.objective}
                        {c.totalMagnification ? <p className="text-[11px] text-stone-600">{c.totalMagnification}× total</p> : null}
                      </td>
                      <td className={cn(envTdClass, 'whitespace-nowrap text-center')}>
                        {resolutionText(c.imageWidthPx, c.imageHeightPx)}
                      </td>
                      <td className={cn(envTdClass, 'whitespace-nowrap text-right font-mono tabular-nums')}>
                        {umPerPxText(c.umPerPxX)}
                      </td>
                      <td className={cn(envTdClass, 'whitespace-nowrap text-right font-mono tabular-nums')}>
                        {umPerPxText(c.umPerPxY)}
                      </td>
                      <td className={cn(envTdClass, 'whitespace-nowrap text-right font-mono tabular-nums')}>
                        {fixed(c.uRelScalePct, 2)}
                      </td>
                      <td className={cn(envTdClass, 'whitespace-nowrap')}>
                        <p>{formatDate(effectiveValidFrom(c))}</p>
                        <p className="text-[11.5px] text-stone-600">to {formatDate(c.validUntil)}</p>
                      </td>
                      <td className={cn(envTdClass, 'text-center')}>
                        <div className="flex flex-col items-center gap-1">
                          <CalibrationStatusBadge status={c.status} />
                          <CalibrationValidityBadge validity={v} />
                        </div>
                      </td>
                      <td className={envTdClass}>
                        <p>{c.performedByName || '—'}</p>
                        <p className="text-[11px] text-stone-600">{formatDateTime(c.performedAt)}</p>
                        {c.verifiedAt ? (
                          <>
                            <p className="mt-1">{c.verifiedByName || '—'}</p>
                            <p className="text-[11px] text-stone-600">{formatDateTime(c.verifiedAt)}</p>
                          </>
                        ) : null}
                      </td>
                      <td className={cn(envTdClass, 'text-center')}>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className={cn(limsOutlineBtnClass, 'w-8')}
                          aria-label={openLabel(c)}
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpen(c)
                          }}
                        >
                          {rowIsEditable(c, canEdit, userId, isDirector) ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
