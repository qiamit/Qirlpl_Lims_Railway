import { Fragment, useState, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RESULT_REMARK_OPTIONS } from './evaluateResultConformity'
import {
  groupReportRowsBySectionCode,
  sortReportResultRows,
  type ReportResultRow,
} from './reportResultRows'
import { normalizeResultRemark, resultRemarkCellClass } from './resultRemarkUi'
import {
  ReportSectionCodeEditDialog,
  type ReportSectionCodeEditTarget,
} from './ReportSectionCodeEditDialog'

/** Full grid: vertical + horizontal lines; header/section rows emphasized */
const GRID_TABLE =
  'table-auto w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const GRID_HEAD = 'text-xs font-semibold text-foreground bg-muted/60 border-border whitespace-nowrap px-2 py-1.5'
const GRID_HEAD_ROW = 'border-b-2 border-primary/40 hover:bg-muted/60'
const GRID_CELL = 'text-xs border-border px-2 py-1.5 align-top'
const GRID_SECTION_ROW = 'bg-muted/30 hover:bg-muted/30 border-y-2 border-y-primary/30'
const GRID_SECTION_CELL = 'text-xs text-foreground font-semibold whitespace-pre-wrap px-3 py-2 border-border'

function columnCount(showScope: boolean): number {
  return showScope ? 8 : 7
}

function ResultDataRow({
  row,
  showScope,
  editable,
  onRemarkChange,
  disabled,
}: {
  row: ReportResultRow
  showScope: boolean
  editable?: boolean
  onRemarkChange?: (rowKey: string, remark: string) => void
  disabled?: boolean
}) {
  const remark = normalizeResultRemark(row.remark)

  return (
    <TableRow className="hover:bg-muted/20">
      <TableCell className={cn(GRID_CELL, 'text-center font-medium w-0 whitespace-nowrap')}>
        {row.srNo}
      </TableCell>
      <TableCell className={cn(GRID_CELL, 'text-left')}>
        <div className="font-medium leading-snug">{row.testName}</div>
        {row.testMethodClause && (
          <div className="mt-0.5 text-muted-foreground leading-snug">{row.testMethodClause}</div>
        )}
      </TableCell>
      <TableCell className={cn(GRID_CELL, 'text-center w-0 whitespace-nowrap')}>{row.unit}</TableCell>
      <TableCell className={cn(GRID_CELL, 'text-center whitespace-pre-wrap')}>
        {row.specifiedRequirement}
      </TableCell>
      <TableCell className={cn(GRID_CELL, 'text-center whitespace-pre-wrap font-medium w-0')}>
        {row.observedValue}
      </TableCell>
      <TableCell className={cn(GRID_CELL, 'text-center whitespace-pre-wrap w-0')}>
        {row.uncertainty}
      </TableCell>
      <TableCell
        className={cn(
          GRID_CELL,
          'text-center whitespace-pre-wrap font-medium w-0',
          !editable && resultRemarkCellClass(remark),
        )}
      >
        {editable && onRemarkChange ? (
          <Select
            value={remark}
            onValueChange={(value) => onRemarkChange(row.rowKey, value)}
            disabled={disabled}
          >
            <SelectTrigger
              className={cn(
                'h-8 min-w-[7rem] text-xs font-medium border-input/80',
                resultRemarkCellClass(remark),
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESULT_REMARK_OPTIONS.map((option) => (
                <SelectItem key={option} value={option} className="text-xs">
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          remark
        )}
      </TableCell>
      {showScope && (
        <TableCell className={cn(GRID_CELL, 'text-center w-0 whitespace-nowrap')}>{row.scope}</TableCell>
      )}
    </TableRow>
  )
}

function ResultsTableHeader({ showScope }: { showScope: boolean }) {
  return (
    <TableHeader>
      <TableRow className={GRID_HEAD_ROW}>
        <TableHead className={cn(GRID_HEAD, 'text-center w-0')}>Sr No</TableHead>
        <TableHead className={cn(GRID_HEAD, 'text-left')}>Test Name</TableHead>
        <TableHead className={cn(GRID_HEAD, 'text-center w-0')}>Unit</TableHead>
        <TableHead className={cn(GRID_HEAD, 'text-center')}>Specified Requirements</TableHead>
        <TableHead className={cn(GRID_HEAD, 'text-center w-0')}>Observed Value</TableHead>
        <TableHead className={cn(GRID_HEAD, 'text-center w-0')}>Uncertainty</TableHead>
        <TableHead className={cn(GRID_HEAD, 'text-center w-0')}>Remark</TableHead>
        {showScope && <TableHead className={cn(GRID_HEAD, 'text-center w-0')}>Scope</TableHead>}
      </TableRow>
    </TableHeader>
  )
}

function ResultsTableShell({
  embedded,
  children,
}: {
  embedded: boolean
  children: ReactNode
}) {
  const wrapClass = embedded ? 'overflow-x-auto' : 'rounded-md border overflow-x-auto'

  return (
    <div className={wrapClass}>
      <Table className={GRID_TABLE}>{children}</Table>
    </div>
  )
}

function ResultsGroupedBody({
  sections,
  colSpan,
  showScope,
  editable,
  onRemarkChange,
  disabled,
  sectionCodeEditable,
  onEditSectionCode,
}: {
  sections: ReturnType<typeof groupReportRowsBySectionCode>
  colSpan: number
  showScope: boolean
  editable?: boolean
  onRemarkChange?: (rowKey: string, remark: string) => void
  disabled?: boolean
  sectionCodeEditable?: boolean
  onEditSectionCode?: (target: ReportSectionCodeEditTarget) => void
}) {
  if (sections.length === 0) {
    return (
      <TableBody>
        <TableRow>
          <TableCell
            colSpan={colSpan}
            className={cn(GRID_CELL, 'text-sm text-muted-foreground py-4 text-center')}
          >
            No completed test parameter results.
          </TableCell>
        </TableRow>
      </TableBody>
    )
  }

  return (
    <TableBody className="[&_tr:last-child]:border-b">
      {sections.map((section) => (
        <Fragment key={section.testAllocationId || section.sectionCode}>
          <TableRow className={GRID_SECTION_ROW}>
            <TableCell colSpan={colSpan} className={GRID_SECTION_CELL}>
              <div className="flex items-center justify-between gap-3">
                <span>Section Code - {section.sectionCode}</span>
                {sectionCodeEditable &&
                  onEditSectionCode &&
                  section.sampleAllocationId &&
                  section.testAllocationId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 gap-1.5 text-xs font-normal"
                      onClick={() =>
                        onEditSectionCode({
                          sectionCode: section.sectionCode,
                          sampleAllocationId: section.sampleAllocationId,
                          testAllocationId: section.testAllocationId,
                        })
                      }
                      disabled={disabled}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      Edit
                    </Button>
                  )}
              </div>
            </TableCell>
          </TableRow>
          {section.rows.map((row) => (
            <ResultDataRow
              key={row.rowKey}
              row={row}
              showScope={showScope}
              editable={editable}
              onRemarkChange={onRemarkChange}
              disabled={disabled}
            />
          ))}
        </Fragment>
      ))}
    </TableBody>
  )
}

export function ReportResultsTable({
  rows,
  showScope = true,
  embedded = false,
  groupBySectionCode = false,
  editable = false,
  onRemarkChange,
  disabled,
  sampleId = null,
  sectionCodeEditable = false,
  onSectionCodeUpdated,
}: {
  rows: ReportResultRow[]
  showScope?: boolean
  embedded?: boolean
  groupBySectionCode?: boolean
  editable?: boolean
  onRemarkChange?: (rowKey: string, remark: string) => void
  disabled?: boolean
  sampleId?: string | null
  sectionCodeEditable?: boolean
  onSectionCodeUpdated?: (oldCode: string, newCode: string) => void
}) {
  const colSpan = columnCount(showScope)
  const sections = groupBySectionCode ? groupReportRowsBySectionCode(rows) : null
  const flatRows = groupBySectionCode ? null : sortReportResultRows(rows)
  const [sectionEditTarget, setSectionEditTarget] = useState<ReportSectionCodeEditTarget | null>(null)
  const [sectionEditOpen, setSectionEditOpen] = useState(false)

  const openSectionCodeEdit = (target: ReportSectionCodeEditTarget) => {
    setSectionEditTarget(target)
    setSectionEditOpen(true)
  }

  const tableShell = (children: ReactNode) => (
    <>
      <ResultsTableShell embedded={embedded}>{children}</ResultsTableShell>
      {sectionCodeEditable && sampleId && onSectionCodeUpdated && (
        <ReportSectionCodeEditDialog
          open={sectionEditOpen}
          onOpenChange={setSectionEditOpen}
          sampleId={sampleId}
          target={sectionEditTarget}
          onSaved={onSectionCodeUpdated}
        />
      )}
    </>
  )

  if (rows.length === 0 && !embedded) {
    return <p className="text-sm text-muted-foreground py-4 px-3">No completed test parameter results.</p>
  }

  if (sections) {
    return tableShell(
      <>
        <ResultsTableHeader showScope={showScope} />
        <ResultsGroupedBody
          sections={sections}
          colSpan={colSpan}
          showScope={showScope}
          editable={editable}
          onRemarkChange={onRemarkChange}
          disabled={disabled}
          sectionCodeEditable={sectionCodeEditable && Boolean(sampleId && onSectionCodeUpdated)}
          onEditSectionCode={openSectionCodeEdit}
        />
      </>,
    )
  }

  return tableShell(
    <>
      <ResultsTableHeader showScope={showScope} />
      <TableBody>
        {flatRows!.length === 0 ? (
          <TableRow>
            <TableCell colSpan={colSpan} className="text-sm text-muted-foreground py-4 text-center">
              No completed test parameter results.
            </TableCell>
          </TableRow>
        ) : (
          flatRows!.map((row) => (
            <ResultDataRow
              key={row.rowKey}
              row={row}
              showScope={showScope}
              editable={editable}
              onRemarkChange={onRemarkChange}
              disabled={disabled}
            />
          ))
        )}
      </TableBody>
    </>,
  )
}
