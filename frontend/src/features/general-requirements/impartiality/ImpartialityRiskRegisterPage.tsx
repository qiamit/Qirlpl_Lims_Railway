import {
  GrRegisterMasterPage,
  type GrRegisterConfig,
} from '../GrRegisterMasterPage'
import { metaLineClass, primaryLineClass, todayIsoDate } from '../shared'
import { cn } from '@/lib/utils'

const SCALE = ['1', '2', '3', '4', '5']

/** Likelihood x severity (1-25) banded for the register. */
function impartialityRiskBand(score: number | null): string {
  if (score == null || !Number.isFinite(score) || score <= 0) return ''
  if (score >= 15) return 'High'
  if (score >= 8) return 'Medium'
  return 'Low'
}

function scoreFromForm(form: Record<string, string | boolean>): number | null {
  const l = Number(form.likelihood)
  const s = Number(form.severity)
  if (!String(form.likelihood ?? '').trim() || !String(form.severity ?? '').trim()) return null
  if (!Number.isFinite(l) || !Number.isFinite(s)) return null
  return l * s
}

const bandClass: Record<string, string> = {
  High: 'border-red-700/40 bg-red-100 text-red-800',
  Medium: 'border-amber-700/40 bg-amber-100 text-amber-900',
  Low: 'border-emerald-700/40 bg-emerald-100 text-emerald-800',
}

function ScoreCell({ row }: { row: Record<string, unknown> }) {
  const raw = row.risk_score
  const score = raw == null || raw === '' ? null : Number(raw)
  const band = impartialityRiskBand(score)
  if (!band) return <p className={primaryLineClass}>—</p>
  return (
    <div className="space-y-0.5 text-center">
      <span
        className={cn(
          'inline-block border px-1.5 py-0.5 text-[11px] font-bold tracking-wide',
          bandClass[band],
        )}
      >
        {score} · {band}
      </span>
      <p className={metaLineClass}>
        L{String(row.likelihood ?? '')} × S{String(row.severity ?? '')}
      </p>
    </div>
  )
}

const config: GrRegisterConfig = {
  title: 'Impartiality Risk Register',
  clauseNote:
    'ISO/IEC 17025:2017 cl. 4.1.4–4.1.5 — identify risks to impartiality on an ongoing basis (activities, relationships, personnel) and show how each is eliminated or minimised.',
  tableName: 'gr_impartiality_risks',
  idPrefix: 'IMP',
  idField: 'risk_id',
  newLabel: 'Add Risk',
  searchPlaceholder: 'Search ID, source, risk, mitigation, status…',
  orderBy: 'identified_at',
  fields: [
    { key: 'risk_id', label: 'Risk ID', kind: 'readonly' },
    { key: 'identified_at', label: 'Identified On', kind: 'date', required: true },
    {
      key: 'risk_source',
      label: 'Source of Risk',
      kind: 'select',
      options: ['Activities', 'Relationships', 'Personnel', 'Other'],
    },
    { key: 'status', label: 'Status', kind: 'select', options: ['Open', 'Mitigated', 'Closed'] },
    { key: 'risk_description', label: 'Risk to Impartiality', kind: 'textarea', span: 3, required: true },
    {
      key: 'relationship_details',
      label: 'Relationship / Activity Details (who, what link, since when)',
      kind: 'textarea',
      span: 3,
    },
    {
      key: 'likelihood',
      label: 'Likelihood (1 rare – 5 almost certain)',
      kind: 'select',
      options: SCALE,
      numeric: true,
    },
    {
      key: 'severity',
      label: 'Severity (1 negligible – 5 severe)',
      kind: 'select',
      options: SCALE,
      numeric: true,
    },
    {
      key: 'risk_score',
      label: 'Risk Score (L × S)',
      kind: 'readonly',
      compute: (f) => {
        const score = scoreFromForm(f)
        return score == null ? '' : `${score} · ${impartialityRiskBand(score)}`
      },
    },
    { key: 'residual_risk', label: 'Residual Risk', kind: 'select', options: ['Low', 'Medium', 'High'] },
    { key: 'mitigation_actions', label: 'Actions to Eliminate / Minimise', kind: 'textarea', span: 3 },
    { key: 'reviewed_by_name', label: 'Reviewed By', kind: 'text', span: 2 },
    { key: 'next_review_date', label: 'Next Review Date', kind: 'date' },
    { key: 'remarks', label: 'Remarks', kind: 'textarea', span: 3 },
  ],
  columns: [
    {
      key: 'risk_id',
      header: 'Risk',
      lines: [
        { key: 'risk_id', tone: 'meta' },
        { key: 'identified_at', tone: 'secondary' },
        { key: 'risk_source', tone: 'secondary' },
      ],
    },
    {
      key: 'risk_description',
      header: 'Risk / Relationship',
      lines: [
        { key: 'risk_description', tone: 'primary' },
        { key: 'relationship_details', tone: 'secondary' },
      ],
    },
    { key: 'risk_score', header: 'Score', render: (row) => <ScoreCell row={row} /> },
    {
      key: 'mitigation_actions',
      header: 'Mitigation / Residual',
      lines: [
        { key: 'mitigation_actions', tone: 'primary' },
        { key: 'residual_risk', tone: 'secondary' },
      ],
    },
    {
      key: 'status',
      header: 'Status / Review',
      lines: [
        { key: 'status', tone: 'primary' },
        { key: 'reviewed_by_name', tone: 'secondary' },
        { key: 'next_review_date', tone: 'meta' },
      ],
    },
  ],
  exportHeaders: [
    'Risk ID',
    'Identified On',
    'Source',
    'Risk',
    'Relationship Details',
    'Likelihood',
    'Severity',
    'Risk Score',
    'Mitigation Actions',
    'Residual Risk',
    'Reviewed By',
    'Status',
    'Next Review',
    'Remarks',
  ],
  exportKeys: [
    'risk_id',
    'identified_at',
    'risk_source',
    'risk_description',
    'relationship_details',
    'likelihood',
    'severity',
    'risk_score',
    'mitigation_actions',
    'residual_risk',
    'reviewed_by_name',
    'status',
    'next_review_date',
    'remarks',
  ],
  searchKeys: [
    'risk_id',
    'risk_source',
    'risk_description',
    'relationship_details',
    'mitigation_actions',
    'residual_risk',
    'reviewed_by_name',
    'status',
  ],
  emptyForm: () => ({
    risk_id: '',
    identified_at: todayIsoDate(),
    risk_source: 'Activities',
    status: 'Open',
    risk_description: '',
    relationship_details: '',
    likelihood: '',
    severity: '',
    risk_score: '',
    residual_risk: '',
    mitigation_actions: '',
    reviewed_by_name: '',
    next_review_date: '',
    remarks: '',
  }),
  canSave: (f) =>
    String(f.risk_id).trim().length > 0 && String(f.risk_description).trim().length > 0,
}

export default function ImpartialityRiskRegisterPage() {
  return <GrRegisterMasterPage config={config} />
}
