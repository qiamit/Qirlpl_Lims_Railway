import { Download, Eye, List, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ConsentLetterListRow } from './types'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

export function ConsentLetterTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onDownload,
  onView,
  onViewTestParameters,
  onEdit,
  onDelete,
  downloadBusyId,
  viewBusyId,
  deleteBusyId,
}: {
  rows: ConsentLetterListRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onDownload: (row: ConsentLetterListRow) => void
  onView: (row: ConsentLetterListRow) => void
  onViewTestParameters: (row: ConsentLetterListRow) => void
  onEdit: (row: ConsentLetterListRow) => void
  onDelete: (row: ConsentLetterListRow) => void
  downloadBusyId: string | null
  viewBusyId: string | null
  deleteBusyId: string | null
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20 overflow-hidden">
      {error ? <p className="px-4 pt-4 text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-stone-800 hover:bg-stone-800">
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 w-10 text-center">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = !allChecked && someChecked
                  }}
                  onChange={(e) => onToggleAll(e.target.checked)}
                />
              </TableHead>
              <TableHead className="text-xs" style={{ width: '14%' }}>
                Letter No
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center" style={{ width: '10%' }}>
                Date
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center" style={{ width: '22%' }}>
                Client
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center" style={{ width: '18%' }}>
                IS Code
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center" style={{ width: '12%' }}>
                Test Parameters
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center" style={{ width: '16%' }}>
                Action
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  No consent letters generated yet. Use Generate Consent Letter to create one.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-center">
                    <input
                      type="checkbox"
                      aria-label={`Select ${fmt(r.consentLetterNo)}`}
                      checked={selectedIds.has(r.id)}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium line-clamp-2 break-words">{fmt(r.consentLetterNo)}</div>
                  </TableCell>
                  <TableCell className="text-center text-xs">{fmt(r.letterDate)}</TableCell>
                  <TableCell className="text-center">
                    <div className="line-clamp-2 break-words text-xs">{fmt(r.clientName)}</div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="line-clamp-2 break-words text-xs">{fmt(r.isCodeLabel)}</div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 px-2.5"
                      aria-label={`View test parameters for ${fmt(r.consentLetterNo)}`}
                      title="View test parameters"
                      disabled={r.testParameterNames.length === 0}
                      onClick={() => onViewTestParameters(r)}
                    >
                      <List size={14} />
                      View
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={`View ${fmt(r.consentLetterNo)}`}
                        title="View consent letter"
                        disabled={viewBusyId === r.id || downloadBusyId === r.id || deleteBusyId === r.id}
                        onClick={() => onView(r)}
                      >
                        <Eye size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={`Download ${fmt(r.consentLetterNo)}`}
                        title="Download PDF"
                        disabled={downloadBusyId === r.id || viewBusyId === r.id || deleteBusyId === r.id}
                        onClick={() => onDownload(r)}
                      >
                        <Download size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={`Edit ${fmt(r.consentLetterNo)}`}
                        title="Edit"
                        disabled={deleteBusyId === r.id}
                        onClick={() => onEdit(r)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label={`Delete ${fmt(r.consentLetterNo)}`}
                        title="Delete"
                        disabled={deleteBusyId === r.id || viewBusyId === r.id || downloadBusyId === r.id}
                        onClick={() => onDelete(r)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
