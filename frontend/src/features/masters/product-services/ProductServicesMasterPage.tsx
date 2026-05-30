import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ProductServicesForm } from './ProductServicesForm'
import { ProductServicesHeaderBar } from './ProductServicesHeaderBar'
import { ProductServicesTable } from './ProductServicesTable'
import { ProductServicesTableFooterBar } from './ProductServicesFooterBar'
import {
  emptyProductServiceForm,
  normalizeText,
  type ItemCategory,
  type ProductServiceForm,
  type ProductServiceRow,
} from './types'

const formatSupabaseError = (err: unknown) => {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function toCsv(headers: string[], rows: Array<Record<string, string>>) {
  const esc = (v: string) => {
    const s = String(v ?? '')
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const lines = [headers.map(esc).join(',')]
  for (const r of rows) {
    lines.push(headers.map((h) => esc(r[h] ?? '')).join(','))
  }
  return lines.join('\n')
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const flushCell = () => {
    row.push(cell)
    cell = ''
  }
  const flushRow = () => {
    flushCell()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1]
        if (next === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }

    if (ch === ',') {
      flushCell()
      continue
    }

    if (ch === '\n') {
      flushRow()
      continue
    }

    if (ch === '\r') {
      continue
    }

    cell += ch
  }

  if (cell.length > 0 || row.length > 0) flushRow()

  return rows
}

export default function ProductServicesMasterPage() {
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)

  const importInputRef = useRef<HTMLInputElement | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')

  const [rows, setRows] = useState<ProductServiceRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')

  const [gstRates, setGstRates] = useState<Array<{ id: string; label: string }>>(() => [])
  const [units, setUnits] = useState<Array<{ id: string; label: string }>>(() => [])

  const [gstRateDialogOpen, setGstRateDialogOpen] = useState(false)
  const [newGstRate, setNewGstRate] = useState('')

  const [unitDialogOpen, setUnitDialogOpen] = useState(false)
  const [newUnit, setNewUnit] = useState('')

  const [form, setForm] = useState<ProductServiceForm>(() => {
    const base = emptyProductServiceForm()
    return { ...base, itemCode: generateItemCodeFromRows(base.category, []) }
  })

  function generateItemCodeFromRows(category: ItemCategory, list: ProductServiceRow[]) {
    const prefix = category === 'Product' ? 'P-' : 'S-'
    const max = list
      .map((r) => r.item_code)
      .filter((code) => typeof code === 'string' && code.startsWith(prefix))
      .map((code) => Number(code.slice(prefix.length)))
      .filter((n) => Number.isFinite(n))
      .reduce((a, b) => Math.max(a, b), 0)

    const next = Math.max(1, max + 1)
    return `${prefix}${String(next).padStart(5, '0')}`
  }

  const generateItemCode = (category: ItemCategory) => generateItemCodeFromRows(category, rows)

  const canSave =
    !saveLoading &&
    form.itemName.trim().length > 0 &&
    form.itemCode.trim().length > 0

  const loadItems = async () => {
    setListError(null)
    setListLoading(true)
    try {
      const { data, error } = await supabase.from('product_services').select('*').order('created_at', { ascending: false })
      if (error) throw error
      const list = (Array.isArray(data) ? (data as ProductServiceRow[]) : [])
      setRows(
        list.map((r) => ({
          ...r,
          category: (r.category ?? 'Service') as ProductServiceRow['category'],
          item_code: r.item_code ?? '',
          item_name: r.item_name ?? '',
        })),
      )
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load items')
    } finally {
      setListLoading(false)
    }
  }

  const loadMasterOptions = async () => {
    try {
      const { data, error } = await supabase.from('product_service_master_options').select('*').order('label', { ascending: true })
      if (error) throw error
      const list = Array.isArray(data)
        ? (data as Array<{ id: string; category: string; label: string; value: string | null }>)
        : []

      const by = (cat: string) => list.filter((r) => r.category === cat).map((r) => ({ id: r.id, label: r.label }))

      setGstRates(by('gst_rate'))
      setUnits(by('unit'))
    } catch (err) {
      setSaveMessage((prev) => prev ?? formatSupabaseError(err))
    }
  }

  useEffect(() => {
    void loadItems()
    void loadMasterOptions()
  }, [])

  useEffect(() => {
    setForm((prev) => ({ ...prev, itemCode: prev.itemCode || generateItemCodeFromRows(prev.category, rows) }))
  }, [rows])

  const addSimpleOption = async (category: string, label: string, onAdded: (id: string) => void) => {
    const name = normalizeText(label)
    if (!name) return

    try {
      const { data, error } = await supabase
        .from('product_service_master_options')
        .insert({ category, label: name, value: name })
        .select('id')
        .single()
      if (error) throw error
      const id = (data as { id: string } | null)?.id ?? `tmp-${name}`
      onAdded(id)
    } catch (err) {
      setSaveMessage(formatSupabaseError(err))
    }
  }

  const deleteMasterOption = (id: string, category: string) => {
    void (async () => {
      try {
        if (!id || id.startsWith('default-') || id.startsWith('db-')) return
        const { error } = await supabase.from('product_service_master_options').delete().eq('id', id)
        if (error) throw error

        if (category === 'gst_rate') setGstRates((prev) => prev.filter((x) => x.id !== id))
        if (category === 'unit') setUnits((prev) => prev.filter((x) => x.id !== id))
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      }
    })()
  }

  const handleAddGstRate = () => {
    const raw = normalizeText(newGstRate)
    if (!raw) return
    void (async () => {
      await addSimpleOption('gst_rate', raw, (id) => {
        setGstRates((prev) => {
          const merged = [...prev, { id, label: raw }]
          const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
          return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
        })
        setForm((prev) => ({ ...prev, gstRate: raw }))
        setNewGstRate('')
        setGstRateDialogOpen(false)
      })
    })()
  }

  const handleAddUnit = () => {
    const raw = normalizeText(newUnit)
    if (!raw) return
    void (async () => {
      await addSimpleOption('unit', raw, (id) => {
        setUnits((prev) => {
          const merged = [...prev, { id, label: raw }]
          const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
          return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
        })
        setForm((prev) => ({ ...prev, unitOfItem: raw }))
        setNewUnit('')
        setUnitDialogOpen(false)
      })
    })()
  }

  const handleNew = () => {
    setSaveMessage(null)
    setEditingId(null)
    const base = emptyProductServiceForm()
    setForm({ ...base, itemCode: generateItemCodeFromRows(base.category, rows) })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleClear = () => {
    const base = emptyProductServiceForm()
    setForm({ ...base, itemCode: generateItemCodeFromRows(base.category, rows) })
    setSaveMessage(null)
  }

  const handleEdit = (row: ProductServiceRow) => {
    setSaveMessage(null)
    setEditingId(row.id)
    setForm({
      category: row.category,
      itemCode: row.item_code ?? '',
      make: row.make ?? '',
      serialModelNo: row.serial_model_no ?? '',
      itemName: row.item_name ?? '',
      itemDescription: row.item_description ?? '',
      hsnCode: row.hsn_code ?? '',
      gstRate: row.gst_rate == null ? '' : String(row.gst_rate),
      unitOfItem: row.unit_of_item ?? '',
      lowStockValue: row.low_stock_value == null ? '' : String(row.low_stock_value),
      purchasePrice: row.purchase_price == null ? '' : String(row.purchase_price),
      salePrice: row.sale_price == null ? '' : String(row.sale_price),
      maximumRetailPrice: row.maximum_retail_price == null ? '' : String(row.maximum_retail_price),
      openingStock: row.opening_stock == null ? '' : String(row.opening_stock),
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCopy = (row: ProductServiceRow) => {
    setSaveMessage(null)
    setEditingId(null)
    setForm({
      category: row.category,
      itemCode: generateItemCodeFromRows(row.category, rows),
      make: row.make ?? '',
      serialModelNo: row.serial_model_no ?? '',
      itemName: row.item_name ?? '',
      itemDescription: row.item_description ?? '',
      hsnCode: row.hsn_code ?? '',
      gstRate: row.gst_rate == null ? '' : String(row.gst_rate),
      unitOfItem: row.unit_of_item ?? '',
      lowStockValue: row.low_stock_value == null ? '' : String(row.low_stock_value),
      purchasePrice: row.purchase_price == null ? '' : String(row.purchase_price),
      salePrice: row.sale_price == null ? '' : String(row.sale_price),
      maximumRetailPrice: row.maximum_retail_price == null ? '' : String(row.maximum_retail_price),
      openingStock: row.opening_stock == null ? '' : String(row.opening_stock),
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSave = () => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const payload = {
          category: form.category,
          item_code: normalizeText(form.itemCode),
          make: normalizeText(form.make) || null,
          serial_model_no: normalizeText(form.serialModelNo) || null,
          item_name: normalizeText(form.itemName),
          item_description: normalizeText(form.itemDescription) || null,
          hsn_code: normalizeText(form.hsnCode) || null,
          gst_rate: form.gstRate.trim() ? Number(form.gstRate) : null,
          unit_of_item: normalizeText(form.unitOfItem) || null,
          low_stock_value: form.lowStockValue.trim() ? Number(form.lowStockValue) : null,
          purchase_price: form.purchasePrice.trim() ? Number(form.purchasePrice) : null,
          sale_price: form.salePrice.trim() ? Number(form.salePrice) : null,
          maximum_retail_price: form.maximumRetailPrice.trim() ? Number(form.maximumRetailPrice) : null,
          opening_stock: form.openingStock.trim() ? Number(form.openingStock) : null,
        }

        if (!payload.item_name) {
          setSaveMessage('Item Name is required.')
          return
        }

        if (!payload.item_code) {
          setSaveMessage('Item Code is required.')
          return
        }

        if (editingId) {
          const { error } = await supabase.from('product_services').update(payload).eq('id', editingId)
          if (error) throw error
        } else {
          const { error } = await supabase.from('product_services').insert(payload)
          if (error) throw error
        }

        setSaveMessage('Saved successfully.')
        setShowForm(false)
        setEditingId(null)
        await loadItems()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const blob = [
        r.category,
        r.item_code,
        r.item_name,
        r.item_description ?? '',
        r.make ?? '',
        r.serial_model_no ?? '',
        r.hsn_code ?? '',
        String(r.gst_rate ?? ''),
        r.unit_of_item ?? '',
        String(r.opening_stock ?? ''),
        String(r.low_stock_value ?? ''),
        String(r.purchase_price ?? ''),
        String(r.sale_price ?? ''),
        String(r.maximum_retail_price ?? ''),
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  useEffect(() => {
    setPage(1)
    setJumpTo('')
  }, [search, pageSize])

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

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
      for (const r of pagedRows) {
        if (checked) next.add(r.id)
        else next.delete(r.id)
      }
      return next
    })
  }

  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(r.id)), [rows, selectedIds])

  const handleDeleteSelected = () => {
    void (async () => {
      if (selectedRows.length === 0) return
      const ok = window.confirm(`Delete ${selectedRows.length} selected item(s)?`)
      if (!ok) return
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const ids = selectedRows.map((r) => r.id)
        const { error } = await supabase.from('product_services').delete().in('id', ids)
        if (error) throw error
        setSaveMessage('Deleted successfully.')
        setSelectedIds(new Set())
        await loadItems()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const buildPrintHtml = (list: ProductServiceRow[]) => {
    const esc = (s: string) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

    const rowsHtml = list
      .map((r) => {
        return `<tr>
<td>${esc(r.item_name)}</td>
<td>${esc(r.category)}</td>
<td>${esc(r.item_code)}</td>
<td>${esc(r.make ?? '')}</td>
<td>${esc(r.hsn_code ?? '')}</td>
<td style="text-align:right">${esc(String(r.gst_rate ?? ''))}</td>
<td>${esc(r.unit_of_item ?? '')}</td>
<td style="text-align:right">${esc(String(r.opening_stock ?? ''))}</td>
<td style="text-align:right">${esc(String(r.sale_price ?? ''))}</td>
<td style="text-align:right">${esc(String(r.purchase_price ?? ''))}</td>
</tr>`
      })
      .join('')

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Product & Services</title>
<style>
  body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial; padding:18px;}
  h1{font-size:18px; margin:0 0 12px 0;}
  table{border-collapse:collapse; width:100%; font-size:12px;}
  th,td{border:1px solid #cbd5e1; padding:8px; vertical-align:top;}
  th{background:#f1f5f9; text-align:left;}
</style>
</head>
<body>
<h1>Product & Services</h1>
<table>
<thead>
<tr>
<th>Item Name</th>
<th>Category</th>
<th>Item Code</th>
<th>Make</th>
<th>HSN</th>
<th>GST %</th>
<th>Unit</th>
<th>Opening</th>
<th>Sale</th>
<th>Purchase</th>
</tr>
</thead>
<tbody>
${rowsHtml}
</tbody>
</table>
</body>
</html>`
  }

  const handlePrintSelected = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows
    if (exportRows.length === 0) return
    const html = buildPrintHtml(exportRows)

    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.setAttribute('aria-hidden', 'true')
    document.body.appendChild(iframe)

    const cleanup = () => {
      try {
        document.body.removeChild(iframe)
      } catch {
        // ignore
      }
    }

    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) {
      cleanup()
      setSaveMessage('Unable to open print preview.')
      return
    }

    doc.open()
    doc.write(html)
    doc.close()

    iframe.onload = () => {
      try {
        win.focus()
        win.print()
      } finally {
        window.setTimeout(cleanup, 500)
      }
    }
  }

  const handleExport = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows

    const headers = [
      'id',
      'category',
      'item_code',
      'make',
      'serial_model_no',
      'item_name',
      'item_description',
      'hsn_code',
      'gst_rate',
      'unit_of_item',
      'low_stock_value',
      'purchase_price',
      'sale_price',
      'maximum_retail_price',
      'opening_stock',
      'created_at',
    ]

    const lines = exportRows.map((r) => ({
      id: r.id,
      category: r.category,
      item_code: r.item_code,
      make: r.make ?? '',
      serial_model_no: r.serial_model_no ?? '',
      item_name: r.item_name,
      item_description: r.item_description ?? '',
      hsn_code: r.hsn_code ?? '',
      gst_rate: String(r.gst_rate ?? ''),
      unit_of_item: r.unit_of_item ?? '',
      low_stock_value: String(r.low_stock_value ?? ''),
      purchase_price: String(r.purchase_price ?? ''),
      sale_price: String(r.sale_price ?? ''),
      maximum_retail_price: String(r.maximum_retail_price ?? ''),
      opening_stock: String(r.opening_stock ?? ''),
      created_at: r.created_at ?? '',
    }))

    const csv = toCsv(headers, lines)

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'product_services.csv'
    a.click()
    URL.revokeObjectURL(url)
    setSaveMessage('Exported.')
  }

  const handleImport = () => {
    setSaveMessage(null)
    importInputRef.current?.click()
  }

  const handleImportFile = (file: File) => {
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const text = await file.text()
        const records = parseCsv(text)
        if (records.length === 0) {
          setSaveMessage('No rows found in CSV.')
          return
        }

        const header = records[0].map((h) => h.trim())
        const rowsData = records.slice(1).filter((r) => r.some((c) => String(c ?? '').trim().length > 0))

        const idx = (name: string) => header.findIndex((h) => h === name)

        const payloads = rowsData.map((r) => {
          const get = (name: string) => {
            const i = idx(name)
            return i >= 0 ? (r[i] ?? '') : ''
          }

          const category = (get('category') || 'Service') as ItemCategory

          return {
            category,
            item_code: get('item_code') || generateItemCodeFromRows(category, rows),
            make: get('make') || null,
            serial_model_no: get('serial_model_no') || null,
            item_name: get('item_name') || '',
            item_description: get('item_description') || null,
            hsn_code: get('hsn_code') || null,
            gst_rate: get('gst_rate') ? Number(get('gst_rate')) : null,
            unit_of_item: get('unit_of_item') || null,
            low_stock_value: get('low_stock_value') ? Number(get('low_stock_value')) : null,
            purchase_price: get('purchase_price') ? Number(get('purchase_price')) : null,
            sale_price: get('sale_price') ? Number(get('sale_price')) : null,
            maximum_retail_price: get('maximum_retail_price') ? Number(get('maximum_retail_price')) : null,
            opening_stock: get('opening_stock') ? Number(get('opening_stock')) : null,
          }
        })

        const cleaned = payloads.filter((p) => normalizeText(p.item_name).length > 0)
        if (cleaned.length === 0) {
          setSaveMessage('No valid rows found in CSV.')
          return
        }

        const { error } = await supabase.from('product_services').insert(cleaned)
        if (error) throw error

        setSaveMessage('Imported successfully.')
        await loadItems()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  return (
    <div className="p-6 space-y-5">
      <ProductServicesHeaderBar
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        onNew={handleNew}
      />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Item</DialogTitle>
            <DialogDescription>Product & Services master entry.</DialogDescription>
          </DialogHeader>
          {saveMessage && <div className="text-sm text-destructive">{saveMessage}</div>}
          <ProductServicesForm
            form={form}
            onChange={setForm}
            canSave={canSave}
            saveLoading={saveLoading}
            onSave={handleSave}
            onClear={handleClear}
            gstRates={gstRates}
            units={units}
            gstRateDialogOpen={gstRateDialogOpen}
            setGstRateDialogOpen={setGstRateDialogOpen}
            newGstRate={newGstRate}
            setNewGstRate={setNewGstRate}
            onAddGstRate={handleAddGstRate}
            onDeleteGstRate={(id: string) => deleteMasterOption(id, 'gst_rate')}
            unitDialogOpen={unitDialogOpen}
            setUnitDialogOpen={setUnitDialogOpen}
            newUnit={newUnit}
            setNewUnit={setNewUnit}
            onAddUnit={handleAddUnit}
            onDeleteUnit={(id: string) => deleteMasterOption(id, 'unit')}
            generateItemCode={generateItemCode}
          />
        </DialogContent>
      </Dialog>

      <ProductServicesTable
        rows={pagedRows}
        loading={listLoading}
        error={listError}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        onEdit={handleEdit}
        onCopy={handleCopy}
      />

      <ProductServicesTableFooterBar
        message={saveMessage}
        loading={saveLoading}
        selectedCount={selectedIds.size}
        onImport={handleImport}
        onExport={handleExport}
        onPrintSelected={handlePrintSelected}
        onDeleteSelected={handleDeleteSelected}
        page={page}
        pageCount={pageCount}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        jumpTo={jumpTo}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number(jumpTo)
          if (!Number.isFinite(n) || n <= 0) return
          setPage(Math.min(pageCount, Math.max(1, n)))
        }}
      />

      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImportFile(f)
          e.currentTarget.value = ''
        }}
      />
    </div>
  )
}
