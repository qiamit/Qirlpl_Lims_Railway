import { useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { recordReason, useReasonForChange } from '@/hooks/useReasonForChange'
import { limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { formatDateTime } from '@/lib/utils'
import { EnvSelect, Field, MessageLine } from '@/features/environment/EnvironmentUi'
import { metallographyErrorText, updateSettings } from '../metallographyApi'
import type { AiMode, MetallographySettings } from '../types'

const AI_MODE_LABEL: Record<AiMode, string> = {
  off: 'Off',
  numeric_only: 'Numbers only (coming later)',
  image: 'Numbers and images (coming later)',
}

/**
 * S5 Module settings: the module switch and the AI mode. Laboratory Director
 * only (the database refuses anyone else); others see the values read-only.
 */
export function ModuleSettingsTab({
  settings,
  isDirector,
  onSaved,
}: {
  settings: MetallographySettings
  isDirector: boolean
  onSaved: (s: MetallographySettings, message: string) => void
}) {
  const askReason = useReasonForChange()
  const [enabled, setEnabled] = useState(settings.enabled)
  const [aiMode, setAiMode] = useState<AiMode>(settings.aiMode)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = enabled !== settings.enabled || aiMode !== settings.aiMode

  const save = async () => {
    const reason = await askReason({
      title: enabled !== settings.enabled ? (enabled ? 'Reason for switching metallography on' : 'Reason for switching metallography off') : 'Reason for changing the metallography settings',
      recordLabel: 'Metallography module settings',
      description: 'Keep the module off until the Quality Manager has signed off OQ-09 (metallography).',
      confirmLabel: 'Save',
      quickPicks: ['OQ-09 signed off by the Quality Manager', 'Module taken out of use', 'Validation in progress'],
    })
    if (!reason) return
    setSaving(true)
    setError(null)
    try {
      const saved = await updateSettings({ enabled, aiMode })
      await recordReason('metallography_settings', 1, reason)
      onSaved(saved, saved.enabled ? 'Metallography is in use.' : 'Metallography is switched off.')
    } catch (err) {
      setError(metallographyErrorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <MessageLine tone="error" text={error} />
      {!isDirector ? (
        <p className="text-[12px] text-stone-600">Only the Laboratory Director can change these settings.</p>
      ) : null}

      <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-h-10 items-center gap-2 border border-stone-400 bg-white px-2.5 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={enabled}
            disabled={!isDirector || saving}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>
            <span className="font-semibold">Metallography module in use</span>
            <span className="block text-[12px] text-stone-600">
              When off, the pages show "not in use" and Enter Results shows no Metallography link.
            </span>
          </span>
        </label>

        <Field label="AI advisory" htmlFor="mg-ai-mode">
          <EnvSelect
            id="mg-ai-mode"
            value={aiMode}
            onChange={(v) => setAiMode(v as AiMode)}
            disabled={!isDirector || saving}
          >
            {(Object.keys(AI_MODE_LABEL) as AiMode[]).map((m) => (
              <option key={m} value={m} disabled={m !== 'off' && m !== settings.aiMode}>
                {AI_MODE_LABEL[m]}
              </option>
            ))}
          </EnvSelect>
        </Field>
        <div className="text-[12px] text-stone-600 sm:self-end">
          AI never decides a result. Advisory comparison comes in a later release, only if the laboratory opts in.
        </div>
      </div>

      <p className="text-[12px] text-stone-500">
        {settings.updatedAt ? `Last changed ${formatDateTime(settings.updatedAt)}.` : 'Not changed yet.'}
      </p>

      {isDirector ? (
        <Button className={limsPrimaryBtnClass} onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
        </Button>
      ) : null}
    </div>
  )
}
