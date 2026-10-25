import crypto from 'node:crypto'

export const randomToken = () => crypto.randomBytes(32).toString('base64url')

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex')

/** AES-256-GCM, output base64url(iv | tag | ciphertext). */
export function encryptJson(key, value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
}

export function decryptJson(key, text) {
  const raw = Buffer.from(String(text), 'base64url')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'))
}

/** Short stable placeholder for a value (not reversible without the key). */
export function placeholderFor(key, category, value) {
  const norm = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  const h = crypto.createHmac('sha256', key).update(`${category}:${norm}`).digest('hex').slice(0, 6)
  return `${category}_${h}`
}
