/**
 * DOMPurify helpers for HTML and text that end up in reports, letterheads and
 * print templates (security plan S-17). Used on save and again on render, so
 * markup planted through the REST API before the server-side checks existed
 * is neutralised too.
 */
import DOMPurify from 'dompurify'

/** Something that looks like an HTML tag, comment or javascript: URL. */
const MARKUP_RE = /<[a-z!?/][^>]*>|<!--|javascript\s*:/i

export function hasMarkup(value: string): boolean {
  return MARKUP_RE.test(value)
}

function purifierReady(): boolean {
  return typeof window !== 'undefined' && DOMPurify.isSupported
}

/** Safe HTML (no scripts, event handlers or javascript: URLs). */
export function sanitizeHtml(html: string): string {
  const source = String(html ?? '')
  if (!source) return ''
  if (!purifierReady()) return source.replace(/<[^>]*>/g, '')
  return DOMPurify.sanitize(source, { USE_PROFILES: { html: true } })
}

/**
 * Plain text: strips any markup and returns the text content. Text without
 * anything that looks like a tag is returned unchanged, so values such as
 * "pH < 7" or "A & B" are not altered.
 */
export function stripMarkup(text: string): string {
  const source = String(text ?? '')
  if (!source || !hasMarkup(source)) return source
  if (!purifierReady()) {
    return source.replace(/<[^>]*>/g, '').replace(/javascript\s*:/gi, '')
  }
  const fragment = DOMPurify.sanitize(source, {
    ALLOWED_TAGS: [],
    KEEP_CONTENT: true,
    RETURN_DOM_FRAGMENT: true,
  })
  return (fragment.textContent ?? '').replace(/javascript\s*:/gi, '')
}

/** Deep copy of a template JSON document with markup removed from every string. */
export function sanitizeTemplateJson<T>(value: T): T {
  const walk = (v: unknown, depth: number): unknown => {
    if (typeof v === 'string') return stripMarkup(v)
    if (depth > 12 || v === null || typeof v !== 'object') return v
    if (Array.isArray(v)) return v.map((item) => walk(item, depth + 1))
    const out: Record<string, unknown> = {}
    for (const [k, item] of Object.entries(v as Record<string, unknown>)) {
      out[k] = walk(item, depth + 1)
    }
    return out
  }
  return walk(value, 0) as T
}
