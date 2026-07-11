export type TestParameterRow = {
  id: string
  is_code_id: string | null
  is_code_label: string | null
  clause_no: string | null
  unit_value: string | null
  test_method: string | null
  item_name: string
  specific_requirement: string | null
  under_accreditation_ids: string[]
  uncertainty_mu: string | null
  uncertainty_calculation_data: unknown | null
  department: string | null
  designation: string | null
  acceptance_criteria: string | null
  created_at?: string
}

export type AccreditationBodyRow = {
  id: string
  name: string
  created_at?: string
}

export type UnitRow = {
  id: string
  name: string
  created_at?: string
}

export type TestParameterForm = {
  isCodeId: string
  isCodeLabel: string
  clauseNo: string
  unitValue: string
  testMethod: string
  itemName: string
  specificRequirement: string
  underAccreditationIds: string[]
  uncertaintyMu: string
  department: string
  designation: string
}

export const emptyTestParameterForm = (): TestParameterForm => ({
  isCodeId: '',
  isCodeLabel: '',
  clauseNo: '',
  unitValue: '',
  testMethod: '',
  itemName: '',
  specificRequirement: '',
  underAccreditationIds: [],
  uncertaintyMu: '',
  department: 'Mechanical',
  designation: 'Testing Engineer',
})

export const normalizeText = (value: string) => value.trim()

export const normalizeNumberString = (value: string) => value.replace(/[^0-9.]/g, '')
