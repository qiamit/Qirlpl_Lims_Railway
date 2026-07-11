import type { ResultValidityCheckType } from './types'

export interface ResultValidityCheckTypeMeta {
  id: ResultValidityCheckType
  clause: string
  label: string
  shortLabel: string
  description: string
  usesSample: boolean
  usesEquipment: boolean
  usesIqc: boolean
  usesTestParameter: boolean
}

export const RESULT_VALIDITY_CHECK_TYPES: ResultValidityCheckTypeMeta[] = [
  {
    id: '7_7_a',
    clause: '7.7.1(a)',
    label: 'Reference / QC Materials',
    shortLabel: 'Ref. Materials',
    description: 'Use of reference materials or quality control materials.',
    usesSample: true,
    usesEquipment: false,
    usesIqc: true,
    usesTestParameter: true,
  },
  {
    id: '7_7_b',
    clause: '7.7.1(b)',
    label: 'Alternative Instrumentation',
    shortLabel: 'Alt. Instrument',
    description: 'Use of alternative calibrated instrumentation with traceable results.',
    usesSample: true,
    usesEquipment: true,
    usesIqc: false,
    usesTestParameter: true,
  },
  {
    id: '7_7_c',
    clause: '7.7.1(c)',
    label: 'Functional Equipment Check',
    shortLabel: 'Functional Check',
    description: 'Functional check(s) of measuring and testing equipment.',
    usesSample: false,
    usesEquipment: true,
    usesIqc: false,
    usesTestParameter: false,
  },
  {
    id: '7_7_d',
    clause: '7.7.1(d)',
    label: 'Working Standard / Control Chart',
    shortLabel: 'Control Chart',
    description: 'Use of check or working standards with control charts where applicable.',
    usesSample: false,
    usesEquipment: false,
    usesIqc: true,
    usesTestParameter: false,
  },
  {
    id: '7_7_e',
    clause: '7.7.1(e)',
    label: 'Intermediate Equipment Check',
    shortLabel: 'Intermediate',
    description: 'Intermediate checks on measuring equipment between calibrations.',
    usesSample: false,
    usesEquipment: true,
    usesIqc: false,
    usesTestParameter: false,
  },
  {
    id: '7_7_f',
    clause: '7.7.1(f)',
    label: 'Replicate Tests / Calibrations',
    shortLabel: 'Replicate',
    description: 'Replicate tests or calibrations using the same or different methods.',
    usesSample: true,
    usesEquipment: true,
    usesIqc: false,
    usesTestParameter: true,
  },
  {
    id: '7_7_g',
    clause: '7.7.1(g)',
    label: 'Retest of Retained Items',
    shortLabel: 'Retest Retained',
    description: 'Retesting or recalibration of retained items.',
    usesSample: true,
    usesEquipment: false,
    usesIqc: false,
    usesTestParameter: false,
  },
  {
    id: '7_7_h',
    clause: '7.7.1(h)',
    label: 'Correlation of Results',
    shortLabel: 'Correlation',
    description: 'Correlation of results for different characteristics of an item.',
    usesSample: true,
    usesEquipment: false,
    usesIqc: false,
    usesTestParameter: true,
  },
  {
    id: '7_7_i',
    clause: '7.7.1(i)',
    label: 'Review of Reported Results',
    shortLabel: 'Results Review',
    description: 'Review of reported results before release.',
    usesSample: true,
    usesEquipment: false,
    usesIqc: false,
    usesTestParameter: false,
  },
  {
    id: '7_7_j',
    clause: '7.7.1(j)',
    label: 'Intralaboratory Comparison',
    shortLabel: 'Intralab',
    description: 'Intralaboratory comparisons between personnel, methods or equipment.',
    usesSample: true,
    usesEquipment: true,
    usesIqc: false,
    usesTestParameter: true,
  },
  {
    id: '7_7_k',
    clause: '7.7.1(k)',
    label: 'Blind Sample Testing',
    shortLabel: 'Blind Sample',
    description: 'Testing of blind sample(s) where the expected result is unknown to the analyst.',
    usesSample: true,
    usesEquipment: true,
    usesIqc: false,
    usesTestParameter: true,
  },
]

export function getCheckTypeMeta(type: ResultValidityCheckType): ResultValidityCheckTypeMeta {
  return RESULT_VALIDITY_CHECK_TYPES.find((t) => t.id === type) ?? RESULT_VALIDITY_CHECK_TYPES[0]
}

export function checkTypeLabel(type: ResultValidityCheckType): string {
  return getCheckTypeMeta(type).label
}

export const RESULT_VALIDITY_STATUS_LABELS: Record<string, string> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  satisfactory: 'Satisfactory',
  unsatisfactory: 'Unsatisfactory',
}
