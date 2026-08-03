import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { CALIBRATION_JOB_STAGE_LABELS, type CalibrationJobStage } from '../types'

export function CalibrationJobStageHeaderBar({
  stage,
  titleOverride,
  search,
  onSearchChange,
}: {
  stage: CalibrationJobStage
  titleOverride?: string
  search: string
  onSearchChange: (value: string) => void
}) {
  const title = titleOverride ?? CALIBRATION_JOB_STAGE_LABELS[stage]
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-sm sm:px-5 sm:py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 md:gap-4">
          <h1 className="shrink-0 text-base font-semibold tracking-tight text-foreground sm:text-lg">
            {title}
          </h1>
          <div className="relative hidden min-w-0 flex-1 sm:block sm:max-w-xs md:max-w-sm lg:max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-9 pl-9"
              aria-label={`Search ${title}`}
            />
          </div>
        </div>
      </div>
      <div className="relative w-full sm:hidden">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={`Search ${title}…`}
          className="h-9 pl-9"
          aria-label={`Search ${title}`}
        />
      </div>
    </div>
  )
}
