import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { limsDarkBarBtnClass, limsDarkBarFieldClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { SectionCompareSource } from './sectionCompareSources'
import { formatNumber } from './testResultValues'

function evaluateExpression(expr: string): number | null {
  const t = expr.trim().replace(/,/g, '')
  if (!t) return null
  if (!/^[\d+\-*/().\s]+$/.test(t)) return null
  try {
    const result = Function(`"use strict"; return (${t})`)() as unknown
    return typeof result === 'number' && Number.isFinite(result) ? result : null
  } catch {
    return null
  }
}

const KEYS = [
  ['C', '⌫', '(', ')'],
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['0', '.', '=', '+'],
] as const

export function TestResultMiniCalculator({
  decimalPlaces,
  onInsertReading,
  onApplyReported,
  references = [],
  className,
}: {
  decimalPlaces: number
  onInsertReading?: (value: string) => void
  onApplyReported: (value: string) => void
  /** Section test parameters / individual readings to insert into the expression. */
  references?: SectionCompareSource[]
  className?: string
}) {
  const [expression, setExpression] = useState('')

  const result = useMemo(() => evaluateExpression(expression), [expression])
  const formattedResult = result !== null ? formatNumber(result, decimalPlaces) : ''

  const appendToken = (token: string) => {
    setExpression((prev) => prev + token)
  }

  const insertReference = (source: SectionCompareSource) => {
    appendToken(formatNumber(source.value, decimalPlaces))
  }

  const handleKey = (key: string) => {
    if (key === 'C') {
      setExpression('')
      return
    }
    if (key === '⌫') {
      setExpression((prev) => prev.slice(0, -1))
      return
    }
    if (key === '=') {
      if (formattedResult) setExpression(formattedResult)
      return
    }
    appendToken(key)
  }

  return (
    <div
      className={cn(
        'space-y-2 border border-amber-500/35 bg-stone-950/40 p-2.5 text-white',
        className,
      )}
    >
      {references.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
            Section references
          </p>
          <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
            {references.map((source) => (
              <button
                key={source.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 border border-stone-500 bg-stone-800/70 px-2 py-1.5 text-left text-[11px] text-amber-50 hover:bg-amber-500/20"
                title={`Insert ${formatNumber(source.value, decimalPlaces)}${source.unit ? ` ${source.unit}` : ''}`}
                onClick={() => insertReference(source)}
              >
                <span className="min-w-0 truncate">{source.label}</span>
                <span className="shrink-0 font-mono tabular-nums text-amber-100">
                  {formatNumber(source.value, decimalPlaces)}
                  {source.unit ? ` ${source.unit}` : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-stone-400">
          No numeric readings in this section yet. Add individual readings to use as references.
        </p>
      )}

      <Input
        value={expression}
        onChange={(e) => setExpression(e.target.value)}
        placeholder="Expression e.g. (12.1 + 11.9) / 2"
        className={cn(limsDarkBarFieldClass, 'font-mono text-xs')}
        inputMode="decimal"
      />
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-amber-100/90">Result</span>
        <span className="font-mono font-semibold tabular-nums text-amber-50">
          {formattedResult || '—'}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {KEYS.flat().map((key) => (
          <Button
            key={key}
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              limsDarkBarBtnClass,
              'h-8 px-0 text-xs',
              key === '=' && 'border-amber-400 bg-amber-500/25 text-amber-50',
            )}
            onClick={() => handleKey(key)}
          >
            {key}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {onInsertReading ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(limsDarkBarBtnClass, 'h-8 flex-1 text-xs')}
            disabled={!formattedResult}
            onClick={() => {
              if (!formattedResult) return
              onInsertReading(formattedResult)
            }}
          >
            Add as reading
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          className={cn(limsPrimaryBtnClass, 'h-8 flex-1 text-xs')}
          disabled={!formattedResult}
          onClick={() => {
            if (!formattedResult) return
            onApplyReported(formattedResult)
          }}
        >
          Apply to reported
        </Button>
      </div>
    </div>
  )
}
