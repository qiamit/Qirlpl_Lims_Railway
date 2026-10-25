/**
 * One password rule for the whole LIMS (sign-in accounts).
 *
 * Mirrored in backend/functions/server.mjs (validatePasswordPolicy). Keep the
 * two in step, including COMMON_PASSWORDS. GoTrue's own minimum
 * (GOTRUE_PASSWORD_MIN_LENGTH) should be set to the same length.
 *
 * Passwords are never trimmed (not on create, change, reset or sign-in).
 * Instead a password may not begin or end with a space, so a form that trims
 * and one that does not end up with the same value.
 */

export const PASSWORD_MIN_LENGTH = 10
/** bcrypt (GoTrue) ignores everything after 72 bytes. */
export const PASSWORD_MAX_LENGTH = 72

/** Small list of passwords that pass the length and character rules but are guessed first. Lower case. */
export const COMMON_PASSWORDS: readonly string[] = [
  '1234567890a',
  '1q2w3e4r5t',
  '1q2w3e4r5t6y',
  '1qaz2wsx3edc',
  'a123456789',
  'abc@123456',
  'abc1234567',
  'abcd123456',
  'abcdef1234',
  'admin@1234',
  'admin12345',
  'asdfghjkl1',
  'changeme123',
  'dragon12345',
  'football123',
  'india12345',
  'iloveyou12',
  'laboratory1',
  'letmein123',
  'lims123456',
  'master12345',
  'monkey12345',
  'p@ssw0rd123',
  'pass@12345',
  'passw0rd123',
  'password@123',
  'password12',
  'password123',
  'password1234',
  'princess123',
  'q1w2e3r4t5',
  'qirlpl@123',
  'qirlpl12345',
  'qwerty@123',
  'qwerty1234',
  'qwerty12345',
  'qwertyuiop1',
  'raipur1234',
  'sunshine123',
  'superman123',
  'temp@12345',
  'temp123456',
  'test123456',
  'trustno1234',
  'welcome@123',
  'welcome123',
  'zaq12wsxcde',
]

const COMMON_SET = new Set(COMMON_PASSWORDS)

export const PASSWORD_POLICY_HINT =
  `At least ${PASSWORD_MIN_LENGTH} characters with a letter and a number. ` +
  'Not your email address, not a common password, and no space at the start or end.'

/** Returns an error message, or null when the password meets the policy. */
export function validatePassword(password: string, opts: { email?: string | null } = {}): string | null {
  const value = String(password ?? '')
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`
  }
  if (value !== value.trim()) {
    return 'Password must not begin or end with a space.'
  }
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return 'Password must include a letter and a number.'
  }
  const lower = value.toLowerCase()
  const email = String(opts.email ?? '').trim().toLowerCase()
  if (email) {
    const local = email.split('@')[0] ?? ''
    if (lower === email || (local.length > 0 && lower === local)) {
      return 'Password must not be your email address.'
    }
  }
  if (COMMON_SET.has(lower)) {
    return 'This password is too common. Choose another.'
  }
  return null
}
