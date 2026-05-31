import type { SampleRow } from '../types'

export function buildSampleReceivingAssistantContext(input: {
  rows: SampleRow[]
  search: string
  clients: Array<{ id: string; label: string }>
  isCodes: Array<{ id: string; label: string }>
}): string {
  const { rows, search, clients, isCodes } = input
  const lines = [
    'Module: Sample Receiving (ISO 17025 Clause 7.4)',
    `Samples in receiving stage loaded: ${rows.length}`,
    search.trim() ? `Active search filter: "${search.trim()}"` : 'No search filter applied',
    '',
    'Use lims_crud on table samples to create/update/delete. Each row below includes id=<UUID>.',
    'For new samples from a Test Request PDF: omit srf_number (lab auto-generates it).',
    'Set stage=receiving. Prefer sample_receiving_status=Received unless PDF indicates otherwise.',
    '',
    'Key columns: client_id, date_of_sample_receiving (YYYY-MM-DD), test_report_is_code_id,',
    'client_reference, sample_code, sample_qr_code, sample_quantity, sample_description,',
    'test_required, batch_number, date_of_manufacturing, shelf_life, mode_of_disposal,',
    'nature_of_sample, sample_declaration, any_other_information, tentative_date_required,',
    'tentative_date_by_lab, review booleans (competent_person_available, equipment_available, etc.).',
    '',
    'Clients (match client_id by company name):',
  ]

  if (clients.length === 0) {
    lines.push('(none — create client in Client Master first, or use lims_crud on clients)')
  } else {
    for (const c of clients.slice(0, 40)) {
      lines.push(`- id=${c.id} | ${c.label}`)
    }
    if (clients.length > 40) lines.push(`… and ${clients.length - 40} more clients.`)
  }

  lines.push('', 'IS Codes for Test Report (test_report_is_code_id):')
  if (isCodes.length === 0) {
    lines.push('(none)')
  } else {
    for (const ic of isCodes.slice(0, 40)) {
      lines.push(`- id=${ic.id} | ${ic.label}`)
    }
    if (isCodes.length > 40) lines.push(`… and ${isCodes.length - 40} more IS codes.`)
  }

  lines.push('', 'Recent samples (up to 20):')
  const slice = rows.slice(0, 20)
  if (slice.length === 0) {
    lines.push('(none)')
  } else {
    for (const r of slice) {
      lines.push(
        `- id=${r.id} | SRF=${r.srf_number ?? '-'} | ${r.client_name ?? '-'} | code=${r.sample_code ?? '-'} | ${r.sample_description ?? r.description ?? '-'}`,
      )
    }
    if (rows.length > 20) lines.push(`… and ${rows.length - 20} more samples not listed.`)
  }

  return lines.join('\n')
}
