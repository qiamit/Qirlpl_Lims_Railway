/**
 * Annual personnel declarations, ISO/IEC 17025:2017 clauses 4.1 and 4.2.
 * The exact text a person signs is stored with the record (statement_text),
 * so changing the wording here only affects new signatures. Bump the version
 * whenever the wording changes.
 */

export type DeclarationType = 'impartiality_coi' | 'confidentiality'

export type DeclarationStatement = {
  type: DeclarationType
  title: string
  shortTitle: string
  clause: string
  version: string
  /** Body for the given year; numbered points separated by new lines. */
  text: (year: number) => string
  /** COI asks for a list of interests ("None" when there are none). */
  asksForConflicts: boolean
}

export const DECLARATION_STATEMENTS: DeclarationStatement[] = [
  {
    type: 'impartiality_coi',
    title: 'Impartiality and Conflict of Interest Declaration',
    shortTitle: 'Impartiality / COI',
    clause: 'ISO/IEC 17025:2017 cl. 4.1',
    version: 'IMP-COI v1.0',
    asksForConflicts: true,
    text: (year) =>
      [
        `Impartiality and Conflict of Interest Declaration for ${year}`,
        '',
        'The laboratory must carry out its testing and calibration work impartially. For this year I confirm that:',
        '1. I will not let commercial, financial or other pressure from anyone, inside or outside the laboratory, influence my technical work or the results I report.',
        '2. I will report results exactly as found. I will not change, leave out or pick data to suit a customer, a colleague or management.',
        '3. I will not accept gifts, money, hospitality or favours from customers, suppliers or anyone with an interest in a test or calibration result. Any token item I am offered I will report to the Quality Manager.',
        '4. I will not test, calibrate, review or authorise work for a customer or product in which I, or a close family member, have a financial, employment, ownership or personal interest.',
        '5. I am not involved in designing, making, selling, installing, using or maintaining items that I test or calibrate for customers, except as I have listed below.',
        '6. I will tell the Quality Manager or the Laboratory Director straight away if a new conflict of interest arises, or if anyone puts pressure on me about a result.',
        '',
        'Below I have listed every current relationship or interest that could affect, or could appear to affect, my impartiality. Where I have none, I have written "None".',
      ].join('\n'),
  },
  {
    type: 'confidentiality',
    title: 'Confidentiality Agreement',
    shortTitle: 'Confidentiality',
    clause: 'ISO/IEC 17025:2017 cl. 4.2',
    version: 'CONF v1.0',
    asksForConflicts: false,
    text: (year) =>
      [
        `Confidentiality Agreement for ${year}`,
        '',
        'The laboratory is responsible for protecting all information it obtains or creates while working for its customers. For this year I agree that:',
        '1. I will keep confidential all customer information: names, samples and items, drawings, specifications, test and calibration data, results, reports, prices and correspondence.',
        '2. I will use this information only for my work in the laboratory, and share it only with colleagues who need it for that work.',
        '3. I will not disclose customer information to anyone outside the laboratory, including other customers, unless the customer has agreed in writing or the law requires it. Any request for disclosure, including from a regulator or a court, goes to the Quality Manager or the Laboratory Director, who will inform the customer unless the law forbids it.',
        '4. Information about a customer that comes from someone other than the customer (for example a complainant or a regulator) is also confidential, and I will not reveal where it came from unless that source agrees.',
        '5. I will protect paper and electronic records: I will not share my LIMS password, copy data to personal devices, email or messaging accounts, or photograph samples, documents or screens without permission.',
        '6. I will report any loss or suspected leak of confidential information to the Quality Manager straight away.',
        '7. This agreement continues after my employment or contract with the laboratory ends.',
      ].join('\n'),
  },
]

/** Declarations for a year are due by 31 January of that year. */
export function declarationDueDate(year: number): Date {
  return new Date(year, 0, 31, 23, 59, 59)
}

export type DeclarationStatus = 'Signed' | 'Pending' | 'Overdue'

export function declarationStatus(
  signed: boolean,
  year: number,
  now: Date = new Date(),
): DeclarationStatus {
  if (signed) return 'Signed'
  return now > declarationDueDate(year) ? 'Overdue' : 'Pending'
}
