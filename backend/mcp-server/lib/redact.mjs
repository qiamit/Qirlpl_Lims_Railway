// Client name and address are replaced for the Quality Manager and Technical
// Managers (lab decision of 25 Oct 2026); the Laboratory Director sees them.
// Two layers: columns that hold client identity are replaced by name, and every
// text value is scrubbed for known client names and addresses, e-mails, phone
// numbers, GSTIN and PAN (patterns as in the functions service's AI data
// guard). Placeholders are stable (CLIENT_3fa91c is always the same client), so
// a placeholder can be used in a search and is mapped back here.

import { placeholderFor } from './secure.mjs'

const NAME_COLUMN =
  /^(client|customer|company|complainant|party|buyer|consignee|bill_to|ship_to)(_[a-z]+)*_(name|org|organisation|organization)$|^(client_name|company_name|customer_name|complainant_org|party_name)$/
const CONTACT_COLUMN = /^(contact_person(_name)?|complainant_name|complainant_contact|kind_attn|customer_notify_details)$/
const ADDRESS_COLUMN = /(^|_)address(_line\d*)?$|^(pin_code|pincode|pin)$/
const PRIVATE_COLUMN = /(^|_)(email|e_mail|mobile|phone|telephone|whatsapp)(_\w+)?$|^(gst_number|gstin|pan|pan_number)$/

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
const GSTIN_RE = /(?<![A-Za-z0-9_])\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z](?![A-Za-z0-9_])/gi
const PAN_RE = /(?<![A-Za-z0-9_])[A-Z]{5}\d{4}[A-Z](?![A-Za-z0-9_])/g
const PHONE_RES = [
  /(?<![\w.+/-])(?:(?:\+|00)91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\w|\.\d)/g,
  /(?<![\w.+/-])0\d{2,4}[\s-]\d{6,8}(?!\w|\.\d)/g,
  /(?<![\w.])\+\d{1,3}[\s-]?\d(?:[\s-]?\d){8,12}(?!\w|\.\d)/g,
]

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function columnCategory(name) {
  const c = String(name || '').toLowerCase()
  if (NAME_COLUMN.test(c)) return 'CLIENT'
  if (CONTACT_COLUMN.test(c)) return 'CONTACT'
  if (ADDRESS_COLUMN.test(c)) return 'ADDRESS'
  if (PRIVATE_COLUMN.test(c)) return 'PRIVATE'
  return null
}

/**
 * clients: [{ company_name, contact_person_name, address }] as the user may
 * read them. Returns { redactValue(v), unmask(text) }.
 */
export function createRedactor(key, clients) {
  const known = [] // [text, placeholder], longest first
  const back = new Map() // placeholder -> real text (names only, for searching)
  for (const c of clients || []) {
    const name = String(c.company_name || '').trim()
    if (name.length >= 3) {
      const ph = placeholderFor(key, 'CLIENT', name)
      known.push([name, ph])
      back.set(ph, name)
    }
    const contact = String(c.contact_person_name || '').trim()
    if (contact.length >= 4) known.push([contact, placeholderFor(key, 'CONTACT', contact)])
    const address = String(c.address || '').trim()
    if (address.length >= 8) known.push([address, placeholderFor(key, 'ADDRESS', address)])
  }
  known.sort((a, b) => b[0].length - a[0].length)
  const knownRe = known.length
    ? new RegExp(known.map(([t]) => escapeRe(t)).join('|'), 'gi')
    : null
  const byLower = new Map(known.map(([t, ph]) => [t.toLowerCase(), ph]))

  function scrubText(s) {
    let out = String(s)
    if (knownRe) out = out.replace(knownRe, (m) => byLower.get(m.toLowerCase()) || '[client]')
    out = out.replace(EMAIL_RE, (m) => placeholderFor(key, 'EMAIL', m))
    out = out.replace(GSTIN_RE, (m) => placeholderFor(key, 'GSTIN', m))
    out = out.replace(PAN_RE, (m) => placeholderFor(key, 'PAN', m))
    for (const re of PHONE_RES) out = out.replace(re, (m) => placeholderFor(key, 'PHONE', m))
    return out
  }

  function redactValue(value, column) {
    if (value === null || value === undefined) return value
    const cat = column ? columnCategory(column) : null
    if (cat && (typeof value === 'string' || typeof value === 'number')) {
      const s = String(value).trim()
      if (!s) return value
      if (cat === 'CLIENT') return byLower.get(s.toLowerCase()) || placeholderFor(key, 'CLIENT', s)
      if (cat === 'PRIVATE') return placeholderFor(key, 'PRIVATE', s)
      return placeholderFor(key, cat, s)
    }
    if (typeof value === 'string') return scrubText(value)
    if (Array.isArray(value)) return value.map((v) => redactValue(v, cat ? column : null))
    if (typeof value === 'object') {
      const out = {}
      for (const [k, v] of Object.entries(value)) out[k] = redactValue(v, k)
      return out
    }
    return value
  }

  /** Placeholders in a search value are turned back into the client name. */
  function unmask(text) {
    return String(text ?? '').replace(/\bCLIENT_[0-9a-f]{6}\b/g, (ph) => back.get(ph) ?? ph)
  }

  return { redactValue, redactRows: (rows) => rows.map((r) => redactValue(r)), unmask }
}

/** For the Director: nothing is replaced. */
export const NO_REDACTION = {
  redactValue: (v) => v,
  redactRows: (rows) => rows,
  unmask: (t) => String(t ?? ''),
}
