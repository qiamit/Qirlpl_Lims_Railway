/** Browser library of reusable calibration-point formulas. */

export type SavedPointFormula = {
  id: string
  name: string
  expression: string
  updatedAt: string
}

export const SAVED_POINT_FORMULAS_STORAGE_KEY = 'qirlpl.calibrationPointFormulas'

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `fml-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function loadSavedPointFormulas(): SavedPointFormula[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(SAVED_POINT_FORMULAS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const row = item as Record<string, unknown>
        const name = String(row.name ?? '').trim()
        const expression = String(row.expression ?? '').trim()
        if (!name || !expression) return null
        return {
          id: String(row.id ?? newId()),
          name,
          expression,
          updatedAt: String(row.updatedAt ?? new Date().toISOString()),
        } satisfies SavedPointFormula
      })
      .filter((x): x is SavedPointFormula => x != null)
  } catch {
    return []
  }
}

function persist(formulas: SavedPointFormula[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SAVED_POINT_FORMULAS_STORAGE_KEY, JSON.stringify(formulas))
}

/** Save or update by name (case-insensitive). Returns the saved list. */
export function savePointFormula(name: string, expression: string): SavedPointFormula[] {
  const cleanName = name.trim()
  const cleanExpr = expression.trim()
  if (!cleanName || !cleanExpr) return loadSavedPointFormulas()

  const list = loadSavedPointFormulas()
  const existing = list.find((f) => f.name.toLowerCase() === cleanName.toLowerCase())
  const next: SavedPointFormula = existing
    ? { ...existing, name: cleanName, expression: cleanExpr, updatedAt: new Date().toISOString() }
    : {
        id: newId(),
        name: cleanName,
        expression: cleanExpr,
        updatedAt: new Date().toISOString(),
      }

  const updated = existing
    ? list.map((f) => (f.id === existing.id ? next : f))
    : [next, ...list]

  persist(updated)
  return updated
}

export function deleteSavedPointFormula(id: string): SavedPointFormula[] {
  const updated = loadSavedPointFormulas().filter((f) => f.id !== id)
  persist(updated)
  return updated
}
