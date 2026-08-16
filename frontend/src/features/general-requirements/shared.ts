export function formatDateDisplay(value: string | null | undefined): string {
  if (!value) return '—'
  const iso = String(value).slice(0, 10)
  const [y, m, d] = iso.split('-')
  if (y && m && d) return `${d}-${m}-${y}`
  return iso
}

export function formatSupabaseError(err: unknown) {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

export function printViaIframe(html: string) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
  })
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  if (!doc) {
    document.body.removeChild(iframe)
    return
  }
  doc.open()
  doc.write(html)
  doc.close()
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe)
      }, 1000)
    }
  }
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function nextPrefixedId(existingIds: string[], prefixBase: string): string {
  const year = new Date().getFullYear()
  const prefix = `${prefixBase}-${year}-`
  let max = 0
  for (const id of existingIds) {
    if (!id.startsWith(prefix)) continue
    const n = Number(id.slice(prefix.length))
    if (Number.isFinite(n)) max = Math.max(max, n)
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export const GRID_TABLE =
  'table-fixed min-w-[980px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm]'
export const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'
export const primaryLineClass =
  'break-words text-[12.5px] font-semibold tracking-tight text-[#292524]'
export const secondaryLineClass = 'break-words text-[11px] font-medium leading-snug text-[#78716c]'
export const metaLineClass = 'break-words font-mono text-[11px] font-medium text-[#b45309]'
export const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
export const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
export const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'
export const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'
export const actionBtnClass =
  'rounded-none text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]'
