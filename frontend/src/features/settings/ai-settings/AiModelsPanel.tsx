import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { deleteAiModel, fetchAiModels, upsertAiModel } from './aiSettingsApi'
import {
  AI_PROVIDERS,
  emptyAiModelForm,
  maskApiKey,
  type AiModelForm,
  type AiModelRow,
  type AiProvider,
} from './types'

export function AiModelsPanel() {
  const [rows, setRows] = useState<AiModelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<AiModelForm>(emptyAiModelForm)
  const [saving, setSaving] = useState(false)
  const [hadExistingKey, setHadExistingKey] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await fetchAiModels())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditId(null)
    setHadExistingKey(false)
    setForm(emptyAiModelForm())
    setDialogOpen(true)
  }

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Add AI providers with API keys. Keys are stored securely in your database (Lab Director access only).
        </p>
        <Button type="button" size="sm" className="gap-2 shrink-0" onClick={openCreate}>
          <Plus size={14} />
          Add Model
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && (
        <p className={message.toLowerCase().includes('unable') || message.toLowerCase().includes('failed') || message.toLowerCase().includes('required') ? 'text-sm text-destructive' : 'text-sm text-emerald-700'}>
          {message}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading models…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No AI models configured. Click Add Model to connect OpenAI, Anthropic, or other providers.
        </p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs text-center">Provider</TableHead>
                <TableHead className="text-xs text-center">Model ID</TableHead>
                <TableHead className="text-xs text-center">API Key</TableHead>
                <TableHead className="text-xs text-center">Status</TableHead>
                <TableHead className="text-xs text-center w-[100px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {r.display_name}
                      {r.is_default && (
                        <Badge variant="secondary" className="text-[10px] gap-0.5">
                          <Star size={10} className="fill-current" />
                          Default
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-center text-xs capitalize">{r.provider}</TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground">{r.model_id}</TableCell>
                  <TableCell className="text-center text-xs font-mono">{maskApiKey(r.api_key)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={r.is_active ? 'default' : 'outline'}>{r.is_active ? 'Active' : 'Inactive'}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      <Button type="button" size="icon" variant="ghost" aria-label="Edit model" onClick={() => openEdit(r)}>
                        <Pencil size={16} />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" aria-label="Delete model" onClick={() => handleDelete(r)}>
                        <Trash2 size={16} className="text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit AI Model' : 'Add AI Model'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Provider</Label>
              <Select value={form.provider} onValueChange={(v) => setForm((p) => ({ ...p, provider: v as AiProvider }))}>
                <SelectTrigger>
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
            <div className="grid gap-2">
              <Label htmlFor="ai-display-name">Display name</Label>
              <Input
                id="ai-display-name"
                value={form.displayName}
                onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
                placeholder="e.g. GPT-4o Production"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ai-model-id">Model ID</Label>
              <Input
                id="ai-model-id"
                value={form.modelId}
                onChange={(e) => setForm((p) => ({ ...p, modelId: e.target.value }))}
                placeholder={
                  form.provider === 'google'
                    ? 'e.g. gemini-2.0-flash or gemini-1.5-pro'
                    : 'e.g. gpt-4o, claude-3-5-sonnet-latest'
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ai-api-key">API key</Label>
              <Input
                id="ai-api-key"
                type="password"
                autoComplete="off"
                value={form.apiKey}
                onChange={(e) => setForm((p) => ({ ...p, apiKey: e.target.value }))}
                placeholder={
                  editId && hadExistingKey
                    ? 'Leave blank to keep existing key'
                    : form.provider === 'google'
                      ? 'Gemini API key from Google AI Studio'
                      : 'sk-...'
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ai-base-url">API base URL (optional)</Label>
              <Input
                id="ai-base-url"
                value={form.apiBaseUrl}
                onChange={(e) => setForm((p) => ({ ...p, apiBaseUrl: e.target.value }))}
                placeholder={
                  form.provider === 'google'
                    ? 'Leave empty for Google Gemini OpenAI endpoint'
                    : 'https://api.openai.com/v1'
                }
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
                />
                Default model
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                />
                Active
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
