/**
 * Indian identifiers: GSTIN, PAN, PIN code, mobile, and GST state codes.
 * Ported from Consultancy Pro (`lib/indiaValidators.ts`). The GSTIN checksum
 * and the state-name map match the database functions gstin_is_valid() and
 * gst_state_code_for_name() (migration 20261030100100).
 */

/** GST state codes in use (CBIC). 25 (Daman & Diu) merged into 26. */
export const INDIA_GST_STATE_CODES = [
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '26', '27', '28', '29', '30', '31',
  '32', '33', '34', '35', '36', '37', '38', '97',
] as const

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

export function gstinStateCode(gstin: string): string {
  const v = gstin.trim().toUpperCase()
  return v.length >= 2 ? v.slice(0, 2) : ''
}

export function panFromGstin(gstin: string): string {
  const v = gstin.trim().toUpperCase()
  return GSTIN_SHAPE.test(v) ? v.slice(2, 12) : ''
}

export function isValidPan(value: string): boolean {
  const v = value.trim().toUpperCase()
  if (!v) return true
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v)
}

export function isValidIndianPinCode(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  return /^[1-9][0-9]{5}$/.test(v)
}

/** Indian mobile when the country code is +91. Empty is valid. */
export function isValidIndianMobile(value: string, countryCode: string): boolean {
  const v = value.trim()
  if (!v) return true
  const code = countryCode.trim()
  if (code !== '+91' && code !== '91') return true
  return /^[6-9][0-9]{9}$/.test(v)
}

/** Shape, state code and check character. Empty is valid (the field is optional). */
export function isValidGstin(value: string): boolean {
  const v = value.trim().toUpperCase()
  if (!v) return true
  if (!GSTIN_SHAPE.test(v)) return false
  if (!INDIA_GST_STATE_CODES.includes(v.slice(0, 2) as (typeof INDIA_GST_STATE_CODES)[number])) return false
  let sum = 0
  for (let i = 0; i < 14; i += 1) {
    const code = GSTIN_CHARS.indexOf(v[i] ?? '')
    if (code < 0) return false
    const product = code * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(product / 36) + (product % 36)
  }
  const check = (36 - (sum % 36)) % 36
  return GSTIN_CHARS[check] === v[14]
}

/** A GSTIN that is present and valid (isValidGstin treats empty as valid). */
export function hasValidGstin(value: string | null | undefined): boolean {
  const v = String(value ?? '').trim()
  return v.length > 0 && isValidGstin(v)
}

const STATE_CODE_BY_NAME: Record<string, string> = {
  jammuandkashmir: '01', jammukashmir: '01', jk: '01',
  himachalpradesh: '02', hp: '02',
  punjab: '03',
  chandigarh: '04',
  uttarakhand: '05', uttaranchal: '05',
  haryana: '06',
  delhi: '07', newdelhi: '07', nctofdelhi: '07', nctdelhi: '07',
  rajasthan: '08',
  uttarpradesh: '09', up: '09',
  bihar: '10',
  sikkim: '11',
  arunachalpradesh: '12',
  nagaland: '13',
  manipur: '14',
  mizoram: '15',
  tripura: '16',
  meghalaya: '17',
  assam: '18',
  westbengal: '19', wb: '19',
  jharkhand: '20',
  odisha: '21', orissa: '21',
  chhattisgarh: '22', chattisgarh: '22', chhatisgarh: '22', chattishgarh: '22', chhattishgarh: '22', cg: '22',
  madhyapradesh: '23', mp: '23',
  gujarat: '24', gujrat: '24',
  damananddiu: '26', dadraandnagarhaveli: '26', dadraandnagarhavelianddamananddiu: '26', dnhdd: '26',
  maharashtra: '27', maharastra: '27',
  andhrapradeshold: '28',
  karnataka: '29',
  goa: '30',
  lakshadweep: '31',
  kerala: '32',
  tamilnadu: '33', tn: '33',
  puducherry: '34', pondicherry: '34',
  andamanandnicobarislands: '35', andamanandnicobar: '35', andamannicobar: '35',
  telangana: '36',
  andhrapradesh: '37', ap: '37',
  ladakh: '38',
  otherterritory: '97',
}

/** GST state code for a state / UT name (or a 1–2 digit code). '' when unknown. */
export function gstStateCodeForName(state: string | null | undefined): string {
  const key = String(state ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
  if (!key) return ''
  if (/^[0-9]{1,2}$/.test(key)) {
    const code = key.padStart(2, '0')
    if (code === '25') return '26'
    return (INDIA_GST_STATE_CODES as readonly string[]).includes(code) ? code : ''
  }
  return STATE_CODE_BY_NAME[key] ?? ''
}

/** The lab is in Chhattisgarh. Used when Lab Settings has neither a valid GSTIN nor a known state. */
export const LAB_DEFAULT_GST_STATE_CODE = '22'
