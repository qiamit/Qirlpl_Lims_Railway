import { useQuery } from '@tanstack/react-query'
import { fetchAiSettings } from '@/features/settings/ai-settings/aiSettingsApi'

/** Query key — invalidate after General Setting “Show AI Assistant” changes. */
export const AI_ASSISTANT_VISIBLE_QUERY_KEY = ['ai-assistant-visible'] as const

/**
 * `ai_settings.ai_enabled` is used as UI Show/Hide for QI Assistant buttons.
 * AI itself stays available on the server regardless of this flag.
 */
export function useShowAiAssistant(): boolean {
  const { data } = useQuery({
    queryKey: AI_ASSISTANT_VISIBLE_QUERY_KEY,
    queryFn: async () => {
      const settings = await fetchAiSettings()
      return settings?.ai_enabled !== false
    },
    staleTime: 30_000,
  })
  return data ?? true
}
