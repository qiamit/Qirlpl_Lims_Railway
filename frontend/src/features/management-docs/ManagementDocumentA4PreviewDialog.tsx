import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { Loader2, Paperclip, Printer, Settings2, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatDate } from '@/lib/utils'
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { sendQiAssistantMessage, validateAssistantPdfFile } from '@/components/qi-assistant/qiAssistantApi'
import { fetchActiveUserProfiles } from '@/features/sample-handling/shared/fetchActiveUserProfiles'
import {
  createEmptySection,
  displaySectionLabel,
  parseDraftContent,
  serializeDraftContent,
  type DraftSection,
  type DraftSectionLevel,
} from './draftDocumentModel'
import {
  buildDocumentFormatAiPrompt,
  buildSectionChatAiPrompt,
  extractSectionHtmlFromAiReply,
  normalizeSectionHtml,
  prependSectionNoToHtml,
} from './documentContentFormat'
import {
  buildReferenceCheckAiPrompt,
  documentPlainOutline,
  fetchManagementDocCatalog,
  formatCatalogForPrompt,
  formatLocalFindingsForPrompt,
  rowToCatalogMeta,
  scanLocalReferences,
  type LocalReferenceFinding,
  type ReferenceCheckResult,
} from './documentReferenceCheck'
import { DraftSectionRichEditor } from './DraftSectionRichEditor'
import {
  fetchManagementDocLetterhead,
  type ManagementDocLetterhead,
} from './fetchManagementDocLetterhead'
import type { ManagementDocumentRow } from './types'
import { MANAGEMENT_DOC_STATUSES } from './types'

/** Fullscreen preview — main content area only (sidebar 268px stays visible). */
const MGMT_A4_PREVIEW_OVERLAY = 'md:inset-y-0 md:left-[268px] md:right-0 md:w-auto'

const MGMT_A4_PREVIEW_DIALOG_CLASS = cn(
  limsDialogClass,
  '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border-0 bg-white p-0 shadow-none ring-0',
  'left-0 top-0',
  'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
  'data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 sm:rounded-none',
  '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
)

const MGMT_A4_SECTION_EDIT_DIALOG_CLASS = cn(
  limsDialogClass,
  '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border-0 p-0 shadow-none ring-0',
  'left-0 top-0',
  'md:left-[268px] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
  'data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 sm:rounded-none',
  '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
)

const MGMT_A4_NESTED_DIALOG_CLASS = cn(
  limsDialogClass,
  'max-w-2xl !gap-0 overflow-hidden p-0',
  'md:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
  '[&>button]:text-white [&>button]:hover:bg-white/10',
)

type PageOrientation = 'portrait' | 'landscape'

const PAGE_ORIENTATION_OPTIONS = [
  { id: 'portrait' as const, label: 'Portrait (A4 · 210 × 297 mm)' },
  { id: 'landscape' as const, label: 'Landscape (A4 · 297 × 210 mm)' },
]

function pageDimensionsMm(orientation: PageOrientation): {
  widthMm: number
  heightMm: number
} {
  return orientation === 'landscape'
    ? { widthMm: 297, heightMm: 210 }
    : { widthMm: 210, heightMm: 297 }
}

/** Shared page chrome; width/height applied via inline style from page layout. */
const A4_PAGE_CLASS =
  'mx-auto flex w-full flex-col overflow-hidden bg-white text-slate-900 shadow-lg print:mx-0 print:shadow-none print:overflow-hidden'

const BLOCK_GAP_OPTIONS = [
  { id: 0, label: 'None (0px)' },
  { id: 2, label: 'Ultra tight (2px)' },
  { id: 4, label: 'Minimal (4px)' },
  { id: 8, label: 'Tight (8px)' },
  { id: 12, label: 'Compact (12px)' },
  { id: 16, label: 'Normal (16px)' },
] as const

const LINE_SPACING_OPTIONS = [
  { id: 0.95, label: 'Dense (0.95)' },
  { id: 1, label: 'Single (1.0)' },
  { id: 1.05, label: 'Tight (1.05)' },
  { id: 1.15, label: 'Normal (1.15)' },
  { id: 1.3, label: 'Relaxed (1.3)' },
] as const

const PARAGRAPH_GAP_OPTIONS = [
  { id: 0, label: 'None (0)' },
  { id: 0.1, label: 'Ultra tight (0.1em)' },
  { id: 0.15, label: 'Minimal (0.15em)' },
  { id: 0.35, label: 'Tight (0.35em)' },
  { id: 0.55, label: 'Normal (0.55em)' },
] as const

const SECTION_NO_SIZE_OPTIONS = [
  { id: 11, label: '11 px' },
  { id: 12, label: '12 px' },
  { id: 13, label: '13 px' },
  { id: 14, label: '14 px' },
  { id: 15, label: '15 px' },
  { id: 16, label: '16 px' },
] as const

const SECTION_TITLE_SIZE_OPTIONS = [
  { id: 12, label: '12 px' },
  { id: 13, label: '13 px' },
  { id: 14, label: '14 px' },
  { id: 15, label: '15 px' },
  { id: 16, label: '16 px' },
  { id: 18, label: '18 px' },
] as const

const SECTION_TITLE_CASE_OPTIONS = [
  { id: 'none' as const, label: 'As typed' },
  { id: 'capitalize' as const, label: 'Capitalize' },
  { id: 'uppercase' as const, label: 'Uppercase' },
] as const

const SECTION_TITLE_TRACKING_OPTIONS = [
  { id: 0, label: 'Normal (0)' },
  { id: 0.02, label: 'Slight (0.02em)' },
  { id: 0.06, label: 'Wide (0.06em)' },
  { id: 0.12, label: 'Extra wide (0.12em)' },
] as const

type SectionTitleCase = (typeof SECTION_TITLE_CASE_OPTIONS)[number]['id']

const SECTION_TEXT_SIZE_OPTIONS = [
  { id: 11, label: '11 px' },
  { id: 12, label: '12 px' },
  { id: 12.5, label: '12.5 px' },
  { id: 13, label: '13 px' },
  { id: 14, label: '14 px' },
  { id: 15, label: '15 px' },
] as const

const SECTION_TEXT_TRACKING_OPTIONS = [
  { id: 0, label: 'Normal (0)' },
  { id: 0.01, label: 'Slight (0.01em)' },
  { id: 0.03, label: 'Wide (0.03em)' },
  { id: 0.05, label: 'Extra wide (0.05em)' },
] as const

const SECTION_TEXT_INDENT_OPTIONS = [
  { id: 0, label: 'None (0)' },
  { id: 0.5, label: 'Small (0.5em)' },
  { id: 1, label: 'Standard (1em)' },
  { id: 1.5, label: 'Large (1.5em)' },
] as const

const FONT_WEIGHT_OPTIONS = [
  { id: 400, label: 'Regular' },
  { id: 500, label: 'Medium' },
  { id: 600, label: 'Semibold' },
  { id: 700, label: 'Bold' },
] as const

const TEXT_ALIGN_OPTIONS = [
  { id: 'justify', label: 'Justify' },
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Center' },
  { id: 'right', label: 'Right' },
] as const

type TextAlign = (typeof TEXT_ALIGN_OPTIONS)[number]['id']

type PreviewTypography = {
  sectionNoSizePx: number
  sectionTitleSizePx: number
  sectionTextSizePx: number
  sectionNoWeight: number
  sectionTitleWeight: number
  sectionTitleCase: SectionTitleCase
  sectionTitleTrackingEm: number
  sectionTextWeight: number
  sectionTextTrackingEm: number
  sectionTextFirstLineIndentEm: number
  lineSpacing: number
  paragraphGapEm: number
  textAlign: TextAlign
}

function textAlignClass(textAlign: TextAlign): string {
  if (textAlign === 'center') return '!text-center'
  if (textAlign === 'right') return '!text-right'
  if (textAlign === 'left') return '!text-left'
  return '!text-justify'
}

function textAlignChildClass(textAlign: TextAlign, selector: string): string {
  if (textAlign === 'center') return `${selector}:!text-center`
  if (textAlign === 'right') return `${selector}:!text-right`
  if (textAlign === 'left') return `${selector}:!text-left`
  return `${selector}:!text-justify`
}

/** Print-ready body styles: alignment + proper list / heading hierarchy. */
function docBodyClass(textAlign: TextAlign = 'justify'): string {
  return cn(
    'a4-doc-body text-slate-800',
    textAlignClass(textAlign),
    '[&_h1]:mb-0.5 [&_h1]:mt-1 [&_h1]:text-left [&_h1]:text-[1em] [&_h1]:font-bold',
    '[&_h2]:mb-0.5 [&_h2]:mt-1 [&_h2]:text-left [&_h2]:text-[1em] [&_h2]:font-semibold',
    '[&_h3]:mb-0.5 [&_h3]:mt-0.5 [&_h3]:text-left [&_h3]:text-[1em] [&_h3]:font-semibold',
    '[&_h4]:mb-0.5 [&_h4]:mt-0.5 [&_h4]:text-left [&_h4]:text-[1em] [&_h4]:font-semibold',
    '[&_p]:mb-[var(--para-gap,0.1em)] [&_p]:[text-indent:var(--para-indent,0)]',
    textAlignChildClass(textAlign, '[&_p]'),
    '[&_ul]:my-0.5 [&_ul]:list-disc [&_ul]:pl-[var(--list-indent,1.5rem)]',
    '[&_ol]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-[var(--list-indent,1.5rem)]',
    '[&_li]:mb-0',
    textAlignChildClass(textAlign, '[&_li]'),
    '[&_ul_ul]:mt-0 [&_ul_ul]:mb-0 [&_ul_ul]:list-circle [&_ul_ul]:pl-5',
    '[&_ul_ul_ul]:list-square',
    '[&_ol_ol]:mt-0 [&_ol_ol]:mb-0 [&_ol_ol]:pl-5',
    '[&_li>p]:mb-0 [&_li>p]:[text-indent:0]',
    '[&_table]:my-1 [&_table]:w-full [&_table]:border-collapse',
    '[&_th]:border [&_td]:border [&_th]:border-slate-400 [&_td]:border-slate-400',
    '[&_th]:bg-slate-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold',
    '[&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
    textAlignChildClass(textAlign, '[&_td]'),
    '[&_blockquote]:my-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-400 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-700',
    '[&_strong.sec-no]:text-slate-900',
    '[&_strong.sec-no]:text-[length:var(--sec-no-size,13px)]',
    '[&_strong.sec-no]:[font-weight:var(--sec-no-weight,600)]',
  )
}

function docBodyStyle(typography: PreviewTypography): CSSProperties {
  return {
    fontSize: `${typography.sectionTextSizePx}px`,
    fontWeight: typography.sectionTextWeight,
    letterSpacing: `${typography.sectionTextTrackingEm}em`,
    lineHeight: typography.lineSpacing,
    textAlign: typography.textAlign,
    ['--sec-no-size' as string]: `${typography.sectionNoSizePx}px`,
    ['--sec-no-weight' as string]: String(typography.sectionNoWeight),
    ['--para-gap' as string]: `${typography.paragraphGapEm}em`,
    ['--para-indent' as string]: `${typography.sectionTextFirstLineIndentEm}em`,
  }
}

const MARGIN_X_OPTIONS = [
  { id: 8, label: 'Narrow (8 mm)' },
  { id: 10, label: 'Compact (10 mm)' },
  { id: 12, label: 'Standard (12 mm)' },
  { id: 15, label: 'Wide (15 mm)' },
  { id: 18, label: 'Extra wide (18 mm)' },
] as const

const MARGIN_TOP_OPTIONS = [
  { id: 4, label: 'Tight (4 mm)' },
  { id: 6, label: 'Compact (6 mm)' },
  { id: 8, label: 'Standard (8 mm)' },
  { id: 10, label: 'Comfortable (10 mm)' },
  { id: 12, label: 'Loose (12 mm)' },
] as const

const BODY_PAD_Y_OPTIONS = [
  { id: 4, label: 'Minimal (4 px)' },
  { id: 8, label: 'Tight (8 px)' },
  { id: 12, label: 'Standard (12 px)' },
  { id: 16, label: 'Relaxed (16 px)' },
] as const

type PreviewLayoutSettings = PreviewTypography & {
  showCover: boolean
  showToc: boolean
  showContentHeading: boolean
  showTocPageNumbers: boolean
  blockGapPx: number
  /** Page chrome */
  showLetterhead: boolean
  showPageFooter: boolean
  showPageNumbers: boolean
  marginXMm: number
  marginTopMm: number
  bodyPadYPx: number
  /** Start every Level-1 section on a new page */
  breakLevel1Sections: boolean
  /** A4 portrait vs landscape */
  pageOrientation: PageOrientation
}

const DEFAULT_PREVIEW_SETTINGS: PreviewLayoutSettings = {
  showCover: true,
  showToc: true,
  showContentHeading: true,
  showTocPageNumbers: true,
  blockGapPx: 2,
  lineSpacing: 1,
  paragraphGapEm: 0.1,
  textAlign: 'justify',
  sectionNoSizePx: 14,
  sectionTitleSizePx: 15,
  sectionTextSizePx: 13,
  sectionNoWeight: 600,
  sectionTitleWeight: 600,
  sectionTitleCase: 'none',
  sectionTitleTrackingEm: 0,
  sectionTextWeight: 400,
  sectionTextTrackingEm: 0,
  sectionTextFirstLineIndentEm: 0,
  showLetterhead: true,
  showPageFooter: true,
  showPageNumbers: true,
  marginXMm: 12,
  marginTopMm: 8,
  bodyPadYPx: 12,
  breakLevel1Sections: false,
  pageOrientation: 'portrait',
}


/** Split rich HTML into top-level siblings so large sections can paginate cleanly. */
function splitHtmlIntoChunks(html: string): string[] {
  const trimmed = html.trim()
  if (!trimmed) return []
  if (typeof document === 'undefined') return [trimmed]

  const wrap = document.createElement('div')
  wrap.innerHTML = trimmed
  const chunks: string[] = []
  Array.from(wrap.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent?.trim()
      if (t) chunks.push(`<p>${t}</p>`)
      return
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      chunks.push((node as Element).outerHTML)
    }
  })
  return chunks.length > 0 ? chunks : [trimmed]
}

type ContentBlock =
  | { id: string; kind: 'remark'; text: string }
  | { id: string; kind: 'contentHeading' }
  | { id: string; kind: 'toc'; sections: DraftSection[] }
  | { id: string; kind: 'empty'; hasFile: boolean }
  | { id: string; kind: 'sectionHeading'; section: DraftSection }
  /** Title blank: section no + first body chunk on the same line (clickable). */
  | { id: string; kind: 'sectionLead'; section: DraftSection; html: string }
  | { id: string; kind: 'html'; html: string }

function tocEntryLabel(section: DraftSection): { no: string; title: string } {
  const no = section.sectionNo.trim()
  const title = section.title.trim()
  if (no && title) return { no, title }
  if (no) return { no, title: '' }
  if (title) return { no: '', title }
  return { no: '', title: 'Untitled' }
}

/** First page where each section heading / lead appears (offset by cover when shown). */
function buildSectionPageMap(
  pages: ContentBlock[][],
  coverPageCount: number,
): Map<string, number> {
  const map = new Map<string, number>()
  pages.forEach((pageBlocks, pageIndex) => {
    const pageNo = pageIndex + 1 + coverPageCount
    for (const block of pageBlocks) {
      if (block.kind === 'sectionHeading' || block.kind === 'sectionLead') {
        if (!map.has(block.section.id)) map.set(block.section.id, pageNo)
      }
    }
  })
  return map
}

function statusLabel(status: ManagementDocumentRow['status']): string {
  return MANAGEMENT_DOC_STATUSES.find((s) => s.id === status)?.label ?? status
}

function formatAddressLines(lh: ManagementDocLetterhead): string[] {
  const lines: string[] = []
  if (lh.labAddress.trim()) lines.push(lh.labAddress.trim())
  const cityLine = [lh.district, lh.state, lh.pinCode].map((s) => s.trim()).filter(Boolean)
  if (cityLine.length) lines.push(cityLine.join(', '))
  if (lh.country.trim()) lines.push(lh.country.trim())
  return lines
}

function buildContentBlocks(
  sections: DraftSection[],
  remark: string | null | undefined,
  hasFile: boolean,
  options?: { showToc?: boolean; showContentHeading?: boolean },
): ContentBlock[] {
  const blocks: ContentBlock[] = []
  const showToc = options?.showToc !== false
  const showContentHeading = options?.showContentHeading !== false

  if (remark?.trim()) {
    blocks.push({ id: 'remark', kind: 'remark', text: remark.trim() })
  }

  if (showContentHeading) {
    blocks.push({ id: 'content-heading', kind: 'contentHeading' })
  }

  if (sections.length === 0) {
    blocks.push({ id: 'empty', kind: 'empty', hasFile })
    return blocks
  }

  if (showToc) {
    blocks.push({ id: 'toc', kind: 'toc', sections })
  }

  for (const section of sections) {
    const hasTitle = section.title.trim().length > 0
    const hasNo = section.sectionNo.trim().length > 0
    const chunks = splitHtmlIntoChunks(section.body)

    if (!hasTitle && hasNo) {
      // Title blank → body starts on same line after Section No
      const [first, ...rest] = chunks.length > 0 ? chunks : ['']
      blocks.push({
        id: `sec-lead-${section.id}`,
        kind: 'sectionLead',
        section,
        html: first || '<p></p>',
      })
      rest.forEach((html, i) => {
        blocks.push({ id: `sec-b-${section.id}-${i + 1}`, kind: 'html', html })
      })
    } else {
      // Title present (or no section no) → heading, then body on new line(s)
      blocks.push({ id: `sec-h-${section.id}`, kind: 'sectionHeading', section })
      if (chunks.length === 0) {
        blocks.push({
          id: `sec-empty-${section.id}`,
          kind: 'html',
          html: '<p class="text-sm italic text-slate-400">No content.</p>',
        })
      } else {
        chunks.forEach((html, i) => {
          blocks.push({ id: `sec-b-${section.id}-${i}`, kind: 'html', html })
        })
      }
    }
  }

  return blocks
}

/** Shrink font until text fits one line inside its box (letterhead / cover). */
function FitSingleLineText({
  text,
  className,
  minPx = 7,
}: {
  text: string
  className?: string
  minPx?: number
}) {
  const ref = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const fitToBox = () => {
      el.style.fontSize = ''
      const base = Number.parseFloat(window.getComputedStyle(el).fontSize) || 13
      let size = base
      el.style.whiteSpace = 'nowrap'
      while (el.scrollWidth > el.clientWidth + 0.5 && size > minPx) {
        size -= 0.25
        el.style.fontSize = `${size}px`
      }
    }

    fitToBox()
    const ro = new ResizeObserver(fitToBox)
    ro.observe(el)
    if (el.parentElement) ro.observe(el.parentElement)
    return () => ro.disconnect()
  }, [text, minPx])

  return (
    <p ref={ref} className={className} title={text}>
      {text}
    </p>
  )
}

function DocumentLetterhead({
  lh,
  row,
  pageLabel = '1 of 1',
}: {
  lh: ManagementDocLetterhead
  row: ManagementDocumentRow
  pageLabel?: string
}) {
  const companyName = lh.labName.trim() || 'Laboratory'

  return (
    <div className="grid grid-cols-[79px_1fr] border-2 border-slate-900 sm:grid-cols-[97px_1fr]">
      <div className="flex items-center justify-center border-r-2 border-slate-900 p-1.5">
        {lh.logoUrl ? (
          <img
            src={lh.logoUrl}
            alt="Logo"
            className="max-h-[72px] max-w-full object-contain sm:max-h-[88px]"
          />
        ) : (
          <div className="flex h-full min-h-[72px] w-full items-center justify-center bg-slate-50 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            Logo
          </div>
        )}
      </div>

      <div
        className={cn(
          'grid min-w-0',
          'grid-cols-[minmax(0,1.375fr)_minmax(0,1.375fr)_minmax(0,1fr)]',
          'grid-rows-[auto_auto_auto]',
        )}
      >
        <div className="col-span-2 row-span-2 flex min-w-0 flex-col items-center justify-center border-b border-r-2 border-slate-900 px-1.5 py-1 text-center">
          <FitSingleLineText
            text={companyName}
            className="w-full max-w-full whitespace-nowrap text-center text-[13px] font-bold leading-none tracking-tight text-slate-900"
          />
          <p className="mt-0.5 w-full truncate text-[11px] font-semibold leading-tight text-slate-700">
            {row.title?.trim() || '—'}
          </p>
        </div>

        <div className="flex items-center justify-end border-b border-slate-900 px-1.5 py-0.5 text-right text-[10px] font-semibold leading-none text-slate-900">
          Document No - {row.doc_number || '—'}
        </div>
        <div className="flex items-center justify-end border-b border-slate-900 px-1.5 py-0.5 text-right text-[10px] font-semibold leading-none text-slate-900">
          Page No - {pageLabel?.trim() ? pageLabel : '—'}
        </div>

        <div className="flex min-w-0 flex-col items-start justify-center gap-0 border-r-2 border-slate-900 px-1.5 py-0.5 text-left text-[10px] font-semibold leading-tight text-slate-900">
          <p>Revision No - {row.revision_no || '00'}</p>
          <p>Revision Date - {formatDate(row.revision_date)}</p>
        </div>
        <div className="flex min-w-0 flex-col items-center justify-center gap-0 border-r-2 border-slate-900 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-tight text-slate-900">
          <p>Issue No - {row.issue_no || '01'}</p>
          <p>Issue Date - {formatDate(row.issue_date)}</p>
        </div>
        <div className="flex min-w-0 flex-col items-end justify-center gap-0 px-1.5 py-0.5 text-right text-[10px] font-semibold leading-tight text-slate-900">
          <p>Amendment No - {row.amendment_no || '00'}</p>
          <p>Amendment Date - {formatDate(row.amendment_date)}</p>
        </div>
      </div>
    </div>
  )
}

/** Cover page body (letterhead + footer shared with other pages). */
function DocumentCoverBody({
  lh,
  row,
}: {
  lh: ManagementDocLetterhead
  row: ManagementDocumentRow
}) {
  const companyName = lh.labName.trim() || 'Laboratory'
  const addressLines = formatAddressLines(lh)
  const phone = lh.labPhone.trim()
  const email = lh.labEmail.trim()
  const contact = lh.contactPerson.trim()

  const controlPairs: Array<[string, string]> = [
    ['Document No', row.doc_number || '—'],
    ['Document Type', row.doc_type || '—'],
    ['Status', statusLabel(row.status)],
    ['Owner', row.owner_name?.trim() || '—'],
  ]

  const revisionPairs: Array<[string, string, string, string]> = [
    ['Revision No', row.revision_no || '00', 'Revision Date', formatDate(row.revision_date)],
    ['Issue No', row.issue_no || '00', 'Issue Date', formatDate(row.issue_date)],
    [
      'Amendment No',
      row.amendment_no || '00',
      'Amendment Date',
      formatDate(row.amendment_date),
    ],
  ]

  return (
    <div className="flex h-full min-h-0 flex-col justify-between gap-3">
      {/* Title hero */}
      <div className="flex flex-1 flex-col items-center justify-center px-1 text-center">
        {lh.logoUrl ? (
          <img
            src={lh.logoUrl}
            alt={`${companyName} logo`}
            className="mb-4 max-h-[88px] max-w-[200px] object-contain"
          />
        ) : (
          <div className="mb-4 flex h-[72px] w-[160px] items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Logo
          </div>
        )}
        <div className="w-full max-w-[28rem] border-y-2 border-slate-900 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Controlled Document
          </p>
          <h1 className="mt-3 text-[1.75rem] font-bold leading-[1.15] tracking-tight text-slate-900 sm:text-[2rem]">
            {row.title?.trim() || 'Untitled Document'}
          </h1>
          <p className="mt-2.5 text-[12px] font-semibold tracking-[0.08em] text-slate-700 sm:text-[13px]">
            Based on{' '}
            <span className="font-bold tracking-normal text-slate-900">ISO/IEC 17025:2017</span>
          </p>
          <p className="mt-3 inline-flex items-center border border-slate-900 bg-slate-50 px-3 py-1 font-mono text-[12px] font-semibold tracking-wide text-slate-900">
            {row.doc_number || '—'}
          </p>
          {row.doc_type?.trim() ? (
            <p className="mt-2.5 text-[12px] font-medium text-slate-600">{row.doc_type.trim()}</p>
          ) : null}
        </div>
      </div>

      {/* Laboratory identity */}
      <section className="border-2 border-slate-900">
        <div className="border-b-2 border-slate-900 bg-slate-100 px-3 py-1.5">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-700">
            Issuing Laboratory
          </h2>
        </div>
        <div className="grid sm:grid-cols-[1.25fr_1fr]">
          <div className="min-w-0 space-y-1 border-b border-slate-300 px-3 py-2.5 sm:border-b-0 sm:border-r-2 sm:border-slate-900">
            <FitSingleLineText
              text={companyName}
              className="w-full max-w-full whitespace-nowrap text-[13px] font-bold leading-none text-slate-900"
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Testing & Calibration
            </p>
            {addressLines.length > 0 ? (
              <p className="pt-1 text-[13px] leading-snug text-slate-700">
                {addressLines.join(', ')}
              </p>
            ) : (
              <p className="pt-1 text-[13px] italic text-slate-400">Address not set</p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 px-3 py-2.5 text-right text-[11px] text-slate-700">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Phone</p>
              <p className="font-medium text-slate-900">{phone || '—'}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Email</p>
              <p className="break-all font-medium text-slate-900">{email || '—'}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                Contact Person
              </p>
              <p className="font-medium text-slate-900">{contact || '—'}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Document control table */}
      <section className="border-2 border-slate-900">
        <div className="border-b-2 border-slate-900 bg-slate-100 px-3 py-1.5">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-700">
            Document Control
          </h2>
        </div>

        <div className="grid grid-cols-2 border-b border-slate-300 sm:grid-cols-4">
          {controlPairs.map(([label, value], i) => (
            <div
              key={label}
              className={cn(
                'min-w-0 px-2.5 py-2',
                i === 0 && 'text-left',
                (i === 1 || i === 2) && 'text-center',
                i === 3 && 'text-right',
                i !== controlPairs.length - 1 && 'border-r border-slate-300',
                i < 2 && 'border-b border-slate-300 sm:border-b-0',
              )}
            >
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="truncate text-[12px] font-semibold text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        <div className="divide-y divide-slate-300">
          {revisionPairs.map(([l1, v1, l2, v2]) => (
            <div key={l1} className="grid grid-cols-2">
              <div className="border-r border-slate-300 px-2.5 py-2">
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{l1}</p>
                <p className="font-mono text-[12px] font-semibold text-slate-900">{v1}</p>
              </div>
              <div className="px-2.5 py-2 text-right">
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{l2}</p>
                <p className="text-[12px] font-semibold tabular-nums text-slate-900">{v2}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-center text-[10px] leading-relaxed text-slate-500">
        This is a controlled document. Unauthorised copies are not valid for use.
        Verify revision status before use.
      </p>
    </div>
  )
}

function formatPersonWithDesignation(
  name: string | null | undefined,
  designationByName: Map<string, string>,
): string {
  const n = name?.trim()
  if (!n) return '—'
  const des = designationByName.get(n)?.trim()
  if (des) return `${n} (${des})`
  // Already stored as "Name (Designation)"
  if (/\([^)]+\)$/.test(n)) return n
  return n
}

const DocumentPageFooter = forwardRef<
  HTMLElement,
  { row: ManagementDocumentRow; designationByName: Map<string, string> }
>(function DocumentPageFooter({ row, designationByName }, ref) {
  return (
    <footer ref={ref} className="shrink-0 px-[12mm] pb-[8mm] pt-2">
      <div className="border-t-2 border-slate-900 pt-2">
        <div className="grid grid-cols-3 divide-x-2 divide-slate-900 border-2 border-slate-900">
          {(
            [
              ['Prepared By', row.prepared_by],
              ['Reviewed By', row.reviewed_by],
              ['Approved By', row.approved_by],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="min-w-0">
              <p className="border-b border-slate-800 bg-slate-100 px-1.5 py-0.5 text-center text-[8px] font-bold uppercase tracking-wide text-slate-700">
                {label}
              </p>
              <p className="min-h-[28px] px-1.5 py-1.5 text-center text-[11px] font-semibold leading-snug text-slate-900">
                {formatPersonWithDesignation(value, designationByName)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </footer>
  )
})

function SectionHoverActions({
  section,
  hasBreak,
  onEditSection,
  onAddSectionRelative,
  onDeleteSection,
  onTogglePageBreak,
  onAiSection,
}: {
  section: DraftSection
  hasBreak: boolean
  onEditSection?: (section: DraftSection) => void
  onAddSectionRelative?: (section: DraftSection, position: 'above' | 'below') => void
  onDeleteSection?: (section: DraftSection) => void
  onTogglePageBreak?: (section: DraftSection) => void
  onAiSection?: (section: DraftSection) => void
}) {
  const label = displaySectionLabel(section)
  return (
    <span className="inline-flex shrink-0 flex-wrap items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 print:hidden">
      <button
        type="button"
        className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 hover:bg-amber-100"
        onClick={() => onEditSection?.(section)}
      >
        Edit
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900 hover:bg-amber-100"
        onClick={() => onAiSection?.(section)}
        title="Update this section with AI"
        aria-label={`AI update section ${label}`}
      >
        <Sparkles size={10} aria-hidden />
        AI
      </button>
      <button
        type="button"
        className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 hover:bg-slate-200"
        onClick={() => onAddSectionRelative?.(section, 'above')}
        title="Add a new section above this one"
        aria-label={`Add section above ${label}`}
      >
        Add Up
      </button>
      <button
        type="button"
        className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 hover:bg-slate-200"
        onClick={() => onAddSectionRelative?.(section, 'below')}
        title="Add a new section below this one"
        aria-label={`Add section below ${label}`}
      >
        Add Below
      </button>
      <button
        type="button"
        className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-600 hover:bg-red-50"
        onClick={() => onDeleteSection?.(section)}
        title="Delete this section"
        aria-label={`Delete section ${label}`}
      >
        Delete
      </button>
      <button
        type="button"
        className={cn(
          'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide hover:bg-slate-200',
          hasBreak ? 'bg-slate-200 text-slate-800' : 'text-slate-600',
        )}
        onClick={() => onTogglePageBreak?.(section)}
        title={
          hasBreak
            ? 'Remove page break before this section'
            : 'Start this section on a new page'
        }
        aria-label={
          hasBreak
            ? `Remove page break before ${label}`
            : `Add page break before ${label}`
        }
        aria-pressed={hasBreak}
      >
        {hasBreak ? 'Remove Break' : 'Page Break'}
      </button>
    </span>
  )
}

function ContentBlockView({
  block,
  onEditSection,
  onAddSection,
  onTogglePageBreak,
  onAddSectionRelative,
  onDeleteSection,
  onAiSection,
  pageBySectionId,
  typography = DEFAULT_PREVIEW_SETTINGS,
}: {
  block: ContentBlock
  onEditSection?: (section: DraftSection) => void
  onAddSection?: () => void
  onTogglePageBreak?: (section: DraftSection) => void
  onAddSectionRelative?: (section: DraftSection, position: 'above' | 'below') => void
  onDeleteSection?: (section: DraftSection) => void
  onAiSection?: (section: DraftSection) => void
  pageBySectionId?: ReadonlyMap<string, number>
  typography?: PreviewLayoutSettings
}) {
  const bodyClass = docBodyClass(typography.textAlign)
  const bodyStyle = docBodyStyle(typography)
  switch (block.kind) {
    case 'remark':
      return (
        <section className="border border-slate-400 px-2 py-1.5 text-justify text-[11px] text-slate-700">
          <span className="font-semibold text-slate-500">Remark: </span>
          {block.text}
        </section>
      )
    case 'contentHeading':
      return (
        <div className="flex items-end justify-between gap-2 border-b border-slate-300 pb-1 print:block">
          <h2 className="text-left text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
            Document Content
          </h2>
          {onAddSection ? (
            <button
              type="button"
              className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 hover:underline print:hidden"
              onClick={onAddSection}
            >
              + Add Section
            </button>
          ) : null}
        </div>
      )
    case 'toc':
      return (
        <nav
          className="border border-slate-300 bg-slate-50/60 px-3 py-2.5 print:border-slate-400 print:bg-transparent"
          aria-label="Table of Contents"
        >
          <h3 className="mb-2 border-b border-slate-300 pb-1 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-slate-700">
            Table of Contents
          </h3>
          <ul className="m-0 list-none space-y-1 p-0">
            {block.sections.map((section) => {
              const { no, title } = tocEntryLabel(section)
              const pageNo = pageBySectionId?.get(section.id)
              const pad =
                section.level === 1
                  ? 'pl-0'
                  : section.level === 2
                    ? 'pl-3'
                    : section.level === 3
                      ? 'pl-6'
                      : 'pl-9'
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    className={cn(
                      'group flex w-full items-baseline gap-1.5 rounded-sm text-left text-slate-800',
                      'print:pointer-events-none',
                      'hover:bg-amber-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600',
                      pad,
                    )}
                    style={{ lineHeight: typography.lineSpacing }}
                    onClick={() => onEditSection?.(section)}
                    title="Click to edit this section"
                    aria-label={`Edit section ${displaySectionLabel(section)}, page ${pageNo ?? '—'}`}
                  >
                    {no ? (
                      <span
                        className="shrink-0 tabular-nums text-slate-900"
                        style={{
                          fontSize: `${typography.sectionNoSizePx}px`,
                          fontWeight: typography.sectionNoWeight,
                        }}
                      >
                        {no}
                      </span>
                    ) : null}
                    <span
                      className="min-w-0 shrink truncate"
                      style={{
                        fontSize: `${typography.sectionTitleSizePx}px`,
                        fontWeight: typography.sectionTitleWeight,
                        textTransform: typography.sectionTitleCase,
                        letterSpacing: `${typography.sectionTitleTrackingEm}em`,
                      }}
                    >
                      {title || (!no ? 'Untitled' : '')}
                    </span>
                    <span
                      className="mx-1 min-h-[1em] min-w-[1.25rem] flex-1 border-b border-dotted border-slate-400"
                      aria-hidden
                    />
                    {typography.showTocPageNumbers !== false ? (
                      <span
                        className="shrink-0 tabular-nums font-medium text-slate-900"
                        style={{ fontSize: `${typography.sectionTextSizePx}px` }}
                      >
                        {pageNo ?? '—'}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      )
    case 'empty':
      return (
        <div className="space-y-2 print:block">
          <p className="text-left text-sm italic text-slate-500">
            No drafted sections yet.
            {block.hasFile ? ' An uploaded file is attached to this document.' : ''}
          </p>
          {onAddSection ? (
            <button
              type="button"
              className="text-sm font-medium text-amber-800 hover:underline print:hidden"
              onClick={onAddSection}
            >
              Click to add the first section
            </button>
          ) : null}
        </div>
      )
    case 'sectionHeading': {
      const no = block.section.sectionNo.trim()
      const title = block.section.title.trim() || (!no ? 'Untitled' : '')
      const hasBreak = Boolean(block.section.pageBreakBefore)
      return (
        <div
          className={cn(
            'group relative w-full rounded-sm',
            hasBreak && 'border-t-2 border-dashed border-slate-400 pt-2',
            'hover:bg-amber-50/80',
          )}
        >
          {hasBreak ? (
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 print:hidden">
              Page break
            </p>
          ) : null}
          <div className="flex items-baseline gap-2">
            <button
              type="button"
              className={cn(
                'min-w-0 flex-1 rounded-sm text-left text-slate-900',
                'print:pointer-events-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600',
              )}
              style={{ lineHeight: typography.lineSpacing }}
              onClick={() => onEditSection?.(block.section)}
              title="Click to edit this section"
              aria-label={`Edit section ${displaySectionLabel(block.section)}`}
            >
              <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {no ? (
                  <span
                    className="tabular-nums"
                    style={{
                      fontSize: `${typography.sectionNoSizePx}px`,
                      fontWeight: typography.sectionNoWeight,
                    }}
                  >
                    {no}
                  </span>
                ) : null}
                {title ? (
                  <span
                    style={{
                      fontSize: `${typography.sectionTitleSizePx}px`,
                      fontWeight: typography.sectionTitleWeight,
                      textTransform: typography.sectionTitleCase,
                      letterSpacing: `${typography.sectionTitleTrackingEm}em`,
                    }}
                  >
                    {title}
                  </span>
                ) : null}
              </span>
            </button>
            <SectionHoverActions
              section={block.section}
              hasBreak={hasBreak}
              onEditSection={onEditSection}
              onAddSectionRelative={onAddSectionRelative}
              onDeleteSection={onDeleteSection}
              onTogglePageBreak={onTogglePageBreak}
              onAiSection={onAiSection}
            />
          </div>
        </div>
      )
    }
    case 'sectionLead': {
      // Title blank → Section No + body on the same line (no inside first <p>)
      const leadHtml = prependSectionNoToHtml(
        normalizeSectionHtml(block.html),
        block.section.sectionNo,
      )
      const hasBreak = Boolean(block.section.pageBreakBefore)
      return (
        <div
          className={cn(
            'group relative w-full rounded-sm',
            hasBreak && 'border-t-2 border-dashed border-slate-400 pt-2',
            'hover:bg-amber-50/60',
          )}
        >
          {hasBreak ? (
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 print:hidden">
              Page break
            </p>
          ) : null}
          <div className="flex items-start gap-2">
            <button
              type="button"
              className={cn(
                'min-w-0 flex-1 rounded-sm text-left',
                'print:pointer-events-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600',
              )}
              onClick={() => onEditSection?.(block.section)}
              title="Click to edit this section"
              aria-label={`Edit section ${block.section.sectionNo}`}
            >
              <div
                className={bodyClass}
                style={bodyStyle}
                dangerouslySetInnerHTML={{ __html: leadHtml }}
              />
            </button>
            <span className="pt-0.5">
              <SectionHoverActions
                section={block.section}
                hasBreak={hasBreak}
                onEditSection={onEditSection}
                onAddSectionRelative={onAddSectionRelative}
                onDeleteSection={onDeleteSection}
                onTogglePageBreak={onTogglePageBreak}
                onAiSection={onAiSection}
              />
            </span>
          </div>
        </div>
      )
    }
    case 'html':
      return (
        <div
          className={bodyClass}
          style={bodyStyle}
          dangerouslySetInnerHTML={{ __html: normalizeSectionHtml(block.html) }}
        />
      )
    default:
      return null
  }
}

type SectionEditForm = {
  id: string | null
  level: DraftSectionLevel
  sectionNo: string
  title: string
  body: string
}

function SectionEditDialog({
  open,
  docLabel,
  form,
  saving,
  error,
  onChange,
  onOpenChange,
  onSave,
}: {
  open: boolean
  docLabel: string
  form: SectionEditForm
  saving: boolean
  error: string | null
  onChange: (next: SectionEditForm) => void
  onOpenChange: (open: boolean) => void
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent
        layer="stacked"
        overlayClassName={MGMT_A4_PREVIEW_OVERLAY}
        className={MGMT_A4_SECTION_EDIT_DIALOG_CLASS}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-5 py-3 text-white sm:px-6 sm:py-3.5">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative flex flex-row items-center justify-between gap-3 space-y-0 pr-10 text-left">
            <DialogTitle className="shrink-0 text-base font-semibold tracking-tight text-white sm:text-lg">
              {form.id ? 'Edit Section' : 'Add Section'}
            </DialogTitle>
            <p className="min-w-0 truncate text-right text-xs text-stone-300" title={docLabel}>
              {docLabel}
            </p>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-gradient-to-b from-stone-100/80 to-white px-5 py-5 sm:px-6">
          <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-[120px_140px_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="sec-level">Level</Label>
              <select
                id="sec-level"
                className={cn(limsFieldClass, 'flex w-full px-3 text-sm')}
                value={form.level}
                onChange={(e) =>
                  onChange({ ...form, level: Number(e.target.value) as DraftSectionLevel })
                }
              >
                <option value={1}>Level 1</option>
                <option value={2}>Level 2</option>
                <option value={3}>Level 3</option>
                <option value={4}>Level 4</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sec-no">Section No</Label>
              <Input
                id="sec-no"
                value={form.sectionNo}
                onChange={(e) => onChange({ ...form, sectionNo: e.target.value })}
                placeholder="4.1"
                className={limsFieldClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sec-title">Title</Label>
              <Input
                id="sec-title"
                value={form.title}
                onChange={(e) => onChange({ ...form, title: e.target.value })}
                placeholder="Impartiality"
                className={limsFieldClass}
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DraftSectionRichEditor
              id="a4-section-body"
              label="Section Content"
              value={form.body}
              onChange={(html) => onChange({ ...form, body: html })}
              placeholder="Write section content…"
              aiContext={`${docLabel} · ${form.sectionNo} ${form.title}`.trim()}
              fillHeight
            />
          </div>

          {error ? <p className="shrink-0 text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="shrink-0 border-t-2 border-stone-500 bg-stone-50 px-5 py-3 sm:px-6">
          <Button
            type="button"
            size="sm"
            className={cn('h-9', limsPrimaryBtnClass)}
            disabled={saving}
            onClick={onSave}
          >
            {saving ? 'Saving…' : 'Save & Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function packBlocksIntoPages(
  blocks: ContentBlock[],
  heights: Map<string, number>,
  availablePx: number,
  blockGapPx: number,
  breakLevel1Sections = false,
): ContentBlock[][] {
  if (blocks.length === 0) return [[]]

  const pages: ContentBlock[][] = [[]]
  let used = 0

  for (const block of blocks) {
    const h = heights.get(block.id) ?? 24
    const page = pages[pages.length - 1]!
    const sectionBreak =
      (block.kind === 'sectionHeading' || block.kind === 'sectionLead') &&
      (Boolean(block.section.pageBreakBefore) ||
        (breakLevel1Sections && block.section.level === 1))
    const forceBreak = page.length > 0 && sectionBreak

    const need = page.length === 0 ? h : h + blockGapPx

    if (forceBreak || (page.length > 0 && used + need > availablePx)) {
      pages.push([block])
      used = h
      continue
    }

    page.push(block)
    used += need
  }

  return pages
}

function findingTone(severity: LocalReferenceFinding['severity']): string {
  if (severity === 'error') return 'border-red-200 bg-red-50 text-red-900'
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-950'
  return 'border-slate-200 bg-white text-slate-700'
}

function ReferenceCheckReport({ result }: { result: ReferenceCheckResult }) {
  const problems = result.localFindings.filter((f) => f.kind !== 'ok_ref')
  const okRefs = result.localFindings.filter((f) => f.kind === 'ok_ref')

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium">
          Register: {result.catalog.length} docs
        </span>
        <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-800">
          Issues: {problems.length}
        </span>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-900">
          Matched refs: {okRefs.length}
        </span>
      </div>

      {problems.length > 0 ? (
        <ul className="m-0 max-h-40 list-none space-y-1.5 overflow-y-auto p-0">
          {problems.map((f, i) => (
            <li
              key={`${f.mention}-${i}`}
              className={cn('rounded-md border px-2.5 py-1.5 text-[12px] leading-snug', findingTone(f.severity))}
            >
              <span className="font-semibold uppercase tracking-wide">{f.severity}</span>
              {f.sectionLabel ? (
                <span className="text-slate-500"> · {f.sectionLabel}</span>
              ) : null}
              <p className="mt-0.5">{f.detail}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-slate-600">
          Local scan: no missing / obsolete document-number tokens found.
        </p>
      )}

      {result.aiReport ? (
        <div className="space-y-1 border-t border-slate-100 pt-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            AI audit report
          </p>
          <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 px-2.5 py-2 font-sans text-[12px] leading-relaxed text-slate-800">
            {result.aiReport}
          </pre>
        </div>
      ) : null}
    </div>
  )
}

export function ManagementDocumentA4PreviewDialog({
  open,
  row,
  onOpenChange,
  onDraftUpdated,
  autoPrint = false,
}: {
  open: boolean
  row: ManagementDocumentRow | null
  onOpenChange: (open: boolean) => void
  /** Called after AI / section save so parent list + preview stay in sync. */
  onDraftUpdated?: (row: ManagementDocumentRow) => void
  /** When true, open print dialog once pages are ready, then close. */
  autoPrint?: boolean
}) {
  const [letterhead, setLetterhead] = useState<ManagementDocLetterhead | null>(null)
  const [pages, setPages] = useState<ContentBlock[][]>([[]])
  const [pageBySectionId, setPageBySectionId] = useState<Map<string, number>>(
    () => new Map(),
  )
  const [designationByName, setDesignationByName] = useState<Map<string, string>>(
    () => new Map(),
  )
  const [workingRow, setWorkingRow] = useState<ManagementDocumentRow | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiTask, setAiTask] = useState<'chat' | 'format' | 'references'>('chat')
  const [aiMode, setAiMode] = useState<'local' | 'ai'>('ai')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiProgress, setAiProgress] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [referenceResult, setReferenceResult] = useState<ReferenceCheckResult | null>(null)
  const [aiSelectedSectionIds, setAiSelectedSectionIds] = useState<string[]>([])
  const [aiChatMessage, setAiChatMessage] = useState('')
  const [aiAttachedPdfs, setAiAttachedPdfs] = useState<File[]>([])
  const aiPdfInputRef = useRef<HTMLInputElement>(null)
  const autoPrintFiredRef = useRef(false)
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange

  const [sectionEditOpen, setSectionEditOpen] = useState(false)
  const [sectionForm, setSectionForm] = useState<SectionEditForm>({
    id: null,
    level: 1,
    sectionNo: '',
    title: '',
    body: '',
  })
  const [sectionSaving, setSectionSaving] = useState(false)
  const [sectionError, setSectionError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [layoutSettings, setLayoutSettings] =
    useState<PreviewLayoutSettings>(DEFAULT_PREVIEW_SETTINGS)
  /** Edits while Settings dialog is open; applied to preview on Done */
  const [draftLayoutSettings, setDraftLayoutSettings] =
    useState<PreviewLayoutSettings>(DEFAULT_PREVIEW_SETTINGS)

  const coverPageCount = layoutSettings.showCover ? 1 : 0
  const blockGapPx = layoutSettings.blockGapPx

  const measurePageRef = useRef<HTMLElement | null>(null)
  const measureHeaderRef = useRef<HTMLDivElement | null>(null)
  const measureFooterRef = useRef<HTMLElement | null>(null)
  const measureBodyViewportRef = useRef<HTMLDivElement | null>(null)
  const measureBlocksRef = useRef<HTMLDivElement | null>(null)

  const sections = useMemo(() => {
    if (!workingRow) return []
    return parseDraftContent(workingRow.draft_content).sections
  }, [workingRow])

  const blocks = useMemo(() => {
    if (!workingRow) return []
    return buildContentBlocks(sections, workingRow.remark, Boolean(workingRow.file_path), {
      showToc: layoutSettings.showToc,
      showContentHeading: layoutSettings.showContentHeading,
    })
  }, [workingRow, sections, layoutSettings.showToc, layoutSettings.showContentHeading])

  useEffect(() => {
    if (open && row) {
      setWorkingRow(row)
      setAiError(null)
      setAiProgress(null)
      setSectionEditOpen(false)
      setSectionError(null)
      // Migrate previous compact defaults → larger type / tighter spacing
      // and fill any missing page-settings keys from older session state.
      setLayoutSettings((s) => {
        const merged: PreviewLayoutSettings = { ...DEFAULT_PREVIEW_SETTINGS, ...s }
        const needsFontBump =
          merged.sectionTextSizePx === 11 &&
          merged.sectionNoSizePx === 13 &&
          merged.sectionTitleSizePx === 14
        if (!needsFontBump) return merged
        return {
          ...merged,
          sectionTextSizePx: 13,
          sectionNoSizePx: 14,
          sectionTitleSizePx: 15,
          blockGapPx: merged.blockGapPx === 12 ? 2 : merged.blockGapPx,
          paragraphGapEm: merged.paragraphGapEm === 0.35 ? 0.1 : merged.paragraphGapEm,
        }
      })
    }
    if (!open) {
      setPages([[]])
      setPageBySectionId(new Map())
      setAiOpen(false)
      setSectionEditOpen(false)
      setSettingsOpen(false)
      autoPrintFiredRef.current = false
    }
  }, [open, row])

  useEffect(() => {
    if (!open || !autoPrint || !workingRow || !letterhead) return
    if (autoPrintFiredRef.current) return

    let cancelled = false
    let fallbackTimer = 0

    const closeAfterPrint = () => {
      if (fallbackTimer) window.clearTimeout(fallbackTimer)
      onOpenChangeRef.current(false)
    }

    const runPrint = () => {
      if (cancelled || autoPrintFiredRef.current) return
      autoPrintFiredRef.current = true
      window.addEventListener('afterprint', closeAfterPrint, { once: true })
      fallbackTimer = window.setTimeout(closeAfterPrint, 120_000)
      try {
        window.print()
      } catch {
        window.removeEventListener('afterprint', closeAfterPrint)
        if (fallbackTimer) window.clearTimeout(fallbackTimer)
        autoPrintFiredRef.current = false
      }
    }

    // Wait for pagination measure to settle
    const t = window.setTimeout(runPrint, 700)

    return () => {
      cancelled = true
      window.clearTimeout(t)
      if (fallbackTimer) window.clearTimeout(fallbackTimer)
      window.removeEventListener('afterprint', closeAfterPrint)
    }
  }, [open, autoPrint, workingRow?.id, letterhead, pages.length])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const [lh, profiles] = await Promise.all([
          fetchManagementDocLetterhead(),
          fetchActiveUserProfiles(),
        ])
        if (cancelled) return
        setLetterhead(lh)
        const map = new Map<string, string>()
        for (const p of profiles) {
          if (p.name.trim()) map.set(p.name.trim(), p.designation.trim())
        }
        setDesignationByName(map)
      } catch {
        if (!cancelled) {
          setLetterhead({
            headerUrl: null,
            footerUrl: null,
            logoUrl: null,
            nablLogoUrl: null,
            nablScopeQrImageUrl: null,
            nablScopeQrPayload: 'https://nabl-india.org/',
            nablBody: '',
            nablCertificateNo: '',
            labName: '',
            labAddress: '',
            labPhone: '',
            labEmail: '',
            labWebsite: '',
            labType: '',
            contactPerson: '',
            district: '',
            state: '',
            pinCode: '',
            country: '',
          })
          setDesignationByName(new Map())
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const persistFormattedSections = async (nextSections: DraftSection[]) => {
    if (!workingRow) return
    const draft_content = serializeDraftContent({ version: 1, sections: nextSections })
    const { error } = await supabase
      .from('management_documents')
      .update({ draft_content })
      .eq('id', workingRow.id)
    if (error) throw error
    const updated: ManagementDocumentRow = { ...workingRow, draft_content }
    setWorkingRow(updated)
    onDraftUpdated?.(updated)
  }

  const openEditSection = (section: DraftSection) => {
    setSectionForm({
      id: section.id,
      level: section.level,
      sectionNo: section.sectionNo,
      title: section.title,
      body: section.body,
    })
    setSectionError(null)
    setSectionEditOpen(true)
  }

  const openAiForSection = (section: DraftSection) => {
    setAiError(null)
    setAiProgress(null)
    setReferenceResult(null)
    setAiTask('chat')
    setAiChatMessage('')
    setAiAttachedPdfs([])
    setAiSelectedSectionIds([section.id])
    setAiOpen(true)
  }

  const togglePageBreak = async (section: DraftSection) => {
    if (!workingRow) return
    const current = parseDraftContent(workingRow.draft_content).sections
    const next = current.map((s) =>
      s.id === section.id ? { ...s, pageBreakBefore: !s.pageBreakBefore } : s,
    )
    try {
      await persistFormattedSections(next)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to update page break.')
    }
  }

  const addSectionRelative = async (
    section: DraftSection,
    position: 'above' | 'below',
  ) => {
    if (!workingRow) return
    const current = parseDraftContent(workingRow.draft_content).sections
    const index = current.findIndex((s) => s.id === section.id)
    if (index < 0) return

    const created = createEmptySection({
      level: section.level,
      sectionNo: '',
      title: 'New Section',
      body: '',
    })
    const insertAt = position === 'above' ? index : index + 1
    const next = [...current.slice(0, insertAt), created, ...current.slice(insertAt)]

    try {
      await persistFormattedSections(next)
      setSectionForm({
        id: created.id,
        level: created.level,
        sectionNo: created.sectionNo,
        title: created.title,
        body: created.body,
      })
      setSectionError(null)
      setSectionEditOpen(true)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to add section.')
    }
  }

  const deleteSection = async (section: DraftSection) => {
    if (!workingRow) return
    const label = displaySectionLabel(section)
    if (!window.confirm(`Delete section "${label}"? This cannot be undone.`)) return

    const current = parseDraftContent(workingRow.draft_content).sections
    const next = current.filter((s) => s.id !== section.id)
    try {
      await persistFormattedSections(next)
      if (sectionForm.id === section.id) {
        setSectionEditOpen(false)
        setSectionForm({
          id: null,
          level: 1,
          sectionNo: '',
          title: '',
          body: '',
        })
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to delete section.')
    }
  }

  const openAddSection = () => {
    setSectionForm({
      id: null,
      level: 1,
      sectionNo: '',
      title: '',
      body: '',
    })
    setSectionError(null)
    setSectionEditOpen(true)
  }

  const saveSectionEdit = async () => {
    if (!workingRow) return
    if (!sectionForm.title.trim() && !sectionForm.sectionNo.trim()) {
      setSectionError('Section title or section no is required.')
      return
    }
    setSectionSaving(true)
    setSectionError(null)
    try {
      const current = parseDraftContent(workingRow.draft_content).sections
      let next: DraftSection[]
      if (sectionForm.id) {
        next = current.map((s) =>
          s.id === sectionForm.id
            ? {
                ...s,
                level: sectionForm.level,
                sectionNo: sectionForm.sectionNo.trim(),
                title: sectionForm.title.trim() || 'Untitled',
                body: sectionForm.body,
              }
            : s,
        )
      } else {
        next = [
          ...current,
          createEmptySection({
            level: sectionForm.level,
            sectionNo: sectionForm.sectionNo.trim(),
            title: sectionForm.title.trim() || 'Untitled',
            body: sectionForm.body,
          }),
        ]
      }
      await persistFormattedSections(next)
      setSectionEditOpen(false)
    } catch (err) {
      setSectionError(err instanceof Error ? err.message : 'Unable to save section')
    } finally {
      setSectionSaving(false)
    }
  }

  const runFormatImprove = async () => {
    if (!workingRow) return
    const current = parseDraftContent(workingRow.draft_content).sections
    if (current.length === 0) {
      setAiError('No drafted sections to format. Use Create to add content first.')
      return
    }

    const targetIds =
      aiSelectedSectionIds.length > 0
        ? new Set(aiSelectedSectionIds)
        : new Set(current.map((s) => s.id))
    const targets = current.filter((s) => targetIds.has(s.id))
    if (targets.length === 0) {
      setAiError('Select at least one section to format.')
      return
    }

    setAiLoading(true)
    setAiError(null)
    setAiProgress(null)

    try {
      const updatedById = new Map<string, string>()

      for (let i = 0; i < targets.length; i++) {
        const section = targets[i]!
        setAiProgress(`Formatting section ${i + 1} of ${targets.length}…`)

        let body = section.body.trim()
        if (!body) {
          updatedById.set(section.id, section.body)
          continue
        }

        if (aiMode === 'local') {
          body = normalizeSectionHtml(body)
        } else {
          const { reply } = await sendQiAssistantMessage({
            page: 'management-docs/a4-format',
            message: buildDocumentFormatAiPrompt({
              docNumber: workingRow.doc_number,
              title: workingRow.title,
              sectionLabel: displaySectionLabel(section),
              sectionNo: section.sectionNo,
              sectionTitle: section.title,
              bodyHtml: body,
            }),
            context: `Format HTML for section only (${workingRow.doc_number}). Do not change letterhead, footer, or cover. Reply with HTML only.`,
            history: [],
          })
          body = normalizeSectionHtml(extractSectionHtmlFromAiReply(reply, body))
        }

        updatedById.set(section.id, body)
      }

      const next = current.map((s) =>
        updatedById.has(s.id) ? { ...s, body: updatedById.get(s.id)! } : s,
      )
      await persistFormattedSections(next)
      setAiOpen(false)
      setAiProgress(null)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Formatting failed.')
    } finally {
      setAiLoading(false)
    }
  }

  const runReferenceCheck = async () => {
    if (!workingRow) return
    const current = parseDraftContent(workingRow.draft_content).sections
    if (current.length === 0) {
      setAiError('No drafted sections to check. Add content first.')
      return
    }

    setAiLoading(true)
    setAiError(null)
    setAiProgress('Loading document register from the system…')
    setReferenceResult(null)

    try {
      const catalog = await fetchManagementDocCatalog(workingRow.id)
      setAiProgress(`Scanning references against ${catalog.length} system documents…`)

      const localFindings = scanLocalReferences(
        current,
        catalog,
        workingRow.doc_number,
      )

      setAiProgress('Asking QI Assistant to audit cross-document consistency…')
      const meta = rowToCatalogMeta(workingRow)
      const { reply } = await sendQiAssistantMessage({
        page: 'management-docs/a4-reference-check',
        message: buildReferenceCheckAiPrompt({
          ...meta,
          labName: letterhead?.labName ?? '',
          catalogText: formatCatalogForPrompt(catalog),
          localFindingsText: formatLocalFindingsForPrompt(localFindings),
          documentOutline: documentPlainOutline(current),
        }),
        context: `Reference check for ${workingRow.doc_number} — ${workingRow.title}. Catalog size: ${catalog.length}.`,
        history: [],
      })

      setReferenceResult({
        catalog,
        localFindings,
        aiReport: reply.trim() || null,
      })
      setAiProgress(null)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Reference check failed.')
      setAiProgress(null)
    } finally {
      setAiLoading(false)
    }
  }

  const toggleAiSection = (sectionId: string) => {
    setAiSelectedSectionIds((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId],
    )
  }

  const addAiPdfs = (fileList: FileList | null) => {
    if (!fileList?.length) return
    const next: File[] = []
    const errors: string[] = []
    Array.from(fileList).forEach((file) => {
      try {
        validateAssistantPdfFile(file)
        next.push(file)
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `${file.name} rejected`)
      }
    })
    if (errors.length) setAiError(errors.join(' · '))
    else setAiError(null)
    if (next.length) {
      setAiAttachedPdfs((prev) => {
        const names = new Set(prev.map((f) => `${f.name}:${f.size}`))
        const merged = [...prev]
        for (const f of next) {
          const key = `${f.name}:${f.size}`
          if (!names.has(key)) {
            names.add(key)
            merged.push(f)
          }
        }
        return merged
      })
    }
  }

  /** Draft/update ONE draft section from chat + attached PDFs — never whole manual / letterhead / footer / cover. */
  const runSectionChat = async () => {
    if (!workingRow) return
    const message = aiChatMessage.trim()
    const hasPdfs = aiAttachedPdfs.length > 0
    if (!message && !hasPdfs) {
      setAiError('Attach a PDF and/or enter Chat Message for this section update.')
      return
    }

    const current = parseDraftContent(workingRow.draft_content).sections
    if (current.length === 0) {
      setAiError('No draft sections found. Add a section before updating.')
      return
    }

    const sectionId = aiSelectedSectionIds[0]
    if (!sectionId) {
      setAiError('Select one section to update.')
      return
    }
    const section = current.find((s) => s.id === sectionId)
    if (!section) {
      setAiError('Selected section was not found. Re-open AI and try again.')
      return
    }

    const effectiveMessage =
      message ||
      'Draft or update this section using the attached reference document(s). Align with the section title and ISO/IEC 17025 controlled-document style.'

    setAiLoading(true)
    setAiError(null)
    setAiProgress(null)

    try {
      const pdfNames = aiAttachedPdfs.map((f) => f.name)

      setAiProgress('Loading Level 1–4 document register…')
      const catalog = await fetchManagementDocCatalog(workingRow.id)
      const catalogText = formatCatalogForPrompt(catalog)

      setAiProgress(`Updating section: ${displaySectionLabel(section)}…`)

      const { reply } = await sendQiAssistantMessage({
        page: 'management-docs/a4-section-chat',
        message: buildSectionChatAiPrompt({
          docNumber: workingRow.doc_number,
          title: workingRow.title,
          sectionLabel: displaySectionLabel(section),
          sectionNo: section.sectionNo,
          sectionTitle: section.title,
          bodyHtml: section.body || '<p></p>',
          userMessage: effectiveMessage,
          pdfFileNames: pdfNames,
          catalogText,
        }),
        context: [
          'SCOPE: Draft/update ONLY this one section body HTML — not the whole manual.',
          `Target section: ${displaySectionLabel(section)}.`,
          'Do not modify letterhead, footer, cover page, or other sections.',
          `Document ${workingRow.doc_number} — ${workingRow.title}`,
          hasPdfs
            ? `Use attached PDF(s) as source material: ${pdfNames.join(', ')}.`
            : 'No PDFs — follow the chat message only.',
          `Register size: ${catalog.length} (Level 1–4). Use only those Doc Nos/Titles.`,
        ].join('\n'),
        attachedPdfs: hasPdfs ? aiAttachedPdfs : undefined,
        history: [],
      })

      const nextBody = normalizeSectionHtml(
        extractSectionHtmlFromAiReply(reply, section.body || '<p></p>'),
      )
      const next = current.map((s) => (s.id === section.id ? { ...s, body: nextBody } : s))
      await persistFormattedSections(next)
      setAiProgress(null)
      setAiChatMessage('')
      setAiAttachedPdfs([])
      setAiOpen(false)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Section update failed.')
      setAiProgress(null)
    } finally {
      setAiLoading(false)
    }
  }

  useLayoutEffect(() => {
    if (!open || !workingRow || !letterhead || blocks.length === 0) return

    const recalc = () => {
      const bodyViewport = measureBodyViewportRef.current
      const blocksRoot = measureBlocksRef.current
      if (!bodyViewport || !blocksRoot) return

      const style = getComputedStyle(bodyViewport)
      const padTop = Number.parseFloat(style.paddingTop) || 0
      const padBottom = Number.parseFloat(style.paddingBottom) || 0
      const available = Math.max(
        80,
        Math.floor(bodyViewport.clientHeight - padTop - padBottom),
      )

      const heights = new Map<string, number>()
      blocksRoot.querySelectorAll<HTMLElement>('[data-block-id]').forEach((el) => {
        const id = el.dataset.blockId
        if (!id) return
        heights.set(id, Math.ceil(el.getBoundingClientRect().height))
      })

      const packed = packBlocksIntoPages(
        blocks,
        heights,
        available,
        blockGapPx,
        layoutSettings.breakLevel1Sections,
      )
      setPages(packed)
      const nextPageMap = buildSectionPageMap(packed, coverPageCount)
      setPageBySectionId((prev) => {
        if (
          prev.size === nextPageMap.size &&
          [...nextPageMap.entries()].every(([id, page]) => prev.get(id) === page)
        ) {
          return prev
        }
        return nextPageMap
      })
    }

    const raf = requestAnimationFrame(() => {
      recalc()
      requestAnimationFrame(recalc)
    })

    const ro = new ResizeObserver(() => recalc())
    if (measurePageRef.current) ro.observe(measurePageRef.current)
    if (measureBlocksRef.current) ro.observe(measureBlocksRef.current)

    const imgs = measureHeaderRef.current?.querySelectorAll('img') ?? []
    const onImg = () => recalc()
    imgs.forEach((img) => {
      if (!img.complete) img.addEventListener('load', onImg)
    })

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      imgs.forEach((img) => img.removeEventListener('load', onImg))
    }
  }, [
    open,
    workingRow,
    letterhead,
    blocks,
    blockGapPx,
    coverPageCount,
    layoutSettings.lineSpacing,
    layoutSettings.paragraphGapEm,
    layoutSettings.textAlign,
    layoutSettings.sectionNoSizePx,
    layoutSettings.sectionTitleSizePx,
    layoutSettings.sectionTextSizePx,
    layoutSettings.sectionNoWeight,
    layoutSettings.sectionTitleWeight,
    layoutSettings.sectionTitleCase,
    layoutSettings.sectionTitleTrackingEm,
    layoutSettings.sectionTextWeight,
    layoutSettings.sectionTextTrackingEm,
    layoutSettings.sectionTextFirstLineIndentEm,
    layoutSettings.showTocPageNumbers,
    layoutSettings.showLetterhead,
    layoutSettings.showPageFooter,
    layoutSettings.showPageNumbers,
    layoutSettings.marginXMm,
    layoutSettings.marginTopMm,
    layoutSettings.bodyPadYPx,
    layoutSettings.breakLevel1Sections,
    layoutSettings.pageOrientation,
  ])

  if (!workingRow) return null

  const lh = letterhead
  const pageCount = Math.max(1, pages.length) + coverPageCount
  const { widthMm: pageWidthMm, heightMm: pageHeightMm } = pageDimensionsMm(
    layoutSettings.pageOrientation,
  )
  const pageBoxStyle: CSSProperties = {
    width: `${pageWidthMm}mm`,
    maxWidth: `${pageWidthMm}mm`,
    height: `${pageHeightMm}mm`,
  }
  const pagePadX = `${layoutSettings.marginXMm}mm`
  const pagePadTop = `${layoutSettings.marginTopMm}mm`
  const bodyPadY = `${layoutSettings.bodyPadYPx}px`
  const headerPadStyle: CSSProperties = {
    paddingLeft: pagePadX,
    paddingRight: pagePadX,
    paddingTop: pagePadTop,
  }
  const bodyPadStyle: CSSProperties = {
    paddingLeft: pagePadX,
    paddingRight: pagePadX,
    paddingTop: bodyPadY,
    paddingBottom: bodyPadY,
  }
  const pageLabelFor = (n: number) =>
    layoutSettings.showPageNumbers ? `${n} of ${pageCount}` : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        data-mgmt-a4-preview=""
        overlayClassName={MGMT_A4_PREVIEW_OVERLAY}
        className={MGMT_A4_PREVIEW_DIALOG_CLASS}
      >
        <style>{`
          @media print {
            @page {
              size: A4 ${layoutSettings.pageOrientation};
              margin: 0;
            }

            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            /* Hide non-page UI (still in layout) */
            body * {
              visibility: hidden !important;
            }
            [data-mgmt-a4-pages],
            [data-mgmt-a4-pages] * {
              visibility: visible !important;
            }

            [data-radix-dialog-overlay],
            [data-mgmt-a4-measure] {
              display: none !important;
            }

            /* Pull pages to the printable origin (avoids blank pages from hidden chrome) */
            [data-mgmt-a4-pages] {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: ${pageWidthMm}mm !important;
              max-width: ${pageWidthMm}mm !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
              display: block !important;
            }

            /* Un-clip fixed dialog / portal wrappers */
            body,
            #root,
            [data-radix-portal],
            div.fixed.inset-0,
            [data-mgmt-a4-preview] {
              overflow: visible !important;
              height: auto !important;
              max-height: none !important;
              position: static !important;
              inset: auto !important;
              transform: none !important;
              background: transparent !important;
            }

            [data-mgmt-a4-preview] {
              display: block !important;
              width: auto !important;
              padding: 0 !important;
              margin: 0 !important;
              border: none !important;
              box-shadow: none !important;
            }

            [data-mgmt-a4-page] {
              display: flex !important;
              flex-direction: column !important;
              box-sizing: border-box !important;
              width: ${pageWidthMm}mm !important;
              height: ${pageHeightMm}mm !important;
              max-width: ${pageWidthMm}mm !important;
              max-height: ${pageHeightMm}mm !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
              box-shadow: none !important;
              background: #fff !important;
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }

            [data-mgmt-a4-page]:last-child {
              page-break-after: auto !important;
              break-after: auto !important;
            }

            [data-mgmt-a4-page] > div.min-h-0.flex-1 {
              overflow: hidden !important;
              flex: 1 1 auto !important;
              min-height: 0 !important;
            }
          }
        `}</style>

        <div className="relative flex shrink-0 items-center justify-between gap-3 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white print:hidden sm:px-6 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative min-w-0 flex-1 text-left">
            <DialogTitle className="truncate text-base font-semibold tracking-tight text-white sm:text-lg">
              {workingRow.doc_number} — {workingRow.title}
            </DialogTitle>
          </DialogHeader>
          <div className="relative flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn('h-8 gap-1.5 text-xs', limsDarkBarBtnClass)}
              onClick={() => {
                setDraftLayoutSettings(layoutSettings)
                setSettingsOpen(true)
              }}
              aria-label="Preview layout settings"
            >
              <Settings2 size={14} />
              Settings
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn('h-8 gap-1.5 text-xs', limsDarkBarBtnClass)}
              onClick={() => {
                setAiError(null)
                setAiProgress(null)
                setReferenceResult(null)
                setAiTask('chat')
                setAiChatMessage('')
                setAiAttachedPdfs([])
                // One section only — keep current single selection, else none (user picks in dialog)
                setAiSelectedSectionIds((prev) => (prev.length === 1 ? prev : []))
                setAiOpen(true)
              }}
              aria-label="AI update section"
            >
              <Sparkles size={14} />
              AI
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn('h-8 gap-1.5 text-xs', limsDarkBarBtnClass)}
              onClick={() => window.print()}
            >
              <Printer size={14} />
              Print
            </Button>
            <DialogClose
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border !border-red-600 !bg-red-600 !text-white shadow-sm transition-colors hover:!border-red-700 hover:!bg-red-700 hover:!text-white focus:outline-none focus:ring-2 focus:!ring-red-500 focus:ring-offset-2"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5 !text-white" strokeWidth={2.75} aria-hidden />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-stone-50 px-3 py-4 sm:px-6 sm:py-6 print:overflow-visible print:bg-white print:p-0">
          {/* Measure: full block list at real page content width */}
          {lh ? (
            <article
              ref={measurePageRef}
              data-mgmt-a4-measure
              aria-hidden
              className={cn(
                A4_PAGE_CLASS,
                'pointer-events-none absolute left-[-10000px] top-0 opacity-0',
              )}
              style={pageBoxStyle}
            >
              <div
                ref={measureHeaderRef}
                className="shrink-0"
                style={layoutSettings.showLetterhead ? headerPadStyle : undefined}
              >
                {layoutSettings.showLetterhead ? (
                  <DocumentLetterhead
                    lh={lh}
                    row={workingRow}
                    pageLabel={pageLabelFor(1) || '1 of 1'}
                  />
                ) : null}
              </div>
              <div
                ref={measureBodyViewportRef}
                className="relative min-h-0 flex-1 overflow-hidden"
                style={bodyPadStyle}
              >
                <div ref={measureBlocksRef} className="flex flex-col" style={{ gap: blockGapPx }}>
                  {blocks.map((block) => (
                    <div key={block.id} data-block-id={block.id}>
                      <ContentBlockView
                        block={block}
                        pageBySectionId={pageBySectionId}
                        typography={layoutSettings}
                      />
                    </div>
                  ))}
                </div>
              </div>
              {layoutSettings.showPageFooter ? (
                <DocumentPageFooter
                  ref={measureFooterRef}
                  row={workingRow}
                  designationByName={designationByName}
                />
              ) : (
                <footer ref={measureFooterRef} className="h-0 overflow-hidden" aria-hidden />
              )}
            </article>
          ) : null}

          <div
            data-mgmt-a4-pages
            className="mx-auto flex w-full flex-col"
            style={{ maxWidth: `${pageWidthMm}mm` }}
          >
            {lh ? (
              <>
                {layoutSettings.showCover ? (
                  <article
                    data-mgmt-a4-page
                    data-mgmt-a4-cover
                    className={cn(A4_PAGE_CLASS, 'mb-6 print:mb-0')}
                    style={pageBoxStyle}
                  >
                    {layoutSettings.showLetterhead ? (
                      <div className="shrink-0" style={headerPadStyle}>
                        <DocumentLetterhead
                          lh={lh}
                          row={workingRow}
                          pageLabel={pageLabelFor(1)}
                        />
                      </div>
                    ) : null}
                    <div className="min-h-0 flex-1 overflow-hidden" style={bodyPadStyle}>
                      <DocumentCoverBody lh={lh} row={workingRow} />
                    </div>
                    {layoutSettings.showPageFooter ? (
                      <DocumentPageFooter row={workingRow} designationByName={designationByName} />
                    ) : null}
                  </article>
                ) : null}

                {pages.map((pageBlocks, pageIndex) => (
                  <article
                    key={pageIndex}
                    data-mgmt-a4-page
                    className={cn(
                      A4_PAGE_CLASS,
                      pageIndex < pages.length - 1 && 'mb-6 print:mb-0',
                    )}
                    style={pageBoxStyle}
                  >
                    {layoutSettings.showLetterhead ? (
                      <div className="shrink-0" style={headerPadStyle}>
                        <DocumentLetterhead
                          lh={lh}
                          row={workingRow}
                          pageLabel={pageLabelFor(pageIndex + 1 + coverPageCount)}
                        />
                      </div>
                    ) : null}

                    <div className="min-h-0 flex-1 overflow-hidden" style={bodyPadStyle}>
                      <div className="flex flex-col" style={{ gap: blockGapPx }}>
                        {pageBlocks.map((block) => (
                          <div key={block.id}>
                            <ContentBlockView
                              block={block}
                              onEditSection={openEditSection}
                              onAddSection={openAddSection}
                              onTogglePageBreak={(section) => void togglePageBreak(section)}
                              onAddSectionRelative={(section, position) =>
                                void addSectionRelative(section, position)
                              }
                              onDeleteSection={(section) => void deleteSection(section)}
                              onAiSection={openAiForSection}
                              pageBySectionId={pageBySectionId}
                              typography={layoutSettings}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {layoutSettings.showPageFooter ? (
                      <DocumentPageFooter row={workingRow} designationByName={designationByName} />
                    ) : null}
                  </article>
                ))}
              </>
            ) : (
              <div
                className={cn(A4_PAGE_CLASS, 'animate-pulse bg-slate-100')}
                style={pageBoxStyle}
              />
            )}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t-2 border-stone-500 bg-stone-50 px-4 py-3 print:hidden sm:px-6">
          <Button
            type="button"
            size="sm"
            className={cn('h-9', limsPrimaryBtnClass)}
            onClick={() => onOpenChange(false)}
          >
            Save & Close
          </Button>
        </div>

        {/* Preview layout settings */}
        <Dialog
          open={settingsOpen}
          onOpenChange={(next) => {
            if (!next) {
              setSettingsOpen(false)
              return
            }
            setDraftLayoutSettings(layoutSettings)
            setSettingsOpen(true)
          }}
        >
          <DialogContent
            layer="nested"
            overlayClassName={MGMT_A4_PREVIEW_OVERLAY}
            className={MGMT_A4_NESTED_DIALOG_CLASS}
          >
            <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-5 py-3.5 text-white">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={limsDarkBarGlowStyle}
              />
              <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
              <DialogHeader className="relative pr-10 text-left">
                <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                  Preview Settings
                </DialogTitle>
              </DialogHeader>
            </div>

            <div className="max-h-[min(72vh,640px)] space-y-4 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-5 py-5">
              {/* Page settings — layout, margins, chrome & structure */}
              <section className="space-y-2.5 rounded-none border-2 border-stone-500 bg-white p-3.5 ring-1 ring-amber-700/15">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-stone-700">
                    Page settings
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="preview-page-layout" className="text-[11px] text-stone-500">
                      Page layout
                    </Label>
                    <Select
                      value={draftLayoutSettings.pageOrientation}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          pageOrientation: value as PageOrientation,
                        }))
                      }
                    >
                      <SelectTrigger id="preview-page-layout" className={cn(limsFieldClass, 'bg-white')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_ORIENTATION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="preview-margin-x" className="text-[11px] text-stone-500">
                      Side margins
                    </Label>
                    <Select
                      value={String(draftLayoutSettings.marginXMm)}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          marginXMm: Number(value),
                        }))
                      }
                    >
                      <SelectTrigger id="preview-margin-x" className={cn(limsFieldClass, 'bg-white')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MARGIN_X_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="preview-margin-top" className="text-[11px] text-stone-500">
                      Top margin
                    </Label>
                    <Select
                      value={String(draftLayoutSettings.marginTopMm)}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          marginTopMm: Number(value),
                        }))
                      }
                    >
                      <SelectTrigger id="preview-margin-top" className={cn(limsFieldClass, 'bg-white')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MARGIN_TOP_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="preview-body-pad" className="text-[11px] text-stone-500">
                      Body padding
                    </Label>
                    <Select
                      value={String(draftLayoutSettings.bodyPadYPx)}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          bodyPadYPx: Number(value),
                        }))
                      }
                    >
                      <SelectTrigger id="preview-body-pad" className={cn(limsFieldClass, 'bg-white')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BODY_PAD_Y_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    [
                      ['showCover', 'Cover Page', 'First page with lab + control details'],
                      ['showToc', 'Table of Contents', 'Section index before body'],
                      ['showContentHeading', 'Content header', 'Document Content bar + Add Section'],
                      ['showTocPageNumbers', 'TOC page nos.', 'Show page numbers in TOC rows'],
                      ['showLetterhead', 'Letterhead', 'Lab header block on every page'],
                      ['showPageFooter', 'Page footer', 'Prepared / Reviewed / Approved strip'],
                      ['showPageNumbers', 'Page numbers', 'Show n of N in the letterhead'],
                      [
                        'breakLevel1Sections',
                        'Break L1 sections',
                        'Each Level-1 clause starts on a new page',
                      ],
                    ] as const
                  ).map(([key, label, hint]) => (
                    <button
                      key={key}
                      type="button"
                      className={cn(
                        'rounded-none border px-2.5 py-2 text-left text-sm transition-colors',
                        draftLayoutSettings[key]
                          ? 'border-amber-700 bg-amber-50 text-amber-950 ring-1 ring-amber-700/30'
                          : 'border-stone-500 bg-stone-50 text-stone-800 hover:bg-white',
                      )}
                      onClick={() =>
                        setDraftLayoutSettings((s) => ({ ...s, [key]: !s[key] }))
                      }
                      aria-pressed={draftLayoutSettings[key]}
                      title={hint}
                    >
                      <span className="block text-[13px] font-medium leading-tight">{label}</span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-stone-500">
                        {draftLayoutSettings[key] ? 'On' : 'Off'} · {hint}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Section Title */}
              <section className="space-y-2.5 rounded-none border-2 border-stone-500 bg-white p-3.5 ring-1 ring-amber-700/15">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-stone-700">
                    Section Title
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  <div className="min-w-0 space-y-1.5">
                    <Label
                      htmlFor="preview-section-title-size"
                      className="text-[11px] text-stone-500"
                    >
                      Title size
                    </Label>
                    <Select
                      value={String(draftLayoutSettings.sectionTitleSizePx)}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          sectionTitleSizePx: Number(value),
                        }))
                      }
                    >
                      <SelectTrigger
                        id="preview-section-title-size"
                        className={cn(limsFieldClass, 'bg-white')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SECTION_TITLE_SIZE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label
                      htmlFor="preview-section-title-weight"
                      className="text-[11px] text-stone-500"
                    >
                      Title weight
                    </Label>
                    <Select
                      value={String(draftLayoutSettings.sectionTitleWeight)}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          sectionTitleWeight: Number(value),
                        }))
                      }
                    >
                      <SelectTrigger
                        id="preview-section-title-weight"
                        className={cn(limsFieldClass, 'bg-white')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_WEIGHT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label
                      htmlFor="preview-section-title-case"
                      className="text-[11px] text-stone-500"
                    >
                      Title case
                    </Label>
                    <Select
                      value={draftLayoutSettings.sectionTitleCase}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          sectionTitleCase: value as SectionTitleCase,
                        }))
                      }
                    >
                      <SelectTrigger
                        id="preview-section-title-case"
                        className={cn(limsFieldClass, 'bg-white')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SECTION_TITLE_CASE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label
                      htmlFor="preview-section-title-tracking"
                      className="text-[11px] text-stone-500"
                    >
                      Letter spacing
                    </Label>
                    <Select
                      value={String(draftLayoutSettings.sectionTitleTrackingEm)}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          sectionTitleTrackingEm: Number(value),
                        }))
                      }
                    >
                      <SelectTrigger
                        id="preview-section-title-tracking"
                        className={cn(limsFieldClass, 'bg-white')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SECTION_TITLE_TRACKING_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="preview-section-no-size" className="text-[11px] text-stone-500">
                      Section No size
                    </Label>
                    <Select
                      value={String(draftLayoutSettings.sectionNoSizePx)}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          sectionNoSizePx: Number(value),
                        }))
                      }
                    >
                      <SelectTrigger
                        id="preview-section-no-size"
                        className={cn(limsFieldClass, 'bg-white')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SECTION_NO_SIZE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label
                      htmlFor="preview-section-no-weight"
                      className="text-[11px] text-stone-500"
                    >
                      Section No weight
                    </Label>
                    <Select
                      value={String(draftLayoutSettings.sectionNoWeight)}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          sectionNoWeight: Number(value),
                        }))
                      }
                    >
                      <SelectTrigger
                        id="preview-section-no-weight"
                        className={cn(limsFieldClass, 'bg-white')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_WEIGHT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              {/* Section Text */}
              <section className="space-y-2.5 rounded-none border-2 border-stone-500 bg-white p-3.5 ring-1 ring-amber-700/15">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-stone-700">
                    Section Text
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  <div className="min-w-0 space-y-1.5">
                    <Label
                      htmlFor="preview-section-text-size"
                      className="text-[11px] text-stone-500"
                    >
                      Font size
                    </Label>
                    <Select
                      value={String(draftLayoutSettings.sectionTextSizePx)}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          sectionTextSizePx: Number(value),
                        }))
                      }
                    >
                      <SelectTrigger
                        id="preview-section-text-size"
                        className={cn(limsFieldClass, 'bg-white')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SECTION_TEXT_SIZE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label
                      htmlFor="preview-section-text-weight"
                      className="text-[11px] text-stone-500"
                    >
                      Font weight
                    </Label>
                    <Select
                      value={String(draftLayoutSettings.sectionTextWeight)}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          sectionTextWeight: Number(value),
                        }))
                      }
                    >
                      <SelectTrigger
                        id="preview-section-text-weight"
                        className={cn(limsFieldClass, 'bg-white')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_WEIGHT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="preview-text-align" className="text-[11px] text-stone-500">
                      Alignment
                    </Label>
                    <Select
                      value={draftLayoutSettings.textAlign}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          textAlign: value as TextAlign,
                        }))
                      }
                    >
                      <SelectTrigger
                        id="preview-text-align"
                        className={cn(limsFieldClass, 'bg-white')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEXT_ALIGN_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="preview-line-spacing" className="text-[11px] text-stone-500">
                      Line spacing
                    </Label>
                    <Select
                      value={String(draftLayoutSettings.lineSpacing)}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          lineSpacing: Number(value),
                        }))
                      }
                    >
                      <SelectTrigger
                        id="preview-line-spacing"
                        className={cn(limsFieldClass, 'bg-white')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LINE_SPACING_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="preview-para-gap" className="text-[11px] text-stone-500">
                      Paragraph gap
                    </Label>
                    <Select
                      value={String(draftLayoutSettings.paragraphGapEm)}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          paragraphGapEm: Number(value),
                        }))
                      }
                    >
                      <SelectTrigger
                        id="preview-para-gap"
                        className={cn(limsFieldClass, 'bg-white')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PARAGRAPH_GAP_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label
                      htmlFor="preview-section-text-tracking"
                      className="text-[11px] text-stone-500"
                    >
                      Letter spacing
                    </Label>
                    <Select
                      value={String(draftLayoutSettings.sectionTextTrackingEm)}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          sectionTextTrackingEm: Number(value),
                        }))
                      }
                    >
                      <SelectTrigger
                        id="preview-section-text-tracking"
                        className={cn(limsFieldClass, 'bg-white')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SECTION_TEXT_TRACKING_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label
                      htmlFor="preview-section-text-indent"
                      className="text-[11px] text-stone-500"
                    >
                      First-line indent
                    </Label>
                    <Select
                      value={String(draftLayoutSettings.sectionTextFirstLineIndentEm)}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          sectionTextFirstLineIndentEm: Number(value),
                        }))
                      }
                    >
                      <SelectTrigger
                        id="preview-section-text-indent"
                        className={cn(limsFieldClass, 'bg-white')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SECTION_TEXT_INDENT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="preview-block-gap" className="text-[11px] text-stone-500">
                      Block gap
                    </Label>
                    <Select
                      value={String(draftLayoutSettings.blockGapPx)}
                      onValueChange={(value) =>
                        setDraftLayoutSettings((s) => ({
                          ...s,
                          blockGapPx: Number(value),
                        }))
                      }
                    >
                      <SelectTrigger
                        id="preview-block-gap"
                        className={cn(limsFieldClass, 'bg-white')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BLOCK_GAP_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>
            </div>

            <DialogFooter className="border-t-2 border-stone-500 bg-stone-50 px-5 py-3 sm:justify-end">
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn('h-9', limsOutlineBtnClass)}
                  onClick={() => setSettingsOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={cn('h-9', limsPrimaryBtnClass)}
                  onClick={() => {
                    setLayoutSettings(draftLayoutSettings)
                    setSettingsOpen(false)
                  }}
                >
                  Done
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* AI section chat / format / reference check */}
        <Dialog open={aiOpen} onOpenChange={(o) => !aiLoading && setAiOpen(o)}>
          <DialogContent
            layer="nested"
            aria-describedby={undefined}
            overlayClassName={MGMT_A4_PREVIEW_OVERLAY}
            className={cn(MGMT_A4_NESTED_DIALOG_CLASS, 'max-w-xl')}
          >
            <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-5 py-3.5 text-white">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={limsDarkBarGlowStyle}
              />
              <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
              <DialogHeader className="relative pr-10 text-left">
                <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                  Document AI Tools
                </DialogTitle>
              </DialogHeader>
            </div>
            <div className="max-h-[min(72vh,620px)] space-y-4 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-5 py-5">
              {aiTask === 'chat' ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="a4-ai-section" className="text-xs font-medium text-slate-600">
                      Section
                    </Label>
                    <Select
                      value={aiSelectedSectionIds[0] ?? ''}
                      onValueChange={(id) => {
                        setAiSelectedSectionIds(id ? [id] : [])
                        setAiError(null)
                      }}
                      disabled={aiLoading || sections.length === 0}
                    >
                      <SelectTrigger id="a4-ai-section" className={cn(limsFieldClass, 'bg-white')}>
                        <SelectValue
                          placeholder={
                            sections.length === 0 ? 'No sections yet' : 'Select section…'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="z-[80]">
                        {sections.map((section) => (
                          <SelectItem key={section.id} value={section.id}>
                            {displaySectionLabel(section)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">
                      Attach the File
                    </Label>
                    <input
                      ref={aiPdfInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        addAiPdfs(e.target.files)
                        e.target.value = ''
                      }}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={aiLoading}
                        onClick={() => aiPdfInputRef.current?.click()}
                      >
                        <Paperclip size={14} />
                        Add PDF
                      </Button>
                    </div>
                    {aiAttachedPdfs.length > 0 ? (
                      <ul className="m-0 space-y-1 p-0">
                        {aiAttachedPdfs.map((f) => (
                          <li
                            key={`${f.name}-${f.size}`}
                            className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-700"
                          >
                            <span className="min-w-0 truncate">{f.name}</span>
                            <button
                              type="button"
                              className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                              aria-label={`Remove ${f.name}`}
                              disabled={aiLoading}
                              onClick={() =>
                                setAiAttachedPdfs((prev) =>
                                  prev.filter((x) => !(x.name === f.name && x.size === f.size)),
                                )
                              }
                            >
                              <X size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="a4-ai-chat" className="text-xs font-medium text-slate-600">
                      Chat Message
                    </Label>
                    <Textarea
                      id="a4-ai-chat"
                      value={aiChatMessage}
                      onChange={(e) => setAiChatMessage(e.target.value)}
                      disabled={aiLoading}
                      className="min-h-[100px] resize-y bg-white text-sm"
                    />
                  </div>
                </div>
              ) : null}

              {aiTask === 'format' ? (
                <div className="space-y-2">
                  <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-600">
                    Formats <strong>section body HTML only</strong> (not letterhead / footer /
                    cover). Optionally limit to selected sections below.
                  </p>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">
                      Sections to format
                    </Label>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 w-full justify-between bg-white font-normal"
                          disabled={aiLoading || sections.length === 0}
                        >
                          <span className="truncate">
                            {aiSelectedSectionIds.length === 0
                              ? 'Select section(s)…'
                              : aiSelectedSectionIds.length === sections.length
                                ? `All sections (${sections.length})`
                                : `${aiSelectedSectionIds.length} section(s) selected`}
                          </span>
                          <span className="text-slate-400">▾</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="z-[80] max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
                        onCloseAutoFocus={(e) => e.preventDefault()}
                      >
                        {sections.map((section) => (
                          <DropdownMenuCheckboxItem
                            key={section.id}
                            checked={aiSelectedSectionIds.includes(section.id)}
                            onCheckedChange={() => toggleAiSection(section.id)}
                            onSelect={(e) => e.preventDefault()}
                          >
                            {displaySectionLabel(section)}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Label className="text-xs font-medium text-stone-600">Format mode</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={aiLoading}
                      className={cn(
                        'rounded-none border px-3 py-2 text-left text-sm transition-colors',
                        aiMode === 'ai'
                          ? 'border-amber-700 bg-amber-50 text-amber-950 ring-1 ring-amber-700/30'
                          : 'border-stone-500 bg-white text-stone-800 hover:bg-stone-50',
                      )}
                      onClick={() => setAiMode('ai')}
                    >
                      <span className="font-medium">AI Format</span>
                      <span className="mt-0.5 block text-[11px] text-stone-500">
                        Deep rewrite via QI Assistant
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={aiLoading}
                      className={cn(
                        'rounded-none border px-3 py-2 text-left text-sm transition-colors',
                        aiMode === 'local'
                          ? 'border-amber-700 bg-amber-50 text-amber-950 ring-1 ring-amber-700/30'
                          : 'border-stone-500 bg-white text-stone-800 hover:bg-stone-50',
                      )}
                      onClick={() => setAiMode('local')}
                    >
                      <span className="font-medium">Quick Clean</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        Local lists cleanup
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}

              {aiTask === 'references' ? (
                <div className="space-y-2">
                  <p className="text-sm text-slate-600">
                    Read-only audit against the Management Documents register. Does not change
                    letterhead, footer, cover, or section HTML.
                  </p>
                  {referenceResult ? <ReferenceCheckReport result={referenceResult} /> : null}
                </div>
              ) : null}

              {aiProgress ? <p className="text-xs text-amber-800">{aiProgress}</p> : null}
              {aiError ? <p className="text-sm text-destructive">{aiError}</p> : null}
            </div>
            <DialogFooter className="border-t-2 border-stone-500 bg-stone-50 px-5 py-3">
              <Button
                type="button"
                size="sm"
                className={cn('h-9 gap-1.5', limsPrimaryBtnClass)}
                disabled={aiLoading}
                onClick={() => {
                  if (aiTask === 'chat') void runSectionChat()
                  else if (aiTask === 'references') void runReferenceCheck()
                  else void runFormatImprove()
                }}
              >
                {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {aiLoading
                  ? aiTask === 'chat'
                    ? 'Updating…'
                    : aiTask === 'references'
                      ? 'Checking…'
                      : 'Formatting…'
                  : aiTask === 'chat'
                    ? 'Update Section'
                    : aiTask === 'references'
                      ? referenceResult
                        ? 'Re-run check'
                        : 'Run reference check'
                      : 'Apply Formatting'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <SectionEditDialog
          open={sectionEditOpen}
          docLabel={`${workingRow.doc_number} — ${workingRow.title}`}
          form={sectionForm}
          saving={sectionSaving}
          error={sectionError}
          onChange={setSectionForm}
          onOpenChange={setSectionEditOpen}
          onSave={() => void saveSectionEdit()}
        />
      </DialogContent>
    </Dialog>
  )
}
