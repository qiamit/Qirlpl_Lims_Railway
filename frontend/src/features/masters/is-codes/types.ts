export type IsAspect = string

export type IsCodeRow = {
  id: string
  is_number: string
  revision_year: string | null
  reaffirmation_year: string | null
  amendment_number: string | null
  title: string
  aspect: IsAspect
  testing_charges: number | null
  remarks: string | null
  created_at?: string
}

export type IsCodeFileRow = {
  id: string
  is_code_id: string
  file_name: string
  storage_path: string
  created_at?: string
}

export type IsCodeForm = {
  isNumber: string
  revisionYear: string
  reaffirmationYear: string
  amendmentNumber: string
  title: string
  aspect: IsAspect
  testingCharges: string
  remarks: string
  files: File[]
}

export const emptyIsCodeForm = (): IsCodeForm => ({
  isNumber: '',
  revisionYear: '',
  reaffirmationYear: 'RA',
  amendmentNumber: '',
  title: '',
  aspect: 'Specification',
  testingCharges: '',
  remarks: '',
  files: [],
})

export const isValidYear4 = (value: string) => {
  const v = value.trim()
  if (!v) return true
  return /^[0-9]{1,4}$/.test(v)
}

export const isValidAmendment2 = (value: string) => {
  const v = value.trim()
  if (!v) return true
  return /^[0-9]{1,2}$/.test(v)
}

export const normalizeText = (v: string) => v.trim()
