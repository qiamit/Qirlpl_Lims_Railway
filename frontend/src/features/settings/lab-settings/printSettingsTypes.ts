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

export type TestReportPrintSettings = {
  pageSize: PrintPageSize
  bodyPaddingTopMm: number
  bodyPaddingBottomMm: number
  bodyPaddingHorizontalMm: number
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

export const DEFAULT_TEST_REPORT_PRINT_SETTINGS: TestReportPrintSettings = {
  pageSize: 'A4',
  bodyPaddingTopMm: 36,
  bodyPaddingBottomMm: 28,
  bodyPaddingHorizontalMm: 12,
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

export function parseTestReportPrintSettings(raw: unknown): TestReportPrintSettings {
  const d = DEFAULT_TEST_REPORT_PRINT_SETTINGS
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
