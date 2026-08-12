import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** Display date as dd-Mmm-yy (e.g. 21-Aug-26). Returns null when invalid. */
export function formatDateDmyMmm(dateString: string | null | undefined): string | null {
  if (!dateString?.trim()) return null
  const raw = dateString.trim()
  const iso = raw.slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (m) {
    const year = m[1]!
    const monthIdx = parseInt(m[2]!, 10) - 1
    const dayNum = parseInt(m[3]!, 10)
    if (monthIdx < 0 || monthIdx > 11 || dayNum < 1 || dayNum > 31) return null
    const day = String(dayNum).padStart(2, '0')
    return `${day}-${MONTH_ABBR[monthIdx]}-${year.slice(2)}`
  }
  const parsed = Date.parse(raw)
  if (Number.isNaN(parsed)) return null
  const d = new Date(parsed)
  const day = String(d.getDate()).padStart(2, '0')
  return `${day}-${MONTH_ABBR[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`
}

export function formatDate(dateString: string | null | undefined): string {
  return formatDateDmyMmm(dateString) ?? '—'
}

export function formatDateTime(dateString: string | null | undefined): string {
  const datePart = formatDateDmyMmm(dateString)
  if (!datePart || !dateString) return '—'
  const parsed = Date.parse(dateString)
  if (Number.isNaN(parsed)) return datePart
  const time = new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(parsed))
  return `${datePart}, ${time}`
}

export function generateCode(prefix: string, sequence: number, padLength = 5): string {
  return `${prefix}-${String(sequence).padStart(padLength, '0')}`
}

export function isCalibrationDue(dueDateString: string, warningDays = 30): boolean {
  const due = new Date(dueDateString)
  const now = new Date()
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return diffDays <= warningDays
}

export function isCalibrationOverdue(dueDateString: string): boolean {
  return new Date(dueDateString) < new Date()
}
