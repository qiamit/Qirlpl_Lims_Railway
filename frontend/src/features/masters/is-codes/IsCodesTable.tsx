import { ExternalLink, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'
import { buildIsCodeAssistantContext, formatIsCodeLabel } from './buildIsCodeAssistantContext'
import type { IsCodeRow } from './types'

export function IsCodesTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onViewFiles,
  onAssistantDataChanged,
}: {
  rows: IsCodeRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: () => void
  onEdit: (row: IsCodeRow) => void
  onViewFiles: (row: IsCodeRow) => void
  onAssistantDataChanged?: () => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs w-10 text-center">
                <input type="checkbox" aria-label="Select all" checked={allChecked} onChange={onToggleAll} />
              </TableHead>
              <TableHead className="text-xs" style={{ width: '15%' }}>IS Details</TableHead>
              <TableHead className="text-xs text-center" style={{ width: '35%' }}>IS Title</TableHead>
              <TableHead className="text-xs text-center" style={{ width: '20%' }}>Reaffirmation / Amendment</TableHead>
              <TableHead className="text-xs text-center" style={{ width: '20%' }}>Aspect &amp; Charges</TableHead>
              <TableHead className="text-xs text-center" style={{ width: '10%' }}>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  No records.
                </TableCell>
              </TableRow>
            )}

            {rows.map((r) => {
              const checked = selectedIds.has(r.id)
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-center">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.is_number}`}
                      checked={checked}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>

                  <TableCell>
                    <div className="font-medium">
                      {r.is_number}
                      {r.revision_year ? ` : ${r.revision_year}` : ''}
                    </div>
                    <button
                      type="button"
                      onClick={() => onViewFiles(r)}
                      className="mt-1 text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      View Files
                      <ExternalLink size={12} />
                    </button>
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="font-medium">{r.title}</div>
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="text-xs">{r.reaffirmation_year || '-'}</div>
                    <div className="text-xs text-muted-foreground">Amendment: {r.amendment_number || '-'}</div>
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="text-xs">{r.aspect}</div>
                    <div className="text-xs text-muted-foreground">
                      Testing Charges: Rs {Number(r.testing_charges ?? 0).toFixed(2)}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center justify-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => onEdit(r)} aria-label="Edit">
                        <Pencil size={14} />
                      </Button>
                      <QiAssistant
                        page="is-codes"
                        pageTitle={formatIsCodeLabel(r)}
                        contextSummary={buildIsCodeAssistantContext(r)}
                        isCodeId={r.id}
                        triggerVariant="icon"
                        welcomeMessage={`I'm your **IS Code Assistant** for **${formatIsCodeLabel(r)}** — *${r.title}* (id: \`${r.id}\`). I can answer from uploaded PDFs and **update this IS** (e.g. change title) when you ask.`}
                        suggestedQuestions={[
                          'Summarize the scope of this standard',
                          'What are the main testing requirements?',
                          'Change the title of this IS code to Steel maap',
                          'List key clauses from the uploaded PDF',
                        ]}
                        onDataChanged={onAssistantDataChanged}
                        enablePdfImport={false}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
