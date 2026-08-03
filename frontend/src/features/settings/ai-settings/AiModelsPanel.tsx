import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { Pencil, Trash2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { AiSettingsFooterBar } from './AiSettingsFooterBar'
import { deleteAiModel, fetchAiModels, upsertAiModel } from './aiSettingsApi'
import {
  AI_PROVIDERS,
  AI_PROVIDER_MODEL_HINTS,
  DEEPSEEK_API_BASE,
  DEEPSEEK_MODEL_OPTIONS,
  emptyAiModelForm,
  maskApiKey,
  type AiModelForm,
  type AiModelRow,
  type AiProvider,
} from './types'

const GRID_TABLE =
  'w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const fieldControlClass =
  'h-10 rounded-none border-0 border-b border-slate-300 bg-transparent px-0 shadow-none text-slate-900 placeholder:text-slate-400 focus-visible:border-teal-600 focus-visible:ring-0'

export type AiModelsPanelHandle = {
  openCreate: () => void
}

type AiModelsPanelProps = {
  searchQuery: string
}

export const AiModelsPanel = forwardRef<AiModelsPanelHandle, AiModelsPanelProps>(function AiModelsPanel(
  { searchQuery },
  ref,
) {
  const [rows, setRows] = useState<AiModelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<AiModelForm>(emptyAiModelForm)
  const [saving, setSaving] = useState(false)
  const [hadExistingKey, setHadExistingKey] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await fetchAiModels())
      setSelectedIds(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = useCallback(() => {
    setEditId(null)
    setHadExistingKey(false)
    setForm(emptyAiModelForm())
    setDialogOpen(true)
  }, [])

  useImperativeHandle(ref, () => ({ openCreate }), [openCreate])

  const openEdit = (row: AiModelRow) => {
    setEditId(row.id)
    setHadExistingKey(Boolean(row.api_key?.trim()))
    setForm({
      provider: row.provider as AiProvider,
      modelId: row.model_id,
      displayName: row.display_name,
      apiKey: '',
      apiBaseUrl: row.api_base_url ?? '',
      isDefault: row.is_default,
      isActive: row.is_active,
    })
    setDialogOpen(true)
  }

  const handleSave = () => {
    void (async () => {
      setSaving(true)
      setMessage(null)
      try {
        if (!form.displayName.trim() || !form.modelId.trim()) {
          throw new Error('Display name and model ID are required')
        }
        if (!editId && !form.apiKey.trim()) {
          throw new Error('API key is required for a new model')
        }

        await upsertAiModel(
          {
            provider: form.provider,
            model_id: form.modelId.trim(),
            display_name: form.displayName.trim(),
            api_key: form.apiKey.trim() || null,
            api_base_url: form.apiBaseUrl.trim() || null,
            is_default: form.isDefault,
            is_active: form.isActive,
          },
          editId,
          Boolean(editId && hadExistingKey && !form.apiKey.trim()),
        )

        setMessage('Model saved.')
        setDialogOpen(false)
        await load()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Unable to save model')
      } finally {
        setSaving(false)
      }
    })()
  }

  const handleDelete = (row: AiModelRow) => {
    if (!window.confirm(`Delete model "${row.display_name}"?`)) return
    void (async () => {
      try {
        await deleteAiModel(row.id)
        setMessage('Model deleted.')
        await load()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Unable to delete model')
      }
    })()
  }

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} selected model${ids.length === 1 ? '' : 's'}?`)) return
    void (async () => {
      try {
        for (const id of ids) {
          await deleteAiModel(id)
        }
        setMessage(
          ids.length === 1 ? 'Model deleted.' : `${ids.length} models deleted.`,
        )
        await load()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Unable to delete selected models')
      }
    })()
  }

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.display_name, r.provider, r.model_id, r.is_active ? 'active' : 'inactive', r.is_default ? 'default' : '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [rows, searchQuery])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  useEffect(() => {
    setPage(1)
    setJumpTo('')
  }, [searchQuery, pageSize])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

  const allPagedChecked =
    pagedRows.length > 0 && pagedRows.every((r) => selectedIds.has(r.id))
  const somePagedChecked = pagedRows.some((r) => selectedIds.has(r.id))

  const toggleAllPaged = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of pagedRows) {
        if (checked) next.add(r.id)
        else next.delete(r.id)
      }
      return next
    })
  }

  const messageIsError =
    !!message &&
    (message.toLowerCase().includes('unable') ||
      message.toLowerCase().includes('failed') ||
      message.toLowerCase().includes('required'))

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && (
        <p className={messageIsError ? 'text-sm text-destructive' : 'text-sm text-emerald-700'}>{message}</p>
      )}

      {loading ? (
        <div className="rounded-xl border border-border bg-card px-5 py-8 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">Loading models…</p>
        </div>
      ) : (
        <>
          {selectedIds.size > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{selectedIds.size}</span> selected
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={handleBulkDelete}
              >
                <Trash2 size={14} />
                Delete selected
              </Button>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {pagedRows.length > 0 ? (
              <Table className={GRID_TABLE}>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-12 text-center text-xs sm:w-14">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label="Select all on this page"
                        checked={allPagedChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = !allPagedChecked && somePagedChecked
                        }}
                        onChange={(e) => toggleAllPaged(e.target.checked)}
                      />
                    </TableHead>
                    <TableHead className="text-xs text-center">Name</TableHead>
                    <TableHead className="text-xs text-center">Provider</TableHead>
                    <TableHead className="text-xs text-center">Model ID</TableHead>
                    <TableHead className="text-xs text-center">API Key</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                    <TableHead className="text-xs text-center w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map((r) => (
                    <TableRow
                      key={r.id}
                      data-state={selectedIds.has(r.id) ? 'selected' : undefined}
                    >
                      <TableCell className="text-center align-middle">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          aria-label={`Select ${r.display_name}`}
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleRow(r.id)}
                        />
                      </TableCell>
                      <TableCell className="align-middle text-left">
                        <div className="space-y-0.5">
                          <p className="font-medium text-foreground">{r.display_name}</p>
                          {r.is_default ? (
                            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Star size={11} className="fill-current text-amber-500" />
                              Default
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm capitalize align-middle">{r.provider}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground align-middle">{r.model_id}</TableCell>
                      <TableCell className="text-center text-xs font-mono align-middle">{maskApiKey(r.api_key)}</TableCell>
                      <TableCell className="text-center align-middle">
                        <span
                          className={cn(
                            'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
                            r.is_active
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {r.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        <div className="inline-flex items-center justify-center gap-0.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={`Edit ${r.display_name}`}
                            onClick={() => openEdit(r)}
                          >
                            <Pencil size={16} />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={`Delete ${r.display_name}`}
                            onClick={() => handleDelete(r)}
                          >
                            <Trash2 size={16} className="text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {searchQuery.trim()
                    ? 'No models match your search.'
                    : 'No AI models configured yet.'}
                </p>
                {!searchQuery.trim() && (
                  <p className="mt-1 text-xs text-muted-foreground">Use &quot;Add Model&quot; to connect a provider.</p>
                )}
              </div>
            )}
          </div>

          <AiSettingsFooterBar
            totalCount={filteredRows.length}
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            jumpTo={jumpTo}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
            onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
            onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
            onJumpToChange={setJumpTo}
            onJumpToGo={() => {
              const n = Number(jumpTo)
              if (!Number.isFinite(n) || n < 1) return
              setPage(Math.min(pageCount, Math.max(1, Math.floor(n))))
            }}
          />
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-h-[92vh] max-w-2xl gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:opacity-100 [&>button]:hover:bg-white/10"
          aria-describedby={undefined}
        >
          <div className="relative bg-slate-900 px-6 py-5 text-white">
            <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
            <DialogHeader className="relative pr-8 text-left">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                AI Registry · {editId ? 'Edit Entry' : 'New Entry'}
              </p>
              <DialogTitle className="text-xl font-semibold tracking-tight text-white">
                {editId ? 'Edit AI Model' : 'Add AI Model'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="max-h-[min(62vh,480px)] space-y-5 overflow-y-auto bg-[#fafbfc] px-6 py-6">
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-slate-600">Provider</Label>
                <Select
                  value={form.provider}
                  onValueChange={(v) => {
                    const provider = v as AiProvider
                    setForm((p) => ({
                      ...p,
                      provider,
                      apiBaseUrl:
                        provider === 'deepseek' && !p.apiBaseUrl.trim()
                          ? DEEPSEEK_API_BASE
                          : p.apiBaseUrl,
                      modelId:
                        !p.modelId.trim() && provider === 'deepseek'
                          ? DEEPSEEK_MODEL_OPTIONS[0].id
                          : p.modelId,
                      displayName:
                        !p.displayName.trim() && provider === 'deepseek'
                          ? DEEPSEEK_MODEL_OPTIONS[0].label
                          : p.displayName,
                    }))
                  }}
                >
                  <SelectTrigger className={fieldControlClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-display-name" className="text-[12px] font-medium text-slate-600">
                  Display Name
                </Label>
                <Input
                  id="ai-display-name"
                  className={fieldControlClass}
                  value={form.displayName}
                  onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
                  placeholder="GPT-4o Production"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-model-id" className="text-[12px] font-medium text-slate-600">
                  Model ID
                </Label>
                <Input
                  id="ai-model-id"
                  className={fieldControlClass}
                  value={form.modelId}
                  onChange={(e) => setForm((p) => ({ ...p, modelId: e.target.value }))}
                  placeholder={AI_PROVIDER_MODEL_HINTS[form.provider]}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-base-url" className="text-[12px] font-medium text-slate-600">
                  API Base URL
                </Label>
                <Input
                  id="ai-base-url"
                  className={fieldControlClass}
                  value={form.apiBaseUrl}
                  onChange={(e) => setForm((p) => ({ ...p, apiBaseUrl: e.target.value }))}
                  placeholder={
                    form.provider === 'deepseek' ? DEEPSEEK_API_BASE : 'Optional'
                  }
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="ai-api-key" className="text-[12px] font-medium text-slate-600">
                  API Key
                </Label>
                <Input
                  id="ai-api-key"
                  type="password"
                  autoComplete="off"
                  className={fieldControlClass}
                  value={form.apiKey}
                  onChange={(e) => setForm((p) => ({ ...p, apiKey: e.target.value }))}
                  placeholder={editId && hadExistingKey ? 'Leave blank to keep existing key' : 'Enter API Key'}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
                />
                Default model
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                />
                Active
              </label>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-slate-200 bg-white px-6 py-4 sm:justify-end">
            <Button
              type="button"
              className="min-w-[140px] rounded-sm bg-teal-700 text-white hover:bg-teal-800"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save & Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
})
