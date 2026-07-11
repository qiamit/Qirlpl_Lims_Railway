import { supabase } from '@/lib/supabaseClient'
import { formatSupabaseError } from '@/lib/formatSupabaseError'
import {
  buildConsentLetterNumberPrefix,
  formatConsentLetterNumber,
  parseConsentLetterDateInput,
} from '@/features/sample-handling/report-preparation/consentLetterDefaults'
import type { ConsentLetterInsertInput, ConsentLetterListRow, ConsentLetterUpdateInput } from './types'

const CONSENT_LETTER_SELECT =
  'id, consent_letter_no, letter_date, client_id, client_name, client_address, is_code_id, is_code_label, is_number, revision_year, product_title, test_parameter_names, clause_summary, generated_at'

function mapConsentLetterRow(row: Record<string, unknown>): ConsentLetterListRow {
  const names = row.test_parameter_names
  return {
    id: String(row.id ?? ''),
    consentLetterNo: String(row.consent_letter_no ?? '').trim(),
    letterDate: String(row.letter_date ?? '').trim(),
    clientId: row.client_id ? String(row.client_id).trim() : null,
    clientName: String(row.client_name ?? '').trim(),
    clientAddress: String(row.client_address ?? '').trim(),
    isCodeId: row.is_code_id ? String(row.is_code_id).trim() : null,
    isCodeLabel: row.is_code_label ? String(row.is_code_label).trim() : null,
    isNumber: String(row.is_number ?? '').trim(),
    revisionYear: row.revision_year ? String(row.revision_year).trim() : null,
    productTitle: row.product_title ? String(row.product_title).trim() : null,
    testParameterNames: Array.isArray(names)
      ? names.map((n) => String(n).trim()).filter(Boolean)
      : [],
    clauseSummary: row.clause_summary ? String(row.clause_summary).trim() : null,
    generatedAt: row.generated_at ? String(row.generated_at) : null,
  }
}

function consentLetterPayload(input: ConsentLetterInsertInput) {
  return {
    consent_letter_no: input.consentLetterNo.trim(),
    letter_date: input.letterDate.trim(),
    client_id: input.clientId,
    client_name: input.clientName.trim(),
    client_address: input.clientAddress.trim() || null,
    is_code_id: input.isCodeId,
    is_code_label: input.isCodeLabel.trim() || null,
    is_number: input.isNumber.trim() || null,
    revision_year: input.revisionYear?.trim() || null,
    product_title: input.productTitle.trim() || null,
    test_parameter_names: input.testParameterNames,
    clause_summary: input.clauseSummary?.trim() || null,
    sample_id: input.sampleId?.trim() || null,
    srf_number: input.srfNumber?.trim() || null,
    generated_by: input.generatedBy?.trim() || null,
  }
}

export async function generateNextConsentLetterNumber(
  letterDate: string,
  excludeId?: string | null,
): Promise<string> {
  const parsed = parseConsentLetterDateInput(letterDate) ?? new Date()
  const prefix = `${buildConsentLetterNumberPrefix(parsed)}-`

  const { data, error } = await supabase
    .from('consent_letters')
    .select('id, consent_letter_no')
    .like('consent_letter_no', `${prefix}%`)

  if (error) {
    const message = formatSupabaseError(error)
    if (message.toLowerCase().includes('consent_letters')) {
      return formatConsentLetterNumber(parsed, 1)
    }
    throw new Error(message || 'Unable to generate consent letter number')
  }

  let maxSeq = 0
  for (const row of Array.isArray(data) ? data : []) {
    const r = row as { id?: string | null; consent_letter_no?: string | null }
    if (excludeId && r.id === excludeId) continue
    const no = (r.consent_letter_no ?? '').trim()
    const match = no.match(/^QI\/\d{6}-(\d+)$/i)
    if (match) {
      const seq = Number.parseInt(match[1], 10)
      if (Number.isFinite(seq)) maxSeq = Math.max(maxSeq, seq)
    }
  }

  return formatConsentLetterNumber(parsed, maxSeq + 1)
}

export async function fetchConsentLetters(): Promise<ConsentLetterListRow[]> {
  const { data, error } = await supabase
    .from('consent_letters')
    .select(CONSENT_LETTER_SELECT)
    .order('generated_at', { ascending: false })

  if (error) {
    const message = formatSupabaseError(error)
    if (message.toLowerCase().includes('consent_letters')) {
      throw new Error(
        'Consent letters table is missing. Run migration 20260616000000_consent_letters.sql on Supabase.',
      )
    }
    throw new Error(message || 'Unable to load consent letters')
  }
  return (Array.isArray(data) ? data : []).map((row) =>
    mapConsentLetterRow(row as Record<string, unknown>),
  )
}

export async function insertConsentLetter(input: ConsentLetterInsertInput): Promise<ConsentLetterListRow> {
  const { data, error } = await supabase
    .from('consent_letters')
    .insert(consentLetterPayload(input))
    .select(CONSENT_LETTER_SELECT)
    .single()

  if (error) {
    const message = formatSupabaseError(error)
    if (message.toLowerCase().includes('consent_letters')) {
      throw new Error(
        'Consent letters table is missing. Run migration 20260616000000_consent_letters.sql on Supabase.',
      )
    }
    throw new Error(message || 'Unable to save consent letter')
  }
  return mapConsentLetterRow(data as Record<string, unknown>)
}

export async function updateConsentLetter(input: ConsentLetterUpdateInput): Promise<ConsentLetterListRow> {
  const { data, error } = await supabase
    .from('consent_letters')
    .update(consentLetterPayload(input))
    .eq('id', input.id)
    .select(CONSENT_LETTER_SELECT)
    .single()

  if (error) {
    const message = formatSupabaseError(error)
    if (message.toLowerCase().includes('consent_letters')) {
      throw new Error(
        'Consent letters table is missing. Run migration 20260616000000_consent_letters.sql on Supabase.',
      )
    }
    throw new Error(message || 'Unable to update consent letter')
  }
  return mapConsentLetterRow(data as Record<string, unknown>)
}

export async function deleteConsentLetter(id: string): Promise<void> {
  const { error } = await supabase.from('consent_letters').delete().eq('id', id)

  if (error) {
    const message = formatSupabaseError(error)
    if (message.toLowerCase().includes('consent_letters')) {
      throw new Error(
        'Consent letters table is missing. Run migration 20260616000000_consent_letters.sql on Supabase.',
      )
    }
    throw new Error(message || 'Unable to delete consent letter')
  }
}
