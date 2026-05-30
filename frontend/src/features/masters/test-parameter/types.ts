export type ConformityValue = 'Yes' | 'No'

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
  testing_charges: number | null
  conformity: ConformityValue
  department: string | null
  designation: string | null
  equipment_ids: string[]
  temperature_of_test: string | null
  humidity_of_test: string | null
  testing_time: string | null
  test_method_note_path: string | null
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
  testingCharges: string
  conformity: ConformityValue
  department: string
  designation: string
  equipmentIds: string[]
  temperatureOfTest: string
  humidityOfTest: string
  testingTimeHr: string
  testingTimeMin: string
  testMethodNotePath: string
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
  testingCharges: '',
  conformity: 'Yes',
  department: 'Mechanical',
  designation: 'Testing Engineer',
  equipmentIds: [],
  temperatureOfTest: '25 ± 2',
  humidityOfTest: '65 ± 5',
  testingTimeHr: '',
  testingTimeMin: '',
  testMethodNotePath: '',
})

export const normalizeText = (value: string) => value.trim()

export const normalizeNumberString = (value: string) => value.replace(/[^0-9.]/g, '')
