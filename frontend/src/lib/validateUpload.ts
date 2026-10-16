const DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'txt',
])

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp'])

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
}

export const LAB_UPLOAD_MAX_BYTES = 25 * 1024 * 1024

export function fileExtension(file: File): string {
  const name = file.name.trim().toLowerCase()
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1)
}

export function assertAllowedUpload(
  file: File,
  options?: { extensions?: Set<string>; maxBytes?: number },
): void {
  const extensions = options?.extensions ?? DOCUMENT_EXTENSIONS
  const maxBytes = options?.maxBytes ?? LAB_UPLOAD_MAX_BYTES
  const ext = fileExtension(file)
  if (!ext || !extensions.has(ext)) {
    throw new Error(
      `Unsupported file type "${file.name || 'file'}". Allowed: ${[...extensions].join(', ')}.`,
    )
  }
  if (file.size <= 0) {
    throw new Error(`File "${file.name}" is empty.`)
  }
  if (file.size > maxBytes) {
    throw new Error(
      `File "${file.name}" is too large (${Math.ceil(file.size / (1024 * 1024))} MB). Max ${Math.ceil(maxBytes / (1024 * 1024))} MB.`,
    )
  }
}

export function uploadContentType(file: File): string {
  const ext = fileExtension(file)
  return CONTENT_TYPES[ext] || 'application/octet-stream'
}

export function assertSignatureImage(file: File): void {
  assertAllowedUpload(file, { extensions: IMAGE_EXTENSIONS, maxBytes: 5 * 1024 * 1024 })
}

export { DOCUMENT_EXTENSIONS, IMAGE_EXTENSIONS }
