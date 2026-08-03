import { forwardRef, useCallback, useEffect, useImperativeHandle, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Cpu, FlaskConical } from 'lucide-react'
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
import { AI_ASSISTANT_VISIBLE_QUERY_KEY } from '@/hooks/useShowAiAssistant'
import { fetchAiModels, fetchAiSettings, upsertAiSettings } from './aiSettingsApi'
import type { AiModelRow } from './types'

const fieldControlClass =
  'h-10 rounded-none border-0 border-b border-slate-300 bg-transparent px-0 shadow-none text-slate-900 placeholder:text-slate-400 focus-visible:border-teal-600 focus-visible:ring-0'

function SettingSection({
  step,
  title,
  icon,
  children,
}: {
  step: string
  title: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white/80 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-3 border-b border-slate-200/80 bg-slate-900 px-4 py-3 text-white">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/20 text-teal-300">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-teal-300/90">{step}</p>
          <h3 className="text-sm font-semibold tracking-tight text-white">{title}</h3>
        </div>
      </div>
      <div className="space-y-5 bg-[#fafbfc] px-4 py-5">{children}</div>
    </section>
  )
}

function ToggleRow({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  id: string
}) {
  return (
    <label
      htmlFor={id}
      className="flex h-full min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-slate-300"
    >
      <span className="min-w-0 flex-1 text-xs font-medium leading-snug text-slate-700">{label}</span>
      <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
        <input
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-teal-600 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-600/40" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  )
}

export type AiGeneralPanelHandle = {
  save: () => void
}

type AiGeneralPanelProps = {
  onSavingChange?: (saving: boolean) => void
}

export const AiGeneralPanel = forwardRef<AiGeneralPanelHandle, AiGeneralPanelProps>(function AiGeneralPanel(
  { onSavingChange },
  ref,
) {
  const [models, setModels] = useState<AiModelRow[]>([])
  const [defaultModelId, setDefaultModelId] = useState<string>('')
  const [showAiAssistant, setShowAiAssistant] = useState(true)
  const [temperature, setTemperature] = useState('0.7')
  const [maxTokens, setMaxTokens] = useState('4096')
  const [systemPromptPrefix, setSystemPromptPrefix] = useState('')
  const [logRequests, setLogRequests] = useState(false)
  const [agentCrudEnabled, setAgentCrudEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [modelRows, settings] = await Promise.all([fetchAiModels(), fetchAiSettings()])
      setModels(modelRows.filter((m) => m.is_active))
      if (settings) {
        setDefaultModelId(settings.default_model_id ?? '')
        setShowAiAssistant(settings.ai_enabled)
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

  useEffect(() => {
    onSavingChange?.(saving)
  }, [saving, onSavingChange])

  const handleSave = useCallback(() => {
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
          ai_enabled: showAiAssistant,
          temperature: temp,
          max_tokens: Math.round(tokens),
          system_prompt_prefix: systemPromptPrefix.trim() || null,
          log_requests: logRequests,
          agent_crud_enabled: agentCrudEnabled,
        })

        await queryClient.invalidateQueries({ queryKey: AI_ASSISTANT_VISIBLE_QUERY_KEY })
        setMessage('Settings saved.')
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Unable to save settings')
      } finally {
        setSaving(false)
      }
    })()
  }, [
    agentCrudEnabled,
    showAiAssistant,
    defaultModelId,
    logRequests,
    maxTokens,
    queryClient,
    systemPromptPrefix,
    temperature,
  ])

  useImperativeHandle(ref, () => ({ save: handleSave }), [handleSave])

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-8 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">Loading settings…</p>
      </div>
    )
  }

  const messageIsError =
    !!message &&
    (message.toLowerCase().includes('unable') ||
      message.toLowerCase().includes('failed') ||
      message.toLowerCase().includes('must'))

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-[linear-gradient(165deg,#f8fbff_0%,#eef4fb_45%,#f7f9fc_100%)] shadow-sm">
      <div className="relative border-b border-slate-200/80 bg-slate-900 px-5 py-4 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.1]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(45,212,191,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.4) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-teal-400 via-cyan-500 to-transparent" />
        <div className="relative">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">AI Registry · Preferences</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">General Setting</h2>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {message && (
          <p
            className={
              messageIsError
                ? 'border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive'
                : 'border-l-2 border-emerald-500 bg-emerald-50 px-3 py-2 text-sm text-emerald-700'
            }
          >
            {message}
          </p>
        )}

        <div className="grid grid-cols-1 gap-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <ToggleRow
              id="ai-enabled"
              checked={showAiAssistant}
              onChange={setShowAiAssistant}
              label="Show AI Assistant"
            />
            <ToggleRow
              id="ai-agent-crud"
              checked={agentCrudEnabled}
              onChange={setAgentCrudEnabled}
              label="Allow QI Assistant to Edit LIMS Data"
            />
            <ToggleRow
              id="ai-log-requests"
              checked={logRequests}
              onChange={setLogRequests}
              label="Log AI Request"
            />
          </div>

          <SettingSection step="01" title="Core Settings" icon={<Cpu className="h-4 w-4" />}>
            <div className="grid grid-cols-1 gap-x-5 gap-y-5 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-slate-600">Default AI Model</Label>
                <Select
                  value={defaultModelId || '_none'}
                  onValueChange={(v) => setDefaultModelId(v === '_none' ? '' : v)}
                >
                  <SelectTrigger className={fieldControlClass}>
                    <SelectValue placeholder="Select Default Model" />
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
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-temperature" className="text-[12px] font-medium text-slate-600">
                  Temperature (0–2)
                </Label>
                <Input
                  id="ai-temperature"
                  type="number"
                  step="0.1"
                  min={0}
                  max={2}
                  className={fieldControlClass}
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-max-tokens" className="text-[12px] font-medium text-slate-600">
                  Max Tokens
                </Label>
                <Input
                  id="ai-max-tokens"
                  type="number"
                  min={256}
                  max={128000}
                  className={fieldControlClass}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value)}
                />
              </div>
            </div>
          </SettingSection>

          <SettingSection step="02" title="Lab Context" icon={<FlaskConical className="h-4 w-4" />}>
            <div className="space-y-1.5">
              <Label htmlFor="ai-system-prefix" className="text-[12px] font-medium text-slate-600">
                System Prompt Prefix
              </Label>
              <Textarea
                id="ai-system-prefix"
                className="min-h-[140px] rounded-md border-slate-300 bg-white shadow-none focus-visible:ring-teal-600/30"
                value={systemPromptPrefix}
                onChange={(e) => setSystemPromptPrefix(e.target.value)}
                placeholder="You are an assistant for an ISO 17025 testing laboratory…"
              />
            </div>
          </SettingSection>
        </div>
      </div>
    </div>
  )
})
