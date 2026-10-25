import { supabase } from '@/lib/supabaseClient'

/**
 * Whether an object is still in the bucket. storage.remove() answers without
 * an error when row level security refuses the delete (it simply removes
 * nothing), so a delete flow checks this to tell "not allowed" from "already
 * gone". When the listing itself fails the file is taken as still there, so
 * the caller never drops its record for a file that was not deleted.
 */
export async function storageFileExists(bucket: string, path: string): Promise<boolean> {
  const slash = path.lastIndexOf('/')
  const folder = slash >= 0 ? path.slice(0, slash) : ''
  const name = slash >= 0 ? path.slice(slash + 1) : path
  const { data, error } = await supabase.storage.from(bucket).list(folder, { search: name, limit: 100 })
  if (error) return true
  // storage-api v1.24 lists the full path ("folder/name"); older versions the name only.
  return (data ?? []).some((f) => f.name === name || f.name === path)
}
