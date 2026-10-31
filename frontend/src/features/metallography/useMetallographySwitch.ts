import { useCallback, useEffect, useState } from 'react'
import { fetchMetallographySwitch } from './metallographyApi'
import type { MetallographySwitch } from './types'

/**
 * Module switch for the metallography pages (app_metallography_enabled());
 * null while loading. `reload` re-reads it after Module settings change.
 */
export function useMetallographySwitch(): { state: MetallographySwitch | null; reload: () => Promise<void> } {
  const [state, setState] = useState<MetallographySwitch | null>(null)
  const reload = useCallback(async () => {
    setState(await fetchMetallographySwitch())
  }, [])
  useEffect(() => {
    let cancelled = false
    void fetchMetallographySwitch().then((s) => {
      if (!cancelled) setState(s)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return { state, reload }
}
