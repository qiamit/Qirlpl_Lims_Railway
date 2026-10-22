/**
 * AI data guard (ISO/IEC 17025:2017 clause 4.2 confidentiality, gap item P1-10b).
 *
 * Every QI Assistant request goes through `sendQiAssistantMessage`
 * (components/qi-assistant/qiAssistantApi.ts), which calls `guardAiRequest`
 * before posting to the functions service. The guard applies the lab's
 * `lab_settings.ai_client_data_mode`:
 *
 *  - 'off'                -> client / sample record context is withheld; the
 *                            assistant only gets the user's (redacted) question.
 *  - 'redact' (default)   -> client names, contact persons, e-mails, phones,
 *                            GSTIN / PAN, addresses, PIN codes and SRF / report /
 *                            ULR numbers become stable placeholders (CLIENT_1,
 *                            EMAIL_1, ...); free-text remarks are dropped.
 *                            Results, units and specifications are kept.
 *  - 'allow_with_consent' -> sent as-is only when every client found in the
 *                            request has `clients.ai_data_consent`; else redacted.
 *
 * Placeholders in the reply are mapped back with `restoreAiPlaceholders`, so the
 * user still sees real names locally. Before migration 20261025100200 is
 * applied, missing columns mean mode 'redact' and consent false.
 */
import { supabase } from '@/lib/supabaseClient'

export type AiClientDataMode = 'off' | 'redact' | 'allow_with_consent'

export const DEFAULT_AI_CLIENT_DATA_MODE: AiClientDataMode = 'redact'

export const AI_CLIENT_DATA_MODE_OPTIONS: ReadonlyArray<{
  value: AiClientDataMode
  label: string
  description: string
}> = [
  {
    value: 'off',
    label: 'Off',
    description:
      'Client and sample record data is never sent. The assistant answers general questions only.',
  },
  {
    value: 'redact',
    label: 'Redact (default)',
    description:
      'Names, contacts, e-mails, phones, GSTIN/PAN, addresses and SRF/report/ULR numbers are replaced with placeholders; remarks are dropped. Results and specs are kept.',
  },
  {
    value: 'allow_with_consent',
    label: 'Send only for clients who consented',
    description:
      'Sent unchanged only when every client in the request has consented in Client Master; otherwise redacted.',
  },
]

export function normalizeAiClientDataMode(value: unknown): AiClientDataMode {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === 'off' || v === 'redact' || v === 'allow_with_consent') return v
  return DEFAULT_AI_CLIENT_DATA_MODE
}

/** Client master row reduced to what the guard needs. */
export type AiGuardClient = {
  id: string
  companyName: string
  contactPersonName?: string | null
  email?: string | null
  mobile?: string | null
  gstNumber?: string | null
  address?: string | null
  pinCode?: string | null
  aiDataConsent: boolean
}

export type AiGuardCategory =
  | 'CLIENT'
  | 'CONTACT'
  | 'EMAIL'
  | 'PHONE'
  | 'GSTIN'
  | 'PAN'
  | 'ADDRESS'
  | 'PIN'
  | 'SRF'
  | 'REPORT'
  | 'ULR'
  | 'REF'

/** What the functions service is told about the payload. */
export type AiClientDataFlag = 'none' | 'redacted' | 'consented'

export type AiGuardHistoryItem = { role: 'user' | 'assistant'; content: string }

export type AiGuardInput = {
  mode: AiClientDataMode
  clients: AiGuardClient[]
  message: string
  context?: string
  history?: AiGuardHistoryItem[]
  /** Client ids the caller knows are in the context (optional metadata). */
  clientIds?: string[]
  /** Caller knows the context holds client / sample data even if none is detected. */
  containsClientData?: boolean
}

export type AiGuardResult = {
  message: string
  context?: string
  history: AiGuardHistoryItem[]
  clientData: AiClientDataFlag
  /** placeholder -> original text, for mapping the reply back. */
  redactions: Record<string, string>
  contextWithheld: boolean
  /** Client ids found in the request. */
  detectedClientIds: string[]
  /** Short notice for the chat UI (undefined when nothing worth telling). */
  notice?: string
}

export const AI_CONTEXT_WITHHELD_NOTE =
  'Record data withheld: this laboratory does not send client or sample data to AI providers. Answer in general terms only and do not invent record details.'

export const AI_OFF_NOTICE =
  'Client data sharing with AI providers is Off (AI Settings), so this record’s data was not sent. The answer is general.'

export const AI_CONSENT_MISSING_NOTICE =
  'Not every client in this request has consented to AI processing, so client identifiers were replaced with placeholders before sending.'

const REMOVED = '[removed]'

const PLACEHOLDER_CATEGORIES: AiGuardCategory[] = [
  'CLIENT',
  'CONTACT',
  'EMAIL',
  'PHONE',
  'GSTIN',
  'PAN',
  'ADDRESS',
  'PIN',
  'SRF',
  'REPORT',
  'ULR',
  'REF',
]

/** Categories that identify the client itself (consent decides these). */
const CLIENT_IDENTITY: ReadonlySet<AiGuardCategory> = new Set([
  'CLIENT',
  'CONTACT',
  'EMAIL',
  'PHONE',
  'GSTIN',
  'PAN',
  'ADDRESS',
  'PIN',
])

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

const B_START = '(?<![A-Za-z0-9_])'
const B_END = '(?![A-Za-z0-9_])'

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
const GSTIN_RE = new RegExp(`${B_START}\\d{2}[A-Z]{5}\\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]${B_END}`, 'gi')
const PAN_RE = new RegExp(`${B_START}[A-Z]{5}\\d{4}[A-Z]${B_END}`, 'g')
const ULR_RE = new RegExp(`${B_START}T[CS]\\d{12,16}[FP]${B_END}`, 'gi')
const PHONE_RES: RegExp[] = [
  // Indian mobile: +91 98765 43210, 09876543210, 9876543210, +91-98765-43210
  /(?<![\w.+/-])(?:(?:\+|00)91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\w|\.\d)/g,
  // Landline with STD code: 0771-2345678, 0771 2345678
  /(?<![\w.+/-])0\d{2,4}[\s-]\d{6,8}(?!\w|\.\d)/g,
  // Other international numbers: +977 1 4412345
  /(?<![\w.])\+\d{1,3}[\s-]?\d(?:[\s-]?\d){8,12}(?!\w|\.\d)/g,
]
const PIN_LABELED_RE = /\b(?:pin\s*code|pincode|pin)\s*[:=\-–]?\s*([1-9]\d{5})(?!\d)/gi
const PIN_IN_LIST_RE = /(?<=,\s*|[A-Za-z]\s*[-–]\s*)([1-9]\d{5})(?=\s*(?:[,)]|$))/gm
const ADDRESS_LINE_HINT_RE =
  /(india|address|customer|client|pradesh|chhattisgarh|maharashtra|gujarat|odisha|jharkhand|bihar|bengal|karnataka|kerala|tamil|telangana|rajasthan|punjab|haryana|delhi|assam|goa|uttarakhand|nepal|bhutan|road|nagar|colony|sector|plot|district|dist\.)/i

type LabelRule = { re: string; category: AiGuardCategory | 'DROP'; identifier?: boolean }

/**
 * `label: value` / `label=value` pairs found in the context builders. Free-text
 * categories take the value up to `|`, `·` or end of line; identifiers are split
 * into tokens.
 */
const LABEL_RULES: LabelRule[] = [
  { re: 'client\\s*\\(list\\)', category: 'CLIENT' },
  { re: 'client[\\s_]*name', category: 'CLIENT' },
  { re: 'customer[\\s_]*(?:name|details)?', category: 'CLIENT' },
  { re: 'client', category: 'CLIENT' },
  { re: 'company[\\s_]*name', category: 'CLIENT' },
  { re: 'firm(?:[\\s_]*name)?', category: 'CLIENT' },
  { re: 'party(?:[\\s_]*name)?', category: 'CLIENT' },
  { re: 'contact[\\s_]*person(?:[\\s_]*name)?', category: 'CONTACT' },
  { re: 'kind\\s+attn\\.?|attention', category: 'CONTACT' },
  { re: '(?:client|customer)?[\\s_]*address', category: 'ADDRESS' },
  { re: 'srf(?:[\\s_]*(?:number|no\\.?|#))?', category: 'SRF', identifier: true },
  {
    re: '(?:draft|canonical|section|reference|test)?[\\s_]*report[\\s_]*(?:number|no\\.?|#)(?:\\s*\\([^)\\n]{0,24}\\))?',
    category: 'REPORT',
    identifier: true,
  },
  { re: 'draft_report_no|test_report_number', category: 'REPORT', identifier: true },
  { re: 'non-nabl|nabl(?=\\s*=)', category: 'REPORT', identifier: true },
  { re: '(?:nabl[\\s_]*)?ulr(?:[\\s_]*(?:number|no\\.?|#))?', category: 'ULR', identifier: true },
  { re: 'test_report_nabl_ulr_number', category: 'ULR', identifier: true },
  { re: 'party[\\s_]*ref(?:erence)?(?:[\\s_]*no\\.?)?', category: 'REF', identifier: true },
  { re: '(?:client|customer)[\\s_]*ref(?:erence)?(?:[\\s_]*no\\.?)?', category: 'REF', identifier: true },
  // Free text that may carry names: dropped, not placeholdered.
  { re: '(?:part\\s*d\\s*)?remarks?', category: 'DROP' },
  { re: 'other\\s+info(?:rmation)?|any[\\s_]+other[\\s_]+information', category: 'DROP' },
  { re: '(?:draft\\s+|test_report_draft_)?notes|comments?', category: 'DROP' },
]

/** Remark values that only state conformity — kept because the answer needs them. */
const CONFORMITY_REMARK_RE =
  /^(?:complies|complied|does not comply|not complied|non[- ]?compliant|conforms?|does not conform|pass(?:ed)?|fail(?:ed)?|ok|satisfactory|unsatisfactory|within limits?|out of limits?|n\/?a|nil|none|no|yes|—|-|\[removed\])\.?$/i

const EMPTY_VALUE_RE = /^(?:—|-|–|n\/?a|nil|none|\(none\)|no|yes|null|undefined)$/i

/** A `label: value` (or `label=value`) where value runs to `|`, `·` or end of line. */
function labelRegex(rule: LabelRule): RegExp {
  return new RegExp(`(?<![A-Za-z0-9_])(${rule.re})(\\s*[:=]\\s*)([^|·\\n]*)`, 'gi')
}

const LABEL_REGEXES: Array<{ rule: LabelRule; re: RegExp }> = LABEL_RULES.map((rule) => ({
  rule,
  re: labelRegex(rule),
}))

const M_S_RE = /\bM\/s\.?\s+([^,|·\n]{3,80})/g

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normKey(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

/** Regex that finds `value` as a whole token, case-insensitive, flexible whitespace. */
function valueRegex(value: string): RegExp {
  const body = value
    .trim()
    .split(/\s+/)
    .map(escapeRegex)
    .join('\\s+')
  const start = /^[A-Za-z0-9_]/.test(value.trim()) ? B_START : ''
  const end = /[A-Za-z0-9_]$/.test(value.trim()) ? B_END : ''
  return new RegExp(`${start}${body}${end}`, 'gi')
}

function containsValue(text: string, value: string): boolean {
  const v = value.trim()
  if (!v) return false
  return valueRegex(v).test(text)
}

function minLengthFor(category: AiGuardCategory): number {
  switch (category) {
    case 'CLIENT':
    case 'CONTACT':
      return 3
    case 'ADDRESS':
      return 6
    case 'PIN':
      return 6
    default:
      return 3
  }
}

type Entry = {
  value: string
  category: AiGuardCategory
  /** Client this value belongs to, when known. */
  clientId?: string
  firstIndex: number
}

class EntryBag {
  private readonly byKey = new Map<string, Entry>()
  private readonly combined: string

  constructor(combined: string) {
    this.combined = combined
  }

  add(value: string | null | undefined, category: AiGuardCategory, clientId?: string): void {
    const v = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[,;:.\s]+|[,;:\s]+$/g, '')
    if (!v || v.length < minLengthFor(category) || EMPTY_VALUE_RE.test(v)) return
    if (category === 'PHONE' && digitsOnly(v).length < 10) return
    const key = normKey(v)
    const existing = this.byKey.get(key)
    if (existing) {
      if (!existing.clientId && clientId) existing.clientId = clientId
      return
    }
    const idx = this.combined.toLowerCase().indexOf(key)
    this.byKey.set(key, {
      value: v,
      category,
      clientId,
      firstIndex: idx >= 0 ? idx : Number.MAX_SAFE_INTEGER,
    })
  }

  has(value: string): boolean {
    return this.byKey.has(normKey(value))
  }

  values(): Entry[] {
    return [...this.byKey.values()]
  }

  get size(): number {
    return this.byKey.size
  }
}

function clientFields(c: AiGuardClient): Array<[string, AiGuardCategory]> {
  const out: Array<[string, AiGuardCategory]> = [[c.companyName, 'CLIENT']]
  if (c.contactPersonName) out.push([c.contactPersonName, 'CONTACT'])
  if (c.email) out.push([c.email, 'EMAIL'])
  if (c.mobile && digitsOnly(c.mobile).length >= 10) out.push([c.mobile, 'PHONE'])
  if (c.gstNumber) out.push([c.gstNumber, 'GSTIN'])
  if (c.address) out.push([c.address, 'ADDRESS'])
  if (c.pinCode) out.push([c.pinCode, 'PIN'])
  return out
}

/** Clients whose name, e-mail, GSTIN or mobile appears in the text. */
export function findClientsInText(text: string, clients: AiGuardClient[]): AiGuardClient[] {
  const found: AiGuardClient[] = []
  const digits = digitsOnly(text)
  for (const c of clients) {
    const name = (c.companyName ?? '').trim()
    if (name.length >= 3 && containsValue(text, name)) {
      found.push(c)
      continue
    }
    if (c.email?.trim() && text.toLowerCase().includes(c.email.trim().toLowerCase())) {
      found.push(c)
      continue
    }
    if (c.gstNumber?.trim() && text.toUpperCase().includes(c.gstNumber.trim().toUpperCase())) {
      found.push(c)
      continue
    }
    const mobile = digitsOnly(c.mobile ?? '')
    if (mobile.length >= 10 && digits.includes(mobile) && containsValue(text, c.mobile!.trim())) {
      found.push(c)
    }
  }
  return found
}

/** Replaces free-text remark values (which may name people) with `[removed]`. */
export function dropFreeTextRemarks(text: string): { text: string; dropped: number } {
  let dropped = 0
  let out = text
  for (const { rule, re } of LABEL_REGEXES) {
    if (rule.category !== 'DROP') continue
    out = out.replace(re, (whole, label: string, sep: string, value: string) => {
      const trimmed = value.trim()
      if (!trimmed || CONFORMITY_REMARK_RE.test(trimmed) || EMPTY_VALUE_RE.test(trimmed)) return whole
      dropped += 1
      const trailing = value.match(/\s*$/)?.[0] ?? ''
      return `${label}${sep}${REMOVED}${trailing}`
    })
  }
  return { text: out, dropped }
}

function collectPatternValues(text: string, bag: EntryBag): void {
  for (const m of text.matchAll(EMAIL_RE)) bag.add(m[0], 'EMAIL')
  for (const m of text.matchAll(GSTIN_RE)) bag.add(m[0], 'GSTIN')
  for (const m of text.matchAll(PAN_RE)) bag.add(m[0], 'PAN')
  for (const m of text.matchAll(ULR_RE)) bag.add(m[0], 'ULR')
  for (const re of PHONE_RES) {
    for (const m of text.matchAll(re)) bag.add(m[0], 'PHONE')
  }
  for (const m of text.matchAll(PIN_LABELED_RE)) bag.add(m[1], 'PIN')
  for (const line of text.split('\n')) {
    if (!ADDRESS_LINE_HINT_RE.test(line)) continue
    for (const m of line.matchAll(PIN_IN_LIST_RE)) bag.add(m[1], 'PIN')
  }
}

function collectLabeledValues(text: string, bag: EntryBag, knownValues: string[]): void {
  const coveredByKnown = (value: string) => knownValues.some((k) => containsValue(value, k))
  for (const { rule, re } of LABEL_REGEXES) {
    if (rule.category === 'DROP') continue
    const category = rule.category
    for (const m of text.matchAll(re)) {
      const raw = (m[3] ?? '').trim()
      if (!raw || EMPTY_VALUE_RE.test(raw)) continue
      if (rule.identifier) {
        for (const token of raw.split(/[\s,;]+/)) {
          const t = token.replace(/^[([]+|[)\].]+$/g, '')
          if (t.length >= 3 && /\d/.test(t)) bag.add(t, category)
        }
        continue
      }
      // Free text (client, contact, address): skip when a known value already
      // covers it piecewise (e.g. "CLIENT_1, ADDRESS_1, Raipur").
      if (coveredByKnown(raw)) continue
      bag.add(raw, category)
    }
  }
  for (const m of text.matchAll(M_S_RE)) {
    const raw = m[1].trim()
    if (!coveredByKnown(raw)) bag.add(raw, 'CLIENT')
  }
}

function assignPlaceholders(entries: Entry[]): Map<Entry, string> {
  const counters = new Map<AiGuardCategory, number>()
  const out = new Map<Entry, string>()
  const ordered = [...entries].sort(
    (a, b) =>
      a.firstIndex - b.firstIndex ||
      PLACEHOLDER_CATEGORIES.indexOf(a.category) - PLACEHOLDER_CATEGORIES.indexOf(b.category) ||
      a.value.localeCompare(b.value),
  )
  for (const e of ordered) {
    const n = (counters.get(e.category) ?? 0) + 1
    counters.set(e.category, n)
    out.set(e, `${e.category}_${n}`)
  }
  return out
}

function replaceAll(text: string, replacements: Array<{ re: RegExp; placeholder: string }>): string {
  let out = text
  for (const { re, placeholder } of replacements) {
    re.lastIndex = 0
    out = out.replace(re, placeholder)
  }
  return out
}

const PLACEHOLDER_RE = new RegExp(
  `\\[?\\b(${PLACEHOLDER_CATEGORIES.join('|')})\\\\?_(\\d+)\\b\\]?`,
  'g',
)

/** Maps CLIENT_1, EMAIL_2, ... in a reply back to the original values. */
export function restoreAiPlaceholders(text: string, redactions: Record<string, string>): string {
  if (!text || Object.keys(redactions).length === 0) return text
  return text.replace(PLACEHOLDER_RE, (whole, cat: string, n: string) => {
    const original = redactions[`${cat}_${n}`]
    return original ?? whole
  })
}

// ---------------------------------------------------------------------------
// Main entry (pure — unit tested)
// ---------------------------------------------------------------------------

export function applyAiDataGuard(input: AiGuardInput): AiGuardResult {
  const mode = normalizeAiClientDataMode(input.mode)
  const message = String(input.message ?? '')
  const context = input.context == null ? undefined : String(input.context)
  const history = (input.history ?? []).map((h) => ({ role: h.role, content: String(h.content ?? '') }))

  // 1. Drop free-text remarks from record data (context + earlier turns).
  const droppedContext = context != null ? dropFreeTextRemarks(context) : { text: undefined, dropped: 0 }
  const droppedHistory = history.map((h) => {
    const d = dropFreeTextRemarks(h.content)
    return { item: { role: h.role, content: d.text }, dropped: d.dropped }
  })
  const remarksDropped =
    droppedContext.dropped + droppedHistory.reduce((sum, h) => sum + h.dropped, 0)

  const texts = [message, droppedContext.text ?? '', ...droppedHistory.map((h) => h.item.content)]
  const combined = texts.join('\n')

  // 2. Find clients and sensitive values.
  const bag = new EntryBag(combined)
  const detected = new Map<string, AiGuardClient>()
  for (const c of findClientsInText(combined, input.clients)) detected.set(c.id, c)
  for (const id of input.clientIds ?? []) {
    const c = input.clients.find((x) => x.id === id)
    if (c) detected.set(c.id, c)
  }
  const knownValues: string[] = []
  for (const c of detected.values()) {
    for (const [value, category] of clientFields(c)) {
      if (!value?.trim()) continue
      // Only redact fields that actually occur (keeps the map small).
      if (!containsValue(combined, value)) continue
      bag.add(value, category, c.id)
      knownValues.push(value.trim())
    }
  }
  collectPatternValues(combined, bag)
  for (const t of texts) collectLabeledValues(t, bag, knownValues)

  const entries = bag.values()
  const unknownClientIds = (input.clientIds ?? []).filter((id) => !input.clients.some((c) => c.id === id))
  const containsClientData =
    entries.length > 0 || remarksDropped > 0 || Boolean(input.containsClientData) || unknownClientIds.length > 0
  const detectedClientIds = [...detected.keys()]

  // 3. Redaction plan (shared by 'redact', 'off' and unconsented requests).
  const redact = (): Pick<AiGuardResult, 'message' | 'context' | 'history' | 'redactions'> => {
    const placeholders = assignPlaceholders(entries)
    const redactions: Record<string, string> = {}
    const replacements = [...placeholders.entries()]
      .sort((a, b) => b[0].value.length - a[0].value.length)
      .map(([entry, placeholder]) => {
        redactions[placeholder] = entry.value
        return { re: valueRegex(entry.value), placeholder }
      })
    return {
      message: replaceAll(message, replacements),
      context: droppedContext.text != null ? replaceAll(droppedContext.text, replacements) : undefined,
      history: droppedHistory.map((h) => ({ role: h.item.role, content: replaceAll(h.item.content, replacements) })),
      redactions,
    }
  }

  if (!containsClientData) {
    return {
      message,
      context,
      history,
      clientData: 'none',
      redactions: {},
      contextWithheld: false,
      detectedClientIds,
    }
  }

  if (mode === 'off') {
    const r = redact()
    const ctx = droppedContext.text ?? ''
    const contextHasClientData =
      ctx.trim().length > 0 &&
      (droppedContext.dropped > 0 ||
        Boolean(input.containsClientData) ||
        (input.clientIds?.length ?? 0) > 0 ||
        entries.some((e) => containsValue(ctx, e.value)))
    return {
      message: r.message,
      // Context without client data (e.g. an equipment list) is still useful.
      context: contextHasClientData ? AI_CONTEXT_WITHHELD_NOTE : r.context,
      history: r.history,
      clientData: 'none',
      redactions: r.redactions,
      contextWithheld: contextHasClientData,
      detectedClientIds,
      notice: contextHasClientData ? AI_OFF_NOTICE : undefined,
    }
  }

  if (mode === 'allow_with_consent') {
    const consented = (c: AiGuardClient) => c.aiDataConsent === true
    const clientsInRequest = [...detected.values()]
    const allConsented =
      clientsInRequest.length > 0 && unknownClientIds.length === 0 && clientsInRequest.every(consented)
    const consentedValues = new Set<string>()
    const consentedDigits: string[] = []
    for (const c of clientsInRequest) {
      for (const [value, category] of clientFields(c)) {
        if (!value?.trim()) continue
        consentedValues.add(normKey(value))
        if (category === 'PHONE') consentedDigits.push(digitsOnly(value))
      }
    }
    const owned = (e: Entry) =>
      Boolean(e.clientId) ||
      consentedValues.has(normKey(e.value)) ||
      (e.category === 'PHONE' && consentedDigits.some((d) => d.length >= 10 && digitsOnly(e.value).endsWith(d)))
    // Any identity value that does not belong to a client in the request blocks as-is sending.
    const unowned = entries.filter((e) => CLIENT_IDENTITY.has(e.category) && !owned(e))
    if (allConsented && unowned.length === 0) {
      return {
        message,
        context,
        history,
        clientData: 'consented',
        redactions: {},
        contextWithheld: false,
        detectedClientIds,
      }
    }
    const r = redact()
    return {
      ...r,
      clientData: 'redacted',
      contextWithheld: false,
      detectedClientIds,
      notice: AI_CONSENT_MISSING_NOTICE,
    }
  }

  const r = redact()
  return { ...r, clientData: 'redacted', contextWithheld: false, detectedClientIds }
}

// ---------------------------------------------------------------------------
// Database reads (cached; tolerate missing columns before the migration)
// ---------------------------------------------------------------------------

const LAB_SETTINGS_SINGLETON_ID = '00000000-0000-0000-0000-000000000001'
const MODE_TTL_MS = 30_000
const CLIENTS_TTL_MS = 120_000

let modeCache: { at: number; value: AiClientDataMode; columnAvailable: boolean } | null = null
let clientsCache: { at: number; value: AiGuardClient[] } | null = null

export function invalidateAiDataGuardCache(): void {
  modeCache = null
  clientsCache = null
}

/**
 * Reads lab_settings.ai_client_data_mode. `columnAvailable` is false when the
 * column does not exist yet (migration 20261025100200 not applied).
 */
export async function fetchAiClientDataModeState(): Promise<{
  mode: AiClientDataMode
  columnAvailable: boolean
}> {
  if (modeCache && Date.now() - modeCache.at < MODE_TTL_MS) {
    return { mode: modeCache.value, columnAvailable: modeCache.columnAvailable }
  }
  let mode: AiClientDataMode = DEFAULT_AI_CLIENT_DATA_MODE
  let columnAvailable = true
  try {
    const single = await supabase
      .from('lab_settings')
      .select('ai_client_data_mode')
      .eq('id', LAB_SETTINGS_SINGLETON_ID)
      .maybeSingle()
    if (single.error) {
      columnAvailable = false
    } else if (single.data) {
      mode = normalizeAiClientDataMode((single.data as { ai_client_data_mode?: unknown }).ai_client_data_mode)
    } else {
      const latest = await supabase
        .from('lab_settings')
        .select('ai_client_data_mode')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (latest.error) columnAvailable = false
      else
        mode = normalizeAiClientDataMode(
          (latest.data as { ai_client_data_mode?: unknown } | null)?.ai_client_data_mode,
        )
    }
  } catch {
    columnAvailable = false
  }
  modeCache = { at: Date.now(), value: mode, columnAvailable }
  return { mode, columnAvailable }
}

export async function fetchAiClientDataMode(): Promise<AiClientDataMode> {
  return (await fetchAiClientDataModeState()).mode
}

/** Writes lab_settings.ai_client_data_mode on the lab settings row. */
export async function saveAiClientDataMode(mode: AiClientDataMode): Promise<void> {
  const value = normalizeAiClientDataMode(mode)
  const single = await supabase
    .from('lab_settings')
    .select('id')
    .eq('id', LAB_SETTINGS_SINGLETON_ID)
    .maybeSingle()
  let rowId: string | null = single.data ? LAB_SETTINGS_SINGLETON_ID : null
  if (!rowId) {
    const latest = await supabase
      .from('lab_settings')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    rowId = (latest.data as { id?: string } | null)?.id ?? null
  }
  if (!rowId) throw new Error('Lab settings row not found. Save Lab Settings first.')
  const { error } = await supabase.from('lab_settings').update({ ai_client_data_mode: value }).eq('id', rowId)
  if (error) throw error
  invalidateAiDataGuardCache()
}

type ClientDbRow = {
  id: string
  company_name: string | null
  contact_person_name: string | null
  email: string | null
  mobile: string | null
  gst_number: string | null
  address: string | null
  pin_code: string | null
  ai_data_consent?: boolean | null
}

const CLIENT_BASE_COLUMNS = 'id, company_name, contact_person_name, email, mobile, gst_number, address, pin_code'
const CLIENT_PAGE = 1000
const CLIENT_MAX = 20000

async function fetchClientRows(columns: string): Promise<ClientDbRow[] | null> {
  const rows: ClientDbRow[] = []
  for (let from = 0; from < CLIENT_MAX; from += CLIENT_PAGE) {
    const { data, error } = await supabase
      .from('clients')
      .select(columns)
      .order('id', { ascending: true })
      .range(from, from + CLIENT_PAGE - 1)
    if (error) return null
    const page = (data ?? []) as unknown as ClientDbRow[]
    rows.push(...page)
    if (page.length < CLIENT_PAGE) break
  }
  return rows
}

/** Client master for name matching; consent false when the column is missing. */
export async function fetchAiGuardClients(): Promise<AiGuardClient[]> {
  if (clientsCache && Date.now() - clientsCache.at < CLIENTS_TTL_MS) return clientsCache.value
  const rows =
    (await fetchClientRows(`${CLIENT_BASE_COLUMNS}, ai_data_consent`)) ??
    (await fetchClientRows(CLIENT_BASE_COLUMNS)) ??
    []
  const value: AiGuardClient[] = rows
    .filter((r) => r.id && (r.company_name ?? '').trim())
    .map((r) => ({
      id: r.id,
      companyName: String(r.company_name ?? '').trim(),
      contactPersonName: r.contact_person_name,
      email: r.email,
      mobile: r.mobile,
      gstNumber: r.gst_number,
      address: r.address,
      pinCode: r.pin_code,
      aiDataConsent: r.ai_data_consent === true,
    }))
  clientsCache = { at: Date.now(), value }
  return value
}

/** Loads mode + clients and applies the guard. Used by qiAssistantApi only. */
export async function guardAiRequest(
  input: Omit<AiGuardInput, 'mode' | 'clients'>,
): Promise<AiGuardResult> {
  const [mode, clients] = await Promise.all([fetchAiClientDataMode(), fetchAiGuardClients()])
  return applyAiDataGuard({ ...input, mode, clients })
}
