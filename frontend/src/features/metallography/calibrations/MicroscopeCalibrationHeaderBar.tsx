import { Loader2, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EnvHeader } from '@/features/environment/EnvironmentUi'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarSearchClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { CALIBRATION_FILTERS, type CalibrationFilter } from './calibrationFormat'

export function MicroscopeCalibrationHeaderBar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  loading,
  onRefresh,
  canCreate,
  onNew,
}: {
  search: string
  onSearchChange: (value: string) => void
  filter: CalibrationFilter
  onFilterChange: (value: CalibrationFilter) => void
  loading: boolean
  onRefresh: () => void
  /** Director, or Edit on Microscope Calibration. */
  canCreate: boolean
  onNew: () => void
}) {
  return (
    <EnvHeader
      title="Microscope Calibration (µm/px)"
      clause="6.4 · 6.5"
      subtitle="Scale of each microscope, objective and camera resolution, read from a stage micrometer and verified by a second person."
      actions={
        <>
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search cal. no, equipment, objective"
            aria-label="Search calibrations"
            className={cn(limsDarkBarSearchClass, 'w-full sm:w-64')}
          />
          <select
            value={filter}
            onChange={(e) => onFilterChange(e.target.value as CalibrationFilter)}
            aria-label="Show calibrations"
            className={cn(limsDarkBarFieldClass, 'px-2 text-sm')}
          >
            {CALIBRATION_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={onRefresh} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {canCreate ? (
            <Button type="button" className={cn('gap-1.5', limsPrimaryBtnClass)} onClick={onNew}>
              <Plus className="h-4 w-4" /> New calibration
            </Button>
          ) : null}
        </>
      }
    />
  )
}
