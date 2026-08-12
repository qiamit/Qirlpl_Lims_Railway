import { fetchTestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsConfig'
import { CONSENT_LETTER_PAGE_MARGINS_MM } from './buildConsentLetterPrintStylesCss'
import { printHtmlDocument } from './buildScopedTestReportPrintHtml'

/** Opens print dialog or downloads PDF per Lab Settings → Print tab. */
export async function outputConsentLetterDocument(
  html: string,
  filenameBase: string,
): Promise<void> {
  const settings = await fetchTestReportPrintSettings()

  if (settings.pdfOutputMode === 'playwright') {
    const { downloadHtmlAsPdf } = await import('./downloadHtmlAsPdf')
    const safeName = filenameBase.replace(/[^\w.-]+/g, '_').slice(0, 120) || 'consent-letter'
    await downloadHtmlAsPdf(html, `${safeName}.pdf`, settings.pageSize, {
      top: CONSENT_LETTER_PAGE_MARGINS_MM.top,
      right: CONSENT_LETTER_PAGE_MARGINS_MM.right,
      bottom: CONSENT_LETTER_PAGE_MARGINS_MM.bottom,
      left: CONSENT_LETTER_PAGE_MARGINS_MM.left,
    }, ['avoid-all', 'css', 'legacy'])
    return
  }

  await printHtmlDocument(html)
}
