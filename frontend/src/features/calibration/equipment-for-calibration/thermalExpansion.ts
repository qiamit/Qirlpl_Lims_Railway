/**
 * Coefficient of Thermal Expansion (α) — scientific notation helpers.
 * Display: 11.5 × 10⁻⁶/°C
 * Stored:  11.5e-6   (canonical for DB + calculations)
 */

export const THERMAL_EXPANSION_UNIT = '/°C'

/** Default α used in length/gauge temp correction (≈ 11.5 × 10⁻⁶ /°C). */
export const DEFAULT_THERMAL_EXPANSION_MANTISSA = '11.5'
export const DEFAULT_THERMAL_EXPANSION_EXPONENT = -6

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
  '+': '⁺',
}

const FROM_SUPERSCRIPT: Record<string, string> = Object.fromEntries(
  Object.entries(SUPERSCRIPT_DIGITS).map(([k, v]) => [v, k]),
)

export type ThermalExpansionParts = {
  mantissa: string
  exponent: number
}

export function toSuperscriptExponent(exp: number): string {
  const s = String(Math.trunc(exp))
  return [...s].map((ch) => SUPERSCRIPT_DIGITS[ch] ?? ch).join('')
}

export function fromSuperscriptExponent(raw: string): number | null {
  const normalized = [...raw.trim()]
    .map((ch) => FROM_SUPERSCRIPT[ch] ?? ch)
    .join('')
    .replace(/−/g, '-')
  const n = Number.parseInt(normalized, 10)
  return Number.isFinite(n) ? n : null
}

/** Format parts for UI label: 11.5 × 10⁻⁶/°C */
export function formatThermalExpansionDisplay(parts: ThermalExpansionParts): string {
  const m = parts.mantissa.trim() || '0'
  return `${m} × 10${toSuperscriptExponent(parts.exponent)}${THERMAL_EXPANSION_UNIT}`
}

/** Canonical storage string for DB / formulas: 11.5e-6 */
export function formatThermalExpansionStored(parts: ThermalExpansionParts): string {
  const m = parts.mantissa.trim()
  if (!m) return ''
  const num = Number.parseFloat(m)
  if (!Number.isFinite(num)) return ''
  return `${m}e${parts.exponent}`
}

/** Numeric α for calculations (e.g. 0.0000115). */
export function thermalExpansionToNumber(parts: ThermalExpansionParts): number | null {
  const m = Number.parseFloat(parts.mantissa.trim())
  if (!Number.isFinite(m)) return null
  return m * 10 ** parts.exponent
}

/**
 * Parse stored or display text into mantissa + exponent.
 * Accepts: 11.5e-6 | 11.5E-6 | 11.5×10^-6/°C | 11.5 × 10⁻⁶/°C | 0.0000115
 */
export function parseThermalExpansion(raw: string | null | undefined): ThermalExpansionParts | null {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!s) return null

  // 11.5e-6 / 11.5E-6
  const sci = s.match(/^([+-]?\d+(?:\.\d+)?)\s*[eE]\s*([+-]?\d+)\s*(?:\/?\s*°?\s*C)?$/i)
  if (sci) {
    const exponent = Number.parseInt(sci[2]!, 10)
    if (!Number.isFinite(exponent)) return null
    return { mantissa: sci[1]!, exponent }
  }

  // 11.5 × 10⁻⁶/°C  or  11.5 x 10^-6 /°C
  const timesTen = s.match(
    /^([+-]?\d+(?:\.\d+)?)\s*[×xX*]\s*10\s*(?:[\^]?\s*([+-]?\d+)|([⁻⁺⁰¹²³⁴⁵⁶⁷⁸⁹]+))\s*(?:\/?\s*°?\s*C)?$/i,
  )
  if (timesTen) {
    const expRaw = timesTen[2] ?? timesTen[3] ?? ''
    const exponent = timesTen[2]
      ? Number.parseInt(timesTen[2], 10)
      : fromSuperscriptExponent(expRaw)
    if (exponent == null || !Number.isFinite(exponent)) return null
    return { mantissa: timesTen[1]!, exponent }
  }

  // Plain decimal → normalize to scientific-ish mantissa × 10^e
  const plain = Number.parseFloat(s.replace(/\/?\s*°?\s*C$/i, '').trim())
  if (Number.isFinite(plain) && plain !== 0) {
    const exp = Math.floor(Math.log10(Math.abs(plain)))
    const mant = plain / 10 ** exp
    const mantissa =
      Math.abs(mant) >= 10 || Math.abs(mant) < 1
        ? String(Number(mant.toPrecision(6)))
        : String(Number(mant.toPrecision(6)))
    return { mantissa, exponent: exp }
  }
  if (Number.isFinite(plain) && plain === 0) {
    return { mantissa: '0', exponent: 0 }
  }

  return null
}

/** Parse any stored CTE string → numeric α, or null if empty/invalid. */
export function parseCoefficientOfThermalExpansionNumeric(
  raw: string | null | undefined,
): number | null {
  const parts = parseThermalExpansion(raw)
  if (!parts) return null
  return thermalExpansionToNumber(parts)
}

/** Prefer equipment CTE; fall back to default α string used by Raw Data temp correction. */
export function resolveThermalExpansionAlphaString(
  equipmentStored: string | null | undefined,
  fallback = '0.0000115',
): string {
  const n = parseCoefficientOfThermalExpansionNumeric(equipmentStored)
  if (n == null || !Number.isFinite(n)) return fallback
  // Prefer compact scientific for formula constants when magnitude is tiny
  if (Math.abs(n) > 0 && Math.abs(n) < 1e-3) {
    const parts = parseThermalExpansion(equipmentStored)
    if (parts) return formatThermalExpansionStored(parts)
  }
  return String(n)
}

export function defaultThermalExpansionParts(): ThermalExpansionParts {
  return {
    mantissa: DEFAULT_THERMAL_EXPANSION_MANTISSA,
    exponent: DEFAULT_THERMAL_EXPANSION_EXPONENT,
  }
}
