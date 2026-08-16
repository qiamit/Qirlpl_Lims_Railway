import { sendQiAssistantMessage } from '@/components/qi-assistant/qiAssistantApi'
import type { BreakdownRegisterForm } from './types'

export const BREAKDOWN_AI_FIELDS = [
  { key: 'natureOfBreakdown', label: 'Nature of Breakdown' },
  { key: 'symptoms', label: 'Symptoms / Observation' },
  { key: 'impactOnWork', label: 'Impact on Work' },
  { key: 'immediateAction', label: 'Immediate Action Taken' },
  { key: 'repairAction', label: 'Repair Action / Work Done' },
  { key: 'verificationNotes', label: 'Verification Notes' },
] as const

export type BreakdownAiFieldKey = (typeof BREAKDOWN_AI_FIELDS)[number]['key']

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

function buildAiFillFieldMessage(targetKey: BreakdownAiFieldKey, targetLabel: string): string {
  return `Fill ONE field of an ISO/IEC 17025 laboratory equipment breakdown register form.

You may READ all context and all other form fields, but you must WRITE only this target field.

Target field key: ${targetKey}
Target field label: ${targetLabel}

Return ONLY a JSON object (no markdown fences, no commentary) with this exact single key:
{ "${targetKey}":"..." }

Rules:
- Use professional laboratory English suitable for accredited lab equipment records.
- Base content on the equipment identity and other form values provided in context.
- Do not invent specific certificate numbers, fake dates, employee names, or costs.
- Keep the answer 1–3 concise sentences (or short bullet-like sentences).
- If the target field already has text, improve/complete it while keeping intent.
- Do not return or modify any other keys.`
}

export async function aiFillBreakdownField(input: {
  targetKey: BreakdownAiFieldKey
  form: BreakdownRegisterForm
}): Promise<string> {
  const meta = BREAKDOWN_AI_FIELDS.find((f) => f.key === input.targetKey)
  if (!meta) throw new Error('Unknown AI field.')

  const f = input.form
  const context = [
    `Breakdown ID: ${f.registerNo || '(new)'}`,
    `Equipment Source: ${f.equipmentSource}`,
    `Asset Code: ${f.assetCode || '(none)'}`,
    `Equipment Name: ${f.equipmentName || '(none)'}`,
    `Manufacturer: ${f.manufacturer || '(none)'}`,
    `Model: ${f.modelNumber || '(none)'}`,
    `Serial No: ${f.serialNumber || '(none)'}`,
    `Location: ${f.currentLocation || '(none)'}`,
    `Breakdown Start: ${f.breakdownDate || '(none)'} ${f.breakdownTime || ''}`.trim(),
    `Status: ${f.status}`,
    `Reported By: ${f.reportedByName || '(none)'}`,
    `Repaired By: ${f.repairedBy || '(none)'}`,
    `Spare Parts: ${f.sparePartsUsed || '(none)'}`,
    '',
    `Target field to write: ${meta.key} (${meta.label})`,
    '',
    'Current form values (read-only context; write ONLY the target field):',
    ...BREAKDOWN_AI_FIELDS.map(
      ({ key, label }) =>
        `${key} (${label})${key === input.targetKey ? ' [TARGET]' : ''}: ${f[key] || '(empty)'}`,
    ),
  ].join('\n')

  const { reply } = await sendQiAssistantMessage({
    page: 'equipment-breakdown-register',
    message: buildAiFillFieldMessage(input.targetKey, meta.label),
    context,
    history: [],
  })

  const draft = extractJsonObject(reply)
  const value = String(draft[input.targetKey] ?? '').trim()
  if (!value) throw new Error('AI did not return text for this field.')
  return value
}
