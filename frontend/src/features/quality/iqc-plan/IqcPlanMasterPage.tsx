import { useCallback, useEffect, useMemo, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { IqcPlanFooterBar } from './IqcPlanFooterBar'
import { IqcPlanHeaderBar } from './IqcPlanHeaderBar'
import { IqcPlanRecordDialog } from './IqcPlanRecordDialog'
import { IqcPlanTable } from './IqcPlanTable'
import {
  createIqcPlanItem,
  deleteIqcPlanItems,
  fetchIqcPlanItems,
  updateIqcPlanItem,
} from './iqcPlanDb'
import type { IqcPlanFilter, IqcPlanForm, IqcPlanRow } from './types'
import { rowToIqcPlanForm } from './types'

export default function IqcPlanMasterPage() {
  const [rows, setRows] = useState<IqcPlanRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<IqcPlanFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const [frequencyUpdatingId, setFrequencyUpdatingId] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editRow, setEditRow] = useState<IqcPlanRow | null>(null)

  const loadList = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const list = await fetchIqcPlanItems()
      setRows(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load IQC plan.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const filtered = useMemo(() => {
    let list = rows
    if (filter !== 'all') {
      list = list.filter((row) => row.status === filter)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((row) =>
        [row.checkName, row.frequency, row.acceptanceCriteria, row.remarks]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    }
    return list
  }, [rows, filter, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(paged.map((row) => row.id)) : new Set())
  }

  const openNew = () => {
    setEditRow(null)
    setDialogOpen(true)
  }

  const handleSave = async (form: IqcPlanForm) => {
    setSaving(true)
    setSaveMessage(null)
    try {
      if (editRow) {
        await updateIqcPlanItem(editRow.id, form)
        setSaveMessage('Plan item updated.')
      } else {
        await createIqcPlanItem(form)
        setSaveMessage('Plan item saved.')
      }
      setDialogOpen(false)
      setEditRow(null)
      await loadList()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (row: IqcPlanRow) => {
    if (!window.confirm(`Delete plan item "${row.checkName}"?`)) return
    setDeleteBusy(true)
    setSaveMessage(null)
    try {
      await deleteIqcPlanItems([row.id])
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(row.id)
        return next
      })
      setSaveMessage('Plan item deleted.')
      await loadList()
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : 'Delete failed.')
    } finally {
      setDeleteBusy(false)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Delete ${selectedIds.size} selected plan item(s)?`)) return
    setDeleteBusy(true)
    setSaveMessage(null)
    try {
      await deleteIqcPlanItems([...selectedIds])
      setSelectedIds(new Set())
      setSaveMessage('Selected plan items deleted.')
      await loadList()
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : 'Delete failed.')
    } finally {
      setDeleteBusy(false)
    }
  }

  const handleFrequencyChange = async (row: IqcPlanRow, frequency: string) => {
    if (frequency === row.frequency) return
    setFrequencyUpdatingId(row.id)
    setSaveMessage(null)
    try {
      await updateIqcPlanItem(row.id, { ...rowToIqcPlanForm(row), frequency })
      setSaveMessage('Frequency updated.')
      await loadList()
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : 'Frequency update failed.')
    } finally {
      setFrequencyUpdatingId(null)
    }
  }

  return (
    <div className={limsPageShellClass}>
      <IqcPlanHeaderBar
        search={search}
        onSearchChange={(value) => {
          setSearch(value)
          setPage(1)
        }}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        filter={filter}
        onFilterChange={(value) => {
          setFilter(value)
          setPage(1)
        }}
        onNewItem={openNew}
      />

      <IqcPlanTable
        rows={paged}
        loading={loading}
        error={error}
        selectedIds={selectedIds}
        onToggle={toggle}
        onToggleAll={toggleAll}
        onEdit={(row) => {
          setEditRow(row)
          setDialogOpen(true)
        }}
        onDelete={(row) => void handleDelete(row)}
        onFrequencyChange={(row, frequency) => void handleFrequencyChange(row, frequency)}
        frequencyUpdatingId={frequencyUpdatingId}
      />

      <IqcPlanFooterBar
        loading={loading}
        message={saveMessage}
        selectedCount={selectedIds.size}
        page={page}
        pageCount={pageCount}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number(jumpTo)
          if (Number.isFinite(n) && n >= 1 && n <= pageCount) setPage(n)
        }}
        onDeleteSelected={() => void handleDeleteSelected()}
        deleteBusy={deleteBusy}
      />

      <IqcPlanRecordDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        row={editRow}
        saving={saving}
        onSave={handleSave}
      />
    </div>
  )
}
