import {
  gstinStateCode,
  gstStateCodeForName,
  hasValidGstin,
  isValidGstin,
  LAB_DEFAULT_GST_STATE_CODE,
} from '@/lib/indiaValidators'

/**
 * GST place-of-supply and TDS rules, ported from Consultancy Pro
 * (`sale/shared/financeRules.ts`) for a testing / calibration lab.
 *
 * Not ported on purpose: the consultancy SAC default (998393) and the rule
 * that zeroes GST on quotations and proforma invoices. In the LIMS each line
 * keeps the HSN/SAC and GST % it got from the product master (or that the
 * user typed), on every document kind. The lab's own SAC for testing and
 * calibration services is LAB_SERVICE_SAC (9983, Amit 23 Oct 2026): a service
 * line without an HSN/SAC gets it; goods keep their own HSN (e.g. 9027).
 */

/** SAC of the lab's testing and calibration services (lab decision, 23 Oct 2026). */
export const LAB_SERVICE_SAC = '9983'

/**
 * HSN/SAC for a line taken from the product master: the item's own code, or
 * LAB_SERVICE_SAC for a Service without one. Goods without an HSN stay blank.
 */
export function defaultHsnSac(itemType: string | null | undefined, hsnSac: string | null | undefined): string {
  const own = String(hsnSac ?? '').trim()
  if (own) return own
  return String(itemType ?? '').trim().toLowerCase() === 'service' ? LAB_SERVICE_SAC : ''
}

export type GstSupplyMode = 'intra' | 'inter'

/** Same GST state is CGST + SGST. A different state is IGST. A missing or invalid GSTIN stays intra-state. */
export function gstSupplyMode(supplierGstin: string, recipientGstin: string): GstSupplyMode {
  const supplier = supplierGstin.trim()
  const recipient = recipientGstin.trim()
  if (!supplier || !recipient || !isValidGstin(supplier) || !isValidGstin(recipient)) return 'intra'
  return gstinStateCode(supplier) === gstinStateCode(recipient) ? 'intra' : 'inter'
}

/** Lab state code: a valid Lab Settings GSTIN, else its state name, else Chhattisgarh (22). */
export function labGstStateCode(labGstin: string | null | undefined, labState?: string | null): string {
  if (hasValidGstin(labGstin)) return gstinStateCode(String(labGstin))
  return gstStateCodeForName(labState) || LAB_DEFAULT_GST_STATE_CODE
}

/**
 * Supply mode for a client, same rules as sale_gst_supply_mode_for_client():
 * the client's valid GSTIN decides; without one its state name; unknown stays
 * intra-state (IGST is never invented).
 */
export function gstSupplyModeForClient(opts: {
  labGstin?: string | null
  labState?: string | null
  clientGstin?: string | null
  clientState?: string | null
}): GstSupplyMode {
  const lab = labGstStateCode(opts.labGstin, opts.labState)
  const client = hasValidGstin(opts.clientGstin)
    ? gstinStateCode(String(opts.clientGstin))
    : gstStateCodeForName(opts.clientState)
  if (!client || client === lab) return 'intra'
  return 'inter'
}

export function gstSupplyModeLabel(mode: GstSupplyMode): string {
  return mode === 'inter' ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'
}

export function parseGstSupplyMode(value: unknown): GstSupplyMode | null {
  return value === 'intra' || value === 'inter' ? value : null
}

/**
 * Which tax rows a print shows. With a known supply mode the split follows
 * it (CGST + SGST, or IGST), as long as the template prints any GST row;
 * without one the template's own choice stands.
 */
export function printGstRows(
  mode: GstSupplyMode | null | undefined,
  tpl: { showGstAmount: boolean; showCgst: boolean; showSgst: boolean; showIgst: boolean },
): { mode: GstSupplyMode; showCgst: boolean; showSgst: boolean; showIgst: boolean } {
  if (mode && (tpl.showGstAmount || tpl.showCgst || tpl.showSgst || tpl.showIgst)) {
    return mode === 'inter'
      ? { mode, showCgst: false, showSgst: false, showIgst: true }
      : { mode, showCgst: true, showSgst: true, showIgst: false }
  }
  return {
    mode: tpl.showIgst && !tpl.showCgst && !tpl.showSgst ? 'inter' : 'intra',
    showCgst: tpl.showCgst,
    showSgst: tpl.showSgst,
    showIgst: tpl.showIgst,
  }
}

/** Database status for a screen status (Consultancy Pro rule). */
export type FinanceDbStatus = 'pending' | 'accepted' | 'cancelled'

export function dbStatusFor(status: string): FinanceDbStatus {
  const s = status.trim().toLowerCase()
  if (s === 'cancelled' || s === 'rejected' || s === 'expired') return 'cancelled'
  if (s === 'finalized' || s === 'accepted' || s === 'converted') return 'accepted'
  return 'pending'
}

/**
 * A document cancelled with the Cancel action (status 'Cancelled'). It keeps
 * its number (GST practice: no reuse, no gaps without trace), stays listed
 * greyed out, prints with a CANCELLED stamp, cannot be edited and does not
 * count in balances. Rejected / Expired are ordinary statuses.
 */
export function isCancelledDocument(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toLowerCase() === 'cancelled'
}

/** TDS deducted on a gross amount at a percent. 0 for a blank or out-of-range percent. */
export function tdsAmount(gross: number, percent: string | number): number {
  const rate = Number(percent)
  if (!Number.isFinite(rate) || rate < 0 || rate > 100 || !Number.isFinite(gross)) return 0
  return Math.round(gross * (rate / 100) * 100) / 100
}

/** Common Income-tax sections for TDS deducted by customers on lab services. */
export const TDS_SECTION_OPTIONS = ['194J', '194C', '194Q', '194H', '194I', 'Other'] as const
