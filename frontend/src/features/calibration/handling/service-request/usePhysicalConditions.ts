import { useCallback, useEffect, useState } from 'react'
import {
  getCachedPhysicalConditions,
  loadPhysicalConditions,
  subscribePhysicalConditions,
  type PhysicalConditionOptionRow,
} from './physicalConditionApi'

export function usePhysicalConditions() {
  const [options, setOptions] = useState<PhysicalConditionOptionRow[]>(getCachedPhysicalConditions())
  const [loading, setLoading] = useState(getCachedPhysicalConditions().length === 0)

  const refresh = useCallback(async () => {
    try {
      const rows = await loadPhysicalConditions()
      setOptions(rows)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return subscribePhysicalConditions(() => {
      setOptions(getCachedPhysicalConditions())
    })
  }, [refresh])

  return { options, loading, refresh }
}
