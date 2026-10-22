import { useState } from 'react'
import { cn } from '@/lib/utils'

export type MiniTrendPoint = { label: string; value: number | null; note?: string }

/**
 * Small single-series bar trend (one hue, optional dashed target line).
 * Hover / focus a bar for its value; the last value is labelled directly.
 * Callers show the same numbers in a table for accessibility.
 */
export function MiniTrendBars({
  points,
  target = null,
  height = 64,
  ariaLabel,
  formatValue = (v) => String(Number(v.toPrecision(6))),
  className,
}: {
  points: MiniTrendPoint[]
  target?: number | null
  height?: number
  ariaLabel: string
  formatValue?: (v: number) => string
  className?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const values = points.map((p) => p.value).filter((v): v is number => v !== null)
  if (points.length === 0) return null
  const max = Math.max(0, ...values, target ?? 0)
  const min = Math.min(0, ...values, target ?? 0)
  const span = max - min || 1
  const barW = 14
  const gap = 4
  const padTop = 14
  const plotH = height - padTop - 2
  const width = points.length * (barW + gap) + 24
  const y = (v: number) => padTop + ((max - v) / span) * plotH
  const zeroY = y(0)
  const lastIdx = points.map((p) => p.value !== null).lastIndexOf(true)
  const shown = hover ?? lastIdx

  return (
    <div className={cn('relative inline-block', className)}>
      <svg
        role="img"
        aria-label={ariaLabel}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
      >
        <line x1={0} x2={width} y1={zeroY} y2={zeroY} className="stroke-stone-300" strokeWidth={1} />
        {target !== null ? (
          <line
            x1={0}
            x2={width}
            y1={y(target)}
            y2={y(target)}
            className="stroke-stone-500"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          >
            <title>{`Target ${formatValue(target)}`}</title>
          </line>
        ) : null}
        {points.map((p, i) => {
          const x = i * (barW + gap) + 2
          if (p.value === null) {
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={x} y={padTop} width={barW} height={plotH} fill="transparent" />
                <line x1={x + 3} x2={x + barW - 3} y1={zeroY - 2} y2={zeroY - 2} className="stroke-stone-400" strokeWidth={2} />
                <title>{`${p.label}: no value`}</title>
              </g>
            )
          }
          const top = Math.min(y(p.value), zeroY)
          const h = Math.max(1, Math.abs(zeroY - y(p.value)))
          return (
            <g
              key={i}
              tabIndex={0}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              <rect x={x - 1} y={padTop} width={barW + 2} height={plotH} fill="transparent" />
              <rect
                x={x}
                y={top}
                width={barW}
                height={h}
                rx={2}
                className={cn('fill-amber-700', hover !== null && hover !== i && 'opacity-50')}
              />
              <title>{`${p.label}: ${formatValue(p.value)}${p.note ? ` (${p.note})` : ''}`}</title>
            </g>
          )
        })}
        {shown >= 0 && points[shown]?.value !== null ? (
          <text
            x={Math.min(shown * (barW + gap) + 2 + barW / 2, width - 4)}
            y={Math.max(10, Math.min(y(points[shown].value as number), zeroY) - 3)}
            textAnchor="middle"
            className="fill-stone-700 text-[10px] font-semibold"
          >
            {formatValue(points[shown].value as number)}
          </text>
        ) : null}
      </svg>
      {hover !== null ? (
        <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 whitespace-nowrap border border-stone-400 bg-white px-2 py-1 text-[11px] text-stone-800 shadow">
          {points[hover].label}: {points[hover].value === null ? 'no value' : formatValue(points[hover].value as number)}
          {points[hover].note ? ` · ${points[hover].note}` : ''}
        </div>
      ) : null}
    </div>
  )
}
