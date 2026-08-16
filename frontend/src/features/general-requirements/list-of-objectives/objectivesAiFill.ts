import { sendQiAssistantMessage } from '@/components/qi-assistant/qiAssistantApi'

export const OBJECTIVES_AI_FIELDS = [
  { key: 'description', label: 'Description' },
  { key: 'review_notes', label: 'Review Notes' },
] as const

export type ObjectivesAiFieldKey = (typeof OBJECTIVES_AI_FIELDS)[number]['key']

function extractJsonObject(reply: string): Record<string, unknown> {
  const text = reply.trim()
  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // fall through — extract embedded JSON
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI did not return a JSON object.')
  const parsed = JSON.parse(text.slice(start, end + 1)) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI response was not a JSON object.')
  }
  return parsed as Record<string, unknown>
}

function buildAiFillFieldMessage(targetKey: ObjectivesAiFieldKey, targetLabel: string): string {
  return `Fill ONE field of an ISO/IEC 17025 laboratory quality objectives register form.

You may READ all context and all other form fields, but you must WRITE only this target field.

Target field key: ${targetKey}
Target field label: ${targetLabel}

Return ONLY a JSON object (no markdown fences, no commentary) with this exact single key:
{ "${targetKey}":"..." }

Rules:
- Use professional laboratory English suitable for accredited lab quality objectives.
- Base content on the objective title, status, owner, target date, and other form values.
- Do not invent specific certificate numbers, fake audit IDs, or employee names not provided.
- Keep the answer 2–5 concise sentences (or short bullet-like sentences).
- If the target field already has text, improve/complete it while keeping intent.
- For description: explain what the objective means and how success will be judged.
- For review_notes: draft review / progress commentary appropriate to the current status.
- Do not return or modify any other keys.`
}

export async function aiFillObjectiveField(input: {
  targetKey: ObjectivesAiFieldKey
  form: Record<string, string | boolean>
}): Promise<string> {
  const meta = OBJECTIVES_AI_FIELDS.find((f) => f.key === input.targetKey)
  if (!meta) throw new Error('Unknown AI field.')

  const f = input.form
  const str = (key: string) => String(f[key] ?? '').trim() || '(none)'

  const context = [
    `Module: List of Objectives (ISO/IEC 17025 quality objectives)`,
    `Objective ID: ${str('objective_id')}`,
    `Objective Title: ${str('title')}`,
    `Status: ${str('status')}`,
    `Owner: ${str('owner_name')}`,
    `Target Date: ${str('target_date')}`,
    '',
    `Target field to write: ${meta.key} (${meta.label})`,
    '',
    'Current form values (read-only context; write ONLY the target field):',
    ...OBJECTIVES_AI_FIELDS.map(
      ({ key, label }) =>
        `${key} (${label})${key === input.targetKey ? ' [TARGET]' : ''}: ${str(key) === '(none)' ? '(empty)' : str(key)}`,
    ),
  ].join('\n')

  const { reply } = await sendQiAssistantMessage({
    page: 'list-of-objectives',
    message: buildAiFillFieldMessage(input.targetKey, meta.label),
    context,
    history: [],
  })

  const draft = extractJsonObject(reply)
  const value = String(draft[input.targetKey] ?? '').trim()
  if (!value) throw new Error('AI did not return text for this field.')
  return value
}
