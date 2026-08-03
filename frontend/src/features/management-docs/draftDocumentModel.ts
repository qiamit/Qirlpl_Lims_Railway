export type DraftSectionLevel = 1 | 2 | 3 | 4

export type DraftSection = {
  id: string
  /** Display number e.g. "1", "1.1", "QE-01" */
  sectionNo: string
  title: string
  body: string
  level: DraftSectionLevel
  /** When true, this section starts on a new A4 page in preview/print. */
  pageBreakBefore?: boolean
}

export type DraftDocument = {
  version: 1
  sections: DraftSection[]
}

function newSectionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `sec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function clampLevel(value: unknown): DraftSectionLevel {
  const n = typeof value === 'number' ? value : Number(value)
  if (n === 2 || n === 3 || n === 4) return n
  return 1
}

/** Split "1. Scope" → { sectionNo: "1", title: "Scope" } when possible */
export function splitSectionHeading(rawTitle: string): { sectionNo: string; title: string } {
  const trimmed = rawTitle.trim()
  const m = trimmed.match(/^(\d+(?:\.\d+)*)\s*[.:)\-]?\s*(.*)$/)
  if (m && m[2]) {
    return { sectionNo: m[1] ?? '', title: m[2].trim() }
  }
  return { sectionNo: '', title: trimmed }
}

export function createEmptySection(
  partial?: Partial<Pick<DraftSection, 'sectionNo' | 'title' | 'body' | 'level'>>,
): DraftSection {
  return {
    id: newSectionId(),
    sectionNo: partial?.sectionNo ?? '',
    title: partial?.title ?? 'New Section',
    body: partial?.body ?? '',
    level: clampLevel(partial?.level ?? 1),
  }
}

export function legacyPlainTextToDraft(text: string): DraftDocument {
  return {
    version: 1,
    sections: [
      createEmptySection({
        sectionNo: '',
        title: 'Document Body',
        body: text,
        level: 1,
      }),
    ],
  }
}

function isDraftSection(value: unknown): value is DraftSection {
  if (!value || typeof value !== 'object') return false
  const sec = value as {
    id?: unknown
    title?: unknown
    body?: unknown
    level?: unknown
    sectionNo?: unknown
    pageBreakBefore?: unknown
  }
  return (
    typeof sec.id === 'string' &&
    typeof sec.title === 'string' &&
    typeof sec.body === 'string' &&
    (sec.level === undefined || [1, 2, 3, 4].includes(Number(sec.level))) &&
    (sec.sectionNo === undefined || typeof sec.sectionNo === 'string') &&
    (sec.pageBreakBefore === undefined || typeof sec.pageBreakBefore === 'boolean')
  )
}

function isDraftDocument(value: unknown): value is DraftDocument {
  if (!value || typeof value !== 'object') return false
  const obj = value as { version?: unknown; sections?: unknown }
  if (obj.version !== 1 || !Array.isArray(obj.sections)) return false
  return obj.sections.every(isDraftSection)
}

function normalizeSections(sections: DraftSection[]): DraftSection[] {
  return sections.map((s) => {
    const level = clampLevel(s.level)
    let sectionNo = typeof s.sectionNo === 'string' ? s.sectionNo : ''
    let title = s.title
    if (!sectionNo && title) {
      const split = splitSectionHeading(title)
      if (split.sectionNo) {
        sectionNo = split.sectionNo
        title = split.title
      }
    }
    return {
      id: s.id,
      sectionNo,
      title,
      body: s.body,
      level,
      pageBreakBefore: Boolean(s.pageBreakBefore),
    }
  })
}

/** Parse stored draft_content. Empty → no sections (dashboard Add New flow). */
export function parseDraftContent(raw: string | null | undefined): DraftDocument {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) {
    return { version: 1, sections: [] }
  }

  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (isDraftDocument(parsed)) {
        return { version: 1, sections: normalizeSections(parsed.sections) }
      }
    } catch {
      // fall through
    }
  }

  return legacyPlainTextToDraft(trimmed)
}

export function serializeDraftContent(doc: DraftDocument): string {
  return JSON.stringify({
    version: 1,
    sections: doc.sections.map((s) => ({
      id: s.id,
      sectionNo: s.sectionNo ?? '',
      title: s.title,
      body: s.body,
      level: clampLevel(s.level),
      ...(s.pageBreakBefore ? { pageBreakBefore: true } : {}),
    })),
  })
}

export function displaySectionLabel(section: DraftSection): string {
  const no = section.sectionNo.trim()
  const title = section.title.trim() || 'Untitled'
  return no ? `${no} ${title}` : title
}
