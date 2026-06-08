export const SECTION_CODE_LENGTH = 10

const SECTION_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** Auto-generate a 10-character alphanumeric section code. */
export function generateSectionCode(): string {
  let out = ''
  for (let i = 0; i < SECTION_CODE_LENGTH; i += 1) {
    out += SECTION_CODE_CHARS[Math.floor(Math.random() * SECTION_CODE_CHARS.length)]
  }
  return out
}

/** Keep section code editable but alphanumeric and max 10 characters. */
export function sanitizeSectionCodeInput(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').slice(0, SECTION_CODE_LENGTH).toUpperCase()
}
