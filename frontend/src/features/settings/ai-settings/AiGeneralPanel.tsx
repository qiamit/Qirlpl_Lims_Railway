import { useCallback, useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fetchAiModels, fetchAiSettings, upsertAiSettings } from './aiSettingsApi'
import type { AiModelRow } from './types'

export function AiGeneralPanel() {
  const [models, setModels] = useState<AiModelRow[]>([])
  const [defaultModelId, setDefaultModelId] = useState<string>('')
  const [aiEnabled, setAiEnabled] = useState(true)
  const [temperature, setTemperature] = useState('0.7')
  const [maxTokens, setMaxTokens] = useState('4096')
  const [systemPromptPrefix, setSystemPromptPrefix] = useState('')
  const [logRequests, setLogRequests] = useState(false)
  const [agentCrudEnabled, setAgentCrudEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [modelRows, settings] = await Promise.all([fetchAiModels(), fetchAiSettings()])
      setModels(modelRows.filter((m) => m.is_active))
      if (settings) {
        setDefaultModelId(settings.default_model_id ?? '')
        setAiEnabled(settings.ai_enabled)
        setTemperature(String(settings.temperature ?? 0.7))
        setMaxTokens(String(settings.max_tokens ?? 4096))
        setSystemPromptPrefix(settings.system_prompt_prefix ?? '')
        setLogRequests(settings.log_requests)
        setAgentCrudEnabled(settings.agent_crud_enabled ?? true)
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleSave = () => {
    void (async () => {
      setSaving(true)
      setMessage(null)
      try {
        const temp = Number(temperature)
        const tokens = Number(maxTokens)
        if (!Number.isFinite(temp) || temp < 0 || temp > 2) {
          throw new Error('Temperature must be between 0 and 2')
        }
        if (!Number.isFinite(tokens) || tokens < 256 || tokens > 128000) {
          throw new Error('Max tokens must be between 256 and 128000')
        }

        await upsertAiSettings({
          default_model_id: defaultModelId || null,
          ai_enabled: aiEnabled,
          temperature: temp,
          max_tokens: Math.round(tokens),
          system_prompt_prefix: systemPromptPrefix.trim() || null,
          log_requests: logRequests,
          agent_crud_enabled: agentCrudEnabled,
        })

        setMessage('Settings saved.')
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Unable to save settings')
      } finally {
        setSaving(false)
      }
    })()
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Global AI behaviour for Qirlpl LIMS — default model, creativity, and lab-wide system context.
      </p>

      {message && (
        <p
          className={
            message.toLowerCase().includes('unable') || message.toLowerCase().includes('failed') || message.toLowerCase().includes('must')
              ? 'text-sm text-destructive'
              : 'text-sm text-emerald-700'
          }
        >
          {message}
        </p>
      )}

      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} />
        Enable AI features in LIMS
      </label>

      <div className="grid gap-2">
        <Label>Default AI model</Label>
        <Select
          value={defaultModelId || '_none'}
          onValueChange={(v) => setDefaultModelId(v === '_none' ? '' : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select default model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">— None —</SelectItem>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.display_name} ({m.provider})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {models.length === 0 && (
          <p className="text-xs text-muted-foreground">Add an active model in the Models tab first.</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="ai-temperature">Temperature (0–2)</Label>
          <Input
            id="ai-temperature"
            type="number"
            step="0.1"
            min={0}
            max={2}
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Lower = more focused; higher = more creative.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ai-max-tokens">Max tokens per request</Label>
          <Input
            id="ai-max-tokens"
            type="number"
            min={256}
            max={128000}
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="ai-system-prefix">Lab system prompt prefix</Label>
        <Textarea
          id="ai-system-prefix"
          className="min-h-[120px]"
          value={systemPromptPrefix}
          onChange={(e) => setSystemPromptPrefix(e.target.value)}
          placeholder="You are an assistant for an ISO 17025 testing laboratory. Always follow Qirlpl LIMS procedures…"
        />
        <p className="text-xs text-muted-foreground">Prepended to every AI request for your lab context.</p>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={agentCrudEnabled}
          onChange={(e) => setAgentCrudEnabled(e.target.checked)}
        />
        Allow QI Assistant to create, edit, and delete LIMS data
      </label>
      <p className="text-xs text-muted-foreground -mt-4">
        When enabled, the assistant uses secure tools to change allowed tables (clients, IS codes, samples, etc.).
        AI config tables are never modified.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={logRequests} onChange={(e) => setLogRequests(e.target.checked)} />
        Log AI requests (audit trail — future release)
      </label>

      <div className="flex justify-end pt-2">
        <Button type="button" className="gap-2" onClick={handleSave} disabled={saving}>
          <Save size={16} />
          {saving ? 'Saving…' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}
