import { useMemo, useState } from 'react'
import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { ServiceRequestRow } from './types'

const GRID_TABLE =
  'min-w-[900px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const VIEW_GRID =
  'min-w-[720px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function cellText(value: string | null | undefined): string {
  const t = (value ?? '').trim()
  return t.length > 0 ? t : '—'
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = value.slice(0, 10)
  return d || '—'
}

type ParsedEquipment = {
  name: string
  leastCount: string
  range: string
  make: string
  model: string
  serial: string
  quantity: string
}

function takePrefixed(parts: string[], prefix: RegExp): string {
  const idx = parts.findIndex((p) => prefix.test(p))
  if (idx < 0) return ''
  const raw = parts[idx]!
  parts.splice(idx, 1)
  return raw.replace(prefix, '').trim()
}

/** Parse saved equipment_description lines into table rows. */
export function parseEquipmentDescription(description: string | null | undefined): ParsedEquipment[] {
  const text = (description ?? '').trim()
  if (!text) return []

  return text
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const parts = chunk.split('·').map((p) => p.trim()).filter(Boolean)
      const head = parts.shift() ?? ''
      // Strip legacy "(ASSET-CODE)" suffix if present in older saved rows
      const name = head.replace(/\s*\([^)]*\)\s*$/, '').trim()

      const leastCount = takePrefixed(parts, /^lc\s+/i)
      const range = takePrefixed(parts, /^range\s+/i)
      const make = takePrefixed(parts, /^make\s+/i)
      const model = takePrefixed(parts, /^model\s+/i)
      const serial = takePrefixed(parts, /^s\/n\s+/i)
      const quantity = takePrefixed(parts, /^qty\s+/i)

      // Drop legacy Inside/Outside tokens (decision is at Job Allocation)
      const locIdx = parts.findIndex((p) => /^(inside|outside|in lab|on site)$/i.test(p))
      if (locIdx >= 0) parts.splice(locIdx, 1)

      return {
        name: name || '—',
        leastCount,
        range,
        make,
        model,
        serial,
        quantity,
      }
    })
}

function ViewEquipmentButton({
  srfNumber,
  description,
}: {
  srfNumber: string
  description: string | null | undefined
}) {
  const [open, setOpen] = useState(false)
  const items = useMemo(() => parseEquipmentDescription(description), [description])

  if (items.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 border-teal-600/40 px-2.5 text-xs font-medium text-teal-800 hover:bg-teal-50"
        onClick={() => setOpen(true)}
        aria-label={`View equipment for ${srfNumber}`}
      >
        View ({items.length})
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-5xl gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg"
          aria-describedby={undefined}
        >
          <div className="relative bg-slate-900 px-4 py-4 text-white sm:px-6 sm:py-5">
            <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-8 text-left">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                Service Request · Equipment
              </p>
              <DialogTitle className="text-xl font-semibold tracking-tight text-white">
                Equipment — {srfNumber || 'SRF'}
              </DialogTitle>
              <p className="mt-1 text-xs text-slate-300">{items.length} item(s)</p>
            </DialogHeader>
          </div>

          <div className="max-h-[min(70vh,560px)] overflow-auto bg-[#fafbfc] px-4 py-4 sm:px-6 sm:py-5">
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <Table className={VIEW_GRID}>
                <TableHeader>
                  <TableRow className="bg-stone-800 hover:bg-stone-800">
                    <TableHead className="min-w-[160px] text-left text-xs">Name</TableHead>
                    <TableHead className="min-w-[100px] text-center text-xs">Least Count</TableHead>
                    <TableHead className="min-w-[110px] text-center text-xs">Range</TableHead>
                    <TableHead className="min-w-[90px] text-center text-xs">Make</TableHead>
                    <TableHead className="min-w-[90px] text-center text-xs">Model</TableHead>
                    <TableHead className="min-w-[90px] text-center text-xs">Serial</TableHead>
                    <TableHead className="min-w-[70px] text-center text-xs">Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, i) => (
                    <TableRow key={`${item.name}-${i}`}>
                      <TableCell className="align-middle text-left">
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                      </TableCell>
                      <TableCell className="align-middle text-center text-sm">
                        {cellText(item.leastCount)}
                      </TableCell>
                      <TableCell className="align-middle text-center text-sm">
                        {cellText(item.range)}
                      </TableCell>
                      <TableCell className="align-middle text-center text-sm">
                        {cellText(item.make)}
                      </TableCell>
                      <TableCell className="align-middle text-center text-sm">
                        {cellText(item.model)}
                      </TableCell>
                      <TableCell className="align-middle text-center text-sm">
                        {cellText(item.serial)}
                      </TableCell>
                      <TableCell className="align-middle text-center text-sm">
                        {cellText(item.quantity)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ServiceRequestTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onCopy,
}: {
  rows: ServiceRequestRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: ServiceRequestRow) => void
  onCopy: (row: ServiceRequestRow) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="overflow-hidden overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
      {error ? <p className="px-3 pt-3 text-sm text-destructive sm:px-5 sm:pt-4">{error}</p> : null}

      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 rounded-lg border border-dashed border-border p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-muted-foreground">
            {searchActive ? 'No service requests match your search.' : 'No service requests added yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Use &quot;Add New Request&quot; to create your first SRF.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className={GRID_TABLE}>
            <TableHeader>
              <TableRow className="bg-stone-800 hover:bg-stone-800">
                <TableHead className="sticky left-0 z-10 w-12 bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 sm:w-14">
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    aria-label="Select all"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = !allChecked && someChecked
                    }}
                    onChange={(e) => onToggleAll(e.target.checked)}
                  />
                </TableHead>
                <TableHead className="sticky left-12 z-10 min-w-[120px] bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 sm:left-14">
                  SRF Number
                </TableHead>
                <TableHead className="min-w-[100px] text-center text-xs">SRF Date</TableHead>
                <TableHead className="min-w-[160px] text-left text-xs">Client</TableHead>
                <TableHead className="min-w-[100px] text-center text-xs">Equipment</TableHead>
                <TableHead className="min-w-[100px] text-center text-xs">Status</TableHead>
                <TableHead className="min-w-[96px] text-center text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const selected = selectedIds.has(r.id)
                return (
                  <TableRow key={r.id} data-state={selected ? 'selected' : undefined}>
                    <TableCell
                      className={cn(
                        'sticky left-0 z-10 text-center align-middle',
                        selected ? 'bg-muted' : 'bg-card',
                      )}
                    >
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select ${r.srf_number}`}
                        checked={selected}
                        onChange={() => onToggle(r.id)}
                      />
                    </TableCell>
                    <TableCell
                      className={cn(
                        'sticky left-12 z-10 align-middle text-center sm:left-14',
                        selected ? 'bg-muted' : 'bg-card',
                      )}
                    >
                      <p className="truncate font-mono text-sm text-foreground">{cellText(r.srf_number)}</p>
                    </TableCell>
                    <TableCell className="align-middle text-center text-sm">
                      {formatDate(r.srf_date)}
                    </TableCell>
                    <TableCell className="align-middle text-left">
                      <p className="truncate text-sm font-medium" title={r.client_name ?? undefined}>
                        {cellText(r.client_name)}
                      </p>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <ViewEquipmentButton
                        srfNumber={r.srf_number}
                        description={r.equipment_description}
                      />
                    </TableCell>
                    <TableCell className="align-middle text-center text-sm">{cellText(r.status)}</TableCell>
                    <TableCell className="align-middle text-center">
                      <div className="inline-flex items-center justify-center gap-0.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Edit ${r.srf_number}`}
                          onClick={() => onEdit(r)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Copy ${r.srf_number}`}
                          onClick={() => onCopy(r)}
                        >
                          <Copy size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
