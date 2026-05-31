/**
 * Canonical designation from User Management / profiles.
 * Laboratory Director gets full Sample Handling (Clause 7.4) nav + gated routes.
 */
export function isLaboratoryDirector(designation: string | null | undefined): boolean {
  const d = designation?.trim().toLowerCase() ?? ''
  return d === 'laboratory director'
}

/** Laboratory Director may delete SRF / section records from sample-handling footers. */
export function canDeleteSampleHandlingRecords(designation: string | null | undefined): boolean {
  return isLaboratoryDirector(designation)
}
