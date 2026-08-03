import { supabase } from '@/lib/supabaseClient'
import {
  parseDraftContent,
  displaySectionLabel,
  type DraftSection,
} from './draftDocumentModel'
import type { ManagementDocumentRow } from './types'

export type DocCatalogEntry = {
  id: string
  docNumber: string
  title: string
  docType: string
  revisionNo: string
  issueNo: string
  status: string
  level: number
}

export type LocalReferenceFinding = {
  severity: 'error' | 'warning' | 'info'
  kind: 'missing_doc' | 'title_mismatch' | 'obsolete_ref' | 'ok_ref'
  mention: string
  matchedDocNumber?: string
  detail: string
  sectionLabel?: string
}

export type ReferenceCheckResult = {
  catalog: DocCatalogEntry[]
  localFindings: LocalReferenceFinding[]
  aiReport: string | null
}

/** Typical controlled-document number tokens used in ISO / LIMS manuals. */
const DOC_TOKEN_RE =
  /\b(?:(?:QM|QSM|QP|SOP|WI|WI-|F|FR|FORM|POL|PR|PROC|QSP|QOP)[\s\-_/]*[A-Z0-9][\w.\-/]{0,24}|[A-Z]{1,4}[\-/]\d{1,4}(?:[\./]\d{1,3}){0,3})\b/gi

function stripHtml(html: string): string {
  if (typeof document !== 'undefined') {
    const el = document.createElement('div')
    el.innerHTML = html
    return (el.textContent || '').replace(/\s+/g, ' ').trim()
  }
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sectionPlainText(section: DraftSection): string {
  const head = displaySectionLabel(section)
  const body = stripHtml(section.body || '')
  return [head, body].filter(Boolean).join('\n')
}

export function documentPlainOutline(sections: DraftSection[]): string {
  return sections
    .map((s) => {
      const label = displaySectionLabel(s)
      const body = stripHtml(s.body || '').slice(0, 4000)
      return `### ${label}\n${body}`
    })
    .join('\n\n')
    .slice(0, 28000)
}

export async function fetchManagementDocCatalog(
  excludeId?: string,
): Promise<DocCatalogEntry[]> {
  const { data, error } = await supabase
    .from('management_documents')
    .select(
      'id, level, doc_number, title, doc_type, revision_no, issue_no, status',
    )
    .order('doc_number', { ascending: true })

  if (error) throw error

  return (data ?? [])
    .filter((r) => r.id !== excludeId)
    .map((r) => ({
      id: r.id as string,
      docNumber: String(r.doc_number ?? '').trim(),
      title: String(r.title ?? '').trim(),
      docType: String(r.doc_type ?? '').trim(),
      revisionNo: String(r.revision_no ?? '').trim(),
      issueNo: String(r.issue_no ?? '').trim(),
      status: String(r.status ?? '').trim(),
      level: Number(r.level) || 1,
    }))
    .filter((e) => e.docNumber.length > 0)
}

export function formatCatalogForPrompt(catalog: DocCatalogEntry[]): string {
  if (catalog.length === 0) return '(No documents in the Management Documents register.)'

  const byLevel = new Map<number, DocCatalogEntry[]>()
  for (const d of catalog) {
    const level = d.level >= 1 && d.level <= 4 ? d.level : 0
    const list = byLevel.get(level) ?? []
    list.push(d)
    byLevel.set(level, list)
  }

  const levelTitle = (level: number) =>
    level === 0 ? 'Other / unleveled' : `Level ${level} Documents`

  const blocks: string[] = []
  for (const level of [1, 2, 3, 4, 0]) {
    const list = byLevel.get(level)
    if (!list?.length) continue
    blocks.push(`### ${levelTitle(level)}`)
    for (const d of list) {
      blocks.push(
        `- ${d.docNumber} | ${d.title} | Type: ${d.docType} | Rev: ${d.revisionNo || '—'} | Issue: ${d.issueNo || '—'} | Status: ${d.status}`,
      )
    }
  }
  return blocks.join('\n')
}

function normalizeToken(token: string): string {
  return token.replace(/\s+/g, '').toUpperCase()
}

function findCatalogMatch(
  token: string,
  catalog: DocCatalogEntry[],
): DocCatalogEntry | undefined {
  const n = normalizeToken(token)
  const exact = catalog.find((d) => normalizeToken(d.docNumber) === n)
  if (exact) return exact
  // Soft match: catalog number contained in token or vice versa
  return catalog.find((d) => {
    const c = normalizeToken(d.docNumber)
    return c.length >= 3 && (n.includes(c) || c.includes(n))
  })
}

/**
 * Local scan: document-number-like tokens vs master list.
 * Also flags obsolete status when a known doc is cited.
 */
export function scanLocalReferences(
  sections: DraftSection[],
  catalog: DocCatalogEntry[],
  currentDocNumber: string,
): LocalReferenceFinding[] {
  const findings: LocalReferenceFinding[] = []
  const currentNorm = normalizeToken(currentDocNumber)
  const seen = new Set<string>()

  for (const section of sections) {
    const text = sectionPlainText(section)
    const label = displaySectionLabel(section)
    const matches = text.match(DOC_TOKEN_RE) ?? []

    for (const raw of matches) {
      const mention = raw.trim()
      const key = `${label}::${normalizeToken(mention)}`
      if (seen.has(key)) continue
      seen.add(key)

      if (normalizeToken(mention) === currentNorm) continue

      const hit = findCatalogMatch(mention, catalog)
      if (!hit) {
        findings.push({
          severity: 'error',
          kind: 'missing_doc',
          mention,
          detail: `Referenced as "${mention}" but no matching document number exists in Management Documents.`,
          sectionLabel: label,
        })
        continue
      }

      if (hit.status === 'obsolete') {
        findings.push({
          severity: 'warning',
          kind: 'obsolete_ref',
          mention,
          matchedDocNumber: hit.docNumber,
          detail: `"${hit.docNumber}" (${hit.title}) is marked Obsolete in the system.`,
          sectionLabel: label,
        })
      } else {
        findings.push({
          severity: 'info',
          kind: 'ok_ref',
          mention,
          matchedDocNumber: hit.docNumber,
          detail: `Matches ${hit.docNumber} — ${hit.title} (Rev ${hit.revisionNo || '—'}, ${hit.status}).`,
          sectionLabel: label,
        })
      }

      // Nearby title mismatch: if catalog title words appear scrambled nearby
      const window = text.slice(
        Math.max(0, text.toUpperCase().indexOf(mention.toUpperCase()) - 80),
        text.toUpperCase().indexOf(mention.toUpperCase()) + mention.length + 120,
      )
      const titleWords = hit.title
        .split(/\s+/)
        .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
        .filter((w) => w.length > 4)
      if (titleWords.length >= 2) {
        const upper = window.toUpperCase()
        const hits = titleWords.filter((w) => upper.includes(w.toUpperCase())).length
        // If text mentions a different long title-like phrase after the doc no, warn
        const after = window.slice(window.toUpperCase().indexOf(mention.toUpperCase()) + mention.length)
        const quoted = after.match(/[“"']([^”"']{8,80})[”"']/)
        if (quoted?.[1]) {
          const quotedNorm = quoted[1].trim().toLowerCase()
          const titleNorm = hit.title.trim().toLowerCase()
          if (
            quotedNorm !== titleNorm &&
            !titleNorm.includes(quotedNorm) &&
            !quotedNorm.includes(titleNorm) &&
            hits < Math.ceil(titleWords.length / 2)
          ) {
            findings.push({
              severity: 'warning',
              kind: 'title_mismatch',
              mention,
              matchedDocNumber: hit.docNumber,
              detail: `Near "${mention}", text quotes “${quoted[1].trim()}” but system title is “${hit.title}”.`,
              sectionLabel: label,
            })
          }
        }
      }
    }
  }

  return findings
}

export function buildReferenceCheckAiPrompt(input: {
  docNumber: string
  title: string
  docType: string
  revisionNo: string
  issueNo: string
  status: string
  labName: string
  catalogText: string
  localFindingsText: string
  documentOutline: string
}): string {
  return [
    'You are an ISO/IEC 17025 document-control auditor for a LIMS Quality Management System.',
    'Task: Cross-check THIS document against the SYSTEM document register and flag inconsistencies.',
    '',
    'Current document metadata:',
    `- Doc No: ${input.docNumber}`,
    `- Title: ${input.title}`,
    `- Type: ${input.docType}`,
    `- Revision: ${input.revisionNo || '—'}`,
    `- Issue: ${input.issueNo || '—'}`,
    `- Status: ${input.status}`,
    `- Issuing laboratory (system): ${input.labName || '—'}`,
    '',
    'SYSTEM document register (source of truth for numbers / titles / rev / status):',
    input.catalogText,
    '',
    'Local scanner findings (may be incomplete — verify and extend):',
    input.localFindingsText || '(none)',
    '',
    'Document content outline to audit:',
    input.documentOutline,
    '',
    'Check for:',
    '1. References to other controlled documents (SOP, WI, Form, Policy, QM clauses) — number must exist in the register.',
    '2. Wrong / outdated titles next to a correct document number.',
    '3. Wrong revision / issue numbers vs the register.',
    '4. References to Obsolete documents still treated as active.',
    '5. Lab / organization name mismatches vs issuing laboratory.',
    '6. Internal clause references that clearly contradict other sections in THIS document.',
    '7. Anything system-related that looks invented or not aligned with the register.',
    '',
    'Output rules:',
    '- Reply in clear English (short Hindi notes allowed in parentheses if helpful).',
    '- Use this structure exactly:',
    '## Summary',
    '(1-3 sentences: overall OK / issues found)',
    '## Issues',
    '- [ERROR|WARN|INFO] Section … — …',
    '(If no issues: write "- None — references look consistent with the system register.")',
    '## Suggested fixes',
    '- …',
    '- Do NOT rewrite the full document HTML. Report only.',
    '- Do not invent document numbers that are not in the register or the content.',
  ].join('\n')
}

export function formatLocalFindingsForPrompt(findings: LocalReferenceFinding[]): string {
  if (findings.length === 0) return '(Local scanner found no document-number tokens.)'
  return findings
    .map(
      (f) =>
        `- [${f.severity.toUpperCase()}] ${f.kind} | ${f.sectionLabel ?? '—'} | "${f.mention}" → ${f.detail}`,
    )
    .join('\n')
}

export function rowToCatalogMeta(row: ManagementDocumentRow): {
  docNumber: string
  title: string
  docType: string
  revisionNo: string
  issueNo: string
  status: string
} {
  return {
    docNumber: row.doc_number,
    title: row.title,
    docType: row.doc_type,
    revisionNo: row.revision_no,
    issueNo: row.issue_no ?? '',
    status: row.status,
  }
}
