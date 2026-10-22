import { supabase } from '@/lib/supabaseClient'
import { fetchNextNablUlrNumber } from './nablUlrNumber'
import { fetchNextTestReportNumber } from './formattedTestReportNumber'

type Holder = { srf_number: string | null; stage: string | null }

function describeHolder(h: Holder): string {
  const srf = h.srf_number?.trim() || 'another SRF'
  return h.stage === 'completed' ? `issued report of SRF ${srf}` : `saved draft of SRF ${srf}`
}

/** ILIKE without wildcards = case-insensitive equality; escape the two wildcard characters. */
function exactIlike(value: string): string {
  return value.replace(/[%_\\]/g, (c) => `\\${c}`)
}

async function findHolder(column: string, value: string, excludeSampleId: string): Promise<Holder | null> {
  const { data, error } = await supabase
    .from('samples')
    .select('srf_number, stage')
    .neq('id', excludeSampleId)
    .ilike(column, exactIlike(value))
    .limit(1)
  if (error) throw error
  return (data?.[0] as Holder | undefined) ?? null
}

/**
 * Checks that the report number and ULR typed in the dialog are not held by another sample
 * (issued or saved as draft). Returns a message for the user, or null when both are free.
 * The numbers are never changed here: the user decides which number to use.
 */
export async function findReportNumberClash(
  sampleId: string,
  reportNumber: string | null,
  ulr: string | null,
): Promise<string | null> {
  const problems: string[] = []

  if (ulr) {
    const holder = await findHolder('test_report_nabl_ulr_number', ulr, sampleId)
    if (holder) {
      const { ulr: next } = await fetchNextNablUlrNumber(sampleId)
      problems.push(`ULR number ${ulr} is already used in the ${describeHolder(holder)}. Next free ULR number: ${next}.`)
    }
  }

  if (reportNumber) {
    const holder = await findHolder('test_report_number', reportNumber, sampleId)
    if (holder) {
      const { number: next } = await fetchNextTestReportNumber(sampleId)
      problems.push(
        `Report number ${reportNumber} is already used in the ${describeHolder(holder)}. Next free report number: ${next}.`,
      )
    }
  }

  return problems.length > 0 ? `${problems.join(' ')} Please change the number and try again.` : null
}
