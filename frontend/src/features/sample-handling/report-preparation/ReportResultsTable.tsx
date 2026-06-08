import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
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

/** Full grid: vertical + horizontal lines; header/section rows emphasized */
const GRID_TABLE =
  'border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const GRID_HEAD = 'text-xs font-semibold text-foreground bg-muted/60 border-border'
const GRID_HEAD_ROW = 'border-b-2 border-primary/40 hover:bg-muted/60'
const GRID_CELL = 'text-xs border-border'
const GRID_SECTION_ROW = 'bg-muted/30 hover:bg-muted/30 border-y-2 border-y-primary/30'
const GRID_SECTION_CELL = 'text-xs text-foreground font-semibold whitespace-pre-wrap px-3 py-2 border-border'

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
      <TableCell className={cn(GRID_CELL, 'text-center font-medium w-12')}>{row.srNo}</TableCell>
      <TableCell className={cn(GRID_CELL, 'text-left min-w-[200px]')}>
        <div className="font-medium leading-snug">{row.testName}</div>
        {row.testMethodClause && (
          <div className="mt-0.5 text-muted-foreground leading-snug">{row.testMethodClause}</div>
        )}
      </TableCell>
      <TableCell className={cn(GRID_CELL, 'text-center')}>{row.unit}</TableCell>
      <TableCell className={cn(GRID_CELL, 'text-center whitespace-pre-wrap min-w-[120px]')}>
        {row.specifiedRequirement}
      </TableCell>
      <TableCell className={cn(GRID_CELL, 'text-center whitespace-pre-wrap font-medium min-w-[100px]')}>
        {row.observedValue}
      </TableCell>
      <TableCell
        className={cn(
          GRID_CELL,
          'text-center whitespace-pre-wrap font-medium min-w-[120px]',
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
                'h-8 text-xs font-medium border-input/80',
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
      {showScope && <TableCell className={cn(GRID_CELL, 'text-center')}>{row.scope}</TableCell>}
    </TableRow>
  )
}

function ResultsTableHeader({ showScope }: { showScope: boolean }) {
  return (
    <TableHeader>
      <TableRow className={GRID_HEAD_ROW}>
        <TableHead className={cn(GRID_HEAD, 'text-center w-12')}>Sr No</TableHead>
        <TableHead className={cn(GRID_HEAD, 'text-left min-w-[200px]')}>Test Name</TableHead>
        <TableHead className={cn(GRID_HEAD, 'text-center')}>Unit</TableHead>
        <TableHead className={cn(GRID_HEAD, 'text-center min-w-[120px]')}>Specified Requirements</TableHead>
        <TableHead className={cn(GRID_HEAD, 'text-center min-w-[100px]')}>Observed Value</TableHead>
        <TableHead className={cn(GRID_HEAD, 'text-center min-w-[100px]')}>Remark</TableHead>
        {showScope && <TableHead className={cn(GRID_HEAD, 'text-center')}>Scope</TableHead>}
      </TableRow>
    </TableHeader>
  )
}

function ResultsTableShell({
  showScope,
  embedded,
  children,
}: {
  showScope: boolean
  embedded: boolean
  children: ReactNode
}) {
  const colSpan = showScope ? 7 : 6
  const wrapClass = embedded ? 'overflow-x-auto' : 'rounded-md border overflow-x-auto'

  return (
    <div className={wrapClass}>
      <Table className={embedded ? GRID_TABLE : undefined}>{children}</Table>
    </div>
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
}: {
  rows: ReportResultRow[]
  showScope?: boolean
  embedded?: boolean
  groupBySectionCode?: boolean
  editable?: boolean
  onRemarkChange?: (rowKey: string, remark: string) => void
  disabled?: boolean
}) {
  const colSpan = showScope ? 7 : 6
  const displayRows = groupBySectionCode ? rows : sortReportResultRows(rows)

  if (rows.length === 0 && !embedded) {
    return <p className="text-sm text-muted-foreground py-4 px-3">No completed test parameter results.</p>
  }

  if (groupBySectionCode && embedded) {
    const sections = groupReportRowsBySectionCode(displayRows)

    if (sections.length === 0) {
      return (
        <ResultsTableShell showScope={showScope} embedded={embedded}>
          <ResultsTableHeader showScope={showScope} />
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
        </ResultsTableShell>
      )
    }

    return (
      <ResultsTableShell showScope={showScope} embedded={embedded}>
        <ResultsTableHeader showScope={showScope} />
        <TableBody className="[&_tr:last-child]:border-b">
          {sections.map((section) => (
            <Fragment key={section.sectionCode}>
              <TableRow className={GRID_SECTION_ROW}>
                <TableCell colSpan={colSpan} className={GRID_SECTION_CELL}>
                  Section Code - {section.sectionCode}
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
      </ResultsTableShell>
    )
  }

  return (
    <ResultsTableShell showScope={showScope} embedded={embedded}>
      <ResultsTableHeader showScope={showScope} />
      <TableBody>
        {displayRows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={colSpan} className="text-sm text-muted-foreground py-4 text-center">
              No completed test parameter results.
            </TableCell>
          </TableRow>
        ) : (
          displayRows.map((row) => (
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
    </ResultsTableShell>
  )
}
