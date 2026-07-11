import { evaluateResultConformity } from '@/features/sample-handling/report-preparation/evaluateResultConformity'
import type { RetestSampleTestParameterOption } from './fetchSampleTestParametersForRetest'
import type { ResultValidityCheckData, RetestParameterEntry } from './types'

export const RETEST_STATUS_OPTIONS = ['Pass', 'Fail', '—'] as const
export type RetestStatus = (typeof RETEST_STATUS_OPTIONS)[number]

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

export function retestStatusFromResult(newResult: string, acceptanceCriteria: string): RetestStatus {
  const remark = evaluateResultConformity(newResult, acceptanceCriteria)
  if (remark === 'Confirm') return 'Pass'
  if (remark === 'Not Confirm') return 'Fail'
  return '—'
}

export function normalizeRetestParameterEntry(raw: unknown): RetestParameterEntry | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  if (!id) return null
  return {
    id,
    testName: str(raw.testName) || str(raw.test_name) || '—',
    testMethod: str(raw.testMethod) || str(raw.test_method),
    unit: str(raw.unit) || str(raw.unit_value),
    uncertainty: str(raw.uncertainty),
    oldResult: str(raw.oldResult) || str(raw.old_result),
    newResult: str(raw.newResult) || str(raw.new_result),
    status: normalizeRetestStatus(str(raw.status)),
  }
}

export function normalizeRetestStatus(value: string): RetestStatus {
  const t = value.trim()
  if (t === 'Pass' || t.toLowerCase() === 'pass') return 'Pass'
  if (t === 'Fail' || t.toLowerCase() === 'fail') return 'Fail'
  if (t === 'Confirm') return 'Pass'
  if (t === 'Not Confirm') return 'Fail'
  return '—'
}

export function parseRetestParameters(checkData: ResultValidityCheckData): RetestParameterEntry[] {
  const raw = checkData.retest_parameters
  if (Array.isArray(raw)) {
    return raw
      .map(normalizeRetestParameterEntry)
      .filter((row): row is RetestParameterEntry => row != null)
  }

  const ids = Array.isArray(checkData.retest_parameter_ids)
    ? checkData.retest_parameter_ids.map(String)
    : []
  const labels = Array.isArray(checkData.retest_parameter_labels)
    ? checkData.retest_parameter_labels.map(String)
    : []

  return ids.map((id, index) => ({
    id,
    testName: labels[index]?.trim() || '—',
    testMethod: '',
    unit: '',
    uncertainty: '',
    oldResult: '',
    newResult: '',
    status: '—',
  }))
}

export function retestOptionToEntry(option: RetestSampleTestParameterOption): RetestParameterEntry {
  return {
    id: option.id,
    testName: option.label,
    testMethod: option.testMethod,
    unit: option.unit,
    uncertainty: option.uncertainty,
    oldResult: option.oldResult,
    newResult: '',
    status: '—',
  }
}

export function mergeRetestParameterEntries(
  existing: RetestParameterEntry[],
  fetched: RetestSampleTestParameterOption[],
): RetestParameterEntry[] {
  const byId = new Map(fetched.map((f) => [f.id, f]))
  return existing.map((row) => {
    const match = byId.get(row.id)
    if (!match) return row
    return {
      ...row,
      testName: row.testName !== '—' ? row.testName : match.label,
      testMethod: row.testMethod || match.testMethod,
      unit: row.unit || match.unit,
      uncertainty: row.uncertainty || match.uncertainty,
      oldResult: row.oldResult || match.oldResult,
    }
  })
}

export function retestParameterLabels(entries: RetestParameterEntry[]): string[] {
  return entries.map((e) => e.testName).filter(Boolean)
}

export function retestParametersToCheckData(
  checkData: ResultValidityCheckData,
  entries: RetestParameterEntry[],
): ResultValidityCheckData {
  const labels = retestParameterLabels(entries)
  return {
    ...checkData,
    retest_parameters: entries,
    retest_parameter_ids: entries.map((e) => e.id),
    retest_parameter_labels: labels,
  }
}
