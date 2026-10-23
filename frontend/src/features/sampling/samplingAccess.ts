/** Who may do what on the sampling pages, and the Lab Settings switch. */
import { useEffect, useState } from 'react'
import { fetchSamplingSwitch, type SamplingSwitch } from './shared'

/** Lab Settings switch for the sampling pages; null while loading. */
export function useSamplingSwitch(): SamplingSwitch | null {
  const [state, setState] = useState<SamplingSwitch | null>(null)
  useEffect(() => {
    let cancelled = false
    void fetchSamplingSwitch().then((s) => {
      if (!cancelled) setState(s)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

/** Same rule as app_sampling_can_manage(): Director, Quality Manager (QA) or Technical Manager. */
export function canManageSampling(designation: string, departmentName: string, isDirector: boolean): boolean {
  const des = designation.trim().toLowerCase()
  return (
    isDirector ||
    des === 'technical manager' ||
    (des === 'quality manager' && departmentName.trim().toLowerCase() === 'quality assurance')
  )
}

/** Same rule as app_sampling_can_record(): the above plus a sampler (designation mentions sampling). */
export function canRecordSampling(designation: string, departmentName: string, isDirector: boolean): boolean {
  return canManageSampling(designation, departmentName, isDirector) || designation.toLowerCase().includes('sampl')
}
