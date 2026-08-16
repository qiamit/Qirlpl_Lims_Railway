import {
  GrRegisterMasterPage,
  type GrRegisterConfig,
} from '../GrRegisterMasterPage'
import { todayIsoDate } from '../shared'

const config: GrRegisterConfig = {
  title: 'Improvement',
  tableName: 'gr_improvements',
  idPrefix: 'IMPV',
  idField: 'improvement_id',
  newLabel: 'Add Improvement',
  searchPlaceholder: 'Search ID, source, description, status…',
  orderBy: 'identified_at',
  fields: [
    { key: 'improvement_id', label: 'Improvement ID', kind: 'readonly' },
    { key: 'identified_at', label: 'Identified On', kind: 'date', required: true },
    {
      key: 'source',
      label: 'Source',
      kind: 'select',
      options: [
        'Procedure Review',
        'Policy',
        'Objectives',
        'Audit',
        'Corrective Action',
        'Management Review',
        'Personnel Suggestion',
        'Risk Assessment',
        'Data Analysis',
        'Proficiency Testing',
        'Customer Feedback',
        'Other',
      ],
    },
    {
      key: 'status',
      label: 'Status',
      kind: 'select',
      options: ['Identified', 'In Progress', 'Implemented', 'Closed'],
    },
    { key: 'description', label: 'Opportunity Description', kind: 'textarea', span: 3, required: true },
    { key: 'planned_actions', label: 'Necessary Actions', kind: 'textarea', span: 3 },
    {
      key: 'customer_feedback_notes',
      label: 'Customer feedback Analysis',
      kind: 'textarea',
      span: 3,
    },
    { key: 'effectiveness_notes', label: 'Effectiveness / Outcome', kind: 'textarea', span: 3 },
  ],
  columns: [
    {
      key: 'improvement_id',
      header: 'Improvement',
      lines: [
        { key: 'improvement_id', tone: 'meta' },
        { key: 'identified_at', tone: 'secondary' },
      ],
    },
    { key: 'source', header: 'Source' },
    {
      key: 'description',
      header: 'Description / Actions',
      lines: [
        { key: 'description', tone: 'primary' },
        { key: 'planned_actions', tone: 'secondary' },
      ],
    },
    { key: 'status', header: 'Status' },
  ],
  exportHeaders: ['Improvement ID', 'Date', 'Source', 'Description', 'Actions', 'Status'],
  exportKeys: [
    'improvement_id',
    'identified_at',
    'source',
    'description',
    'planned_actions',
    'status',
  ],
  searchKeys: ['improvement_id', 'source', 'description', 'planned_actions', 'status'],
  emptyForm: () => ({
    improvement_id: '',
    identified_at: todayIsoDate(),
    source: 'Other',
    description: '',
    planned_actions: '',
    customer_feedback_notes: '',
    status: 'Identified',
    effectiveness_notes: '',
  }),
  canSave: (f) =>
    String(f.improvement_id).trim().length > 0 && String(f.description).trim().length > 0,
}

export default function ImprovementPage() {
  return <GrRegisterMasterPage config={config} />
}
