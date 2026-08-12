import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsDialogClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { CalibrationJobRow, CalibrationJobStage } from '../types'
import { fetchCalibrationJobsByStage } from './calibrationJobApi'
import {
  CalibrationJobStageTable,
  groupCalibrationJobsBySrf,
} from './CalibrationJobStageTable'

/** Jobs already forwarded from Review Data. */
const REVIEWED_STAGES: CalibrationJobStage[] = ['certificate_preparation']

function formatError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unable to load reviewed SRFs'
  return (err as { message?: string }).message ?? 'Unable to load reviewed SRFs'
}

export function ReviewedSrfsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [rows, setRows] = useState<CalibrationJobRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!open) {
      setSearch('')
      setPage(1)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchCalibrationJobsByStage(REVIEWED_STAGES)
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(formatError(err))
          setRows([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.srf_number, r.client_name, r.equipment_label, r.equipment_detail]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount))
  }, [pageCount])

  useEffect(() => {
    setPage(1)
  }, [search, pageSize])

  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize],
  )
  const pagedGroups = useMemo(() => groupCalibrationJobsBySrf(pagedRows), [pagedRows])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        overlayClassName="md:inset-y-0 md:left-[268px] md:right-0 md:w-auto"
        className={cn(
          limsDialogClass,
          'left-0 top-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:rounded-none',
          'md:left-[268px] md:h-[100dvh] md:w-[calc(100vw-268px)] md:max-w-[calc(100vw-268px)]',
          '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-wrap items-center gap-2 pr-10 sm:flex-nowrap sm:gap-3">
            <DialogHeader className="shrink-0 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                Reviewed SRF
              </DialogTitle>
            </DialogHeader>
            <div className="order-3 w-full min-w-0 sm:order-none sm:mx-1 sm:w-[40%] sm:max-w-[19.5rem] sm:flex-none">
              <Input
                type="search"
                placeholder="Search reviewed SRFs"
                aria-label="Search reviewed SRFs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(limsDarkBarSearchClass, 'h-8')}
              />
            </div>
            <div className="w-[6.5rem] shrink-0">
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger
                  className={cn(
                    limsDarkBarFieldClass,
                    'w-full border-amber-500/40 text-amber-100 focus:border-amber-500 focus:bg-stone-900 focus:text-amber-50',
                  )}
                  aria-label="Rows per page"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 / Page</SelectItem>
                  <SelectItem value="10">10 / Page</SelectItem>
                  <SelectItem value="20">20 / Page</SelectItem>
                  <SelectItem value="50">50 / Page</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="ml-auto hidden text-xs text-stone-300 sm:block">
              {filteredRows.length} {filteredRows.length === 1 ? 'item' : 'items'}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-gradient-to-b from-stone-100/90 to-stone-50 p-[1%]">
          <CalibrationJobStageTable
            stage="review_data"
            groups={pagedGroups}
            loading={loading}
            error={error}
            searchActive={search.trim().length > 0}
            selectedSrfIds={new Set()}
            onToggleSrf={() => undefined}
            onToggleAll={() => undefined}
            onForward={() => undefined}
            onReferback={() => undefined}
            hideAction
            emptyMessage="No reviewed SRFs yet. Forward equipment from Review Data to see it here."
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
