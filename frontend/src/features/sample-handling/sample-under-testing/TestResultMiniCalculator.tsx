import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
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
  className,
}: {
  decimalPlaces: number
  onInsertReading: (value: string) => void
  onApplyReported: (value: string) => void
  className?: string
}) {
  const [expression, setExpression] = useState('')

  const result = useMemo(() => evaluateExpression(expression), [expression])
  const formattedResult = result !== null ? formatNumber(result, decimalPlaces) : ''

  const appendToken = (token: string) => {
    setExpression((prev) => prev + token)
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
    <div className={cn('rounded-md border border-border/60 bg-background p-2.5 space-y-2', className)}>
      <Input
        value={expression}
        onChange={(e) => setExpression(e.target.value)}
        placeholder="Enter expression e.g. (5.2 + 4.8) / 2"
        className="h-8 text-xs font-mono"
        inputMode="decimal"
      />
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Result</span>
        <span className="font-mono font-semibold tabular-nums">{formattedResult || '—'}</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {KEYS.flat().map((key) => (
          <Button
            key={key}
            type="button"
            variant={key === '=' ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs px-0"
            onClick={() => handleKey(key)}
          >
            {key}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs flex-1"
          disabled={!formattedResult}
          onClick={() => {
            if (!formattedResult) return
            onInsertReading(formattedResult)
          }}
        >
          Add as reading
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 text-xs flex-1"
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
