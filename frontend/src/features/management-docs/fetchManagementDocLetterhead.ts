import { supabase } from '@/lib/supabaseClient'
import {
  LAB_SETTINGS_SINGLETON_ID,
  letterheadFromRow,
  parseLabSettingsRow,
} from '@/features/settings/lab-settings/labSettingsDb'

const LETTERHEAD_BUCKET = 'laboratory-files'

export type ManagementDocLetterhead = {
  headerUrl: string | null
  footerUrl: string | null
  logoUrl: string | null
  labName: string
  labAddress: string
  labPhone: string
  labEmail: string
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

function emptyLetterhead(): ManagementDocLetterhead {
  return {
    headerUrl: null,
    footerUrl: null,
    logoUrl: null,
    labName: '',
    labAddress: '',
    labPhone: '',
    labEmail: '',
    labType: '',
    contactPerson: '',
    district: '',
    state: '',
    pinCode: '',
    country: '',
  }
}

/** Default header/footer images + lab logo/identity for management-doc letterhead. */
export async function fetchManagementDocLetterhead(): Promise<ManagementDocLetterhead> {
  const [lhResult, labResult] = await Promise.all([
    supabase
      .from('lab_letterheads')
      .select('template_type, title, name, file_path, content_text, is_default')
      .order('is_default', { ascending: false }),
    supabase.from('lab_settings').select('*').eq('id', LAB_SETTINGS_SINGLETON_ID).maybeSingle(),
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

  const [headerUrl, footerUrl, logoUrl] = await Promise.all([
    signedUrl(headerPath),
    signedUrl(footerPath),
    signedUrl(logoPath),
  ])

  if (!parsed) {
    return { ...emptyLetterhead(), headerUrl, footerUrl, logoUrl }
  }

  return {
    headerUrl,
    footerUrl,
    logoUrl,
    labName: parsed.labName,
    labAddress: parsed.address,
    labPhone: parsed.mobile,
    labEmail: parsed.email,
    labType: parsed.labType,
    contactPerson: parsed.contactPersonName,
    district: parsed.district,
    state: parsed.state,
    pinCode: parsed.pinCode,
    country: parsed.country,
  }
}
