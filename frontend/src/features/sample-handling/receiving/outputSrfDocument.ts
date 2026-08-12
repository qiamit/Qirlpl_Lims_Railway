import { fetchSrfPrintSettings } from '@/features/settings/lab-settings/printSettingsConfig'
import { printHtmlDocument } from '@/features/sample-handling/report-preparation/buildScopedTestReportPrintHtml'

/** Opens print dialog or downloads PDF per Lab Settings → Print → SRF. */
export async function outputSrfDocument(html: string, filenameBase: string): Promise<void> {
  const settings = await fetchSrfPrintSettings()

  if (settings.pdfOutputMode === 'playwright') {
    const { downloadHtmlAsPdf } = await import(
      '@/features/sample-handling/report-preparation/downloadHtmlAsPdf'
    )
    const safeName = filenameBase.replace(/[^\w.-]+/g, '_').slice(0, 120) || 'srf-list'
    await downloadHtmlAsPdf(html, `${safeName}.pdf`, settings.pageSize)
    return
  }

  await printHtmlDocument(html)
}
