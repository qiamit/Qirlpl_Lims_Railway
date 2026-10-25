import {
  GrRegisterMasterPage,
  type GrRegisterConfig,
} from '../GrRegisterMasterPage'
import { todayIsoDate } from '../shared'

const config: GrRegisterConfig = {
  title: 'Confidentiality Records',
  clauseNote:
    'ISO/IEC 17025:2017 cl. 4.2 — confidentiality commitments, information the lab intends to make public (agreed with the customer in advance), releases required by law (customer notified unless prohibited), and information about the customer from other sources.',
  tableName: 'gr_confidentiality_records',
  idPrefix: 'CONF',
  idField: 'record_id',
  newLabel: 'Add Record',
  searchPlaceholder: 'Search ID, type, party, description, status…',
  orderBy: 'recorded_at',
  fields: [
    { key: 'record_id', label: 'Record ID', kind: 'readonly' },
    { key: 'recorded_at', label: 'Recorded On', kind: 'date', required: true },
    {
      key: 'record_type',
      label: 'Record Type',
      kind: 'select',
      options: [
        'Commitment',
        'Public Disclosure',
        'Legal Release',
        'Third Party Info',
        'Personnel Acknowledgement',
      ],
    },
    { key: 'status', label: 'Status', kind: 'select', options: ['Active', 'Closed'] },
    { key: 'subject_party', label: 'Customer / Party Concerned', kind: 'text', span: 2, required: true },
    {
      key: 'legal_basis',
      label: 'Legal Basis / Authority (for releases required by law)',
      kind: 'text',
      span: 2,
    },
    { key: 'description', label: 'Description of Information / Commitment', kind: 'textarea', span: 3, required: true },
    { key: 'customer_notified', label: 'Customer notified', kind: 'checkbox' },
    { key: 'remarks', label: 'Remarks', kind: 'textarea', span: 3 },
  ],
  columns: [
    {
      key: 'record_id',
      header: 'Record',
      lines: [
        { key: 'record_id', tone: 'meta' },
        { key: 'recorded_at', tone: 'secondary' },
      ],
    },
    {
      key: 'record_type',
      header: 'Type / Party',
      lines: [
        { key: 'record_type', tone: 'primary' },
        { key: 'subject_party', tone: 'secondary' },
      ],
    },
    {
      key: 'description',
      header: 'Description / Legal Basis',
      lines: [
        { key: 'description', tone: 'primary' },
        { key: 'legal_basis', tone: 'secondary' },
      ],
    },
    {
      key: 'customer_notified',
      header: 'Customer Notified',
      render: (row) => (
        <p className="text-center text-[12.5px] font-semibold text-[#292524]">
          {row.customer_notified ? 'Yes' : 'No'}
        </p>
      ),
    },
    { key: 'status', header: 'Status' },
  ],
  exportHeaders: [
    'Record ID',
    'Recorded On',
    'Type',
    'Party',
    'Description',
    'Customer Notified',
    'Legal Basis',
    'Status',
    'Remarks',
  ],
  exportKeys: [
    'record_id',
    'recorded_at',
    'record_type',
    'subject_party',
    'description',
    'customer_notified',
    'legal_basis',
    'status',
    'remarks',
  ],
  searchKeys: ['record_id', 'record_type', 'subject_party', 'description', 'legal_basis', 'status'],
  emptyForm: () => ({
    record_id: '',
    recorded_at: todayIsoDate(),
    record_type: 'Commitment',
    status: 'Active',
    subject_party: '',
    legal_basis: '',
    description: '',
    customer_notified: false,
    remarks: '',
  }),
  canSave: (f) =>
    String(f.record_id).trim().length > 0 &&
    String(f.subject_party).trim().length > 0 &&
    String(f.description).trim().length > 0,
}

export default function ConfidentialityRecordsPage() {
  return <GrRegisterMasterPage config={config} />
}
