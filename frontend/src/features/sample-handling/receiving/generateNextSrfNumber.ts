import { supabase } from '@/lib/supabaseClient'

/** Generate next SRF: prefix from lab_prefixes (name='SRF') + yymmdd + 2-digit serial, reset per date. */
export async function generateNextSrfNumber(dateStr?: string): Promise<string> {
  let yymmdd: string
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-')
    yymmdd = y.slice(-2) + m + d
  } else {
    const today = new Date()
    yymmdd =
      today.getFullYear().toString().slice(-2) +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0')
  }
  let prefix = 'QI/SRF'
  const { data: prefixRows } = await supabase
    .from('lab_prefixes')
    .select('name, prefix')
    .eq('name', 'SRF')
    .limit(1)
  if (prefixRows?.[0]?.prefix) prefix = String(prefixRows[0].prefix).trim() || prefix
  const pattern = `${prefix}/${yymmdd}-%`
  const { data: existing } = await supabase
    .from('samples')
    .select('srf_number')
    .not('srf_number', 'is', null)
    .like('srf_number', pattern)
  const numbers = (existing ?? [])
    .map((r) => (r as { srf_number?: string }).srf_number)
    .filter((n): n is string => typeof n === 'string')
  const serials = numbers
    .map((n) => {
      const part = n.split('-')[1]
      return part ? parseInt(part, 10) : 0
    })
    .filter((s) => !Number.isNaN(s))
  const nextSerial = serials.length > 0 ? Math.max(...serials) + 1 : 1
  return `${prefix}/${yymmdd}-${String(nextSerial).padStart(2, '0')}`
}
