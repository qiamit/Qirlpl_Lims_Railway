import { IQC_PLAN_DEFAULT_ACCEPTANCE_CRITERIA } from './iqcPlanDefaults'

export type IqcPlanStatus = 'planned' | 'on_track' | 'due_soon' | 'overdue' | 'inactive'

export type IqcPlanFilter = 'all' | IqcPlanStatus

export interface IqcPlanRow {
  id: string
  checkName: string
  checkTypeSlug: string | null
  frequency: string
  acceptanceCriteria: string | null
  lastDone: string | null
  nextDue: string | null
  status: IqcPlanStatus
  remarks: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface IqcPlanForm {
  checkName: string
  checkTypeSlug: string
  frequency: string
  acceptanceCriteria: string
  lastDone: string
  nextDue: string
  status: IqcPlanStatus
  remarks: string
}

export function emptyIqcPlanForm(): IqcPlanForm {
  return {
    checkName: '',
    checkTypeSlug: '',
    frequency: 'Monthly',
    acceptanceCriteria: IQC_PLAN_DEFAULT_ACCEPTANCE_CRITERIA,
    lastDone: '',
    nextDue: '',
    status: 'planned',
    remarks: '',
  }
}

export function rowToIqcPlanForm(row: IqcPlanRow): IqcPlanForm {
  return {
    checkName: row.checkName,
    checkTypeSlug: row.checkTypeSlug ?? '',
    frequency: row.frequency,
    acceptanceCriteria: row.acceptanceCriteria ?? '',
    lastDone: row.lastDone?.slice(0, 10) ?? '',
    nextDue: row.nextDue?.slice(0, 10) ?? '',
    status: row.status,
    remarks: row.remarks ?? '',
  }
}
