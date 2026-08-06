import { supabase } from '@/lib/supabaseClient'
import {
  accreditationFromRow,
  LAB_SETTINGS_SINGLETON_ID,
  letterheadFromRow,
  parseLabSettingsRow,
} from '@/features/settings/lab-settings/labSettingsDb'

const LETTERHEAD_BUCKET = 'laboratory-files'
const NABL_DIRECTORY_FALLBACK = 'https://nabl-india.org/'
const DEFAULT_NABL_CERT_NO = 'CC - 3039'

export type ManagementDocLetterhead = {
  headerUrl: string | null
  footerUrl: string | null
  logoUrl: string | null
  /** NABL / accreditation body logo (Lab Settings → Registration Documents). */
  nablLogoUrl: string | null
  /**
   * Signed URL of uploaded NABL scope document when it is an image
   * (labs often store the official scope QR here).
   */
  nablScopeQrImageUrl: string | null
  /**
   * Payload to encode in a generated QR when no scope QR image is available:
   * scope URL (if stored as http), else certificate no, else NABL directory.
   */
  nablScopeQrPayload: string
  nablBody: string
  nablCertificateNo: string
  labName: string
  labAddress: string
  labPhone: string
  labEmail: string
  labWebsite: string
  labType: string
  contactPerson: string
  district: string
  state: string
  pinCode: string
  country: string
}

async function signedUrl(path: string | null | undefined): Promise<string | null> {
  const p = (path ?? '').trim()
  if (!p) return null
  if (/^https?:\/\//i.test(p)) return p
  const { data, error } = await supabase.storage.from(LETTERHEAD_BUCKET).createSignedUrl(p, 60 * 60)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

function isImagePath(path: string | null | undefined): boolean {
  const p = (path ?? '').trim().toLowerCase()
  if (!p) return false
  if (/^https?:\/\//i.test(p)) {
    try {
      const pathname = new URL(p).pathname.toLowerCase()
      return /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(pathname)
    } catch {
      return false
    }
  }
  return /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(p)
}

/** Display form: `CC - 3039` (spaces around hyphen). */
export function formatNablCertificateNo(raw: string | null | undefined): string {
  const t = (raw ?? '').trim()
  if (!t) return DEFAULT_NABL_CERT_NO
  const m = t.match(/^([A-Za-z]+)\s*[-–—]?\s*(\d[\d\s]*)$/)
  if (m) return `${m[1]!.toUpperCase()} - ${m[2]!.replace(/\s+/g, '')}`
  return t
}

function resolveNablScopeQrPayload(opts: {
  scopePath: string | null
  certificateNo: string
}): string {
  const scope = (opts.scopePath ?? '').trim()
  if (/^https?:\/\//i.test(scope)) return scope
  const cert = formatNablCertificateNo(opts.certificateNo)
  if (cert) {
    return `NABL India Certificate No. ${cert} — ${NABL_DIRECTORY_FALLBACK}`
  }
  return NABL_DIRECTORY_FALLBACK
}

function emptyLetterhead(): ManagementDocLetterhead {
  return {
    headerUrl: null,
    footerUrl: null,
    logoUrl: null,
    nablLogoUrl: null,
    nablScopeQrImageUrl: null,
    nablScopeQrPayload: NABL_DIRECTORY_FALLBACK,
    nablBody: '',
    nablCertificateNo: '',
    labName: '',
    labAddress: '',
    labPhone: '',
    labEmail: '',
    labWebsite: '',
    labType: '',
    contactPerson: '',
    district: '',
    state: '',
    pinCode: '',
    country: '',
  }
}

function pickNablAccreditation(
  rows: Array<Record<string, unknown>>,
): {
  logoPath: string | null
  scopePath: string | null
  body: string
  certificateNo: string
} {
  const parsed = rows.map((row) => accreditationFromRow(row))
  const withLogo = parsed.filter((c) => (c.logoFilePath ?? '').trim())
  const nabl =
    withLogo.find((c) => /nabl/i.test(c.inputLabel)) ??
    parsed.find((c) => /nabl/i.test(c.inputLabel)) ??
    withLogo[0] ??
    parsed[0] ??
    null
  if (!nabl) return { logoPath: null, scopePath: null, body: '', certificateNo: '' }
  return {
    logoPath: nabl.logoFilePath,
    scopePath: nabl.scopeFilePath,
    body: nabl.inputLabel,
    certificateNo: nabl.certificateNo,
  }
}

/** Default header/footer images + lab logo/identity for management-doc letterhead. */
export async function fetchManagementDocLetterhead(): Promise<ManagementDocLetterhead> {
  const [lhResult, labResult, accResult] = await Promise.all([
    supabase
      .from('lab_letterheads')
      .select('template_type, title, name, file_path, content_text, is_default')
      .order('is_default', { ascending: false }),
    supabase.from('lab_settings').select('*').eq('id', LAB_SETTINGS_SINGLETON_ID).maybeSingle(),
    supabase
      .from('lab_accreditations')
      .select(
        'accreditation_body, accreditation_number, certificate_file_path, scope_document_path, logo_file_path, valid_from, valid_until',
      ),
  ])

  let headerPath: string | null = null
  let footerPath: string | null = null

  for (const row of Array.isArray(lhResult.data) ? lhResult.data : []) {
    const { type, fileUrl } = letterheadFromRow(row as Record<string, unknown>)
    if (!fileUrl) continue
    if (type === 'header' && !headerPath) headerPath = fileUrl
    if (type === 'footer' && !footerPath) footerPath = fileUrl
  }

  let labRow = !labResult.error ? labResult.data : null
  if (!labRow) {
    const fallback = await supabase
      .from('lab_settings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!fallback.error) labRow = fallback.data
  }

  const parsed = labRow ? parseLabSettingsRow(labRow as Record<string, unknown>) : null
  const logoPath = parsed?.companyLogoPath ?? null
  const nablPick = pickNablAccreditation(
    !accResult.error && Array.isArray(accResult.data)
      ? (accResult.data as Array<Record<string, unknown>>)
      : [],
  )

  const scopeImagePath = isImagePath(nablPick.scopePath) ? nablPick.scopePath : null
  const nablScopeQrPayload = resolveNablScopeQrPayload({
    scopePath: nablPick.scopePath,
    certificateNo: nablPick.certificateNo,
  })

  const [headerUrl, footerUrl, logoUrl, nablLogoUrl, nablScopeQrImageUrl] = await Promise.all([
    signedUrl(headerPath),
    signedUrl(footerPath),
    signedUrl(logoPath),
    signedUrl(nablPick.logoPath),
    signedUrl(scopeImagePath),
  ])

  if (!parsed) {
    return {
      ...emptyLetterhead(),
      headerUrl,
      footerUrl,
      logoUrl,
      nablLogoUrl,
      nablScopeQrImageUrl,
      nablScopeQrPayload,
      nablBody: nablPick.body,
      nablCertificateNo: nablPick.certificateNo,
    }
  }

  return {
    headerUrl,
    footerUrl,
    logoUrl,
    nablLogoUrl,
    nablScopeQrImageUrl,
    nablScopeQrPayload,
    nablBody: nablPick.body,
    nablCertificateNo: nablPick.certificateNo,
    labName: parsed.labName,
    labAddress: parsed.address,
    labPhone: parsed.mobile,
    labEmail: parsed.email,
    labWebsite: parsed.website,
    labType: parsed.labType,
    contactPerson: parsed.contactPersonName,
    district: parsed.district,
    state: parsed.state,
    pinCode: parsed.pinCode,
    country: parsed.country,
  }
}
