import { useCallback, useEffect, useMemo, useState } from 'react'
import { deleteConsentLetter, fetchConsentLetters } from './consentLetterDb'
import { ConsentLetterFooterBar } from './ConsentLetterFooterBar'
import { ConsentLetterGenerateDialog } from './ConsentLetterGenerateDialog'
import { ConsentLetterHeaderBar } from './ConsentLetterHeaderBar'
import { ConsentLetterTable } from './ConsentLetterTable'
import { ConsentLetterTestParametersViewDialog } from './ConsentLetterTestParametersViewDialog'
import { reprintConsentLetter, previewConsentLetter } from './reprintConsentLetter'
import type { ConsentLetterListRow } from './types'

export default function ConsentLetterMasterPage() {
  const [rows, setRows] = useState<ConsentLetterListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editRow, setEditRow] = useState<ConsentLetterListRow | null>(null)
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null)
  const [viewBusyId, setViewBusyId] = useState<string | null>(null)
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)
  const [testParamsRow, setTestParamsRow] = useState<ConsentLetterListRow | null>(null)
  const [testParamsOpen, setTestParamsOpen] = useState(false)

  const openGenerateDialog = () => {
    setEditRow(null)
    setDialogOpen(true)
  }

  const openEditDialog = (row: ConsentLetterListRow) => {
    setEditRow(row)
    setDialogOpen(true)
  }

  const loadList = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const list = await fetchConsentLetters()
      setRows(list)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to load consent letters'
      if (message.toLowerCase().includes('consent_letters')) {
        setError('Consent letters table is missing. Run migration 20260616000000_consent_letters.sql on Supabase.')
      } else {
        setError(message)
      }
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [
        r.consentLetterNo,
        r.letterDate,
        r.clientName,
        r.isCodeLabel,
        ...r.testParameterNames,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, safePage, pageSize])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllOnPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of paged) {
        if (checked) next.add(r.id)
        else next.delete(r.id)
      }
      return next
    })
  }

  const handleDownload = async (row: ConsentLetterListRow) => {
    setDownloadBusyId(row.id)
    try {
      await reprintConsentLetter(row)
    } finally {
      setDownloadBusyId(null)
    }
  }

  const handleView = async (row: ConsentLetterListRow) => {
    setViewBusyId(row.id)
    try {
      await previewConsentLetter(row)
    } finally {
      setViewBusyId(null)
    }
  }

  const handleViewTestParameters = (row: ConsentLetterListRow) => {
    setTestParamsRow(row)
    setTestParamsOpen(true)
  }

  const handleDelete = async (row: ConsentLetterListRow) => {
    const label = row.consentLetterNo.trim() || 'this consent letter'
    if (!window.confirm(`Delete consent letter ${label}? This cannot be undone.`)) return

    setDeleteBusyId(row.id)
    setError(null)
    try {
      await deleteConsentLetter(row.id)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(row.id)
        return next
      })
      await loadList()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete consent letter')
    } finally {
      setDeleteBusyId(null)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <ConsentLetterHeaderBar
        search={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onGenerate={openGenerateDialog}
      />

      <ConsentLetterTable
        rows={paged}
        loading={loading}
        error={error}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onDownload={(row) => void handleDownload(row)}
        onView={(row) => void handleView(row)}
        onViewTestParameters={handleViewTestParameters}
        onEdit={openEditDialog}
        onDelete={(row) => void handleDelete(row)}
        downloadBusyId={downloadBusyId}
        viewBusyId={viewBusyId}
        deleteBusyId={deleteBusyId}
      />

      <ConsentLetterTestParametersViewDialog
        row={testParamsRow}
        open={testParamsOpen}
        onOpenChange={(open) => {
          setTestParamsOpen(open)
          if (!open) setTestParamsRow(null)
        }}
      />

      <ConsentLetterFooterBar
        loading={loading}
        page={safePage}
        pageCount={pageCount}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number.parseInt(jumpTo, 10)
          if (!Number.isFinite(n) || n < 1) return
          setPage(Math.min(pageCount, n))
        }}
      />

      <ConsentLetterGenerateDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setEditRow(null)
          setDialogOpen(open)
        }}
        editRow={editRow}
        onSaved={() => {
          void loadList()
        }}
      />
    </div>
  )
}
