import { useCallback, useEffect, useMemo, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { ResultValidationFooterBar } from './ResultValidationFooterBar'
import { ResultValidationHeaderBar } from './ResultValidationHeaderBar'
import { ResultValidationRecordDialog } from './ResultValidationRecordDialog'
import { ResultValidationTable } from './ResultValidationTable'
import {
  createResultValidityCheck,
  deleteResultValidityChecks,
  fetchLookupOptions,
  fetchResultValidityChecks,
  updateResultValidityCheck,
} from './resultValidationDb'
import type {
  EquipmentOption,
  IqcOption,
  ResultValidityCheckForm,
  ResultValidityCheckRow,
  ResultValidityFilter,
  SampleOption,
  UserOption,
} from './types'
import type { ResultValidationModuleDef } from './resultValidationModules'

export default function ResultValidationMasterPage({ module }: { module: ResultValidationModuleDef }) {
  const fixedCheckType = module.checkType
  if (!fixedCheckType) return null
  const [rows, setRows] = useState<ResultValidityCheckRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ResultValidityFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const [users, setUsers] = useState<UserOption[]>([])
  const [equipment, setEquipment] = useState<EquipmentOption[]>([])
  const [iqcMasters, setIqcMasters] = useState<IqcOption[]>([])
  const [samples, setSamples] = useState<SampleOption[]>([])
  const [userNameMap, setUserNameMap] = useState<Map<string, string>>(() => new Map())

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editRow, setEditRow] = useState<ResultValidityCheckRow | null>(null)
  const [initialCheckType, setInitialCheckType] = useState<typeof fixedCheckType | undefined>()

  const loadLookups = useCallback(async () => {
    try {
      const opts = await fetchLookupOptions()
      setUsers(opts.users)
      setEquipment(opts.equipment)
      setIqcMasters(opts.iqcMasters)
      setSamples(opts.samples)
      setUserNameMap(opts.userNameMap)
    } catch {
      // Lookups are optional for list view
    }
  }, [])

  const loadList = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const list = await fetchResultValidityChecks()
      setRows(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load checks.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLookups()
    void loadList()
  }, [loadLookups, loadList])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of rows) {
      counts[r.checkType] = (counts[r.checkType] ?? 0) + 1
    }
    return counts
  }, [rows])

  const filtered = useMemo(() => {
    let list = rows
    if (filter !== 'all') {
      list = list.filter((r) => r.status === filter)
    }
    list = list.filter((r) => r.checkType === fixedCheckType)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((r) =>
        [r.checkRef, r.title, r.srfNumber, r.testParameterName, r.performedByName, r.equipmentLabel, r.iqcLabel]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    }
    return list
  }, [rows, filter, fixedCheckType, search])

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
    setSelectedIds(checked ? new Set(paged.map((r) => r.id)) : new Set())
  }

  const openNew = () => {
    setEditRow(null)
    setInitialCheckType(fixedCheckType)
    setDialogOpen(true)
  }

  const handleSave = async (form: ResultValidityCheckForm) => {
    setSaving(true)
    setSaveMessage(null)
    try {
      if (editRow) {
        await updateResultValidityCheck(editRow.id, form, userNameMap)
        setSaveMessage('Check updated.')
      } else {
        await createResultValidityCheck(form, userNameMap)
        setSaveMessage('Check saved.')
      }
      setDialogOpen(false)
      setEditRow(null)
      await loadList()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (row: ResultValidityCheckRow) => {
    if (!window.confirm(`Delete check ${row.checkRef}?`)) return
    setDeleteBusy(true)
    setSaveMessage(null)
    try {
      await deleteResultValidityChecks([row.id])
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(row.id)
        return next
      })
      setSaveMessage('Check deleted.')
      await loadList()
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : 'Delete failed.')
    } finally {
      setDeleteBusy(false)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Delete ${selectedIds.size} selected check(s)?`)) return
    setDeleteBusy(true)
    setSaveMessage(null)
    try {
      await deleteResultValidityChecks([...selectedIds])
      setSelectedIds(new Set())
      setSaveMessage('Selected checks deleted.')
      await loadList()
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : 'Delete failed.')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className={limsPageShellClass}>
      <ResultValidationHeaderBar
        module={module}
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
        filter={filter}
        onFilterChange={(v) => {
          setFilter(v)
          setPage(1)
        }}
        recordCount={typeCounts[fixedCheckType] ?? 0}
        onNewCheck={openNew}
      />

      <ResultValidationTable
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
      />

      <ResultValidationFooterBar
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

      <ResultValidationRecordDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        row={editRow}
        saving={saving}
        users={users}
        equipment={equipment}
        iqcMasters={iqcMasters}
        samples={samples}
        initialCheckType={initialCheckType ?? fixedCheckType}
        fixedCheckType={fixedCheckType}
        onSave={handleSave}
      />
    </div>
  )
}
