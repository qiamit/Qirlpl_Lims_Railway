import { supabase } from '@/lib/supabaseClient'
import type { OptionItem } from './types'

export type LabMasterOptionCategory =
  | 'laboratory_type'
  | 'laboratory_scale'
  | 'designation'
  | 'department'
  | 'state'
  | 'country'
  | 'country_code'
  | 'currency'
  | 'date_format'
  | 'time_format'

export const LAB_MASTER_OPTION_CATEGORIES: LabMasterOptionCategory[] = [
  'laboratory_type',
  'laboratory_scale',
  'designation',
  'department',
  'state',
  'country',
  'country_code',
  'currency',
  'date_format',
  'time_format',
]

export const LAB_MASTER_OPTION_DEFAULTS: Record<LabMasterOptionCategory, OptionItem[]> = {
  laboratory_type: [
    { value: 'testing', label: 'Testing Laboratory' },
    { value: 'calibration', label: 'Calibration Laboratory' },
    { value: 'research', label: 'Research Laboratory' },
    { value: 'other', label: 'Other' },
  ],
  laboratory_scale: [
    { value: 'small', label: 'Small Scale' },
    { value: 'medium', label: 'Medium Scale' },
    { value: 'large', label: 'Large Scale' },
    { value: 'enterprise', label: 'Enterprise / Multi-location' },
  ],
  designation: [
    { value: 'lab-director', label: 'Laboratory Director' },
    { value: 'quality-manager', label: 'Quality Manager' },
    { value: 'technical-manager', label: 'Technical Manager' },
    { value: 'testing-engineer', label: 'Testing Engineer' },
  ],
  department: [
    { value: 'mechanical', label: 'Mechanical' },
    { value: 'chemical', label: 'Chemical' },
    { value: 'sample-cell', label: 'Sample Cell' },
    { value: 'quality-assurance', label: 'Quality Assurance' },
  ],
  state: [
    { value: 'chhattisgarh', label: 'Chhattisgarh' },
    { value: 'maharashtra', label: 'Maharashtra' },
    { value: 'telangana', label: 'Telangana' },
  ],
  country: [
    { value: 'india', label: 'India' },
    { value: 'nepal', label: 'Nepal' },
    { value: 'bhutan', label: 'Bhutan' },
  ],
  country_code: [
    { value: '+91', label: '+91 (IN)' },
    { value: '+977', label: '+977 (NP)' },
    { value: '+975', label: '+975 (BT)' },
  ],
  currency: [
    { value: 'inr', label: 'INR (₹) - Indian Rupee' },
    { value: 'usd', label: 'USD ($) - US Dollar' },
    { value: 'eur', label: 'EUR (€) - Euro' },
    { value: 'gbp', label: 'GBP (£) - British Pound' },
  ],
  date_format: [
    { value: 'dd-mm-yyyy', label: 'DD-MM-YYYY' },
    { value: 'mm-dd-yyyy', label: 'MM-DD-YYYY' },
    { value: 'yyyy-mm-dd', label: 'YYYY-MM-DD' },
  ],
  time_format: [
    { value: '24h', label: '24 Hour (HH:MM)' },
    { value: '12h', label: '12 Hour (hh:MM AM/PM)' },
  ],
}

export function emptyOptionsByCategory(): Record<LabMasterOptionCategory, OptionItem[]> {
  return {
    laboratory_type: [],
    laboratory_scale: [],
    designation: [],
    department: [],
    state: [],
    country: [],
    country_code: [],
    currency: [],
    date_format: [],
    time_format: [],
  }
}

export function slugifyLabOptionValue(label: string, fallbackPrefix: string): string {
  const slug = label
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9+-]+/g, '')
    .replace(/^-+|-+$/g, '')
  return slug || `${fallbackPrefix}-${Date.now()}`
}

function sortOptions(items: OptionItem[]): OptionItem[] {
  return [...items].sort((a, b) => a.label.localeCompare(b.label))
}

export async function fetchLabMasterOptionsGrouped(): Promise<Record<LabMasterOptionCategory, OptionItem[]>> {
  const grouped = emptyOptionsByCategory()

  const { data, error } = await supabase
    .from('lab_master_options')
    .select('category, label, value')
    .order('label', { ascending: true })

  if (error) throw error

  for (const row of data ?? []) {
    const category = String((row as { category?: unknown }).category ?? '') as LabMasterOptionCategory
    if (!LAB_MASTER_OPTION_CATEGORIES.includes(category)) continue
    const value = String((row as { value?: unknown }).value ?? '').trim()
    const label = String((row as { label?: unknown }).label ?? '').trim()
    if (!value || !label) continue
    if (grouped[category].some((o) => o.value === value)) continue
    grouped[category].push({ value, label })
  }

  for (const category of LAB_MASTER_OPTION_CATEGORIES) {
    if (grouped[category].length === 0) {
      grouped[category] = [...LAB_MASTER_OPTION_DEFAULTS[category]]
    } else {
      grouped[category] = sortOptions(grouped[category])
    }
  }

  return grouped
}

export async function insertLabMasterOption(
  category: LabMasterOptionCategory,
  label: string,
  value: string,
): Promise<void> {
  const { error } = await supabase.from('lab_master_options').insert({
    category,
    label: label.trim(),
    value: value.trim(),
  })
  if (error) throw error
}

export async function deleteLabMasterOption(
  category: LabMasterOptionCategory,
  value: string,
): Promise<void> {
  const { error } = await supabase
    .from('lab_master_options')
    .delete()
    .eq('category', category)
    .eq('value', value)
  if (error) throw error
}

/** Insert designation/department label if not already in lab_master_options */
export async function ensureLabMasterOptionByLabel(
  category: 'designation' | 'department',
  label: string,
): Promise<void> {
  const trimmed = label.trim()
  if (!trimmed) return

  const { data, error } = await supabase
    .from('lab_master_options')
    .select('id, label, value')
    .eq('category', category)

  if (error) throw error

  const rows = Array.isArray(data) ? data : []
  const exists = rows.some(
    (r) => String((r as { label?: unknown }).label ?? '').trim().toLowerCase() === trimmed.toLowerCase(),
  )
  if (exists) return

  const value = slugifyLabOptionValue(trimmed, category)
  await insertLabMasterOption(category, trimmed, value)
}

export async function fetchDesignationAndDepartmentLabels(): Promise<{
  designations: string[]
  departments: string[]
}> {
  const grouped = await fetchLabMasterOptionsGrouped()
  return {
    designations: grouped.designation.map((o) => o.label),
    departments: grouped.department.map((o) => o.label),
  }
}
