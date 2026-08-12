import {
  COLUMN_FORMULA_HELP_ROWS,
  evaluateMathExpression,
  validateMathExpression,
} from '@/features/calibration/rawDataSheetTypes'

/**
 * Safe scientific formula evaluator for calibration point generation.
 * Supports: x, ^ / **, + − * /, parentheses, and the same function catalog
 * as Column Calculation (AVERAGE, SUM, IF, …) plus scientific extras.
 */

/** Normalize user formula: ^ → **, unicode operators, whitespace. */
export function normalizePointFormula(expr: string): string {
  return expr
    .trim()
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\^/g, '**')
}

/** Bare `pi` / `e` → `pi()` / `e()` without touching scientific notation (1.2e-3). */
function rewriteBareConstants(expr: string): string {
  return expr
    .replace(/\bpi\b(?!\s*\()/gi, 'pi()')
    .replace(/(?<![\d.])\be\b(?!\s*\()(?![\d])/gi, 'e()')
}

/**
 * Validate that the expression only contains safe tokens.
 * Returns null if valid, otherwise an error message.
 */
export function validatePointFormula(expr: string): string | null {
  const normalized = normalizePointFormula(expr)
  if (!normalized) return 'Formula is empty.'
  const body = rewriteBareConstants(normalized.replace(/\bx\b/gi, '1'))
  const issue = validateMathExpression(body)
  if (!issue) return null
  return issue.replace(
    'Use names in [brackets], numbers, + − × ÷, & "text", or AVERAGE/SUM/MIN/MAX/MEDIAN/MODE/STDEV/VAR/ABS/SQRT.',
    'Use x, numbers, + − × ÷, or functions from the Formula list (AVERAGE, SIN, SQRT, …).',
  )
}

function preparePointExpression(expr: string, x: number): string {
  return rewriteBareConstants(normalizePointFormula(expr).replace(/\bx\b/gi, `(${x})`))
}

/** Evaluate formula for source value x. Returns null on invalid / non-finite. */
export function evaluatePointFormula(expr: string, x: number): number | null {
  if (validatePointFormula(expr) != null) return null
  try {
    const result = evaluateMathExpression(preparePointExpression(expr, x))
    return result != null && Number.isFinite(result) ? result : null
  } catch {
    return null
  }
}

export function clampPointFormulaDecimals(raw: unknown, fallback = 2): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(6, Math.max(0, Math.round(n)))
}

export function formatFormulaResult(value: number, decimals?: number): string {
  if (!Number.isFinite(value)) return ''
  if (decimals != null && Number.isFinite(decimals)) {
    return value.toFixed(clampPointFormulaDecimals(decimals, 2))
  }
  const abs = Math.abs(value)
  const rounded =
    abs >= 1e6
      ? Number(value.toPrecision(8))
      : abs >= 100
        ? Math.round(value * 100) / 100
        : abs >= 1
          ? Math.round(value * 1000) / 1000
          : Math.round(value * 1e8) / 1e8
  return String(Number(rounded.toPrecision(12)))
}

/** Synced with Column Calculation Formulas — same shared catalog. */
export const POINT_FORMULA_HELP_ROWS = COLUMN_FORMULA_HELP_ROWS

export type FormulaPadInsert =
  | { kind: 'text'; text: string; cursorBack?: number }
  | { kind: 'clear' }
  | { kind: 'backspace' }

export type FormulaPadKey = {
  label: string
  ariaLabel: string
  insert: FormulaPadInsert
  variant?: 'default' | 'accent' | 'muted' | 'danger' | 'fn'
}

/** Scientific keypad layout (rows). */
export const SCIENTIFIC_PAD_KEYS: FormulaPadKey[][] = [
  [
    { label: 'sin', ariaLabel: 'Sine', insert: { kind: 'text', text: 'sin()', cursorBack: 1 }, variant: 'fn' },
    { label: 'cos', ariaLabel: 'Cosine', insert: { kind: 'text', text: 'cos()', cursorBack: 1 }, variant: 'fn' },
    { label: 'tan', ariaLabel: 'Tangent', insert: { kind: 'text', text: 'tan()', cursorBack: 1 }, variant: 'fn' },
    { label: 'ln', ariaLabel: 'Natural log', insert: { kind: 'text', text: 'ln()', cursorBack: 1 }, variant: 'fn' },
    { label: 'log', ariaLabel: 'Log base 10', insert: { kind: 'text', text: 'log()', cursorBack: 1 }, variant: 'fn' },
  ],
  [
    { label: '√', ariaLabel: 'Square root', insert: { kind: 'text', text: 'sqrt()', cursorBack: 1 }, variant: 'fn' },
    { label: '∛', ariaLabel: 'Cube root', insert: { kind: 'text', text: 'cbrt()', cursorBack: 1 }, variant: 'fn' },
    { label: 'x²', ariaLabel: 'Square', insert: { kind: 'text', text: '^2' }, variant: 'fn' },
    { label: 'xʸ', ariaLabel: 'Power', insert: { kind: 'text', text: '^' }, variant: 'fn' },
    { label: 'eˣ', ariaLabel: 'Exponential', insert: { kind: 'text', text: 'exp()', cursorBack: 1 }, variant: 'fn' },
  ],
  [
    { label: 'π', ariaLabel: 'Pi', insert: { kind: 'text', text: 'pi' }, variant: 'muted' },
    { label: 'e', ariaLabel: 'Euler number', insert: { kind: 'text', text: 'e' }, variant: 'muted' },
    { label: 'abs', ariaLabel: 'Absolute value', insert: { kind: 'text', text: 'abs()', cursorBack: 1 }, variant: 'fn' },
    { label: '10ˣ', ariaLabel: 'Ten to the power', insert: { kind: 'text', text: '10^' }, variant: 'fn' },
    { label: 'x', ariaLabel: 'Insert x variable', insert: { kind: 'text', text: 'x' }, variant: 'accent' },
  ],
  [
    { label: '(', ariaLabel: 'Open parenthesis', insert: { kind: 'text', text: '(' }, variant: 'muted' },
    { label: ')', ariaLabel: 'Close parenthesis', insert: { kind: 'text', text: ')' }, variant: 'muted' },
    { label: '7', ariaLabel: '7', insert: { kind: 'text', text: '7' } },
    { label: '8', ariaLabel: '8', insert: { kind: 'text', text: '8' } },
    { label: '9', ariaLabel: '9', insert: { kind: 'text', text: '9' } },
    { label: '÷', ariaLabel: 'Divide', insert: { kind: 'text', text: '/' }, variant: 'accent' },
  ],
  [
    { label: 'C', ariaLabel: 'Clear formula', insert: { kind: 'clear' }, variant: 'danger' },
    { label: '⌫', ariaLabel: 'Backspace', insert: { kind: 'backspace' }, variant: 'danger' },
    { label: '4', ariaLabel: '4', insert: { kind: 'text', text: '4' } },
    { label: '5', ariaLabel: '5', insert: { kind: 'text', text: '5' } },
    { label: '6', ariaLabel: '6', insert: { kind: 'text', text: '6' } },
    { label: '×', ariaLabel: 'Multiply', insert: { kind: 'text', text: '*' }, variant: 'accent' },
  ],
  [
    { label: '±', ariaLabel: 'Negate / minus', insert: { kind: 'text', text: '-' }, variant: 'muted' },
    { label: '.', ariaLabel: 'Decimal point', insert: { kind: 'text', text: '.' } },
    { label: '1', ariaLabel: '1', insert: { kind: 'text', text: '1' } },
    { label: '2', ariaLabel: '2', insert: { kind: 'text', text: '2' } },
    { label: '3', ariaLabel: '3', insert: { kind: 'text', text: '3' } },
    { label: '−', ariaLabel: 'Subtract', insert: { kind: 'text', text: '-' }, variant: 'accent' },
  ],
  [
    { label: '×10ⁿ', ariaLabel: 'Times ten to the power', insert: { kind: 'text', text: '*10^' }, variant: 'muted' },
    { label: '+', ariaLabel: 'Add', insert: { kind: 'text', text: '+' }, variant: 'accent' },
  ],
]

export function applyFormulaPadInsert(
  current: string,
  selectionStart: number,
  selectionEnd: number,
  insert: FormulaPadInsert,
): { value: string; caret: number } {
  if (insert.kind === 'clear') return { value: '', caret: 0 }
  if (insert.kind === 'backspace') {
    if (selectionStart !== selectionEnd) {
      const value = current.slice(0, selectionStart) + current.slice(selectionEnd)
      return { value, caret: selectionStart }
    }
    if (selectionStart <= 0) return { value: current, caret: 0 }
    const value = current.slice(0, selectionStart - 1) + current.slice(selectionStart)
    return { value, caret: selectionStart - 1 }
  }
  const before = current.slice(0, selectionStart)
  const after = current.slice(selectionEnd)
  const value = before + insert.text + after
  const caret = selectionStart + insert.text.length - (insert.cursorBack ?? 0)
  return { value, caret }
}
