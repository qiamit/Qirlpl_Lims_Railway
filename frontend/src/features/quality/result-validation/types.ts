export type ResultValidityCheckType =
  | '7_7_a'
  | '7_7_b'
  | '7_7_c'
  | '7_7_d'
  | '7_7_e'
  | '7_7_f'
  | '7_7_g'
  | '7_7_h'
  | '7_7_i'
  | '7_7_j'
  | '7_7_k'

export type ResultValidityCheckStatus = 'planned' | 'in_progress' | 'satisfactory' | 'unsatisfactory'

export type ResultValidityFilter = 'all' | ResultValidityCheckStatus

export type ResultValidityCheckData = Record<
  string,
  string | number | boolean | string[] | RetestParameterEntry[] | null
>

export interface RetestParameterEntry {
  id: string
  testName: string
  testMethod: string
  unit: string
  uncertainty: string
  oldResult: string
  newResult: string
  status: string
}

export interface ResultValidityCheckRow {
  id: string
  checkRef: string
  checkType: ResultValidityCheckType
  checkDate: string
  status: ResultValidityCheckStatus
  title: string
  sampleId: string | null
  srfNumber: string | null
  testParameterName: string | null
  equipmentId: string | null
  equipmentLabel: string | null
  iqcMasterId: string | null
  iqcLabel: string | null
  performedBy: string | null
  performedByName: string | null
  performedByDepartment: string | null
  performedByDesignation: string | null
  reviewedBy: string | null
  reviewedByName: string | null
  reviewedByDepartment: string | null
  reviewedByDesignation: string | null
  predefinedCriteria: string | null
  checkData: ResultValidityCheckData
  conclusion: string | null
  actionTaken: string | null
  remarks: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface ResultValidityCheckForm {
  checkType: ResultValidityCheckType
  checkDate: string
  status: ResultValidityCheckStatus
  title: string
  sampleId: string
  srfNumber: string
  testParameterName: string
  equipmentId: string
  equipmentLabel: string
  iqcMasterId: string
  iqcLabel: string
  performedBy: string
  performedByDepartment: string
  performedByDesignation: string
  reviewedBy: string
  reviewedByDepartment: string
  reviewedByDesignation: string
  predefinedCriteria: string
  checkData: ResultValidityCheckData
  conclusion: string
  actionTaken: string
  remarks: string
}

export interface UserOption {
  id: string
  fullName: string
  departmentName: string
  designation: string
}

export interface EquipmentOption {
  id: string
  label: string
}

export interface IqcOption {
  id: string
  label: string
}

export interface SampleOption {
  id: string
  srfNumber: string
}

export function emptyResultValidityForm(
  checkType: ResultValidityCheckType = '7_7_g',
): ResultValidityCheckForm {
  return {
    checkType,
    checkDate: new Date().toISOString().slice(0, 10),
    status: 'planned',
    title: '',
    sampleId: '',
    srfNumber: '',
    testParameterName: '',
    equipmentId: '',
    equipmentLabel: '',
    iqcMasterId: '',
    iqcLabel: '',
    performedBy: '',
    performedByDepartment: '',
    performedByDesignation: '',
    reviewedBy: '',
    reviewedByDepartment: '',
    reviewedByDesignation: '',
    predefinedCriteria: '',
    checkData: {},
    conclusion: '',
    actionTaken: '',
    remarks: '',
  }
}

export function rowToForm(row: ResultValidityCheckRow): ResultValidityCheckForm {
  return {
    checkType: row.checkType,
    checkDate: row.checkDate?.slice(0, 10) ?? '',
    status: row.status,
    title: row.title ?? '',
    sampleId: row.sampleId ?? '',
    srfNumber: row.srfNumber ?? '',
    testParameterName: row.testParameterName ?? '',
    equipmentId: row.equipmentId ?? '',
    equipmentLabel: row.equipmentLabel ?? '',
    iqcMasterId: row.iqcMasterId ?? '',
    iqcLabel: row.iqcLabel ?? '',
    performedBy: row.performedBy ?? '',
    performedByDepartment: row.performedByDepartment ?? '',
    performedByDesignation: row.performedByDesignation ?? '',
    reviewedBy: row.reviewedBy ?? '',
    reviewedByDepartment: row.reviewedByDepartment ?? '',
    reviewedByDesignation: row.reviewedByDesignation ?? '',
    predefinedCriteria: row.predefinedCriteria ?? '',
    checkData: { ...row.checkData },
    conclusion: row.conclusion ?? '',
    actionTaken: row.actionTaken ?? '',
    remarks: row.remarks ?? '',
  }
}
