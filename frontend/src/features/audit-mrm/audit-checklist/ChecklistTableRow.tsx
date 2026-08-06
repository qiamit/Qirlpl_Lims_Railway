import { memo, useCallback } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableCell, TableRow } from '@/components/ui/table'
import { ChecklistNonConformityCell, ChecklistObservationCell } from './ChecklistTextCells'
import {
  CONFORMITY_OPTIONS,
  type AuditChecklistItemRow,
  type ConformityValue,
} from './types'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export type PolishField = 'remark' | 'non_conformity'

type ChecklistTableRowProps = {
  item: AuditChecklistItemRow
  selected: boolean
  /** Which field on this row is polishing, if any. */
  polishingField: PolishField | null
  /** Any row is polishing — disables other AI buttons only. */
  polishLocked: boolean
  onToggle: (id: string) => void
  onConformityChange: (id: string, value: ConformityValue) => void
  onRemarkCommit: (id: string, next: string) => void
  onNonConformityCommit: (id: string, next: string) => void
  onPolish: (item: AuditChecklistItemRow, field: PolishField) => void
}

function ChecklistTableRowInner({
  item,
  selected,
  polishingField,
  polishLocked,
  onToggle,
  onConformityChange,
  onRemarkCommit,
  onNonConformityCommit,
  onPolish,
}: ChecklistTableRowProps) {
  const showNc = item.conformity === 'no'

  const handleRemarkCommit = useCallback(
    (next: string) => onRemarkCommit(item.id, next),
    [item.id, onRemarkCommit],
  )
  const handleNcCommit = useCallback(
    (next: string) => onNonConformityCommit(item.id, next),
    [item.id, onNonConformityCommit],
  )
  const handlePolishRemark = useCallback(() => onPolish(item, 'remark'), [item, onPolish])
  const handlePolishNc = useCallback(
    () => onPolish(item, 'non_conformity'),
    [item, onPolish],
  )

  return (
    <TableRow className="align-middle" data-state={selected ? 'selected' : undefined}>
      <TableCell className="align-middle text-center">
        <input
          type="checkbox"
          className={checkboxClass}
          aria-label={`Select clause ${item.clause_no}`}
          checked={selected}
          onChange={() => onToggle(item.id)}
        />
      </TableCell>
      <TableCell className="align-middle font-mono text-sm font-medium">{item.clause_no}</TableCell>
      <TableCell className="align-middle">
        <p className="w-full whitespace-normal break-words text-sm leading-snug text-foreground">
          {item.clause_matter}
        </p>
      </TableCell>
      <TableCell className="align-middle text-center">
        <Select
          value={item.conformity || undefined}
          onValueChange={(v) => onConformityChange(item.id, (v as ConformityValue) || '')}
        >
          <SelectTrigger className="mx-auto h-9 w-[100px]" aria-label={`Conformity for clause ${item.clause_no}`}>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            {CONFORMITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="min-w-[220px] align-middle text-center">
        <ChecklistObservationCell
          clauseNo={item.clause_no}
          conformity={item.conformity}
          value={item.remark}
          polishBusy={polishingField === 'remark'}
          polishLocked={polishLocked}
          onCommit={handleRemarkCommit}
          onPolish={handlePolishRemark}
        />
      </TableCell>
      <TableCell className="min-w-[220px] align-middle text-center">
        <ChecklistNonConformityCell
          clauseNo={item.clause_no}
          show={showNc}
          value={item.non_conformity}
          polishBusy={polishingField === 'non_conformity'}
          polishLocked={polishLocked}
          onCommit={handleNcCommit}
          onPolish={handlePolishNc}
        />
      </TableCell>
    </TableRow>
  )
}

function rowPropsEqual(prev: ChecklistTableRowProps, next: ChecklistTableRowProps): boolean {
  return (
    prev.item === next.item &&
    prev.selected === next.selected &&
    prev.polishingField === next.polishingField &&
    prev.polishLocked === next.polishLocked &&
    prev.onToggle === next.onToggle &&
    prev.onConformityChange === next.onConformityChange &&
    prev.onRemarkCommit === next.onRemarkCommit &&
    prev.onNonConformityCommit === next.onNonConformityCommit &&
    prev.onPolish === next.onPolish
  )
}

export const ChecklistTableRow = memo(ChecklistTableRowInner, rowPropsEqual)
