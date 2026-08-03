/** GUM helpers for MU (Conduct auto-fill will use templates later). */

import type { MuCalculationTemplate } from './muCalculationTypes'

export function sampleStdDev(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/** Type A u_A = s / √n from observation values (Conduct auto-calc). */
export function computeTypeAFromReadings(values: number[]): number | null {
  const s = sampleStdDev(values)
  if (s == null) return null
  return s / Math.sqrt(values.length)
}

export function parseMuNumber(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const t = String(raw ?? '').trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function formatMuNumber(n: number | null, decimalPlaces: number): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(decimalPlaces)
}

export type MuCalcResult = {
  typeA: number | null
  typeBRows: Array<{
    id: string
    name: string
    ui: number | null
    contribution: number | null
  }>
  /** Combined standard uncertainty u_c */
  uc: number | null
  coverageFactorK: number
  /** Expanded uncertainty U = k · u_c */
  expandedU: number | null
}

/**
 * Template design only for now — runtime evaluation from column sheets
 * is wired at Conduct time in a later pass.
 */
export function computeMuCalculation(template: MuCalculationTemplate): MuCalcResult {
  const k =
    Number.isFinite(template.coverageFactorK) && template.coverageFactorK > 0
      ? template.coverageFactorK
      : 2
  return {
    typeA: null,
    typeBRows: [],
    uc: null,
    coverageFactorK: k,
    expandedU: null,
  }
}
