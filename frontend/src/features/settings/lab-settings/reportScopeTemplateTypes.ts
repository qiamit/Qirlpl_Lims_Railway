export type ReportScopeKind = 'nabl' | 'non_nabl'

export type ReportScopeTemplateBinding = {
  headerName: string
  footerName: string
  termsName: string
  watermarkName: string
}

export type ReportScopeTemplatesConfig = {
  nabl: ReportScopeTemplateBinding
  non_nabl: ReportScopeTemplateBinding
}

/** Fallback template titles when scope bindings are unset (must match Lab Settings letterhead names). */
export const DEFAULT_LETTERHEAD_TEMPLATE_NAMES = {
  nablHeader: 'NABL Letter Head',
  nonNablHeader: 'Non NABL Letter Head',
  footer: 'General Letter Footer',
} as const

export const EMPTY_SCOPE_BINDING: ReportScopeTemplateBinding = {
  headerName: '',
  footerName: '',
  termsName: '',
  watermarkName: '',
}

export const EMPTY_REPORT_SCOPE_TEMPLATES: ReportScopeTemplatesConfig = {
  nabl: { ...EMPTY_SCOPE_BINDING },
  non_nabl: { ...EMPTY_SCOPE_BINDING },
}

export function parseReportScopeTemplates(raw: unknown): ReportScopeTemplatesConfig {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_REPORT_SCOPE_TEMPLATES }

  const obj = raw as Record<string, unknown>
  const readBinding = (key: ReportScopeKind): ReportScopeTemplateBinding => {
    const block = obj[key]
    if (!block || typeof block !== 'object') return { ...EMPTY_SCOPE_BINDING }
    const b = block as Record<string, unknown>
    return {
      headerName: String(b.headerName ?? '').trim(),
      footerName: String(b.footerName ?? '').trim(),
      termsName: String(b.termsName ?? '').trim(),
      watermarkName: String(b.watermarkName ?? '').trim(),
    }
  }

  return {
    nabl: readBinding('nabl'),
    non_nabl: readBinding('non_nabl'),
  }
}
