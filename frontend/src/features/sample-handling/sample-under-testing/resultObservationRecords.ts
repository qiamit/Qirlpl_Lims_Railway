import { supabase } from '@/lib/supabaseClient'
import { assertAllowedUpload, uploadContentType } from '@/lib/validateUpload'

/**
 * Per-observation records (ISO/IEC 17025 7.5.1, migration 20261029100300):
 *   - who entered each parameter result and when (test_allocation_parameters
 *     entered_by_name / entered_at, stamped by the database), and
 *   - raw printouts / photos per result (result_attachments + private bucket
 *     result-attachments).
 * Every read returns null when the migration is not applied, so the screens
 * hide these parts and behave as before.
 */

export const RESULT_ATTACHMENTS_BUCKET = 'result-attachments'

const ATTACHMENT_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'csv', 'txt', 'xls', 'xlsx'])

export type ResultEntryStamp = { byName: string | null; at: string | null }

export type ResultAttachment = {
  id: string
  paramRowId: string
  sampleId: string | null
  storagePath: string
  fileName: string
  mimeType: string | null
  sizeBytes: number | null
  caption: string | null
  uploadedBy: string | null
  uploadedByName: string | null
  uploadedAt: string | null
}

const cleanIds = (ids: ReadonlyArray<string | null | undefined>) =>
  [...new Set(ids.map((v) => String(v ?? '').trim()).filter((v) => v && !v.startsWith('local-')))]

/** Who entered each result, by test_allocation_parameters.id. null = not available. Never throws. */
export async function fetchResultEntryStamps(
  paramRowIds: ReadonlyArray<string | null | undefined>,
): Promise<Record<string, ResultEntryStamp> | null> {
  const ids = cleanIds(paramRowIds)
  if (ids.length === 0) return {}
  try {
    const { data, error } = await supabase
      .from('test_allocation_parameters')
      .select('id, entered_by_name, entered_at')
      .in('id', ids)
    if (error) return null
    const out: Record<string, ResultEntryStamp> = {}
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      out[String(r.id)] = {
        byName: (r.entered_by_name as string | null) ?? null,
        at: (r.entered_at as string | null) ?? null,
      }
    }
    return out
  } catch {
    return null
  }
}

function mapAttachment(r: Record<string, unknown>): ResultAttachment {
  return {
    id: String(r.id),
    paramRowId: String(r.test_allocation_parameter_id),
    sampleId: (r.sample_id as string | null) ?? null,
    storagePath: String(r.storage_path ?? ''),
    fileName: String(r.file_name ?? ''),
    mimeType: (r.mime_type as string | null) ?? null,
    sizeBytes: typeof r.size_bytes === 'number' ? r.size_bytes : r.size_bytes != null ? Number(r.size_bytes) : null,
    caption: (r.caption as string | null) ?? null,
    uploadedBy: (r.uploaded_by as string | null) ?? null,
    uploadedByName: (r.uploaded_by_name as string | null) ?? null,
    uploadedAt: (r.uploaded_at as string | null) ?? null,
  }
}

/** Attachments by test_allocation_parameters.id. null = not available. Never throws. */
export async function fetchResultAttachments(
  paramRowIds: ReadonlyArray<string | null | undefined>,
): Promise<Record<string, ResultAttachment[]> | null> {
  const ids = cleanIds(paramRowIds)
  if (ids.length === 0) return {}
  try {
    const { data, error } = await supabase
      .from('result_attachments')
      .select('*')
      .in('test_allocation_parameter_id', ids)
      .order('uploaded_at', { ascending: true })
    if (error) return null
    const out: Record<string, ResultAttachment[]> = {}
    for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
      const a = mapAttachment(raw)
      ;(out[a.paramRowId] ??= []).push(a)
    }
    return out
  } catch {
    return null
  }
}

export async function uploadResultAttachment(input: {
  sampleId: string
  paramRowId: string
  file: File
  caption?: string | null
}): Promise<ResultAttachment> {
  const { sampleId, paramRowId, file } = input
  assertAllowedUpload(file, { extensions: ATTACHMENT_EXTENSIONS })
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${sampleId}/${paramRowId}/${crypto.randomUUID()}_${safe}`
  const contentType = uploadContentType(file)
  const { error: upErr } = await supabase.storage
    .from(RESULT_ATTACHMENTS_BUCKET)
    .upload(path, file, { upsert: false, contentType })
  if (upErr) throw upErr
  const { data, error } = await supabase
    .from('result_attachments')
    .insert({
      test_allocation_parameter_id: paramRowId,
      storage_path: path,
      file_name: file.name,
      mime_type: contentType,
      size_bytes: file.size,
      caption: input.caption?.trim() || null,
    })
    .select('*')
    .single()
  if (error) {
    await supabase.storage.from(RESULT_ATTACHMENTS_BUCKET).remove([path])
    throw error
  }
  return mapAttachment(data as Record<string, unknown>)
}

export async function openResultAttachment(a: ResultAttachment): Promise<void> {
  const { data, error } = await supabase.storage.from(RESULT_ATTACHMENTS_BUCKET).createSignedUrl(a.storagePath, 600)
  if (error || !data?.signedUrl) throw error ?? new Error('Could not open the attachment.')
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

/** Removes the record, then the file. The database decides who may (uploader before issue, Director). */
export async function deleteResultAttachment(a: ResultAttachment): Promise<void> {
  const { data, error } = await supabase.from('result_attachments').delete().eq('id', a.id).select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Only the person who uploaded it can remove this file before the report is issued (or the Laboratory Director).')
  }
  const { error: rmErr } = await supabase.storage.from(RESULT_ATTACHMENTS_BUCKET).remove([a.storagePath])
  if (rmErr) console.warn('[result attachments] record removed, file left in storage', rmErr)
}

export function formatFileSize(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
