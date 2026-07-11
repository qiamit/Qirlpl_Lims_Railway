import type { ResultValidityCheckType } from './types'

export interface ResultValidationModuleDef {
  slug: string
  label: string
  clause: string
  checkType: ResultValidityCheckType | null
  description: string
}

export const RESULT_VALIDATION_BASE_PATH = '/samples/result-validation'

export const DEFAULT_RESULT_VALIDATION_MODULE_SLUG = 'retesting-check'

/** ISO 17025 Clause 7.7 — excludes Intermediate Check (handled under Equipment Master). */
export const RESULT_VALIDATION_MODULES: ResultValidationModuleDef[] = [
  {
    slug: 'iqc-plan',
    label: 'IQC Plan',
    clause: '7.7',
    checkType: null,
    description: 'Internal quality control plan and schedule.',
  },
  {
    slug: 'reference-material-check',
    label: 'Reference Material Check',
    clause: '7.7.1(a)',
    checkType: '7_7_a',
    description: 'Use of reference materials or quality control materials.',
  },
  {
    slug: 'alternate-instrument-check',
    label: 'Alternate Instrument Check',
    clause: '7.7.1(b)',
    checkType: '7_7_b',
    description: 'Alternative calibrated instrumentation with traceable results.',
  },
  {
    slug: 'functional-check',
    label: 'Functional Check',
    clause: '7.7.1(c)',
    checkType: '7_7_c',
    description: 'Functional check(s) of measuring and testing equipment.',
  },
  {
    slug: 'control-chart',
    label: 'Control Chart',
    clause: '7.7.1(d)',
    checkType: '7_7_d',
    description: 'Working standards with control charts where applicable.',
  },
  {
    slug: 'replicate-check',
    label: 'Replicate Check',
    clause: '7.7.1(f)',
    checkType: '7_7_f',
    description: 'Replicate tests or calibrations using the same or different methods.',
  },
  {
    slug: 'retesting-check',
    label: 'Retesting Check',
    clause: '7.7.1(g)',
    checkType: '7_7_g',
    description: 'Retesting or recalibration of retained items.',
  },
  {
    slug: 'correlation-check',
    label: 'Correlation Check',
    clause: '7.7.1(h)',
    checkType: '7_7_h',
    description: 'Correlation of results for different characteristics of an item.',
  },
  {
    slug: 'results-review-check',
    label: 'Results Review Check',
    clause: '7.7.1(i)',
    checkType: '7_7_i',
    description: 'Review of reported results before release.',
  },
  {
    slug: 'intralab-check',
    label: 'Intralab Check',
    clause: '7.7.1(j)',
    checkType: '7_7_j',
    description: 'Intralaboratory comparisons between personnel, methods or equipment.',
  },
  {
    slug: 'blind-sampling-check',
    label: 'Blind Sampling Check',
    clause: '7.7.1(k)',
    checkType: '7_7_k',
    description: 'Blind sample testing where the expected result is unknown to the analyst.',
  },
]

export function resultValidationModulePath(slug: string): string {
  return `${RESULT_VALIDATION_BASE_PATH}/${slug}`
}

export function getResultValidationModule(slug: string | undefined): ResultValidationModuleDef | undefined {
  if (!slug?.trim()) return undefined
  return RESULT_VALIDATION_MODULES.find((module) => module.slug === slug.trim())
}

export function getResultValidationModuleByCheckType(
  checkType: ResultValidityCheckType,
): ResultValidationModuleDef | undefined {
  return RESULT_VALIDATION_MODULES.find((module) => module.checkType === checkType)
}
