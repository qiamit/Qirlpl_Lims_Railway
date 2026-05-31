import { supabase } from '@/lib/supabaseClient'
import { letterheadFromRow } from '@/features/settings/lab-settings/labSettingsDb'
import type { ReportScopeKind } from './reportScope'
import { fetchReportScopeTemplatesConfig } from './reportScopeConfig'
import {
  DEFAULT_LETTERHEAD_TEMPLATE_NAMES,
  type ReportScopeTemplateBinding,
} from '@/features/settings/lab-settings/reportScopeTemplateTypes'

export type LetterheadTemplateOptions = {
  headers: string[]
  footers: string[]
  watermarks: string[]
}

export type ScopeLetterheadSelection = {
  headerName: string
  footerName: string
  watermarkName: string
}

export type ReportPrepLetterheadsByScope = Record<ReportScopeKind, ScopeLetterheadSelection>

/** Stored in DB / state when user explicitly chooses N/A (no template). */
export const LETTERHEAD_NOT_APPLICABLE = '__na__'

export function isLetterheadNotApplicable(name: string | null | undefined): boolean {
  const v = (name ?? '').trim()
  return v === LETTERHEAD_NOT_APPLICABLE || v.toUpperCase() === 'N/A'
}

function readStoredTemplateName(
  raw: string | null | undefined,
  fallback: string,
): string {
  const v = (raw ?? '').trim()
  if (!v) return fallback
  if (isLetterheadNotApplicable(v)) return LETTERHEAD_NOT_APPLICABLE
  return v
}

function writeStoredTemplateName(name: string): string | null {
  if (isLetterheadNotApplicable(name)) return LETTERHEAD_NOT_APPLICABLE
  const v = name.trim()
  return v || null
}

const SAMPLE_LETTERHEAD_COLUMNS: Record<
  ReportScopeKind,
  { header: string; footer: string; watermark: string }
> = {
  nabl: {
    header: 'test_report_nabl_header_template',
    footer: 'test_report_nabl_footer_template',
    watermark: 'test_report_nabl_watermark_template',
  },
  non_nabl: {
    header: 'test_report_non_nabl_header_template',
    footer: 'test_report_non_nabl_footer_template',
    watermark: 'test_report_non_nabl_watermark_template',
  },
}

export async function fetchLetterheadTemplateOptions(): Promise<LetterheadTemplateOptions> {
  const { data, error } = await supabase
    .from('lab_letterheads')
    .select('template_type, title, name, file_path, content_text')

  if (error) throw error

  const headers: string[] = []
  const footers: string[] = []
  const watermarks: string[] = []

  for (const row of Array.isArray(data) ? data : []) {
    const { type, title, fileUrl, text } = letterheadFromRow(row as Record<string, unknown>)
    const key = title.trim()
    if (!key) continue
    if (type === 'header' && fileUrl) headers.push(key)
    else if (type === 'footer' && fileUrl) footers.push(key)
    else if (type === 'watermark_image' && fileUrl) watermarks.push(key)
    else if (type === 'watermark_text' && text.trim()) watermarks.push(key)
  }

  return {
    headers: [...new Set(headers)].sort(),
    footers: [...new Set(footers)].sort(),
    watermarks: [...new Set(watermarks)].sort(),
  }
}

function pickTemplateName(
  preferred: string,
  configured: string,
  available: string[],
): string {
  const fromConfig = configured.trim()
  if (fromConfig) return fromConfig
  if (preferred && available.includes(preferred)) return preferred
  return available[0] ?? ''
}

export function resolveScopeLetterheadDefaults(
  scope: ReportScopeKind,
  configBinding: ReportScopeTemplateBinding,
  options: LetterheadTemplateOptions,
): ScopeLetterheadSelection {
  const headerPreferred =
    scope === 'nabl'
      ? DEFAULT_LETTERHEAD_TEMPLATE_NAMES.nablHeader
      : DEFAULT_LETTERHEAD_TEMPLATE_NAMES.nonNablHeader
  return {
    headerName: pickTemplateName(headerPreferred, configBinding.headerName, options.headers),
    footerName: pickTemplateName(
      DEFAULT_LETTERHEAD_TEMPLATE_NAMES.footer,
      configBinding.footerName,
      options.footers,
    ),
    watermarkName: configBinding.watermarkName.trim(),
  }
}

export function letterheadsFromScopeDefaults(
  scopes: ReportScopeKind[],
  config: Awaited<ReturnType<typeof fetchReportScopeTemplatesConfig>>,
  options: LetterheadTemplateOptions,
): ReportPrepLetterheadsByScope {
  return {
    nabl: scopes.includes('nabl')
      ? resolveScopeLetterheadDefaults('nabl', config.nabl, options)
      : { headerName: '', footerName: '', watermarkName: '' },
    non_nabl: scopes.includes('non_nabl')
      ? resolveScopeLetterheadDefaults('non_nabl', config.non_nabl, options)
      : { headerName: '', footerName: '', watermarkName: '' },
  }
}

export async function fetchReportPrepLetterheads(
  sampleId: string,
  scopes: ReportScopeKind[],
): Promise<{
  options: LetterheadTemplateOptions
  letterheads: ReportPrepLetterheadsByScope
}> {
  const [options, config, sampleRes] = await Promise.all([
    fetchLetterheadTemplateOptions(),
    fetchReportScopeTemplatesConfig(),
    supabase
      .from('samples')
      .select(
        'test_report_nabl_header_template, test_report_nabl_footer_template, test_report_nabl_watermark_template, test_report_non_nabl_header_template, test_report_non_nabl_footer_template, test_report_non_nabl_watermark_template',
      )
      .eq('id', sampleId)
      .maybeSingle(),
  ])

  const defaults = letterheadsFromScopeDefaults(scopes, config, options)
  if (sampleRes.error) {
    return { options, letterheads: defaults }
  }

  const row = (sampleRes.data ?? {}) as Record<string, string | null>
  const read = (scope: ReportScopeKind): ScopeLetterheadSelection => {
    const cols = SAMPLE_LETTERHEAD_COLUMNS[scope]
    const scopeDefaults = resolveScopeLetterheadDefaults(scope, config[scope], options)
    const headerName = readStoredTemplateName(row[cols.header], scopeDefaults.headerName)
    const footerName = readStoredTemplateName(row[cols.footer], scopeDefaults.footerName)
    const watermarkName = readStoredTemplateName(row[cols.watermark], scopeDefaults.watermarkName)
    return { headerName, footerName, watermarkName }
  }

  return {
    options,
    letterheads: {
      nabl: scopes.includes('nabl') ? read('nabl') : defaults.nabl,
      non_nabl: scopes.includes('non_nabl') ? read('non_nabl') : defaults.non_nabl,
    },
  }
}

export function letterheadsToSampleUpdate(
  letterheads: ReportPrepLetterheadsByScope,
  scopes: ReportScopeKind[],
): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const scope of scopes) {
    const cols = SAMPLE_LETTERHEAD_COLUMNS[scope]
    const sel = letterheads[scope]
    out[cols.header] = writeStoredTemplateName(sel.headerName)
    out[cols.footer] = writeStoredTemplateName(sel.footerName)
    out[cols.watermark] = writeStoredTemplateName(sel.watermarkName)
  }
  return out
}

export function bindingFromLetterheadSelection(
  scope: ReportScopeKind,
  config: Awaited<ReturnType<typeof fetchReportScopeTemplatesConfig>>,
  selection: ScopeLetterheadSelection,
  options?: LetterheadTemplateOptions,
): ReportScopeTemplateBinding {
  const base = config[scope]
  const fallbacks = options
    ? resolveScopeLetterheadDefaults(scope, base, options)
    : {
        headerName: base.headerName,
        footerName: base.footerName,
        watermarkName: base.watermarkName,
      }
  return {
    ...base,
    headerName: isLetterheadNotApplicable(selection.headerName)
      ? LETTERHEAD_NOT_APPLICABLE
      : selection.headerName.trim() || fallbacks.headerName,
    footerName: isLetterheadNotApplicable(selection.footerName)
      ? LETTERHEAD_NOT_APPLICABLE
      : selection.footerName.trim() || fallbacks.footerName,
    watermarkName: isLetterheadNotApplicable(selection.watermarkName)
      ? LETTERHEAD_NOT_APPLICABLE
      : selection.watermarkName.trim() || fallbacks.watermarkName,
  }
}
