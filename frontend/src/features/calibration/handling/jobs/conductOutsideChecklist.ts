/** Outside Conduct — outgoing / inward equipment handling checklists (ISO-style). */

export type ConductOutsideChecklistKind = 'outgoing' | 'inward'

export type ConductOutsideChecklistItem = {
  id: string
  label: string
  checked: boolean
}

export type ConductOutsideChecklistPayload = {
  completed: boolean
  completedAt: string | null
  remarks: string
  items: ConductOutsideChecklistItem[]
}

const OUTGOING_DEFAULT_LABELS = [
  'Equipment identity verified against SRF (make / model / serial)',
  'Visual inspection — no damage; accessories complete',
  'Reference standards / masters packed; calibration status valid',
  'Transport packaging and handling instructions confirmed',
  'Client site readiness confirmed (power, access, environment)',
  'PPE / site permits / safety requirements available',
  'Job paperwork available (SRF, previous certificate if any)',
] as const

const INWARD_DEFAULT_LABELS = [
  'Equipment returned and identity re-verified',
  'Post-calibration visual inspection — no transit damage',
  'Reference standards / masters returned and secured',
  'Accessories / cables / fixtures complete',
  'Site raw data / worksheets returned with the job',
  'Site environmental conditions recorded',
  'Client acknowledgement / handover note obtained',
] as const

function slugId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`
}

export function defaultOutgoingChecklistItems(): ConductOutsideChecklistItem[] {
  return OUTGOING_DEFAULT_LABELS.map((label, i) => ({
    id: slugId('out', i),
    label,
    checked: false,
  }))
}

export function defaultInwardChecklistItems(): ConductOutsideChecklistItem[] {
  return INWARD_DEFAULT_LABELS.map((label, i) => ({
    id: slugId('in', i),
    label,
    checked: false,
  }))
}

export function emptyChecklistPayload(
  kind: ConductOutsideChecklistKind,
): ConductOutsideChecklistPayload {
  return {
    completed: false,
    completedAt: null,
    remarks: '',
    items:
      kind === 'outgoing' ? defaultOutgoingChecklistItems() : defaultInwardChecklistItems(),
  }
}

function parseItems(
  raw: unknown,
  kind: ConductOutsideChecklistKind,
): ConductOutsideChecklistItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return kind === 'outgoing' ? defaultOutgoingChecklistItems() : defaultInwardChecklistItems()
  }
  const out: ConductOutsideChecklistItem[] = []
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i]
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const label = String(r.label ?? r.checkPoint ?? r.checkpoint ?? '').trim()
    if (!label) continue
    out.push({
      id: String(r.id ?? slugId(kind === 'outgoing' ? 'out' : 'in', i)),
      label,
      checked: Boolean(r.checked ?? r.done ?? false),
    })
  }
  return out.length > 0
    ? out
    : kind === 'outgoing'
      ? defaultOutgoingChecklistItems()
      : defaultInwardChecklistItems()
}

export function parseConductOutsideChecklist(
  value: unknown,
  kind: ConductOutsideChecklistKind,
): ConductOutsideChecklistPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return emptyChecklistPayload(kind)
  }
  const row = value as Record<string, unknown>
  const items = parseItems(row.items, kind)
  const completed = Boolean(row.completed)
  const completedAtRaw = row.completedAt ?? row.completed_at
  const completedAt =
    typeof completedAtRaw === 'string' && completedAtRaw.trim()
      ? completedAtRaw.trim()
      : null
  return {
    completed,
    completedAt: completed ? completedAt : null,
    remarks: String(row.remarks ?? '').trim(),
    items,
  }
}

export function isChecklistCompleted(
  value: ConductOutsideChecklistPayload | null | undefined,
): boolean {
  return Boolean(value?.completed)
}

export function allItemsChecked(items: ConductOutsideChecklistItem[]): boolean {
  return items.length > 0 && items.every((i) => i.checked)
}

export function checklistKindLabel(kind: ConductOutsideChecklistKind): string {
  return kind === 'outgoing' ? 'Outgoing Checklist' : 'Inward Checklist'
}
