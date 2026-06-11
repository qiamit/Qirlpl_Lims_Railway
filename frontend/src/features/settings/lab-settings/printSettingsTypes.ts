import {
  DEFAULT_PART_C_REPORT_COLUMNS,
  parsePartCReportColumns,
  type PartCReportColumnVisibility,
} from '@/features/sample-handling/report-preparation/partCReportColumns'

export type { PartCReportColumnVisibility }

export type PrintPageSize = 'A4' | 'Letter'

export type PdfOutputMode = 'browser_print' | 'html2pdf'

/** Preset font stacks for test report / SRF print (web-safe for browser print & PDF). */
export const PRINT_FONT_FAMILY_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'System UI', value: 'system-ui, sans-serif' },
  { label: 'Segoe UI', value: '"Segoe UI", system-ui, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Calibri', value: 'Calibri, "Segoe UI", Arial, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Roboto', value: 'Roboto, Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
]

export function printFontFamilyOptions(currentValue?: string): Array<{ label: string; value: string }> {
  const trimmed = (currentValue ?? '').trim()
  if (!trimmed || PRINT_FONT_FAMILY_OPTIONS.some((o) => o.value === trimmed)) {
    return [...PRINT_FONT_FAMILY_OPTIONS]
  }
  const short =
    trimmed.length > 36 ? `${trimmed.slice(0, 33)}…` : trimmed
  return [...PRINT_FONT_FAMILY_OPTIONS, { label: `Custom (${short})`, value: trimmed }]
}

export const TEST_REPORT_SIGNATURE_ROLE_OPTIONS = [
  'Tested By',
  'Reviewed By',
  'Authorized By',
  'Approved By',
  'Checked By',
] as const

export type TestReportSignatureRoleLabel = (typeof TEST_REPORT_SIGNATURE_ROLE_OPTIONS)[number]

export type TestReportSignature = {
  /** Label shown above signatory, e.g. Tested By / Reviewed By */
  roleLabel: string
  /** Linked User Management profile id (optional) */
  userId: string
  name: string
  designation: string
}

export const MAX_TEST_REPORT_SIGNATURES = 6

export const TEST_REPORT_SIGNATURE_PART_IDS = [
  'part_a',
  'part_b',
  'part_c',
  'part_d',
] as const

export type TestReportSignatureAfterPart = (typeof TEST_REPORT_SIGNATURE_PART_IDS)[number]

export const TEST_REPORT_SIGNATURE_PART_LABELS: Record<TestReportSignatureAfterPart, string> = {
  part_a: 'Part A',
  part_b: 'Part B',
  part_c: 'Part C',
  part_d: 'Part D',
}

/** @page margin box for printed page numbers */
export const PAGE_NUMBER_POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const

export type PageNumberPosition = (typeof PAGE_NUMBER_POSITIONS)[number]

export const PAGE_NUMBER_POSITION_LABELS: Record<PageNumberPosition, string> = {
  'top-left': 'Top left',
  'top-center': 'Top centre',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom centre',
  'bottom-right': 'Bottom right',
}

export function parsePageNumberPosition(raw: unknown): PageNumberPosition {
  const value = String(raw ?? '').trim()
  if ((PAGE_NUMBER_POSITIONS as readonly string[]).includes(value)) {
    return value as PageNumberPosition
  }
  return 'bottom-center'
}

export type TestReportPrintSettings = {
  pageSize: PrintPageSize
  bodyPaddingTopMm: number
  bodyPaddingBottomMm: number
  bodyPaddingLeftMm: number
  bodyPaddingRightMm: number
  headerMaxHeightMm: number
  footerMaxHeightMm: number
  fontFamily: string
  baseFontSizePt: number
  titleFontSizePt: number
  lineHeight: number
  /** @deprecated Use partGapAfterAMm/B/C — kept for presets & title spacing */
  partGapMm: number
  partGapAfterAMm: number
  partGapAfterBMm: number
  partGapAfterCMm: number
  tableCellPaddingPx: number
  showPartFrames: boolean
  partBNewPage: boolean
  partCNewPage: boolean
  partDNewPage: boolean
  showWatermark: boolean
  pdfOutputMode: PdfOutputMode
  /** Which Part C table columns appear in printed / PDF report */
  partCColumns: PartCReportColumnVisibility
  /** Show signature block at end of printed / PDF test report */
  showSignatures: boolean
  /** Signatory name + designation rows (up to {@link MAX_TEST_REPORT_SIGNATURES}) */
  signatures: TestReportSignature[]
  /** Report parts after which signatures are printed */
  signatureAfterParts: TestReportSignatureAfterPart[]
  /** Show "Page 01 of 05" on every printed page */
  showPageNumbers: boolean
  /** Placement of page numbers in the page margin */
  pageNumberPosition: PageNumberPosition
  /** Print letterhead header block (template chosen per scope in Results section) */
  showPrintHeader: boolean
  /** Print letterhead footer image */
  showPrintFooter: boolean
  /** Show centred "Test Report" title above Part A */
  showReportTitle: boolean
  /** Show Terms & Conditions block from letterhead template */
  showTermsAndConditions: boolean
  /** Show Part C end marker and standard end notes */
  showPartCEndNotes: boolean
  /** Show "Section Code - …" rows in Part C table */
  showPartCSectionRows: boolean
  /** Part A starts on a new page (after title) */
  partANewPage: boolean
  /** Part C table font size (pt); falls back to base font when unset */
  tableFontSizePt: number
}

/** Sample Receiving Form (SRF) list print — layout + letterhead/footer template names. */
export type SrfPrintSettings = {
  pageSize: PrintPageSize
  pdfOutputMode: PdfOutputMode
  bodyPaddingTopMm: number
  bodyPaddingBottomMm: number
  bodyPaddingHorizontalMm: number
  headerMaxHeightMm: number
  footerMaxHeightMm: number
  fontFamily: string
  baseFontSizePt: number
  showHeader: boolean
  showFooter: boolean
  /** Title of header template from Lab Settings → Letter Head. */
  headerTemplateName: string
  /** Title of footer template from Lab Settings → Letter Head. */
  footerTemplateName: string
}

export type LabPrintSettingsDocument = {
  testReport: TestReportPrintSettings
  srf: SrfPrintSettings
}

export const DEFAULT_TEST_REPORT_SIGNATURES: TestReportSignature[] = [
  { roleLabel: 'Tested By', userId: '', name: '', designation: '' },
  { roleLabel: 'Reviewed By', userId: '', name: '', designation: '' },
  { roleLabel: 'Authorized By', userId: '', name: '', designation: '' },
]

const DEFAULT_SIGNATURE_ROLE_BY_INDEX = [
  'Tested By',
  'Reviewed By',
  'Authorized By',
  'Approved By',
  'Checked By',
] as const

function defaultSignatureRoleLabel(index: number): string {
  return DEFAULT_SIGNATURE_ROLE_BY_INDEX[index] ?? ''
}

export function defaultSignatureAfterParts(): TestReportSignatureAfterPart[] {
  return [...TEST_REPORT_SIGNATURE_PART_IDS]
}

const SIGNATURE_PART_ORDER: Record<TestReportSignatureAfterPart, number> = {
  part_a: 0,
  part_b: 1,
  part_c: 2,
  part_d: 3,
}

export function parseSignatureAfterParts(raw: unknown): TestReportSignatureAfterPart[] {
  if (raw === undefined || raw === null) {
    return defaultSignatureAfterParts()
  }
  if (!Array.isArray(raw)) {
    return defaultSignatureAfterParts()
  }
  if (raw.length === 0) {
    return []
  }

  const allowed = new Set<string>(TEST_REPORT_SIGNATURE_PART_IDS)
  const parts = raw
    .map((v) => String(v).trim())
    .filter((id): id is TestReportSignatureAfterPart => allowed.has(id))

  return parts.length > 0
    ? [...new Set(parts)].sort((a, b) => SIGNATURE_PART_ORDER[a] - SIGNATURE_PART_ORDER[b])
    : []
}

export function isAllSignaturePartsSelected(parts: TestReportSignatureAfterPart[]): boolean {
  const normalized = new Set(parts)
  return TEST_REPORT_SIGNATURE_PART_IDS.every((part) => normalized.has(part))
}

export function signaturesApplyAfterPart(
  settings: Pick<TestReportPrintSettings, 'showSignatures' | 'signatureAfterParts'>,
  part: TestReportSignatureAfterPart,
): boolean {
  if (!settings.showSignatures) return false
  return settings.signatureAfterParts.includes(part)
}

export function effectiveTableFontSizePt(settings: TestReportPrintSettings): number {
  const table = settings.tableFontSizePt
  if (Number.isFinite(table) && table >= 8 && table <= 14) return table
  return settings.baseFontSizePt
}

export const DEFAULT_TEST_REPORT_PRINT_SETTINGS: TestReportPrintSettings = {
  pageSize: 'A4',
  bodyPaddingTopMm: 36,
  bodyPaddingBottomMm: 28,
  bodyPaddingLeftMm: 12,
  bodyPaddingRightMm: 12,
  headerMaxHeightMm: 32,
  footerMaxHeightMm: 22,
  fontFamily: 'system-ui, sans-serif',
  baseFontSizePt: 10,
  titleFontSizePt: 18,
  lineHeight: 1.4,
  partGapMm: 10,
  partGapAfterAMm: 10,
  partGapAfterBMm: 10,
  partGapAfterCMm: 10,
  tableCellPaddingPx: 6,
  showPartFrames: true,
  partBNewPage: true,
  partCNewPage: true,
  partDNewPage: true,
  showWatermark: true,
  pdfOutputMode: 'browser_print',
  partCColumns: { ...DEFAULT_PART_C_REPORT_COLUMNS },
  showSignatures: true,
  signatures: DEFAULT_TEST_REPORT_SIGNATURES.map((s) => ({ ...s })),
  signatureAfterParts: ['part_d'],
  showPageNumbers: true,
  pageNumberPosition: 'bottom-center',
  showPrintHeader: true,
  showPrintFooter: true,
  showReportTitle: true,
  showTermsAndConditions: true,
  showPartCEndNotes: true,
  showPartCSectionRows: true,
  partANewPage: false,
  tableFontSizePt: 10,
}

export const DEFAULT_SRF_PRINT_SETTINGS: SrfPrintSettings = {
  pageSize: 'A4',
  bodyPaddingTopMm: 32,
  bodyPaddingBottomMm: 22,
  bodyPaddingHorizontalMm: 12,
  headerMaxHeightMm: 26,
  footerMaxHeightMm: 18,
  fontFamily: 'system-ui, sans-serif',
  baseFontSizePt: 10,
  showHeader: true,
  showFooter: true,
  headerTemplateName: '',
  footerTemplateName: '',
  pdfOutputMode: 'browser_print',
}

export const DEFAULT_LAB_PRINT_SETTINGS: LabPrintSettingsDocument = {
  testReport: DEFAULT_TEST_REPORT_PRINT_SETTINGS,
  srf: DEFAULT_SRF_PRINT_SETTINGS,
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

export function parseTestReportSignatures(raw: unknown): TestReportSignature[] {
  if (!Array.isArray(raw)) {
    return DEFAULT_TEST_REPORT_SIGNATURES.map((s) => ({ ...s }))
  }

  const parsed = raw
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const o = item as Record<string, unknown>
      const roleLabel =
        typeof o.roleLabel === 'string' && o.roleLabel.trim()
          ? o.roleLabel.trim()
          : defaultSignatureRoleLabel(index)
      return {
        roleLabel,
        userId: typeof o.userId === 'string' ? o.userId.trim() : '',
        name: typeof o.name === 'string' ? o.name.trim() : '',
        designation: typeof o.designation === 'string' ? o.designation.trim() : '',
      }
    })
    .slice(0, MAX_TEST_REPORT_SIGNATURES)

  return parsed.length > 0 ? parsed : DEFAULT_TEST_REPORT_SIGNATURES.map((s) => ({ ...s }))
}

export function visibleTestReportSignatures(
  settings: Pick<TestReportPrintSettings, 'showSignatures' | 'signatures'>,
): TestReportSignature[] {
  if (!settings.showSignatures) return []
  return settings.signatures.filter((s) => s.name.trim() || s.designation.trim())
}

export function parseTestReportPrintSettings(raw: unknown): TestReportPrintSettings {
  const d = DEFAULT_TEST_REPORT_PRINT_SETTINGS
  if (!raw || typeof raw !== 'object') return { ...d }

  const o = raw as Record<string, unknown>
  const pageSize = o.pageSize === 'Letter' ? 'Letter' : 'A4'
  const pdfOutputMode: PdfOutputMode =
    o.pdfOutputMode === 'html2pdf' ? 'html2pdf' : 'browser_print'

  const horizontalLegacy = clamp(Number(o.bodyPaddingHorizontalMm), 8, 25)
  const bodyPaddingLeftMm =
    o.bodyPaddingLeftMm != null && Number.isFinite(Number(o.bodyPaddingLeftMm))
      ? clamp(Number(o.bodyPaddingLeftMm), 8, 25)
      : horizontalLegacy
  const bodyPaddingRightMm =
    o.bodyPaddingRightMm != null && Number.isFinite(Number(o.bodyPaddingRightMm))
      ? clamp(Number(o.bodyPaddingRightMm), 8, 25)
      : horizontalLegacy

  return {
    pageSize,
    bodyPaddingTopMm: clamp(Number(o.bodyPaddingTopMm), 18, 50),
    bodyPaddingBottomMm: clamp(Number(o.bodyPaddingBottomMm), 16, 45),
    bodyPaddingLeftMm,
    bodyPaddingRightMm,
    headerMaxHeightMm: clamp(Number(o.headerMaxHeightMm), 12, 40),
    footerMaxHeightMm: clamp(Number(o.footerMaxHeightMm), 10, 35),
    fontFamily:
      typeof o.fontFamily === 'string' && o.fontFamily.trim()
        ? o.fontFamily.trim()
        : d.fontFamily,
    baseFontSizePt: clamp(Number(o.baseFontSizePt), 8, 14),
    titleFontSizePt: clamp(Number(o.titleFontSizePt), 14, 24),
    lineHeight: clamp(Number(o.lineHeight), 1.2, 1.65),
    partGapMm: clamp(Number(o.partGapMm), 4, 24),
    partGapAfterAMm: clamp(Number(o.partGapAfterAMm ?? o.partGapMm), 4, 24),
    partGapAfterBMm: clamp(Number(o.partGapAfterBMm ?? o.partGapMm), 4, 24),
    partGapAfterCMm: clamp(Number(o.partGapAfterCMm ?? o.partGapMm), 4, 24),
    tableCellPaddingPx: clamp(Number(o.tableCellPaddingPx), 4, 12),
    showPartFrames: asBool(o.showPartFrames, d.showPartFrames),
    partBNewPage: asBool(o.partBNewPage, d.partBNewPage),
    partCNewPage: asBool(o.partCNewPage, d.partCNewPage),
    partDNewPage: asBool(o.partDNewPage, d.partDNewPage),
    showWatermark: asBool(o.showWatermark, d.showWatermark),
    pdfOutputMode,
    partCColumns: parsePartCReportColumns(o.partCColumns),
    showSignatures: asBool(o.showSignatures, d.showSignatures),
    signatures: parseTestReportSignatures(o.signatures),
    signatureAfterParts:
      o.signatureAfterParts != null
        ? parseSignatureAfterParts(o.signatureAfterParts)
        : o.signatureApplyPages != null
          ? defaultSignatureAfterParts()
          : parseSignatureAfterParts(undefined),
    showPageNumbers: asBool(o.showPageNumbers, d.showPageNumbers),
    pageNumberPosition: parsePageNumberPosition(o.pageNumberPosition ?? d.pageNumberPosition),
    showPrintHeader: asBool(o.showPrintHeader, d.showPrintHeader),
    showPrintFooter: asBool(o.showPrintFooter, d.showPrintFooter),
    showReportTitle: asBool(o.showReportTitle, d.showReportTitle),
    showTermsAndConditions: asBool(o.showTermsAndConditions, d.showTermsAndConditions),
    showPartCEndNotes: asBool(o.showPartCEndNotes, d.showPartCEndNotes),
    showPartCSectionRows: asBool(o.showPartCSectionRows, d.showPartCSectionRows),
    partANewPage: asBool(o.partANewPage, d.partANewPage),
    tableFontSizePt: clamp(Number(o.tableFontSizePt ?? o.baseFontSizePt), 8, 14),
  }
}

export function parseSrfPrintSettings(raw: unknown): SrfPrintSettings {
  const d = DEFAULT_SRF_PRINT_SETTINGS
  if (!raw || typeof raw !== 'object') return { ...d }

  const o = raw as Record<string, unknown>
  const pageSize = o.pageSize === 'Letter' ? 'Letter' : 'A4'
  const pdfOutputMode: PdfOutputMode =
    o.pdfOutputMode === 'html2pdf' ? 'html2pdf' : 'browser_print'

  return {
    pageSize,
    bodyPaddingTopMm: clamp(Number(o.bodyPaddingTopMm), 18, 50),
    bodyPaddingBottomMm: clamp(Number(o.bodyPaddingBottomMm), 16, 45),
    bodyPaddingHorizontalMm: clamp(Number(o.bodyPaddingHorizontalMm), 8, 25),
    headerMaxHeightMm: clamp(Number(o.headerMaxHeightMm), 12, 40),
    footerMaxHeightMm: clamp(Number(o.footerMaxHeightMm), 10, 35),
    fontFamily:
      typeof o.fontFamily === 'string' && o.fontFamily.trim()
        ? o.fontFamily.trim()
        : d.fontFamily,
    baseFontSizePt: clamp(Number(o.baseFontSizePt), 8, 14),
    showHeader: asBool(o.showHeader, d.showHeader),
    showFooter: asBool(o.showFooter, d.showFooter),
    headerTemplateName:
      typeof o.headerTemplateName === 'string' ? o.headerTemplateName.trim() : d.headerTemplateName,
    footerTemplateName:
      typeof o.footerTemplateName === 'string' ? o.footerTemplateName.trim() : d.footerTemplateName,
    pdfOutputMode,
  }
}

/** Supports legacy flat test-report JSON and nested `{ testReport, srf }`. */
export function parseLabPrintSettings(raw: unknown): LabPrintSettingsDocument {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_LAB_PRINT_SETTINGS }

  const o = raw as Record<string, unknown>
  if ('testReport' in o || 'srf' in o) {
    return {
      testReport: parseTestReportPrintSettings(o.testReport),
      srf: parseSrfPrintSettings(o.srf),
    }
  }

  return {
    testReport: parseTestReportPrintSettings(raw),
    srf: { ...DEFAULT_SRF_PRINT_SETTINGS },
  }
}

export function labPrintSettingsToJson(doc: LabPrintSettingsDocument): LabPrintSettingsDocument {
  return {
    testReport: parseTestReportPrintSettings(doc.testReport),
    srf: parseSrfPrintSettings(doc.srf),
  }
}
