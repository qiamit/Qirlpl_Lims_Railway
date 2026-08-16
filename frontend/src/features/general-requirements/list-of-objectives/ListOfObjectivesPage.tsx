import {
  GrRegisterMasterPage,
  type GrRegisterConfig,
} from '../GrRegisterMasterPage'
import { aiFillObjectiveField, type ObjectivesAiFieldKey } from './objectivesAiFill'

const config: GrRegisterConfig = {
  title: 'List of Objectives',
  tableName: 'gr_objectives',
  idPrefix: 'OBJ',
  idField: 'objective_id',
  newLabel: 'Add Objective',
  searchPlaceholder: 'Search objective ID, title, owner…',
  orderBy: 'created_at',
  fields: [
    { key: 'objective_id', label: 'Objective ID', kind: 'readonly' },
    {
      key: 'status',
      label: 'Status',
      kind: 'select',
      options: ['Planned', 'In Progress', 'Achieved', 'Deferred'],
    },
    { key: 'title', label: 'Objective Title', kind: 'text', required: true, span: 2 },
    { key: 'owner_name', label: 'Owner', kind: 'text' },
    { key: 'target_date', label: 'Target Date', kind: 'date' },
    { key: 'description', label: 'Description', kind: 'textarea', span: 2, aiFill: true },
    { key: 'review_notes', label: 'Review Notes', kind: 'textarea', span: 2, aiFill: true },
  ],
  columns: [
    {
      key: 'objective_id',
      header: 'Objective',
      lines: [
        { key: 'objective_id', tone: 'meta' },
        { key: 'title', tone: 'primary' },
      ],
    },
    { key: 'owner_name', header: 'Owner' },
    {
      key: 'target_date',
      header: 'Target Date',
      date: true,
    },
    { key: 'status', header: 'Status' },
  ],
  exportHeaders: ['Objective ID', 'Title', 'Owner', 'Target Date', 'Status'],
  exportKeys: ['objective_id', 'title', 'owner_name', 'target_date', 'status'],
  searchKeys: ['objective_id', 'title', 'owner_name', 'status', 'description'],
  emptyForm: () => ({
    objective_id: '',
    title: '',
    description: '',
    owner_name: '',
    target_date: '',
    status: 'Planned',
    review_notes: '',
  }),
  canSave: (f) =>
    String(f.objective_id).trim().length > 0 && String(f.title).trim().length > 0,
  aiFillField: async ({ fieldKey, form }) =>
    aiFillObjectiveField({
      targetKey: fieldKey as ObjectivesAiFieldKey,
      form,
    }),
}

export default function ListOfObjectivesPage() {
  return <GrRegisterMasterPage config={config} />
}
