import { supabase } from '@/lib/supabaseClient'
import type { FilterComboboxOption } from '@/features/sample-handling/receiving/FilterCombobox'

type UserProfileRow = {
  id: string
  full_name: string | null
  designation: string | null
  department_name: string | null
  division: string | null
  status: string | null
}

/** "Common Division" staff work across every division, so they belong in each list. */
const SHARED_DIVISION_TOKEN = 'common'

/** Divisions are free text labels ("Calibration Division", legacy slugs, etc.). */
function normalizeDivision(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()
}

function belongsToDivision(division: string | null | undefined, token: string): boolean {
  const normalized = normalizeDivision(division)
  if (!normalized) return false
  return normalized.includes(token) || normalized.includes(SHARED_DIVISION_TOKEN)
}

/** Active employees of the Calibration division, as combobox options keyed by profile id. */
export async function fetchCalibrationDivisionEmployees(): Promise<FilterComboboxOption[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, designation, department_name, division, status')
    .order('full_name', { ascending: true })
  if (error) throw error

  const rows = Array.isArray(data) ? (data as UserProfileRow[]) : []
  return rows
    .filter((r) => String(r.status ?? 'Active').toLowerCase() !== 'inactive')
    .filter((r) => belongsToDivision(r.division, 'calibration'))
    .map((r) => {
      const label = (r.full_name ?? '').trim()
      const secondaryLabel = [(r.department_name ?? '').trim(), (r.designation ?? '').trim()]
        .filter(Boolean)
        .join(' | ')
      return {
        id: r.id,
        label,
        ...(secondaryLabel ? { secondaryLabel } : {}),
      }
    })
    .filter((o) => o.label.length > 0)
}
