import type { IqcPlanStatus } from './types'

export const IQC_PLAN_STATUS_LABELS: Record<IqcPlanStatus, string> = {
  planned: 'Planned',
  on_track: 'On Track',
  due_soon: 'Due Soon',
  overdue: 'Overdue',
  inactive: 'Inactive',
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null
  const d = new Date(`${value.trim().slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function deriveIqcPlanStatus(input: {
  nextDue: string | null
  lastDone: string | null
  storedStatus: IqcPlanStatus
}): IqcPlanStatus {
  if (input.storedStatus === 'inactive') return 'inactive'

  const nextDue = parseDate(input.nextDue)
  if (!nextDue) {
    return input.lastDone?.trim() ? 'on_track' : 'planned'
  }

  const today = startOfToday()
  const diffDays = Math.floor((nextDue.getTime() - today.getTime()) / MS_PER_DAY)

  if (diffDays < 0) return 'overdue'
  if (diffDays <= 7) return 'due_soon'
  return 'on_track'
}

export function withDerivedIqcPlanStatus<T extends {
  nextDue: string | null
  lastDone: string | null
  status: IqcPlanStatus
}>(row: T): T {
  return {
    ...row,
    status: deriveIqcPlanStatus({
      nextDue: row.nextDue,
      lastDone: row.lastDone,
      storedStatus: row.status,
    }),
  }
}
