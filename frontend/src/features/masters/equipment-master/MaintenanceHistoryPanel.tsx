import { useState } from 'react'
import { ChevronDown, ChevronRight, History } from 'lucide-react'
import type { MaintenanceHistoryRecord } from './maintenanceHistory'
import type { MaintenanceChecklistItem } from './types'

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ChecklistPreview({ checklist }: { checklist: MaintenanceChecklistItem[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border/70">
      <table className="w-full min-w-[520px] text-xs">
        <thead className="bg-muted/40">
          <tr>
            <th className="p-2 text-center font-medium">#</th>
            <th className="p-2 text-center font-medium">Check Point</th>
            <th className="p-2 text-center font-medium w-24">Status</th>
            <th className="p-2 text-center font-medium">Repair If Any</th>
          </tr>
        </thead>
        <tbody>
          {checklist.map((row, index) => (
            <tr key={`${row.checkPoint}-${index}`} className="border-t border-border/60">
              <td className="p-2 text-center text-muted-foreground">{index + 1}</td>
              <td className="p-2">{row.checkPoint}</td>
              <td className="p-2 text-center">{row.status}</td>
              <td className="p-2">{row.repairIfAny || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function MaintenanceHistoryPanel({
  history,
  currentLastDate,
  currentDoneByName,
  currentChecklist,
}: {
  history: MaintenanceHistoryRecord[]
  currentLastDate?: string
  currentDoneByName?: string
  currentChecklist?: MaintenanceChecklistItem[]
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const hasCurrent =
    !!currentLastDate?.trim() && (currentChecklist?.length ?? 0) > 0

  if (history.length === 0 && !hasCurrent) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        No previous maintenance records yet. Use <strong>Save & Close</strong> to save the
        first record and start history.
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-slate-50/80 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        <History size={14} />
        Maintenance History
      </div>

      {hasCurrent ? (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 text-xs">
          <p className="font-medium text-primary">Latest saved (current)</p>
          <p className="mt-0.5 text-muted-foreground">
            Date: {formatDisplayDate(currentLastDate!)} · Done by: {currentDoneByName || '-'} ·{' '}
            {currentChecklist!.length} check point(s)
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-primary hover:underline">View checklist</summary>
            <div className="mt-2">
              <ChecklistPreview checklist={currentChecklist!} />
            </div>
          </details>
        </div>
      ) : null}

      {history.length > 0 ? (
        <div className="space-y-1.5">
          {history.map((record) => {
            const open = expandedId === record.id
            return (
              <div key={record.id} className="rounded-md border border-border bg-white">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-muted/30"
                  onClick={() => setExpandedId(open ? null : record.id)}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {formatDisplayDate(record.conductedOn)}
                  </span>
                  <span className="text-muted-foreground">
                    {record.doneByName || '—'} · {record.checklist.length} points · Next due{' '}
                    {formatDisplayDate(record.nextDueDate)}
                  </span>
                </button>
                {open ? (
                  <div className="border-t border-border px-3 pb-3 pt-2">
                    <ChecklistPreview checklist={record.checklist} />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
