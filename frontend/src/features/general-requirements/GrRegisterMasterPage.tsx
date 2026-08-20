import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Copy, Loader2, Pencil, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { useShowAiButtons } from '@/hooks/useShowAiAssistant'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsPageShellClass,
  limsPanelClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { GrFooterBar } from './GrFooterBar'
import { GrHeaderBar } from './GrHeaderBar'
import {
  GRID_TABLE,
  actionBtnClass,
  checkboxClass,
  formatDateDisplay,
  formatSupabaseError,
  metaLineClass,
  nextPrefixedId,
  primaryLineClass,
  printViaIframe,
  rowEvenClass,
  rowOddClass,
  rowSelectedClass,
  secondaryLineClass,
  thBase,
  todayIsoDate,
} from './shared'

export type GrFieldKind = 'text' | 'textarea' | 'date' | 'select' | 'checkbox' | 'readonly'

export type GrFieldDef = {
  key: string
  label: string
  kind: GrFieldKind
  required?: boolean
  options?: string[]
  span?: 1 | 2 | 3
  /** Show Sparkles AI Fill next to label (requires config.aiFillField). */
  aiFill?: boolean
}

export type GrColumnDef = {
  key: string
  header: string
  mono?: boolean
  date?: boolean
  lines?: Array<{ key: string; tone?: 'primary' | 'secondary' | 'meta' }>
}

export type GrRegisterConfig = {
  title: string
  clauseNote?: string
  tableName: string
  idPrefix: string
  idField: string
  newLabel: string
  searchPlaceholder: string
  orderBy: string
  fields: GrFieldDef[]
  columns: GrColumnDef[]
  exportHeaders: string[]
  exportKeys: string[]
  emptyForm: () => Record<string, string | boolean>
  canSave: (form: Record<string, string | boolean>) => boolean
  searchKeys: string[]
  /** Optional AI Fill handler for fields with `aiFill: true`. */
  aiFillField?: (input: {
    fieldKey: string
    fieldLabel: string
    form: Record<string, string | boolean>
  }) => Promise<string>
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: GrFieldDef
  value: string | boolean
  onChange: (v: string | boolean) => void
}) {
  if (field.kind === 'checkbox') {
    return (
      <label className="inline-flex h-8 items-center gap-2 text-sm text-stone-800">
        <input
          type="checkbox"
          className={checkboxClass}
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        {field.label}
      </label>
    )
  }
  if (field.kind === 'select' && field.options) {
    return (
      <Select value={String(value)} onValueChange={(v) => onChange(v)}>
        <SelectTrigger aria-label={field.label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (field.kind === 'textarea') {
    return (
      <Textarea
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="!min-h-8 resize-y"
      />
    )
  }
  if (field.kind === 'date') {
    return (
      <Input
        type="date"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
  return (
    <Input
      value={String(value ?? '')}
      readOnly={field.kind === 'readonly'}
      className={field.kind === 'readonly' ? 'bg-stone-100' : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function GrRegisterMasterPage({ config }: { config: GrRegisterConfig }) {
  const showAiButtons = useShowAiButtons()
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string | boolean>>(() => config.emptyForm())
  const [aiFillingField, setAiFillingField] = useState<string | null>(null)
  const formRef = useRef(form)
  formRef.current = form

  const handleAiFill = async (field: GrFieldDef) => {
    if (!config.aiFillField || aiFillingField != null) return
    setAiFillingField(field.key)
    setMessage(null)
    try {
      const value = await config.aiFillField({
        fieldKey: field.key,
        fieldLabel: field.label,
        form: formRef.current,
      })
      setForm({ ...formRef.current, [field.key]: value })
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'AI fill failed.')
    } finally {
      setAiFillingField(null)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from(config.tableName)
        .select('*')
        .order(config.orderBy, { ascending: false })
      if (err) throw err
      setRows((data ?? []) as Array<Record<string, unknown>>)
    } catch (err) {
      setError(formatSupabaseError(err))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [config.orderBy, config.tableName])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      config.searchKeys
        .map((k) => String(r[k] ?? ''))
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [rows, search, config.searchKeys])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize) || 1)
  const safePage = Math.min(page, pageCount)
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  useEffect(() => {
    setPage(1)
  }, [search, pageSize])

  const rowToForm = (row: Record<string, unknown>) => {
    const next = config.emptyForm()
    for (const field of config.fields) {
      const raw = row[field.key]
      if (field.kind === 'checkbox') next[field.key] = Boolean(raw)
      else if (field.kind === 'date') next[field.key] = raw ? String(raw).slice(0, 10) : ''
      else next[field.key] = raw == null ? '' : String(raw)
    }
    return next
  }

  const formToPayload = (f: Record<string, string | boolean>) => {
    const payload: Record<string, unknown> = {}
    for (const field of config.fields) {
      const v = f[field.key]
      if (field.kind === 'checkbox') payload[field.key] = Boolean(v)
      else if (field.kind === 'date') payload[field.key] = String(v || '').trim() || null
      else payload[field.key] = String(v ?? '').trim()
    }
    return payload
  }

  const handleNew = () => {
    setMessage(null)
    setEditingId(null)
    const next = config.emptyForm()
    const ids = rows.map((r) => String(r[config.idField] ?? ''))
    next[config.idField] = nextPrefixedId(ids, config.idPrefix)
    const dateField = config.fields.find((f) => f.kind === 'date')
    if (dateField && !String(next[dateField.key] ?? '').trim()) {
      next[dateField.key] = todayIsoDate()
    }
    setForm(next)
    setShowForm(true)
  }

  const handleEdit = (row: Record<string, unknown>) => {
    setMessage(null)
    setEditingId(String(row.id))
    setForm(rowToForm(row))
    setShowForm(true)
  }

  const handleCopy = (row: Record<string, unknown>) => {
    setMessage(null)
    setEditingId(null)
    const next = rowToForm(row)
    const ids = rows.map((r) => String(r[config.idField] ?? ''))
    next[config.idField] = nextPrefixedId(ids, config.idPrefix)
    setForm(next)
    setShowForm(true)
  }

  const handleSave = () => {
    void (async () => {
      if (!config.canSave(form) || saveLoading) return
      setSaveLoading(true)
      setMessage(null)
      try {
        const payload = formToPayload(form)
        if (editingId) {
          const { error: err } = await supabase
            .from(config.tableName)
            .update(payload)
            .eq('id', editingId)
          if (err) throw err
        } else {
          const { error: err } = await supabase.from(config.tableName).insert(payload)
          if (err) throw err
        }
        setMessage('Saved successfully.')
        setShowForm(false)
        setEditingId(null)
        await load()
      } catch (err) {
        setMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const selectedRows = filtered.filter((r) => selectedIds.has(String(r.id)))

  const handleDelete = () => {
    void (async () => {
      const ids = Array.from(selectedIds)
      if (!ids.length) return
      if (!window.confirm(`Delete ${ids.length} selected record(s)?`)) return
      setSaveLoading(true)
      try {
        const { error: err } = await supabase.from(config.tableName).delete().in('id', ids)
        if (err) throw err
        setSelectedIds(new Set())
        setMessage('Deleted successfully.')
        await load()
      } catch (err) {
        setMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleExport = () => {
    const list = selectedRows.length ? selectedRows : filtered
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      config.exportHeaders.map(esc).join(','),
      ...list.map((r) =>
        config.exportKeys
          .map((k) => {
            const field = config.fields.find((f) => f.key === k)
            const raw = r[k]
            if (field?.kind === 'checkbox') return raw ? 'Yes' : 'No'
            if (field?.kind === 'date') return formatDateDisplay(raw == null ? null : String(raw))
            return String(raw ?? '')
          })
          .map(esc)
          .join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${config.tableName}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    const list = selectedRows.length ? selectedRows : filtered
    const head = config.columns.map((c) => `<th>${c.header}</th>`).join('')
    const body = list
      .map((r) => {
        const cells = config.columns
          .map((c) => {
            if (c.lines?.length) {
              return `<td>${c.lines.map((l) => String(r[l.key] ?? '')).join(' / ')}</td>`
            }
            const raw = r[c.key]
            return `<td>${c.date ? formatDateDisplay(raw == null ? null : String(raw)) : String(raw ?? '')}</td>`
          })
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')
    printViaIframe(`<!doctype html><html><head><title>${config.title}</title>
<style>body{font-family:sans-serif;font-size:11px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:4px}th{background:#292524;color:#fde68a}</style>
</head><body><h1>${config.title}</h1><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`)
  }

  const renderCell = (row: Record<string, unknown>, col: GrColumnDef): ReactNode => {
    if (col.lines?.length) {
      return (
        <div className="space-y-0.5">
          {col.lines.map((line) => {
            const text = String(row[line.key] ?? '') || '—'
            const cls =
              line.tone === 'meta'
                ? metaLineClass
                : line.tone === 'secondary'
                  ? secondaryLineClass
                  : primaryLineClass
            return (
              <p key={line.key} className={cls}>
                {col.date || line.key.toLowerCase().includes('date')
                  ? formatDateDisplay(text === '—' ? null : text)
                  : text}
              </p>
            )
          })}
        </div>
      )
    }
    const raw = row[col.key]
    const text = col.date
      ? formatDateDisplay(raw == null ? null : String(raw))
      : String(raw ?? '') || '—'
    return <p className={col.mono ? metaLineClass : primaryLineClass}>{text}</p>
  }

  return (
    <div className={cn(limsPageShellClass, 'flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4')}>
      <GrHeaderBar
        title={config.title}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={config.searchPlaceholder}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onNew={handleNew}
        newLabel={config.newLabel}
      />

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          portalClassName="!items-stretch !justify-start md:pl-0"
          className={cn(
            limsDialogClass,
            '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
            'left-0 top-0',
            'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold text-white sm:text-lg">
                {editingId ? `Edit ${config.title}` : `Add ${config.title}`}
              </DialogTitle>
              {config.clauseNote ? (
                <p className="mt-0.5 text-xs text-stone-300">{config.clauseNote}</p>
              ) : null}
            </DialogHeader>
          </div>
          <div className={cn('min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5', limsRegistryFormClass, 'space-y-4')}>
            {message && showForm ? (
              <p
                className={cn(
                  'text-sm',
                  message.toLowerCase().includes('saved') ? 'text-emerald-700' : 'text-destructive',
                )}
              >
                {message}
              </p>
            ) : null}
            <div className="grid gap-4 md:grid-cols-4">
              {config.fields.map((field) => {
                if (field.kind === 'checkbox') {
                  return (
                    <div key={field.key} className="flex items-end md:col-span-1">
                      <FieldControl
                        field={field}
                        value={form[field.key]}
                        onChange={(v) => setForm({ ...form, [field.key]: v })}
                      />
                    </div>
                  )
                }
                return (
                  <div
                    key={field.key}
                    className={cn(
                      'space-y-2',
                      // span 3 = full row (legacy); span 2 = half of 4-col grid
                      field.span === 3 ? 'md:col-span-4' : field.span === 2 ? 'md:col-span-2' : '',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`gr-${field.key}`}>{field.label}</Label>
                      {field.aiFill && config.aiFillField && showAiButtons ? (
                        <Button
                          type="button"
                          size="sm"
                          className={cn(limsPrimaryBtnClass, 'h-7 gap-1 px-2 text-[11px]')}
                          disabled={aiFillingField != null || saveLoading}
                          onClick={() => void handleAiFill(field)}
                          aria-label={`AI fill ${field.label}`}
                          title="AI fills this field only (reads other form fields)"
                        >
                          {aiFillingField === field.key ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Sparkles size={12} />
                          )}
                          {aiFillingField === field.key ? 'AI…' : 'AI Fill'}
                        </Button>
                      ) : null}
                    </div>
                    <FieldControl
                      field={field}
                      value={form[field.key]}
                      onChange={(v) => setForm({ ...form, [field.key]: v })}
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                className={cn('min-w-[7rem]', limsPrimaryBtnClass)}
                disabled={!config.canSave(form) || saveLoading}
                onClick={handleSave}
              >
                {saveLoading ? 'Saving…' : 'Save & Close'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className={cn(limsPanelClass, 'min-h-0 flex-1 overflow-auto bg-[#f7f3eb]')}>
        {error ? <p className="px-3 pt-3 text-sm text-red-600">{error}</p> : null}
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-[#78716c]">Loading…</p>
        ) : pageRows.length === 0 ? (
          <div className="m-4 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-6 text-center text-sm text-[#57534e]">
            {search.trim() ? 'No records match your search.' : 'No records yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className={GRID_TABLE}>
              <TableHeader>
                <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                  <TableHead className={cn('w-10', thBase)}>
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label="Select all"
                      checked={pageRows.length > 0 && pageRows.every((r) => selectedIds.has(String(r.id)))}
                      onChange={(e) => {
                        const next = new Set(selectedIds)
                        pageRows.forEach((r) =>
                          e.target.checked ? next.add(String(r.id)) : next.delete(String(r.id)),
                        )
                        setSelectedIds(next)
                      }}
                    />
                  </TableHead>
                  {config.columns.map((c) => (
                    <TableHead key={c.key} className={thBase}>
                      {c.header}
                    </TableHead>
                  ))}
                  <TableHead className={cn('w-24', thBase)}>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r, index) => {
                  const id = String(r.id)
                  const selected = selectedIds.has(id)
                  return (
                    <TableRow
                      key={id}
                      className={cn(
                        selected
                          ? rowSelectedClass
                          : index % 2 === 0
                            ? rowEvenClass
                            : rowOddClass,
                      )}
                    >
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          checked={selected}
                          onChange={() => {
                            const next = new Set(selectedIds)
                            if (next.has(id)) next.delete(id)
                            else next.add(id)
                            setSelectedIds(next)
                          }}
                          aria-label={`Select ${String(r[config.idField] ?? id)}`}
                        />
                      </TableCell>
                      {config.columns.map((c) => (
                        <TableCell key={c.key}>{renderCell(r, c)}</TableCell>
                      ))}
                      <TableCell className="text-center">
                        <div className="inline-flex gap-0.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className={actionBtnClass}
                            aria-label="Edit"
                            onClick={() => handleEdit(r)}
                          >
                            <Pencil size={16} />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className={actionBtnClass}
                            aria-label="Copy"
                            onClick={() => handleCopy(r)}
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

      <GrFooterBar
        message={showForm ? null : message}
        loading={saveLoading || loading}
        selectedCount={selectedIds.size}
        page={safePage}
        pageCount={pageCount}
        onExport={handleExport}
        onPrintSelected={handlePrint}
        onDeleteSelected={handleDelete}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number(jumpTo)
          if (Number.isInteger(n) && n >= 1 && n <= pageCount) setPage(n)
        }}
      />
    </div>
  )
}
