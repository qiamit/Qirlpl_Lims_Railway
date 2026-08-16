import {
  GrRegisterMasterPage,
  type GrRegisterConfig,
} from '../GrRegisterMasterPage'
import { todayIsoDate } from '../shared'

const config: GrRegisterConfig = {
  title: 'Risk Analysis',
  tableName: 'gr_risk_opportunities',
  idPrefix: 'RSK',
  idField: 'item_id',
  newLabel: 'Add Item',
  searchPlaceholder: 'Search ID, type, description, status…',
  orderBy: 'identified_at',
  fields: [
    { key: 'item_id', label: 'Item ID', kind: 'readonly' },
    { key: 'identified_at', label: 'Identified On', kind: 'date', required: true },
    { key: 'item_type', label: 'Type', kind: 'select', options: ['Risk', 'Opportunity'] },
    { key: 'status', label: 'Status', kind: 'select', options: ['Open', 'In Progress', 'Closed'] },
    { key: 'description', label: 'Description', kind: 'textarea', span: 3, required: true },
    { key: 'potential_impact', label: 'Potential Impact on Validity of Results', kind: 'textarea', span: 3 },
    { key: 'planned_actions', label: 'Planned Action', kind: 'textarea', span: 3 },
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
    { key: 'status', header: 'Status' },
  ],
  exportHeaders: ['Item ID', 'Date', 'Type', 'Description', 'Actions', 'Status'],
  exportKeys: ['item_id', 'identified_at', 'item_type', 'description', 'planned_actions', 'status'],
  searchKeys: ['item_id', 'item_type', 'description', 'planned_actions', 'status'],
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
  }),
  canSave: (f) =>
    String(f.item_id).trim().length > 0 && String(f.description).trim().length > 0,
}

export default function RiskAnalysisPage() {
  return <GrRegisterMasterPage config={config} />
}
