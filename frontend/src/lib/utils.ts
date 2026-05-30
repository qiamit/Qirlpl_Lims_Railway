import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(dateString))
}

export function formatDateTime(dateString: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString))
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
