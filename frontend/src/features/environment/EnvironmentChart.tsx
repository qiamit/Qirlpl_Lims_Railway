import { useMemo } from 'react'
import type { DailyRange } from './shared'

const W = 640
const H = 200
const PAD = { top: 12, right: 12, bottom: 28, left: 40 }

function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo]
  const raw = (hi - lo) / (count - 1)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const start = Math.ceil(lo / step) * step
  const out: number[] = []
  for (let v = start; v <= hi + step * 1e-6; v += step) out.push(Number(v.toFixed(6)))
  return out
}

function shortDay(day: string): string {
  const [, m, d] = day.split('-')
  return `${d}/${m}`
}

/**
 * Daily min–max bars for one measurand with the acceptance band shaded.
 * Inline SVG (no chart library); scales to the container width.
 */
export function EnvironmentChart({
  title,
  unit,
  data,
  limitMin,
  limitMax,
}: {
  title: string
  unit: string
  data: DailyRange[]
  limitMin: number | null
  limitMax: number | null
}) {
  const view = useMemo(() => {
    if (data.length === 0) return null
    const values = data.flatMap((d) => [d.min, d.max])
    if (limitMin !== null) values.push(limitMin)
    if (limitMax !== null) values.push(limitMax)
    let lo = Math.min(...values)
    let hi = Math.max(...values)
    const padding = Math.max((hi - lo) * 0.1, 1)
    lo -= padding
    hi += padding
    const plotW = W - PAD.left - PAD.right
    const plotH = H - PAD.top - PAD.bottom
    const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH
    const slot = plotW / data.length
    const x = (i: number) => PAD.left + slot * (i + 0.5)
    const ticks = niceTicks(lo, hi)
    const labelEvery = Math.max(1, Math.ceil(data.length / 8))
    return { y, x, slot, ticks, labelEvery, plotW, plotH }
  }, [data, limitMin, limitMax])

  const outside = (v: number) => (limitMin !== null && v < limitMin) || (limitMax !== null && v > limitMax)

  if (!view) {
    return (
      <div className="border border-dashed border-stone-400 bg-stone-50 p-4 text-center text-[13px] text-stone-600">
        No {title.toLowerCase()} readings in this period.
      </div>
    )
  }

  const bandTop = limitMax !== null ? view.y(limitMax) : PAD.top
  const bandBottom = limitMin !== null ? view.y(limitMin) : PAD.top + view.plotH
  const hasBand = limitMin !== null || limitMax !== null
  const barW = Math.max(2, Math.min(14, view.slot * 0.45))
  const outCount = data.filter((d) => outside(d.min) || outside(d.max)).length

  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-1 text-[12px]">
        <span className="font-semibold text-stone-800">
          {title} ({unit}) — daily min / max
        </span>
        <span className="text-stone-600">
          {hasBand ? (
            <>
              <span className="mr-1 inline-block h-2.5 w-3 border border-emerald-600/50 bg-emerald-200/70 align-middle" />
              Limit {limitMin ?? '—'} to {limitMax ?? '—'} {unit}
            </>
          ) : (
            'No limit set'
          )}
          {outCount ? <span className="ml-2 font-semibold text-red-700">{outCount} day(s) outside</span> : null}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full border border-stone-300 bg-white"
        role="img"
        aria-label={`${title} daily minimum and maximum`}
      >
        {hasBand ? (
          <rect
            x={PAD.left}
            y={Math.min(bandTop, bandBottom)}
            width={view.plotW}
            height={Math.abs(bandBottom - bandTop)}
            fill="rgb(16 185 129 / 0.14)"
            stroke="rgb(5 150 105 / 0.45)"
            strokeDasharray="4 3"
          />
        ) : null}
        {view.ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={view.y(t)} y2={view.y(t)} stroke="#e7e5e4" />
            <text x={PAD.left - 6} y={view.y(t) + 3.5} textAnchor="end" fontSize="10" fill="#57534e">
              {t}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + view.plotH} stroke="#78716c" />
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + view.plotH}
          y2={PAD.top + view.plotH}
          stroke="#78716c"
        />
        {data.map((d, i) => {
          const bad = outside(d.min) || outside(d.max)
          const color = bad ? '#b91c1c' : '#b45309'
          const cx = view.x(i)
          const yMax = view.y(d.max)
          const yMin = view.y(d.min)
          return (
            <g key={d.day}>
              <title>{`${d.day}: min ${d.min} ${unit}, max ${d.max} ${unit} (${d.count} reading${d.count === 1 ? '' : 's'})`}</title>
              <rect
                x={cx - barW / 2}
                y={yMax}
                width={barW}
                height={Math.max(1.5, yMin - yMax)}
                fill={bad ? 'rgb(220 38 38 / 0.25)' : 'rgb(217 119 6 / 0.22)'}
                stroke={color}
              />
              <circle cx={cx} cy={yMax} r={2.4} fill={outside(d.max) ? '#b91c1c' : color} />
              <circle cx={cx} cy={yMin} r={2.4} fill={outside(d.min) ? '#b91c1c' : color} />
              {i % view.labelEvery === 0 || i === data.length - 1 ? (
                <text x={cx} y={H - 10} textAnchor="middle" fontSize="10" fill="#57534e">
                  {shortDay(d.day)}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
