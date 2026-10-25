import { supabase } from '@/lib/supabaseClient'

/**
 * lab_settings.mcp_enabled: the MCP connector for Claude (migration
 * 20261102101400, docs/mcp-connector-plan.md). Only the Laboratory Director can
 * change it (lab_settings update policy). `columnAvailable` is false before the
 * migration is applied.
 */

const LAB_SETTINGS_SINGLETON_ID = '00000000-0000-0000-0000-000000000001'

/** Connector address shown to the Director (optional build variable). */
export const MCP_CONNECTOR_URL = String(import.meta.env.VITE_MCP_URL ?? '').trim()

async function labSettingsRowId(): Promise<string | null> {
  const single = await supabase.from('lab_settings').select('id').eq('id', LAB_SETTINGS_SINGLETON_ID).maybeSingle()
  if (single.data) return LAB_SETTINGS_SINGLETON_ID
  const latest = await supabase
    .from('lab_settings')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (latest.data as { id?: string } | null)?.id ?? null
}

export async function fetchMcpConnectorState(): Promise<{ enabled: boolean; columnAvailable: boolean }> {
  try {
    const rowId = await labSettingsRowId()
    if (!rowId) return { enabled: false, columnAvailable: true }
    const { data, error } = await supabase.from('lab_settings').select('mcp_enabled').eq('id', rowId).maybeSingle()
    if (error) return { enabled: false, columnAvailable: false }
    return { enabled: Boolean((data as { mcp_enabled?: boolean } | null)?.mcp_enabled), columnAvailable: true }
  } catch {
    return { enabled: false, columnAvailable: false }
  }
}

export async function saveMcpConnectorEnabled(enabled: boolean): Promise<void> {
  const rowId = await labSettingsRowId()
  if (!rowId) throw new Error('Lab settings row not found. Save Lab Settings first.')
  const { data, error } = await supabase
    .from('lab_settings')
    .update({ mcp_enabled: enabled })
    .eq('id', rowId)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Only the Laboratory Director can switch the MCP connector on or off.')
}
