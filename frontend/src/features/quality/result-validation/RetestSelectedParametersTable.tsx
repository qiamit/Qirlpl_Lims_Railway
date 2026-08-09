import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  RETEST_STATUS_OPTIONS,
  normalizeRetestStatus,
  retestStatusFromResult,
  type RetestStatus,
} from './retestParameters'
import type { RetestParameterEntry } from './types'

const GRID_TABLE =
  'table-auto w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const GRID_HEAD =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 whitespace-nowrap px-2 py-1.5 border-stone-700'
const GRID_CELL = 'text-xs border-border px-2 py-1.5 align-middle text-center'

function statusCellClass(status: RetestStatus): string {
  return cn(
    status === 'Pass' && 'text-emerald-700 dark:text-emerald-400 font-medium',
    status === 'Fail' && 'text-destructive font-medium',
    status === '—' && 'text-muted-foreground',
  )
}

export function RetestSelectedParametersTable({
  rows,
  acceptanceCriteria,
  onChange,
  onRemove,
}: {
  rows: RetestParameterEntry[]
  acceptanceCriteria: string
  onChange: (rows: RetestParameterEntry[]) => void
  onRemove: (id: string) => void
}) {
  const updateRow = (id: string, patch: Partial<RetestParameterEntry>) => {
    onChange(
      rows.map((row) => {
        if (row.id !== id) return row
        const next = { ...row, ...patch }
        if ('newResult' in patch && acceptanceCriteria.trim()) {
          next.status = retestStatusFromResult(next.newResult, acceptanceCriteria)
        }
        return next
      }),
    )
  }

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border/80 px-3 py-4 text-center">
        No test parameters added. Select SRF and click Add Test Parameter.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border/80 max-h-64 overflow-y-auto">
      <Table className={GRID_TABLE}>
        <TableHeader>
          <TableRow className="bg-stone-800 hover:bg-stone-800">
            <TableHead className={cn(GRID_HEAD, 'min-w-[120px]')}>Test Name</TableHead>
            <TableHead className={cn(GRID_HEAD, 'min-w-[120px]')}>Test Method</TableHead>
            <TableHead className={cn(GRID_HEAD, 'min-w-[70px]')}>Unit</TableHead>
            <TableHead className={cn(GRID_HEAD, 'min-w-[90px]')}>Uncertainty</TableHead>
            <TableHead className={cn(GRID_HEAD, 'min-w-[100px]')}>Old Results</TableHead>
            <TableHead className={cn(GRID_HEAD, 'min-w-[120px]')}>New Results</TableHead>
            <TableHead className={cn(GRID_HEAD, 'min-w-[140px]')}>
              Status (Pass as per Acceptance criteria)
            </TableHead>
            <TableHead className={cn(GRID_HEAD, 'w-10 p-1')} aria-label="Remove" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="hover:bg-muted/20">
              <TableCell className={cn(GRID_CELL, 'font-medium')}>{row.testName || '—'}</TableCell>
              <TableCell className={cn(GRID_CELL, 'text-muted-foreground whitespace-pre-wrap')}>
                {row.testMethod || '—'}
              </TableCell>
              <TableCell className={cn(GRID_CELL, 'whitespace-nowrap')}>{row.unit || '—'}</TableCell>
              <TableCell className={cn(GRID_CELL, 'whitespace-nowrap')}>
                {row.uncertainty || '—'}
              </TableCell>
              <TableCell className={cn(GRID_CELL, 'whitespace-pre-wrap')}>
                {row.oldResult || '—'}
              </TableCell>
              <TableCell className={cn(GRID_CELL, 'p-1')}>
                <Input
                  value={row.newResult}
                  onChange={(e) => updateRow(row.id, { newResult: e.target.value })}
                  placeholder="Enter retest result"
                  className="h-8 text-xs text-center"
                  aria-label={`New result for ${row.testName}`}
                />
              </TableCell>
              <TableCell className={cn(GRID_CELL, 'p-1')}>
                <Select
                  value={normalizeRetestStatus(row.status)}
                  onValueChange={(v) => updateRow(row.id, { status: v as RetestStatus })}
                >
                  <SelectTrigger
                    className={cn(
                      'h-8 text-xs mx-auto',
                      statusCellClass(normalizeRetestStatus(row.status)),
                    )}
                    aria-label={`Status for ${row.testName}`}
                  >
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {RETEST_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt} className="text-xs">
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className={cn(GRID_CELL, 'p-1')}>
                <div className="flex justify-center">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    aria-label={`Remove ${row.testName}`}
                    onClick={() => onRemove(row.id)}
                  >
                    <X size={14} />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
