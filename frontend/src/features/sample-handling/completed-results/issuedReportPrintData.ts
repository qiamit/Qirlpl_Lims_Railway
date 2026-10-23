/**
 * One renderer for issued test reports (ISO/IEC 17025 7.8.2).
 *
 * Every issued-report print goes through IssuedReportPrintData: the live path
 * (current records) builds it with printDataFromSources(), a re-print from the
 * frozen archive builds it with printDataFromSnapshot(), and both render with
 * renderIssuedReportContinuousHtml(). The archive snapshot itself is built by
 * buildIssuedReportSnapshotFromSources() from the same sources, so an archive
 * re-print reproduces the issued copy.
 *
 * Nothing in this file talks to the database or the DOM.
 */
import { buildScopedTestReportPrintHtml } from '@/features/sample-handling/report-preparation/buildScopedTestReportPrintHtml'
import {
  formatSectionReportLine,
  type TestReportCoverDetails,
} from '@/features/sample-handling/report-preparation/fetchTestReportCoverDetails'
import { toCanonicalReportNumber } from '@/features/sample-handling/report-preparation/formattedTestReportNumber'
import type { ScopeLetterheadSelection } from '@/features/sample-handling/report-preparation/reportPrepLetterhead'
import {
  filterReportRowsByScope,
  type ReportResultRow,
} from '@/features/sample-handling/report-preparation/reportResultRows'
import {
  appendReportScopeSuffix,
  type ReportScopeKind,
} from '@/features/sample-handling/report-preparation/reportScope'
import type { ResolvedScopeTemplate } from '@/features/sample-handling/report-preparation/reportScopeConfig'
import {
  TEST_REPORT_SIGNATURE_PART_IDS,
  signaturesForPart,
  type TestReportPrintSettings,
  type TestReportSignature,
  type TestReportSignatureAfterPart,
} from '@/features/settings/lab-settings/printSettingsTypes'
import { formatDate } from '@/lib/utils'
import {
  summarizeReportEnvironment,
  type ReportEnvironmentLine,
  type ResultEnvironmentSnapshot,
} from '@/features/environment/resultEnvironmentSnapshot'
import type { ReportOpinions } from '@/features/sample-handling/report-preparation/reportOpinions'
import type { ReportSamplingInfo } from '@/features/sampling/samplingReportBlock'
import type { IssuedTestReportListRow } from './types'

export const SNAPSHOT_FORMAT = 'qirlpl-issued-test-report'
/**
 * 1: commit 8bf0fcf (no print settings, no letterhead files).
 * 2: adds clientName, printSettings and per-report template (file paths + text).
 *    Later optional keys (older v2 snapshots print without them): decisionRule,
 *    reports[].environmentConditions, opinions, sampling.
 */
export const SNAPSHOT_VERSION = 2

export function issuedReportScopes(row: IssuedTestReportListRow): ReportScopeKind[] {
  const scopes: ReportScopeKind[] = []
  if (row.nablIssuedAt && row.reportNumberBase) scopes.push('nabl')
  if (row.nonNablIssuedAt && row.reportNumberBase) scopes.push('non_nabl')
  return scopes
}

/** Everything one scoped issued-report print needs. JSON-safe. */
export type IssuedReportPrintData = {
  scope: ReportScopeKind
  labName: string
  srf: string
  client: string
  isStandard: string
  /** Raw date of sample receiving; formatted at render time. */
  dateReceiving: string | null
  reportNumber: string
  ulrNumber: string | null
  notes: string
  rows: ReportResultRow[]
  /** headerUrl / footerUrl / watermarkUrl hold stored file paths, not signed URLs. */
  template: ResolvedScopeTemplate
  coverDetails: TestReportCoverDetails
  printSettings: TestReportPrintSettings
  signatureIssuedAt: string | null
  /**
   * Statement of the decision rule agreed on the SRF (ISO 17025 7.8.6), printed in
   * the Part C end notes. Null / absent = none (and for snapshots taken before
   * decision rules existed).
   */
  decisionRuleStatement?: string | null
  /**
   * Environmental conditions during testing per lab area (ISO 17025 7.8.3.1 a),
   * printed in Part C. Absent = none recorded (and for older snapshots).
   */
  environmentConditions?: ReportEnvironmentLine[]
  /**
   * Opinions and interpretations (ISO 17025 7.8.7), printed in Part C under
   * "Opinions and interpretations". Absent = none (and for older snapshots).
   */
  opinions?: ReportOpinions
  /**
   * Sampling information (ISO 17025 7.8.5), printed in Part C. Absent = the
   * sample has no sampling record, sampling is off, or an older snapshot.
   */
  samplingInformation?: ReportSamplingInfo
}

/** Decision rule as recorded for an issued report. JSON-safe. */
export type IssuedReportDecisionRule = {
  id: string
  code: string
  name: string
  ruleType: string
  guardBandFactor: number
  statementText: string
}

/** Signed (printable) URLs for the template's file paths. */
export type TemplateImageUrls = {
  headerUrl: string | null
  footerUrl: string | null
  watermarkUrl: string | null
}

/** Data loaded from current records for one issued SRF (all issued scopes). */
export type IssuedReportSources = {
  row: IssuedTestReportListRow
  labName: string
  notes: string
  resultRows: ReportResultRow[]
  coverDetails: TestReportCoverDetails
  printSettings: TestReportPrintSettings
  letterheads: Partial<Record<ReportScopeKind, ScopeLetterheadSelection>>
  /** Unsigned templates (file paths) per scope. */
  templates: Partial<Record<ReportScopeKind, ResolvedScopeTemplate>>
  /** Decision rule agreed on the SRF, null when none. */
  decisionRule?: IssuedReportDecisionRule | null
  /** Environmental conditions saved with each result, by result row id (parameterId). */
  environmentByParameterId?: Record<string, ResultEnvironmentSnapshot>
  /** Opinions and interpretations on the sample, null when none. */
  opinions?: ReportOpinions | null
  /** Sampling record of the sample (7.8.5), null when none or sampling is off. */
  sampling?: ReportSamplingInfo | null
}

/** Part C conditions block for a scope's rows; undefined when no row has conditions. */
function environmentForRows(
  rows: ReportResultRow[],
  byParameterId: IssuedReportSources['environmentByParameterId'],
): ReportEnvironmentLine[] | undefined {
  const lines = summarizeReportEnvironment(
    rows.map((r) => r.parameterId),
    byParameterId,
  )
  return lines.length > 0 ? lines : undefined
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function scopeLabel(scope: ReportScopeKind): string {
  return scope === 'nabl' ? 'NABL' : 'Non-NABL'
}

/** Live path: print data for one scope from current records. */
export function printDataFromSources(
  sources: IssuedReportSources,
  scope: ReportScopeKind,
): IssuedReportPrintData {
  const { row } = sources
  const base = toCanonicalReportNumber(row.reportNumberBase ?? '')
  if (!base) throw new Error('Report number is missing for this SRF.')
  const rows = filterReportRowsByScope(sources.resultRows, scope)
  const template = sources.templates[scope]
  if (!template) throw new Error(`Letterhead for the ${scopeLabel(scope)} report could not be resolved.`)
  // JSON round trip so live data has exactly the shape an archived snapshot has.
  return jsonClone<IssuedReportPrintData>({
    scope,
    labName: sources.labName,
    srf: row.srfNumber ?? row.id,
    client: row.clientName ?? '—',
    isStandard: row.isCodeLabel ?? '—',
    dateReceiving: row.dateReceiving ?? null,
    reportNumber: appendReportScopeSuffix(base, scope),
    ulrNumber: scope === 'nabl' ? (row.nablUlrNumber ?? null) : null,
    notes: sources.notes,
    rows,
    template,
    coverDetails: sources.coverDetails,
    printSettings: sources.printSettings,
    signatureIssuedAt: (scope === 'nabl' ? row.nablIssuedAt : row.nonNablIssuedAt) || row.issuedAt,
    decisionRuleStatement: sources.decisionRule?.statementText || null,
    environmentConditions: environmentForRows(rows, sources.environmentByParameterId),
    opinions: sources.opinions ?? undefined,
    samplingInformation: sources.sampling ?? undefined,
  })
}

/** The single renderer: continuous (not yet paginated) report HTML. */
export function renderIssuedReportContinuousHtml(
  data: IssuedReportPrintData,
  imageUrls?: TemplateImageUrls,
): string {
  if (data.rows.length === 0) {
    throw new Error(
      data.scope === 'nabl'
        ? 'No NABL-scoped results found for this report.'
        : 'No Non-NABL-scoped results found for this report.',
    )
  }
  const template: ResolvedScopeTemplate = imageUrls ? { ...data.template, ...imageUrls } : data.template
  const printCover = {
    ...data.coverDetails,
    sectionReportLine: formatSectionReportLine(
      data.coverDetails.sectionCodes,
      data.coverDetails.sectionReportNo,
      data.coverDetails.reportType,
    ),
  }
  return buildScopedTestReportPrintHtml({
    scope: data.scope,
    labName: data.labName,
    srf: data.srf,
    client: data.client,
    isStandard: data.isStandard,
    dateReceiving: formatDate(data.dateReceiving ?? ''),
    reportNumber: data.reportNumber,
    ulrNumber: data.scope === 'nabl' ? (data.ulrNumber ?? undefined) : undefined,
    notes: data.notes,
    rows: data.rows,
    template,
    coverDetails: printCover,
    printSettings: data.printSettings,
    signatureIssuedAt: data.signatureIssuedAt,
    decisionRuleStatement: data.decisionRuleStatement ?? null,
    environmentConditions: data.environmentConditions ?? null,
    opinions: data.opinions ?? null,
    samplingInformation: data.samplingInformation ?? null,
  })
}

// ---------------------------------------------------------------------------
// Snapshot (archive) shape
// ---------------------------------------------------------------------------

type SnapshotSignatory = {
  roleLabel: string
  userId: string
  name: string
  designation: string
  department: string
}

type SnapshotResult = {
  parameterId: string
  rowKey?: string
  sampleAllocationId?: string
  testAllocationId?: string
  srNo: number
  sectionCode: string
  clauseNo: string | null
  testName: string
  testMethodClause: string | null
  unit: string
  specifiedRequirement: string
  observedValue: string
  uncertainty: string
  conformity: string
  scope: string
}

type SnapshotTemplate = {
  headerPath: string | null
  footerPath: string | null
  watermarkPath: string | null
  termsText: string
  watermarkText: string
  omitHeader: boolean
  omitFooter: boolean
}

type SnapshotReport = {
  scope: ReportScopeKind
  reportNumber: string | null
  ulrNumber: string | null
  issuedAt: string | null
  letterhead: ScopeLetterheadSelection | null
  /** v2+ */
  template?: SnapshotTemplate
  results: SnapshotResult[]
  /** Conditions during testing per lab area, as printed (absent = none / older snapshot). */
  environmentConditions?: ReportEnvironmentLine[]
}

export type IssuedReportSnapshot = {
  format: string
  version: number
  capturedAt: string
  labName: string
  sampleId: string
  srfNumber: string | null
  dateOfSampleReceiving: string | null
  reportNumber: string | null
  ulrNumber: string | null
  issuedAt: string | null
  nablIssuedAt: string | null
  nonNablIssuedAt: string | null
  issuedBy: {
    userId: string | null
    name: string | null
    signatureMeaning: string | null
    reauthenticatedAt: string | null
  }
  /** v2+: list client name (Part A fallback). */
  clientName?: string | null
  customer: { name: string | null; address: string | null; details: string | null }
  isStandard: string | null
  cover: TestReportCoverDetails
  remarks: string
  reports: SnapshotReport[]
  signatories: { show: boolean; afterPart: Record<string, SnapshotSignatory[]> }
  /** v2+: full test report print settings at issue. */
  printSettings?: TestReportPrintSettings
  /**
   * Decision rule agreed on the SRF (ISO 17025 7.8.6). Present (possibly null)
   * on snapshots taken after decision rules were added; absent before.
   */
  decisionRule?: IssuedReportDecisionRule | null
  /** Opinions and interpretations as issued (absent = none, or snapshot taken before they existed). */
  opinions?: ReportOpinions
  /** Sampling information as issued (absent = none, sampling off, or snapshot taken before it existed). */
  sampling?: ReportSamplingInfo
}

function signatoryForSnapshot(sig: TestReportSignature): SnapshotSignatory {
  return {
    roleLabel: sig.roleLabel ?? '',
    userId: sig.userId ?? '',
    name: sig.name ?? '',
    designation: sig.designation ?? '',
    department: sig.department ?? '',
  }
}

function templateForSnapshot(t: ResolvedScopeTemplate | undefined): SnapshotTemplate | undefined {
  if (!t) return undefined
  return {
    headerPath: t.headerUrl ?? null,
    footerPath: t.footerUrl ?? null,
    watermarkPath: t.watermarkUrl ?? null,
    termsText: t.termsText ?? '',
    watermarkText: t.watermarkText ?? '',
    omitHeader: Boolean(t.omitHeader),
    omitFooter: Boolean(t.omitFooter),
  }
}

export type SnapshotExtras = {
  capturedAt: string
  issuedBy: IssuedReportSnapshot['issuedBy']
}

/** Archive snapshot of an issued report, from the same sources the live print uses. */
export function buildIssuedReportSnapshotFromSources(
  sources: IssuedReportSources,
  extras: SnapshotExtras,
): IssuedReportSnapshot {
  const { row, coverDetails, printSettings } = sources
  const scopes = issuedReportScopes(row)
  const base = toCanonicalReportNumber(row.reportNumberBase ?? '')

  const reports: SnapshotReport[] = scopes.map((scope) => {
    const scopedRows = filterReportRowsByScope(sources.resultRows, scope)
    const environmentConditions = environmentForRows(scopedRows, sources.environmentByParameterId)
    return {
      scope,
      reportNumber: base ? appendReportScopeSuffix(base, scope) : null,
      ulrNumber: scope === 'nabl' ? row.nablUlrNumber : null,
      issuedAt: (scope === 'nabl' ? row.nablIssuedAt : row.nonNablIssuedAt) || row.issuedAt,
      letterhead: sources.letterheads[scope] ?? null,
      template: templateForSnapshot(sources.templates[scope]),
      results: scopedRows.map((r) => ({
        parameterId: r.parameterId,
        rowKey: r.rowKey,
        sampleAllocationId: r.sampleAllocationId,
        testAllocationId: r.testAllocationId,
        srNo: r.srNo,
        sectionCode: r.sectionCode,
        clauseNo: r.clauseNo,
        testName: r.testName,
        testMethodClause: r.testMethodClause,
        unit: r.unit,
        specifiedRequirement: r.specifiedRequirement,
        observedValue: r.observedValue,
        uncertainty: r.uncertainty,
        conformity: r.remark,
        scope: r.scope,
      })),
      ...(environmentConditions ? { environmentConditions } : {}),
    }
  })

  const signatories = {
    show: Boolean(printSettings.showSignatures),
    afterPart: Object.fromEntries(
      TEST_REPORT_SIGNATURE_PART_IDS.map((part) => [
        part,
        signaturesForPart(printSettings, part).map(signatoryForSnapshot),
      ]),
    ),
  }

  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    capturedAt: extras.capturedAt,
    labName: sources.labName,
    sampleId: row.id,
    srfNumber: row.srfNumber,
    dateOfSampleReceiving: row.dateReceiving,
    reportNumber: base || null,
    ulrNumber: row.nablUlrNumber,
    issuedAt: row.issuedAt,
    nablIssuedAt: row.nablIssuedAt,
    nonNablIssuedAt: row.nonNablIssuedAt,
    issuedBy: extras.issuedBy,
    clientName: row.clientName,
    customer: {
      name: coverDetails.customerName ?? row.clientName,
      address: coverDetails.customerAddress,
      details: coverDetails.customerDetails,
    },
    isStandard: row.isCodeLabel,
    cover: coverDetails,
    remarks: sources.notes,
    reports,
    signatories,
    printSettings,
    decisionRule: sources.decisionRule ?? null,
    ...(sources.opinions ? { opinions: sources.opinions } : {}),
    ...(sources.sampling ? { sampling: sources.sampling } : {}),
  }
}

/** Parts of a print that an older snapshot does not hold and must come from current records. */
export type SnapshotLiveGap = 'printSettings' | 'template'

export function snapshotLiveGaps(snapshot: IssuedReportSnapshot): SnapshotLiveGap[] {
  const gaps: SnapshotLiveGap[] = []
  if (!snapshot.printSettings) gaps.push('printSettings')
  if ((snapshot.reports ?? []).some((r) => !r.template)) gaps.push('template')
  return gaps
}

export function isIssuedReportSnapshot(value: unknown): value is IssuedReportSnapshot {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<IssuedReportSnapshot>
  return v.format === SNAPSHOT_FORMAT && typeof v.version === 'number' && Array.isArray(v.reports) && !!v.cover
}

export function snapshotReportForScope(
  snapshot: IssuedReportSnapshot,
  scope: ReportScopeKind,
): SnapshotReport | null {
  return snapshot.reports.find((r) => r.scope === scope) ?? null
}

/**
 * v1 snapshots kept only the signatory names per part. Rebuild the signature
 * list on top of the current layout settings so the issued signatories print.
 */
function overlaySnapshotSignatories(
  live: TestReportPrintSettings,
  signatories: IssuedReportSnapshot['signatories'],
): TestReportPrintSettings {
  const byKey = new Map<string, TestReportSignature>()
  for (const part of TEST_REPORT_SIGNATURE_PART_IDS) {
    for (const s of signatories.afterPart?.[part] ?? []) {
      const key = [s.roleLabel, s.userId, s.name, s.designation].join('\u0000')
      const existing = byKey.get(key)
      if (existing) {
        existing.showAfterParts = [...existing.showAfterParts, part as TestReportSignatureAfterPart]
      } else {
        byKey.set(key, {
          roleLabel: s.roleLabel,
          userId: s.userId,
          name: s.name,
          designation: s.designation,
          department: s.department,
          enabled: true,
          required: true,
          showAfterParts: [part as TestReportSignatureAfterPart],
        })
      }
    }
  }
  return { ...live, showSignatures: Boolean(signatories.show), signatures: [...byKey.values()] }
}

/** Live parts used only where an older snapshot lacks them (see snapshotLiveGaps). */
export type SnapshotLiveFallback = {
  printSettings?: TestReportPrintSettings
  templates?: Partial<Record<ReportScopeKind, ResolvedScopeTemplate>>
}

/** Archive path: print data for one scope from a verified snapshot. */
export function printDataFromSnapshot(
  snapshot: IssuedReportSnapshot,
  scope: ReportScopeKind,
  fallback: SnapshotLiveFallback = {},
): IssuedReportPrintData {
  const report = snapshotReportForScope(snapshot, scope)
  if (!report) {
    throw new Error(`The archived copy does not contain the ${scopeLabel(scope)} report.`)
  }
  if (!report.reportNumber) throw new Error('Report number is missing in the archived copy.')

  let printSettings = snapshot.printSettings
  if (!printSettings) {
    // LIVE FALLBACK (v1 snapshot): page layout from current print settings,
    // signatories from the snapshot.
    if (!fallback.printSettings) throw new Error('Print settings are needed to print this archived copy.')
    printSettings = overlaySnapshotSignatories(fallback.printSettings, snapshot.signatories)
  }

  let template: ResolvedScopeTemplate
  if (report.template) {
    template = {
      headerUrl: report.template.headerPath,
      footerUrl: report.template.footerPath,
      watermarkUrl: report.template.watermarkPath,
      termsText: report.template.termsText,
      watermarkText: report.template.watermarkText,
      omitHeader: report.template.omitHeader,
      omitFooter: report.template.omitFooter,
    }
  } else {
    // LIVE FALLBACK (v1 snapshot): letterhead files and terms resolved now
    // from the letterhead names recorded at issue.
    const live = fallback.templates?.[scope]
    if (!live) throw new Error('Letterhead is needed to print this archived copy.')
    template = live
  }

  const rows: ReportResultRow[] = report.results.map((r) => ({
    parameterId: r.parameterId,
    rowKey: r.rowKey ?? '',
    srNo: r.srNo,
    sectionCode: r.sectionCode,
    sampleAllocationId: r.sampleAllocationId ?? '',
    testAllocationId: r.testAllocationId ?? '',
    clauseNo: r.clauseNo,
    testName: r.testName,
    testMethodClause: r.testMethodClause,
    unit: r.unit,
    specifiedRequirement: r.specifiedRequirement,
    observedValue: r.observedValue,
    uncertainty: r.uncertainty,
    remark: r.conformity,
    scope: r.scope,
  }))

  return jsonClone<IssuedReportPrintData>({
    scope,
    labName: snapshot.labName,
    srf: snapshot.srfNumber ?? snapshot.sampleId,
    // v1 had no clientName; customer.name is cover.customerName ?? clientName,
    // which renders the same Part A customer line.
    client: (snapshot.clientName !== undefined ? snapshot.clientName : snapshot.customer?.name) ?? '—',
    isStandard: snapshot.isStandard ?? '—',
    dateReceiving: snapshot.dateOfSampleReceiving ?? null,
    reportNumber: report.reportNumber,
    ulrNumber: scope === 'nabl' ? (report.ulrNumber ?? null) : null,
    notes: snapshot.remarks ?? '',
    rows,
    template,
    coverDetails: snapshot.cover,
    printSettings,
    signatureIssuedAt: report.issuedAt,
    decisionRuleStatement: snapshot.decisionRule?.statementText || null,
    environmentConditions:
      report.environmentConditions && report.environmentConditions.length > 0
        ? report.environmentConditions
        : undefined,
    opinions: snapshot.opinions ?? undefined,
    samplingInformation: snapshot.sampling ?? undefined,
  })
}
