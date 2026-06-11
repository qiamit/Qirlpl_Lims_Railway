import { supabase } from '@/lib/supabaseClient'
import { isSupabaseMissingColumnError } from '@/lib/supabaseErrors'

export async function fetchSampleReceivingEditUnlocked(sampleId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('samples')
    .select('sample_receiving_edit_unlocked')
    .eq('id', sampleId)
    .maybeSingle()

  if (error) {
    if (isSupabaseMissingColumnError(error, 'sample_receiving_edit_unlocked')) return false
    throw error
  }

  return Boolean(
    (data as { sample_receiving_edit_unlocked?: boolean } | null)?.sample_receiving_edit_unlocked,
  )
}

export async function setSampleReceivingEditUnlocked(sampleId: string, unlocked: boolean): Promise<void> {
  const { error } = await supabase
    .from('samples')
    .update({ sample_receiving_edit_unlocked: unlocked })
    .eq('id', sampleId)

  if (error) {
    if (isSupabaseMissingColumnError(error, 'sample_receiving_edit_unlocked')) {
      throw new Error(
        'Database update failed: sample_receiving_edit_unlocked column is missing. Apply the latest migration.',
      )
    }
    throw error
  }
}
