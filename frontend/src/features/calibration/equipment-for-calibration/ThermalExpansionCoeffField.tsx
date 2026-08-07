import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  formatThermalExpansionDisplay,
  formatThermalExpansionStored,
  parseThermalExpansion,
  toSuperscriptExponent,
  thermalExpansionToNumber,
} from './thermalExpansion'

type Props = {
  id?: string
  label?: string
  /** Canonical stored value (e.g. 11.5e-6). Empty string = not set. */
  value: string
  onChange: (stored: string) => void
  disabled?: boolean
}

/**
 * Function-style field: [mantissa] × 10^[exponent] /°C
 * Emits canonical `11.5e-6` for DB + calculations.
 */
export function ThermalExpansionCoeffField({
  id = 'efc-cte',
  label = 'Coefficient of Thermal Expansion',
  value,
  onChange,
  disabled,
}: Props) {
  const parsed = parseThermalExpansion(value)
  const [mantissa, setMantissa] = useState(parsed?.mantissa ?? '')
  const [exponentText, setExponentText] = useState(
    parsed != null ? String(parsed.exponent) : '',
  )

  useEffect(() => {
    const next = parseThermalExpansion(value)
    setMantissa(next?.mantissa ?? '')
    setExponentText(next != null ? String(next.exponent) : '')
  }, [value])

  const emit = (nextMantissa: string, nextExpText: string) => {
    const m = nextMantissa.trim()
    if (!m) {
      onChange('')
      return
    }
    const exp = Number.parseInt(nextExpText.trim(), 10)
    if (!Number.isFinite(exp)) return
    onChange(formatThermalExpansionStored({ mantissa: m, exponent: exp }))
  }

  const expNum = Number.parseInt(exponentText.trim(), 10)
  const previewParts =
    mantissa.trim() && Number.isFinite(expNum)
      ? { mantissa: mantissa.trim(), exponent: expNum }
      : null
  const numeric = previewParts ? thermalExpansionToNumber(previewParts) : null

  return (
    <div className="space-y-2">
      <Label htmlFor={`${id}-mantissa`}>{label}</Label>
      <div
        className="flex h-10 min-w-0 items-end gap-1 border-b border-slate-300 px-1 focus-within:border-teal-600"
        role="group"
        aria-label={label}
      >
        <Input
          id={`${id}-mantissa`}
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={mantissa}
          onChange={(e) => {
            const next = e.target.value.replace(/[^\d.+-]/g, '')
            setMantissa(next)
            emit(next, exponentText)
          }}
          placeholder="11.5"
          className="h-9 min-w-0 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          aria-label={`${label} mantissa`}
        />
        <span className="shrink-0 pb-2 text-[13px] font-medium text-slate-600" aria-hidden>
          × 10
        </span>
        <div className="relative w-14 shrink-0">
          <span
            className="pointer-events-none absolute -top-0.5 left-1 font-mono text-[12px] font-semibold leading-none text-teal-800"
            aria-hidden
          >
            {Number.isFinite(expNum) ? toSuperscriptExponent(expNum) : 'ⁿ'}
          </span>
          <Input
            id={`${id}-exponent`}
            type="text"
            inputMode="numeric"
            disabled={disabled}
            value={exponentText}
            onChange={(e) => {
              const next = e.target.value.replace(/[^\d+-]/g, '')
              setExponentText(next)
              emit(mantissa, next)
            }}
            placeholder="-6"
            className="h-9 border-0 bg-transparent px-1 pt-3 text-center text-[12px] text-slate-500 shadow-none focus-visible:ring-0"
            aria-label={`${label} exponent (power of 10)`}
          />
        </div>
        <span className="shrink-0 pb-2 text-[13px] font-medium text-slate-600" aria-hidden>
          /°C
        </span>
      </div>
      {previewParts && numeric != null ? (
        <p className="text-[11px] text-slate-500">
          {formatThermalExpansionDisplay(previewParts)}
          {' · '}α = {numeric}
        </p>
      ) : (
        <p className="text-[11px] text-slate-400">e.g. 11.5 × 10⁻⁶/°C</p>
      )}
    </div>
  )
}
