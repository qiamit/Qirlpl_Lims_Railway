import { useMemo } from 'react'
import { formatChartNumber as fmt, type ChartLimits, type PointEvaluation } from './controlChartStats'

const W = 760
const H = 290
const PAD = { top: 14, right: 78, bottom: 36, left: 56 }

export type ChartPoint = {
  key: string
  label: string
  value: number
  evaluation: PointEvaluation
  tooltip: string
}

function niceTicks(lo: number, hi: number, count = 6): number[] {
  if (!(hi > lo)) return [lo]
  const raw = (hi - lo) / (count - 1)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const start = Math.ceil(lo / step) * step
  const out: number[] = []
  for (let v = start; v <= hi + step * 1e-6; v += step) out.push(Number(v.toPrecision(10)))
  return out
}

const ZONE_FILL: Record<string, string> = {
  in: '#44403c',
  warning: '#d97706',
  action: '#b91c1c',
}

/**
 * Levey-Jennings / Shewhart X-chart: mean, ±1SD (faint), ±2SD warning and
 * ±3SD action lines, points in time order. Inline SVG, scales to the width.
 * Points that complete a Westgard rejection rule get a red ring.
 */
export function ControlChartSvg({
  points,
  limits,
  unit,
  selectedKey,
  onSelect,
}: {
  points: ChartPoint[]
  limits: ChartLimits
  unit?: string
  selectedKey?: string | null
  onSelect?: (key: string) => void
}) {
  const view = useMemo(() => {
    const values = [...points.map((p) => p.value), limits.actionLow, limits.actionHigh]
    let lo = Math.min(...values)
    let hi = Math.max(...values)
    const span = hi - lo || Math.abs(hi) || 1
    lo -= span * 0.08
    hi += span * 0.08
    const plotW = W - PAD.left - PAD.right
    const plotH = H - PAD.top - PAD.bottom
    const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH
    const slot = plotW / Math.max(points.length, 1)
    const x = (i: number) => PAD.left + slot * (i + 0.5)
    const ticks = niceTicks(lo, hi)
    const labelEvery = Math.max(1, Math.ceil(points.length / 10))
    return { y, x, plotW, plotH, ticks, labelEvery }
  }, [points, limits])

  const lines: Array<{ v: number; label: string; stroke: string; dash?: string; width?: number }> = [
    { v: limits.actionHigh, label: '+3SD', stroke: '#b91c1c', dash: '6 3', width: 1.4 },
    { v: limits.warnHigh, label: '+2SD', stroke: '#d97706', dash: '5 3', width: 1.2 },
    { v: limits.center + limits.sd, label: '+1SD', stroke: '#d6d3d1', dash: '2 3' },
    { v: limits.center, label: 'Mean', stroke: '#1c1917', width: 1.4 },
    { v: limits.center - limits.sd, label: '−1SD', stroke: '#d6d3d1', dash: '2 3' },
    { v: limits.warnLow, label: '−2SD', stroke: '#d97706', dash: '5 3', width: 1.2 },
    { v: limits.actionLow, label: '−3SD', stroke: '#b91c1c', dash: '6 3', width: 1.4 },
  ]

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${view.x(i).toFixed(1)},${view.y(p.value).toFixed(1)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full border border-stone-300 bg-white"
      role="img"
      aria-label={`Control chart, ${points.length} points, mean ${fmt(limits.center)}${unit ? ` ${unit}` : ''}`}
    >
      <rect
        x={PAD.left}
        y={view.y(limits.warnHigh)}
        width={view.plotW}
        height={Math.max(0, view.y(limits.warnLow) - view.y(limits.warnHigh))}
        fill="rgb(16 185 129 / 0.07)"
      />
      {view.ticks.map((t) => (
        <g key={`t${t}`}>
          <line x1={PAD.left} x2={W - PAD.right} y1={view.y(t)} y2={view.y(t)} stroke="#f5f5f4" />
          <text x={PAD.left - 6} y={view.y(t) + 3.5} textAnchor="end" fontSize="10" fill="#57534e">
            {fmt(t)}
          </text>
        </g>
      ))}
      {lines.map((l) => (
        <g key={l.label}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={view.y(l.v)}
            y2={view.y(l.v)}
            stroke={l.stroke}
            strokeDasharray={l.dash}
            strokeWidth={l.width ?? 1}
          />
          {l.label.includes('1SD') ? null : (
            <text x={W - PAD.right + 4} y={view.y(l.v) + 3.5} fontSize="10" fill={l.stroke === '#d6d3d1' ? '#78716c' : l.stroke}>
              {`${l.label} ${fmt(l.v)}`}
            </text>
          )}
        </g>
      ))}
      <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + view.plotH} stroke="#78716c" />
      <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + view.plotH} y2={PAD.top + view.plotH} stroke="#78716c" />
      {points.length > 1 ? <path d={path} fill="none" stroke="#a8a29e" strokeWidth={1.2} /> : null}
      {points.map((p, i) => {
        const cx = view.x(i)
        const cy = view.y(p.value)
        const selected = selectedKey === p.key
        return (
          <g
            key={p.key}
            onClick={onSelect ? () => onSelect(p.key) : undefined}
            style={onSelect ? { cursor: 'pointer' } : undefined}
          >
            <title>{p.tooltip}</title>
            {p.evaluation.rejected ? <circle cx={cx} cy={cy} r={8} fill="none" stroke="#b91c1c" strokeWidth={1.6} /> : null}
            {selected ? <circle cx={cx} cy={cy} r={10.5} fill="none" stroke="#2563eb" strokeWidth={1.6} /> : null}
            <circle cx={cx} cy={cy} r={4.2} fill={ZONE_FILL[p.evaluation.zone]} stroke="#fff" strokeWidth={1} />
            {i % view.labelEvery === 0 ? (
              <text x={cx} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="9.5" fill="#57534e">
                {p.label}
              </text>
            ) : null}
          </g>
        )
      })}
      {unit ? (
        <text x={12} y={PAD.top + view.plotH / 2} fontSize="10" fill="#57534e" transform={`rotate(-90 12 ${PAD.top + view.plotH / 2})`} textAnchor="middle">
          {unit}
        </text>
      ) : null}
    </svg>
  )
}
