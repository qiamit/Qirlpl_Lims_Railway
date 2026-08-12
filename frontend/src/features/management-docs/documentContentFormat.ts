/** Helpers to clean / format management-document HTML for A4 preview. */

const BULLET_PREFIX = /^[\s]*([•\-\*◦▪▸►]|(\d+)[.)])\s+/

function stripAiFences(raw: string): string {
  let t = raw.trim()
  // Prefer fenced HTML block if present
  const fenced = t.match(/```(?:html|HTML)?\s*([\s\S]*?)```/)
  if (fenced?.[1]?.trim()) return fenced[1].trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:html|HTML)?\s*/i, '').replace(/\s*```$/i, '').trim()
  }
  return t
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

/** AI chat/meta lines that must never enter section body. */
const AI_CHATTER_RE =
  /^(?:sure|certainly|of course|okay|ok|here(?:'s| is| are)|i(?:'ve| have| will)|as (?:requested|instructed|asked)|based on|according to|however|therefore|note that|please (?:note|find)|the (?:updated|revised|new) (?:section|content|html|body)|updated (?:section|content)|let me|i will now|below is|following is)\b/i

function isAiChatterText(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return true
  if (t.length > 280 && !/[.!?]$/.test(t) && AI_CHATTER_RE.test(t)) return true
  if (AI_CHATTER_RE.test(t) && t.length < 220) return true
  if (/^(?:html|body)\s*(?:output|content)?\s*:?\s*$/i.test(t)) return true
  return false
}

/**
 * Pull clean section HTML from a model reply — drops preamble / "Here is the update…" chatter.
 */
export function extractSectionHtmlFromAiReply(reply: string, fallbackHtml = ''): string {
  let raw = stripAiFences(reply)
  if (!raw) return fallbackHtml

  // Slice from first HTML block tag if model wrapped prose around HTML
  const start = raw.search(/<(?:p|ul|ol|table|h[1-6]|div|section|blockquote|figure)\b/i)
  if (start > 0) {
    const before = raw.slice(0, start).trim()
    // Keep leading text only if it is not chatter and there is no HTML yet — usually chatter
    if (!before || isAiChatterText(before) || looksLikeHtml(raw.slice(start))) {
      raw = raw.slice(start)
    }
  }

  // Drop trailing prose after last closing block tag
  const endMatch = raw.match(/<\/(?:p|ul|ol|table|h[1-6]|div|section|blockquote|figure)>\s*$/i)
  if (!endMatch) {
    const lastClose = Math.max(
      raw.lastIndexOf('</p>'),
      raw.lastIndexOf('</ul>'),
      raw.lastIndexOf('</ol>'),
      raw.lastIndexOf('</table>'),
      raw.lastIndexOf('</h2>'),
      raw.lastIndexOf('</h3>'),
    )
    if (lastClose >= 0) {
      const closeEnd = raw.indexOf('>', lastClose) + 1
      const after = raw.slice(closeEnd).trim()
      if (after && (isAiChatterText(after) || !looksLikeHtml(after))) {
        raw = raw.slice(0, closeEnd).trim()
      }
    }
  }

  if (!looksLikeHtml(raw)) {
    // Plain text reply — drop chatter-only lines then convert
    const kept = raw
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l && !isAiChatterText(l))
    if (kept.length === 0) return fallbackHtml
    return replyToHtml(kept.join('\n'))
  }

  if (typeof document === 'undefined') return raw

  const root = document.createElement('div')
  root.innerHTML = raw

  // Remove leading/trailing chatter paragraphs (and similar)
  const stripEnds = () => {
    while (root.firstChild) {
      const n = root.firstChild
      if (n.nodeType === Node.TEXT_NODE) {
        if (!n.textContent?.trim() || isAiChatterText(n.textContent)) {
          root.removeChild(n)
          continue
        }
        break
      }
      if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as HTMLElement
        const tag = el.tagName
        if (tag === 'P' || tag === 'DIV' || tag === 'SPAN') {
          const onlyText = !el.querySelector('ul,ol,table,h1,h2,h3,h4,li')
          if (onlyText && isAiChatterText(el.textContent || '')) {
            root.removeChild(n)
            continue
          }
        }
      }
      break
    }
    while (root.lastChild) {
      const n = root.lastChild
      if (n.nodeType === Node.TEXT_NODE) {
        if (!n.textContent?.trim() || isAiChatterText(n.textContent)) {
          root.removeChild(n)
          continue
        }
        break
      }
      if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as HTMLElement
        const tag = el.tagName
        if (tag === 'P' || tag === 'DIV' || tag === 'SPAN') {
          const onlyText = !el.querySelector('ul,ol,table,h1,h2,h3,h4,li')
          if (onlyText && isAiChatterText(el.textContent || '')) {
            root.removeChild(n)
            continue
          }
        }
      }
      break
    }
  }
  stripEnds()

  // Remove mid-document chatter paragraphs that are clearly meta
  root.querySelectorAll('p').forEach((p) => {
    if (isAiChatterText(p.textContent || '') && !p.querySelector('table,ul,ol')) {
      p.remove()
    }
  })

  const out = root.innerHTML.trim()
  return out || fallbackHtml
}

/** Plain text / markdown-ish AI reply → simple HTML. */
export function replyToHtml(reply: string): string {
  const cleaned = stripAiFences(reply)
  if (!cleaned) return ''
  if (looksLikeHtml(cleaned)) return cleaned

  const lines = cleaned.split(/\n/)
  const parts: string[] = []
  let listBuf: string[] = []
  let listOrdered = false

  const flushList = () => {
    if (listBuf.length === 0) return
    const tag = listOrdered ? 'ol' : 'ul'
    parts.push(
      `<${tag}>${listBuf.map((li) => `<li>${escapeHtml(li)}</li>`).join('')}</${tag}>`,
    )
    listBuf = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      continue
    }
    const m = trimmed.match(BULLET_PREFIX)
    if (m) {
      const ordered = Boolean(m[2])
      if (listBuf.length > 0 && ordered !== listOrdered) flushList()
      listOrdered = ordered
      listBuf.push(trimmed.replace(BULLET_PREFIX, ''))
      continue
    }
    flushList()
    parts.push(`<p>${escapeHtml(trimmed)}</p>`)
  }
  flushList()
  return parts.join('')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Local structural cleanup: consecutive bullet-like paragraphs → proper lists,
 * empty paragraphs removed, nested list spacing normalized.
 */
export function normalizeSectionHtml(html: string): string {
  if (typeof document === 'undefined') return html
  const trimmed = html.trim()
  if (!trimmed) return ''

  const root = document.createElement('div')
  root.innerHTML = looksLikeHtml(trimmed) ? trimmed : replyToHtml(trimmed)

  // Remove empty paragraphs
  root.querySelectorAll('p').forEach((p) => {
    if (!p.textContent?.trim() && !p.querySelector('img,table,br')) {
      p.remove()
    }
  })

  // Convert runs of bullet-like <p> into <ul>/<ol>
  const children = Array.from(root.childNodes)
  const rebuilt: Node[] = []
  let listItems: string[] = []
  let listOrdered = false

  const flush = () => {
    if (listItems.length === 0) return
    const list = document.createElement(listOrdered ? 'ol' : 'ul')
    for (const text of listItems) {
      const li = document.createElement('li')
      li.innerHTML = text
      list.appendChild(li)
    }
    rebuilt.push(list)
    listItems = []
  }

  for (const node of children) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'P') {
      const el = node as HTMLParagraphElement
      const text = el.textContent?.trim() ?? ''
      const m = text.match(BULLET_PREFIX)
      if (m) {
        const ordered = Boolean(m[2])
        if (listItems.length > 0 && ordered !== listOrdered) flush()
        listOrdered = ordered
        // Keep inner HTML but strip leading bullet from first text node
        const clone = el.cloneNode(true) as HTMLElement
        const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT)
        const first = walker.nextNode()
        if (first?.textContent) {
          first.textContent = first.textContent.replace(BULLET_PREFIX, '')
        }
        listItems.push(clone.innerHTML.trim() || text.replace(BULLET_PREFIX, ''))
        continue
      }
    }
    flush()
    rebuilt.push(node)
  }
  flush()

  root.replaceChildren(...rebuilt)

  // Ensure lists use proper tags (TipTap sometimes leaves odd wrappers)
  root.querySelectorAll('ul, ol').forEach((list) => {
    list.querySelectorAll(':scope > li').forEach((li) => {
      // Unwrap nested single <p> inside li for cleaner print
      if (li.children.length === 1 && li.children[0]?.tagName === 'P') {
        const p = li.children[0]
        while (p.firstChild) li.insertBefore(p.firstChild, p)
        p.remove()
      }
    })
  })

  return root.innerHTML
}

export function buildDocumentFormatAiPrompt(input: {
  docNumber: string
  title: string
  sectionLabel: string
  sectionNo: string
  sectionTitle: string
  bodyHtml: string
}): string {
  const hasTitle = input.sectionTitle.trim().length > 0
  const layoutRule = hasTitle
    ? `Layout: Section has both number ("${input.sectionNo}") and title ("${input.sectionTitle}"). Return body HTML only — do NOT repeat the section number/title in the body. Body starts on a new line after the heading in the UI.`
    : input.sectionNo.trim()
      ? `Layout: Section number is "${input.sectionNo}" and title is BLANK. Return body HTML ONLY without the section number prefix — the UI places the number on the same line before the first paragraph. Do not invent a title heading.`
      : 'Layout: No section number; keep normal paragraph flow.'

  return [
    'You format ISO 17025 / Quality Manual section HTML for professional A4 print.',
    `Document: ${input.docNumber} — ${input.title}`,
    `Section: ${input.sectionLabel}`,
    layoutRule,
    'Tasks:',
    '1. Use proper HTML lists: <ul>/<ol> and <li> for bullets and numbered items (never fake bullets as paragraphs).',
    '2. Use clear hierarchy with <h2>/<h3> only when appropriate; keep body paragraphs in <p>.',
    '3. Nest sub-bullets with nested <ul> inside <li> when content is sub-level.',
    '4. Keep tables intact; do not remove table structure.',
    '5. Preserve meaning and wording; only improve structure and formatting.',
    '6. Justify-friendly clean paragraphs; no markdown, no code fences, no preamble.',
    'Return ONLY the improved HTML body for this section.',
    'Current HTML:',
    input.bodyHtml.slice(0, 12000),
  ].join('\n')
}

/** Chat-driven update for ONE draft section only (never letterhead / footer / cover). */
export function buildSectionChatAiPrompt(input: {
  docNumber: string
  title: string
  sectionLabel: string
  sectionNo: string
  sectionTitle: string
  bodyHtml: string
  userMessage: string
  pdfFileNames: string[]
  catalogText?: string
}): string {
  const hasPdfs = input.pdfFileNames.length > 0
  const userMsg = input.userMessage.trim()
  const pdfNote = hasPdfs
    ? `Attached reference PDF(s): ${input.pdfFileNames.join(', ')}. Extract and use PDF text from context as the primary source to draft/update this section.`
    : 'No PDFs attached — rely on the user instruction and current HTML only.'

  const registerBlock = input.catalogText?.trim()
    ? [
        'DOCUMENT REGISTER (SOURCE OF TRUTH — Level 1 / 2 / 3 / 4 Management Documents):',
        input.catalogText.trim().slice(0, 20000),
        'STRICT: In text and tables, use ONLY Doc No + Title from this register. Never invent documents/forms/SOPs.',
        'If a needed document is missing from the register, write "TBD (not in register)" — do not fabricate a Doc No.',
      ]
    : [
        'No document register was provided — avoid inventing document numbers; keep existing Doc Nos unchanged unless the user names a real one.',
      ]

  const instructionBlock = userMsg
    ? [
        'User instruction (apply while drafting — do NOT quote or restate this instruction in the output):',
        userMsg,
      ]
    : [
        'User instruction: none — draft/update this section primarily from the attached PDF(s).',
      ]

  const draftMission = hasPdfs
    ? [
        'MISSION — UPDATE THIS SECTION ONLY:',
        '- Use attached PDF(s) and any user instruction as source material.',
        '- Produce a clear ISO 17025 controlled-document body for THIS section only — not the whole manual.',
        '- Match the section title/purpose; pull relevant requirements, procedures, and wording from the PDFs.',
        '- If current HTML is empty or placeholder-like, draft full section content from the sources.',
        '- If current HTML has useful content, improve/merge it with the sources (do not drop critical existing points unless they conflict with the sources).',
        '- Write professional controlled-document English suitable for print.',
      ]
    : [
        'MISSION — UPDATE THIS SECTION ONLY:',
        '- Apply the user instruction to draft or improve this section body only — not other sections or the whole manual.',
        '- Write professional controlled-document English suitable for a Quality Manual section.',
      ]

  return [
    'You draft/update ONE Quality Manual / controlled-document SECTION body for an ISO 17025 LIMS.',
    'STRICT SCOPE:',
    '- Update ONLY this section body HTML.',
    '- Do NOT change letterhead, page header, page footer, cover page, TOC, or other sections.',
    '- Do NOT invent a new section number or title unless the user message explicitly asks to rewrite the body text that mentions them.',
    `Document: ${input.docNumber} — ${input.title}`,
    `Target section: ${input.sectionLabel}`,
    `Section No: ${input.sectionNo || '(blank)'}`,
    `Section Title: ${input.sectionTitle || '(blank)'}`,
    pdfNote,
    ...draftMission,
    ...registerBlock,
    ...instructionBlock,
    'CRITICAL OUTPUT RULES:',
    '1. Your entire reply MUST be the section body HTML only. Start with <p> or <ul> or <table> or <h2>/<h3>.',
    '2. FORBIDDEN in the reply: greetings, explanations, "Here is the update", "Sure", "However", "as requested", notes about the instruction, markdown, or code fences.',
    '3. Do not mention the user instruction, PDFs, or that you are an AI.',
    '4. Keep tables if present unless the user asks to change them. Tables must use real HTML <table> with <th>/<td> and <p> inside cells.',
    '5. If sources/instruction cannot be applied, return the original HTML unchanged — still with zero commentary.',
    'Current section HTML:',
    input.bodyHtml.slice(0, 14000),
  ].join('\n')
}

/** Insert section number at the start of the first block so body continues on the same line. */
export function prependSectionNoToHtml(html: string, sectionNo: string): string {
  const no = sectionNo.trim()
  if (!no) return html
  const trimmed = html.trim()
  if (!trimmed) return `<p><strong>${escapeHtml(no)}</strong></p>`

  const label = `<strong class="sec-no">${escapeHtml(no)}</strong>\u00a0`

  if (/^<p(\s[^>]*)?>/i.test(trimmed)) {
    return trimmed.replace(/^<p(\s[^>]*)?>/i, `<p$1>${label}`)
  }
  if (/^<(ul|ol|table|h[1-6])\b/i.test(trimmed)) {
    return `<p>${label}</p>${trimmed}`
  }
  return `<p>${label}${trimmed}</p>`
}
