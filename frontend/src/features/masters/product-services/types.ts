export const NABL_TYPE_OF_TEST_OPTIONS = ['Quantitative', 'Qualitative'] as const
export type NablTypeOfTest = (typeof NABL_TYPE_OF_TEST_OPTIONS)[number]

export type NablScopeRow = {
  id: string
  s_no: number
  discipline_group: string
  materials_products: string
  component_parameter: string
  test_method_specification: string
  permanent_testing: string
  type_of_test: string | null
  range_minimum: number | null
  range_maximum: number | null
  uncertainty: string | null
  created_at?: string
}

export type NablScopeForm = {
  sNo: string
  disciplineGroup: string
  materialsProducts: string
  componentParameter: string
  testMethodSpecification: string
  permanentTesting: string
  typeOfTest: string
  rangeMinimum: string
  rangeMaximum: string
  uncertainty: string
}

export const emptyNablScopeForm = (): NablScopeForm => ({
  sNo: '',
  disciplineGroup: '',
  materialsProducts: '',
  componentParameter: '',
  testMethodSpecification: '',
  permanentTesting: 'Permanent Testing',
  typeOfTest: '',
  rangeMinimum: '',
  rangeMaximum: '',
  uncertainty: '',
})

export const normalizeText = (value: string) => value.trim()

export const isValidIntegerOrEmpty = (value: string) => {
  const v = value.trim()
  if (!v) return true
  const n = Number(v)
  return Number.isInteger(n) && n > 0
}

export const isValidNumberOrEmpty = (value: string) => {
  const v = value.trim()
  if (!v) return true
  const n = Number(v)
  return Number.isFinite(n)
}

export function parseOptionalNumber(value: string): number | null {
  const v = value.trim()
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function formatScopeNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return String(value)
}
