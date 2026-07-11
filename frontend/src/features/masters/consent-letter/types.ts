export type ConsentLetterListRow = {
  id: string
  consentLetterNo: string
  letterDate: string
  clientId: string | null
  clientName: string
  clientAddress: string
  isCodeId: string | null
  isCodeLabel: string | null
  isNumber: string
  revisionYear: string | null
  productTitle: string | null
  testParameterNames: string[]
  clauseSummary: string | null
  generatedAt: string | null
}

export type ConsentLetterUpdateInput = ConsentLetterInsertInput & { id: string }

export type ConsentLetterInsertInput = {
  consentLetterNo: string
  letterDate: string
  clientId: string
  clientName: string
  clientAddress: string
  isCodeId: string
  isCodeLabel: string
  isNumber: string
  revisionYear: string | null
  productTitle: string
  testParameterNames: string[]
  clauseSummary: string | null
  sampleId?: string | null
  srfNumber?: string | null
  generatedBy?: string | null
}
