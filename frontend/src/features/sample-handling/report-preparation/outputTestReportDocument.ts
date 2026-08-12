import { fetchTestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsConfig'
import { getTestReportPrintMargins } from './buildPrintStylesCss'
import { printHtmlDocument } from './buildScopedTestReportPrintHtml'

/** Opens print dialog or downloads PDF per Lab Settings → Print tab. */
export async function outputTestReportDocument(
  html: string,
  filenameBase: string,
): Promise<void> {
  const settings = await fetchTestReportPrintSettings()

  if (settings.pdfOutputMode === 'playwright') {
    const { downloadHtmlAsPdf } = await import('./downloadHtmlAsPdf')
    const safeName = filenameBase.replace(/[^\w.-]+/g, '_').slice(0, 120) || 'test-report'
    await downloadHtmlAsPdf(
      html,
      `${safeName}.pdf`,
      settings.pageSize,
      getTestReportPrintMargins(settings),
    )
    return
  }

  await printHtmlDocument(html)
}
