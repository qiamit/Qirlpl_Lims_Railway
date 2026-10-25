import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import {
  GrRegisterMasterPage,
  type GrRegisterConfig,
} from '../GrRegisterMasterPage'
import {
  formatDateDisplay,
  metaLineClass,
  primaryLineClass,
  secondaryLineClass,
  todayIsoDate,
} from '../shared'
import { RiskHeatMap } from './RiskHeatMap'
import {
  REVIEW_FREQUENCIES,
  RISK_SCALE,
  RISK_SOURCE_TYPES,
  isHeatMapRow,
  isReviewOverdue,
  riskBand,
  riskBandClass,
  riskRowCell,
  scoreOf,
  suggestedNextReview,
  type HeatCell,
  type HeatMapMode,
} from './riskScoring'

/** Added by 20261028100100_risk_scoring_audit_coverage.sql. */
const MIGRATION_NOTE =
  'Scores, owner, review and source need migration 20261028100100_risk_scoring_audit_coverage.sql and were not saved.'

type UserOption = { value: string; label: string }

function ScoreBadge({ likelihood, severity }: { likelihood: unknown; severity: unknown }) {
  const score = scoreOf(likelihood, severity)
  const band = riskBand(score)
  if (!band) return <p className={cn(primaryLineClass, 'text-center')}>—</p>
  return (
    <div className="space-y-0.5 text-center">
      <span className={cn('inline-block border px-1.5 py-0.5 text-[11px] font-bold tracking-wide', riskBandClass[band])}>
        {score} · {band}
      </span>
      <p className={metaLineClass}>
        L{String(likelihood ?? '')} × S{String(severity ?? '')}
      </p>
    </div>
  )
}

function OwnerReviewCell({ row }: { row: Record<string, unknown> }) {
  const overdue = isReviewOverdue(row.next_review_date, row.status)
  const next = row.next_review_date ? formatDateDisplay(String(row.next_review_date)) : ''
  const target = row.target_date ? formatDateDisplay(String(row.target_date)) : ''
  return (
    <div className="space-y-0.5">
      <p className={primaryLineClass}>{String(row.owner_name ?? '') || '—'}</p>
      {target ? <p className={secondaryLineClass}>Target {target}</p> : null}
      {next ? (
        <p className={cn(metaLineClass, overdue && 'font-bold text-red-700')}>
          {overdue ? 'Review overdue ' : 'Review '}
          {next}
          {row.review_frequency ? ` · ${String(row.review_frequency)}` : ''}
        </p>
      ) : null}
    </div>
  )
}

function buildConfig(users: UserOption[]): GrRegisterConfig {
  return {
    title: 'Risk Analysis',
    clauseNote:
      'ISO/IEC 17025:2017 cl. 8.5 — risks and opportunities: likelihood × severity before (inherent) and after (residual) the planned actions, owner, target date and periodic review.',
    tableName: 'gr_risk_opportunities',
    idPrefix: 'RSK',
    idField: 'item_id',
    newLabel: 'Add Item',
    searchPlaceholder: 'Search ID, type, description, owner, source, status…',
    orderBy: 'identified_at',
    optionalFieldsNote: MIGRATION_NOTE,
    fields: [
      { key: 'item_id', label: 'Item ID', kind: 'readonly' },
      { key: 'identified_at', label: 'Identified On', kind: 'date', required: true },
      { key: 'item_type', label: 'Type', kind: 'select', options: ['Risk', 'Opportunity'] },
      { key: 'status', label: 'Status', kind: 'select', options: ['Open', 'In Progress', 'Closed'] },
      {
        key: 'source_type',
        label: 'Source',
        kind: 'select',
        options: RISK_SOURCE_TYPES,
        clearable: true,
        optional: true,
      },
      {
        key: 'source_ref',
        label: 'Source Record No. (process / complaint / NC / audit / impartiality ref.)',
        kind: 'text',
        span: 2,
        optional: true,
      },
      {
        key: 'owner_user_id',
        label: 'Risk Owner',
        kind: 'select',
        optionItems: users,
        clearable: true,
        optional: true,
      },
      { key: 'description', label: 'Description', kind: 'textarea', span: 3, required: true },
      { key: 'potential_impact', label: 'Potential Impact on Validity of Results', kind: 'textarea', span: 3 },
      {
        key: 'likelihood',
        label: 'Inherent Likelihood (1 rare – 5 almost certain)',
        kind: 'select',
        options: RISK_SCALE,
        numeric: true,
        clearable: true,
        optional: true,
      },
      {
        key: 'severity',
        label: 'Inherent Severity (1 negligible – 5 severe)',
        kind: 'select',
        options: RISK_SCALE,
        numeric: true,
        clearable: true,
        optional: true,
      },
      {
        key: 'risk_score',
        label: 'Inherent Score (L × S)',
        kind: 'readonly',
        compute: (f) => {
          const score = scoreOf(f.likelihood, f.severity)
          return score == null ? '' : `${score} · ${riskBand(score)}`
        },
      },
      { key: 'target_date', label: 'Target Date', kind: 'date', optional: true },
      { key: 'planned_actions', label: 'Planned Action', kind: 'textarea', span: 3 },
      {
        key: 'residual_likelihood',
        label: 'Residual Likelihood (after actions)',
        kind: 'select',
        options: RISK_SCALE,
        numeric: true,
        clearable: true,
        optional: true,
      },
      {
        key: 'residual_severity',
        label: 'Residual Severity (after actions)',
        kind: 'select',
        options: RISK_SCALE,
        numeric: true,
        clearable: true,
        optional: true,
      },
      {
        key: 'residual_score',
        label: 'Residual Score (L × S)',
        kind: 'readonly',
        compute: (f) => {
          const score = scoreOf(f.residual_likelihood, f.residual_severity)
          if (score == null) return ''
          const inherent = scoreOf(f.likelihood, f.severity)
          const warn = inherent != null && score > inherent ? ' (higher than inherent!)' : ''
          return `${score} · ${riskBand(score)}${warn}`
        },
      },
      {
        key: 'review_frequency',
        label: 'Review Frequency',
        kind: 'select',
        options: REVIEW_FREQUENCIES,
        clearable: true,
        optional: true,
      },
      { key: 'last_reviewed_on', label: 'Last Reviewed On', kind: 'date', optional: true },
      { key: 'next_review_date', label: 'Next Review Date', kind: 'date', optional: true },
      {
        key: 'next_review_hint',
        label: 'Next Review if Left Blank',
        kind: 'readonly',
        compute: (f) => suggestedNextReview(f),
      },
      { key: 'integration_notes', label: 'Integration into Management System', kind: 'textarea', span: 3 },
      { key: 'effectiveness_evaluation', label: 'Effectiveness Evaluation', kind: 'textarea', span: 3 },
    ],
    columns: [
      {
        key: 'item_id',
        header: 'Item',
        lines: [
          { key: 'item_id', tone: 'meta' },
          { key: 'identified_at', tone: 'secondary' },
          { key: 'source_type', tone: 'secondary' },
        ],
      },
      { key: 'item_type', header: 'Type' },
      {
        key: 'description',
        header: 'Description / Actions',
        lines: [
          { key: 'description', tone: 'primary' },
          { key: 'planned_actions', tone: 'secondary' },
        ],
      },
      {
        key: 'risk_score',
        header: 'Inherent',
        render: (row) => <ScoreBadge likelihood={row.likelihood} severity={row.severity} />,
      },
      {
        key: 'residual_score',
        header: 'Residual',
        render: (row) => (
          <ScoreBadge likelihood={row.residual_likelihood} severity={row.residual_severity} />
        ),
      },
      {
        key: 'owner_name',
        header: 'Owner / Review',
        render: (row) => <OwnerReviewCell row={row} />,
      },
      { key: 'status', header: 'Status' },
    ],
    exportHeaders: [
      'Item ID',
      'Date',
      'Type',
      'Source',
      'Source Ref',
      'Description',
      'Potential Impact',
      'Likelihood',
      'Severity',
      'Inherent Score',
      'Actions',
      'Residual Likelihood',
      'Residual Severity',
      'Residual Score',
      'Owner',
      'Target Date',
      'Review Frequency',
      'Last Reviewed',
      'Next Review',
      'Status',
    ],
    exportKeys: [
      'item_id',
      'identified_at',
      'item_type',
      'source_type',
      'source_ref',
      'description',
      'potential_impact',
      'likelihood',
      'severity',
      'risk_score',
      'planned_actions',
      'residual_likelihood',
      'residual_severity',
      'residual_score',
      'owner_name',
      'target_date',
      'review_frequency',
      'last_reviewed_on',
      'next_review_date',
      'status',
    ],
    searchKeys: [
      'item_id',
      'item_type',
      'description',
      'planned_actions',
      'status',
      'owner_name',
      'source_type',
      'source_ref',
    ],
    emptyForm: () => ({
      item_id: '',
      identified_at: todayIsoDate(),
      item_type: 'Risk',
      description: '',
      potential_impact: '',
      planned_actions: '',
      integration_notes: '',
      effectiveness_evaluation: '',
      status: 'Open',
      source_type: '',
      source_ref: '',
      owner_user_id: '',
      likelihood: '',
      severity: '',
      risk_score: '',
      residual_likelihood: '',
      residual_severity: '',
      residual_score: '',
      target_date: '',
      review_frequency: '',
      last_reviewed_on: '',
      next_review_date: '',
      next_review_hint: '',
    }),
    canSave: (f) =>
      String(f.item_id).trim().length > 0 && String(f.description).trim().length > 0,
  }
}

export default function RiskAnalysisPage() {
  const [users, setUsers] = useState<UserOption[]>([])
  const [mode, setMode] = useState<HeatMapMode>('inherent')
  const [openOnly, setOpenOnly] = useState(true)
  const [cell, setCell] = useState<HeatCell | null>(null)

  useEffect(() => {
    let canceled = false
    void (async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, status')
        .order('full_name', { ascending: true })
      if (canceled || error) return
      setUsers(
        (Array.isArray(data) ? data : []).map((raw) => {
          const r = raw as Record<string, unknown>
          const name = String(r.full_name ?? '').trim() || String(r.email ?? '').trim() || String(r.id)
          const inactive = String(r.status ?? 'Active').toLowerCase() === 'inactive'
          return { value: String(r.id), label: inactive ? `${name} (inactive)` : name }
        }),
      )
    })()
    return () => {
      canceled = true
    }
  }, [])

  const config = useMemo(() => buildConfig(users), [users])

  const rowFilter = useMemo(() => {
    if (!cell) return null
    return (row: Record<string, unknown>) => {
      if (!isHeatMapRow(row, openOnly)) return false
      const c = riskRowCell(row, mode)
      return c != null && c.likelihood === cell.likelihood && c.severity === cell.severity
    }
  }, [cell, mode, openOnly])

  const beforeTable = useCallback(
    (rows: Array<Record<string, unknown>>) => (
      <RiskHeatMap
        rows={rows}
        mode={mode}
        onModeChange={setMode}
        openOnly={openOnly}
        onOpenOnlyChange={setOpenOnly}
        selected={cell}
        onSelect={setCell}
      />
    ),
    [mode, openOnly, cell],
  )

  return <GrRegisterMasterPage config={config} beforeTable={beforeTable} rowFilter={rowFilter} />
}
