import type { TestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsTypes'
import { resolvePrintPageSizeMm } from '@/features/settings/lab-settings/printSettingsTypes'

const CSS_PX_PER_MM = 96 / 25.4
/** Extra clearance so last lines/signatures never sit under the letterhead footer. */
const FOOTER_SAFETY_MM = 3

function waitForImages(doc: Document): Promise<void> {
  const images = Array.from(doc.images)
  if (images.length === 0) return Promise.resolve()
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve()
            return
          }
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        }),
    ),
  ).then(() => undefined)
}

function forceBreakClass(settings: TestReportPrintSettings): Set<string> {
  const set = new Set<string>()
  if (settings.partANewPage) set.add('part-a')
  if (settings.partBNewPage) set.add('part-b')
  if (settings.partCNewPage) set.add('part-c')
  if (settings.partDNewPage) set.add('part-d')
  return set
}

function outerHeight(el: HTMLElement): number {
  const win = el.ownerDocument.defaultView
  const cs = win?.getComputedStyle(el)
  const mt = cs ? parseFloat(cs.marginTop) || 0 : 0
  const mb = cs ? parseFloat(cs.marginBottom) || 0 : 0
  return el.offsetHeight + mt + mb
}

/** Content height only (ignore body padding) — used with measured header/footer reserves. */
function contentHeight(body: HTMLElement): number {
  let h = 0
  for (const child of Array.from(body.children) as HTMLElement[]) {
    h += outerHeight(child)
  }
  return h
}

function bandHeightPx(el: HTMLElement | null | undefined): number {
  if (!el) return 0
  return Math.max(el.offsetHeight, el.scrollHeight, 0)
}

/**
 * Split the continuous print HTML into stacked paper sheets matching page size,
 * margins, forced part page-breaks, and overflowing tables/content.
 */
export async function paginateTestReportPreview(
  doc: Document,
  settings: TestReportPrintSettings,
): Promise<void> {
  await waitForImages(doc)
  if (doc.querySelector('.preview-sheets')) return

  const page = resolvePrintPageSizeMm(settings)
  const pageW = Math.round(page.width * CSS_PX_PER_MM)
  const pageH = Math.round(page.height * CSS_PX_PER_MM)
  const breaks = forceBreakClass(settings)
  const safetyPx = Math.round(FOOTER_SAFETY_MM * CSS_PX_PER_MM)

  const header = doc.querySelector<HTMLElement>('.print-header')
  const footer = doc.querySelector<HTMLElement>('.print-footer')
  const main = doc.querySelector<HTMLElement>('.print-body')
  if (!main) return

  const settingsTopPx = Math.round(settings.bodyPaddingTopMm * CSS_PX_PER_MM)
  const settingsBottomPx = Math.round(settings.bodyPaddingBottomMm * CSS_PX_PER_MM)
  const leftPx = Math.round(settings.bodyPaddingLeftMm * CSS_PX_PER_MM)
  const rightPx = Math.round(settings.bodyPaddingRightMm * CSS_PX_PER_MM)

  // Use the larger of configured padding and real letterhead/footer height so content
  // never paints underneath absolute header/footer bands.
  const topPadPx = Math.max(settingsTopPx, bandHeightPx(header))
  const bottomPadPx = Math.max(settingsBottomPx, bandHeightPx(footer) + safetyPx)
  const availableContentPx = Math.max(48, pageH - topPadPx - bottomPadPx)

  const blocks = Array.from(main.children) as HTMLElement[]
  if (blocks.length === 0) return

  const sheetsWrap = doc.createElement('div')
  sheetsWrap.className = 'preview-sheets'

  type Sheet = { sheet: HTMLElement; body: HTMLElement }
  let current: Sheet | null = null
  let startNextOnNewSheet = false

  const startSheet = (): Sheet => {
    const sheet = doc.createElement('div')
    sheet.className = 'preview-sheet'
    sheet.style.width = `${pageW}px`
    sheet.style.height = `${pageH}px`

    if (header) {
      const clone = header.cloneNode(true) as HTMLElement
      clone.style.position = 'absolute'
      clone.style.top = '0'
      clone.style.left = '0'
      clone.style.right = '0'
      clone.style.zIndex = '20'
      clone.style.background = '#fff'
      sheet.appendChild(clone)
    }

    const body = doc.createElement('main')
    body.className = 'print-body preview-sheet-body'
    body.style.paddingTop = `${topPadPx}px`
    body.style.paddingBottom = `${bottomPadPx}px`
    body.style.paddingLeft = `${leftPx}px`
    body.style.paddingRight = `${rightPx}px`
    body.style.boxSizing = 'border-box'
    body.style.height = '100%'
    body.style.overflow = 'hidden'
    sheet.appendChild(body)

    if (footer) {
      const clone = footer.cloneNode(true) as HTMLElement
      clone.style.position = 'absolute'
      clone.style.bottom = '0'
      clone.style.left = '0'
      clone.style.right = '0'
      clone.style.zIndex = '20'
      clone.style.background = '#fff'
      sheet.appendChild(clone)
    }

    sheetsWrap.appendChild(sheet)
    current = { sheet, body }
    startNextOnNewSheet = false
    return current
  }

  const overflows = (): boolean =>
    Boolean(current && contentHeight(current.body) > availableContentPx + 0.5)

  const ensureSheet = () => {
    if (!current) startSheet()
  }

  const needsForceBreak = (el: HTMLElement): boolean => {
    if (!el.classList.contains('report-part')) return false
    return ['part-a', 'part-b', 'part-c', 'part-d'].some(
      (cls) => el.classList.contains(cls) && breaks.has(cls),
    )
  }

  const markOverflowForNext = () => {
    if (overflows()) startNextOnNewSheet = true
  }

  const placeWhole = (el: HTMLElement) => {
    ensureSheet()
    if (!current) return
    const childrenBefore = current.body.children.length
    if (startNextOnNewSheet && childrenBefore > 0) startSheet()
    if (!current) return

    current.body.appendChild(el)
    if (overflows() && childrenBefore > 0) {
      current.body.removeChild(el)
      startSheet()
      current.body.appendChild(el)
    }
    markOverflowForNext()
  }

  const splitByRows = (
    section: HTMLElement,
    rows: HTMLElement[],
    makeEmptyChunk: () => HTMLElement,
    rowParentOf: (chunk: HTMLElement) => HTMLElement | null,
  ) => {
    if (rows.length === 0) {
      placeWhole(section)
      return
    }

    ensureSheet()
    if (needsForceBreak(section) && current && current.body.children.length > 0) startSheet()
    if (startNextOnNewSheet && current && current.body.children.length > 0) startSheet()

    let chunk: HTMLElement | null = null
    let rowParent: HTMLElement | null = null

    const attachNewChunk = () => {
      ensureSheet()
      if (!current) return
      chunk = makeEmptyChunk()
      current.body.appendChild(chunk)
      rowParent = rowParentOf(chunk)
    }

    for (const row of rows) {
      ensureSheet()
      if (!current) break
      if (!chunk || !rowParent) attachNewChunk()
      if (!rowParent || !current) break

      const rowsBefore = rowParent.children.length
      const blocksBefore = current.body.children.length
      rowParent.appendChild(row)

      if (overflows() && (rowsBefore > 0 || blocksBefore > 1)) {
        rowParent.removeChild(row)
        startSheet()
        attachNewChunk()
        rowParent?.appendChild(row)
      }
    }

    markOverflowForNext()
    section.remove()
  }

  const splitPartA = (section: HTMLElement) => {
    const table = section.querySelector<HTMLTableElement>('table.part-a-table')
    if (!table) {
      placeWhole(section)
      return
    }
    const rows = Array.from(table.querySelectorAll('tbody tr')) as HTMLElement[]
    splitByRows(
      section,
      rows,
      () => {
        const wrap = section.cloneNode(false) as HTMLElement
        const newTable = doc.createElement('table')
        newTable.className = 'part-a-table'
        const colgroup = table.querySelector('colgroup')
        if (colgroup) newTable.appendChild(colgroup.cloneNode(true))
        const thead = table.querySelector('thead')
        if (thead) newTable.appendChild(thead.cloneNode(true))
        const tbody = doc.createElement('tbody')
        newTable.appendChild(tbody)
        wrap.appendChild(newTable)
        return wrap
      },
      (chunk) => chunk.querySelector('tbody'),
    )
  }

  const splitPartB = (section: HTMLElement) => {
    const table = section.querySelector<HTMLTableElement>('table.part-b-table')
    if (!table) {
      placeWhole(section)
      return
    }
    const thead = table.querySelector('thead')
    const rows = Array.from(table.querySelectorAll('tbody tr')) as HTMLElement[]
    splitByRows(
      section,
      rows,
      () => {
        const wrap = doc.createElement('section')
        wrap.className = 'report-part part-b'
        const newTable = doc.createElement('table')
        newTable.className = 'part-b-table'
        const colgroup = table.querySelector('colgroup')
        if (colgroup) newTable.appendChild(colgroup.cloneNode(true))
        if (thead) newTable.appendChild(thead.cloneNode(true))
        const tbody = doc.createElement('tbody')
        newTable.appendChild(tbody)
        wrap.appendChild(newTable)
        return wrap
      },
      (chunk) => chunk.querySelector('tbody'),
    )
  }

  const splitPartC = (section: HTMLElement) => {
    const table = section.querySelector<HTMLTableElement>('table.part-c-table')
    if (!table) {
      placeWhole(section)
      return
    }

    const thead = table.querySelector('thead')
    const colgroup = table.querySelector('colgroup')
    const rows = Array.from(table.querySelectorAll('tbody tr')) as HTMLElement[]
    const endNotes = section.querySelector<HTMLElement>('.part-c-end-notes')

    const makeEmptyChunk = (): HTMLElement => {
      const wrap = doc.createElement('section')
      wrap.className = 'report-part part-c'
      const newTable = doc.createElement('table')
      newTable.className = 'part-c-table'
      if (colgroup) newTable.appendChild(colgroup.cloneNode(true))
      if (thead) newTable.appendChild(thead.cloneNode(true))
      const tbody = doc.createElement('tbody')
      newTable.appendChild(tbody)
      wrap.appendChild(newTable)
      return wrap
    }

    splitByRows(section, rows, makeEmptyChunk, (chunk) => chunk.querySelector('tbody'))

    if (endNotes) {
      ensureSheet()
      if (startNextOnNewSheet && current && current.body.children.length > 0) startSheet()
      const lastPart =
        current?.body.querySelector('.report-part.part-c:last-child') ?? null
      if (lastPart && current) {
        lastPart.appendChild(endNotes)
        if (overflows() && current.body.children.length > 0) {
          lastPart.removeChild(endNotes)
          startSheet()
          const wrap = makeEmptyChunk()
          wrap.appendChild(endNotes)
          current.body.appendChild(wrap)
        }
      } else {
        placeWhole(endNotes)
      }
      markOverflowForNext()
    }
  }

  startSheet()

  for (const block of blocks) {
    if (needsForceBreak(block) && current && current.body.children.length > 0) {
      startSheet()
    }

    if (block.classList.contains('part-a') && block.querySelector('table.part-a-table')) {
      splitPartA(block)
      continue
    }
    if (block.classList.contains('part-b') && block.querySelector('table.part-b-table')) {
      splitPartB(block)
      continue
    }
    if (block.querySelector('table.part-c-table')) {
      splitPartC(block)
      continue
    }

    placeWhole(block)
  }

  header?.remove()
  footer?.remove()
  main.remove()

  doc.body.replaceChildren(sheetsWrap)
  doc.documentElement.style.height = 'auto'
  doc.body.style.height = 'auto'
  doc.body.style.overflow = 'visible'
}
