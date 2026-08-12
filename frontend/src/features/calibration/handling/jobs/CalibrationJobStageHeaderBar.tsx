import { useState } from 'react'
import { ClipboardCheck, FileCheck, Search, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  CALIBRATION_JOB_STAGE_LABELS,
  type CalibrationJobLocation,
  type CalibrationJobStage,
} from '../types'
import { ForwardedEquipmentDialog } from './ForwardedEquipmentDialog'
import { ForwardedSrfsDialog } from './ForwardedSrfsDialog'
import { IssuedCertificatesDialog } from './IssuedCertificatesDialog'
import { ReviewedSrfsDialog } from './ReviewedSrfsDialog'

export function CalibrationJobStageHeaderBar({
  stage,
  titleOverride,
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  onForwardedChanged,
  locationFilter,
}: {
  stage: CalibrationJobStage
  titleOverride?: string
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  onForwardedChanged?: () => void
  locationFilter?: CalibrationJobLocation
}) {
  const [forwardedOpen, setForwardedOpen] = useState(false)
  const [reviewedOpen, setReviewedOpen] = useState(false)
  const [issuedOpen, setIssuedOpen] = useState(false)
  const title = titleOverride ?? CALIBRATION_JOB_STAGE_LABELS[stage]
  const showForwardedSrf = stage === 'job_allocation'
  const showForwardedEquipment = stage === 'calibration_conduct'
  const showReviewedSrf = stage === 'review_data'
  const showIssuedCertificates = stage === 'certificate_preparation'

  return (
    <>
      <div className={cn(limsPanelClass)}>
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
            <h1 className="shrink-0 text-base font-semibold tracking-tight text-white sm:text-lg">
              {title}
            </h1>

            <div className="order-3 flex w-full min-w-0 items-center gap-2 sm:order-none sm:mx-1 sm:w-auto sm:max-w-none sm:flex-none">
              <div className="relative min-w-0 flex-1 sm:w-[70%] sm:max-w-[19.5rem] sm:flex-none">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={
                    stage === 'calibration_conduct'
                      ? 'Search Calibration Details'
                      : `Search ${title}`
                  }
                  className={cn(limsDarkBarSearchClass, 'pl-9')}
                  aria-label={
                    stage === 'calibration_conduct'
                      ? 'Search Calibration Details'
                      : `Search ${title}`
                  }
                />
              </div>
              <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
                <SelectTrigger
                  className={cn(limsDarkBarFieldClass, 'h-9 w-[7.5rem] shrink-0')}
                  aria-label="Rows per page"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 / Page</SelectItem>
                  <SelectItem value="10">10 / Page</SelectItem>
                  <SelectItem value="20">20 / Page</SelectItem>
                  <SelectItem value="50">50 / Page</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {showForwardedSrf ||
            showForwardedEquipment ||
            showReviewedSrf ||
            showIssuedCertificates ? (
              <div className="ml-auto shrink-0">
                {showReviewedSrf ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn('gap-1.5', limsDarkBarBtnClass)}
                    onClick={() => setReviewedOpen(true)}
                    aria-label="Reviewed SRF"
                  >
                    <ClipboardCheck size={14} aria-hidden />
                    <span className="hidden sm:inline">Reviewed SRF</span>
                    <span className="sm:hidden">Reviewed</span>
                  </Button>
                ) : showIssuedCertificates ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn('gap-1.5', limsDarkBarBtnClass)}
                    onClick={() => setIssuedOpen(true)}
                    aria-label="Issued Certificates"
                  >
                    <FileCheck size={14} aria-hidden />
                    <span className="hidden sm:inline">Issued Certificates</span>
                    <span className="sm:hidden">Issued</span>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn('gap-1.5', limsDarkBarBtnClass)}
                    onClick={() => setForwardedOpen(true)}
                    aria-label={showForwardedEquipment ? 'Forwarded Equipment' : 'Forwarded SRF'}
                  >
                    <Send size={14} aria-hidden />
                    <span className="hidden sm:inline">
                      {showForwardedEquipment ? 'Forwarded Equipment' : 'Forwarded SRF'}
                    </span>
                    <span className="sm:hidden">Forwarded</span>
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {showForwardedSrf ? (
        <ForwardedSrfsDialog
          open={forwardedOpen}
          onOpenChange={setForwardedOpen}
          onChanged={onForwardedChanged}
        />
      ) : null}
      {showForwardedEquipment ? (
        <ForwardedEquipmentDialog
          open={forwardedOpen}
          onOpenChange={setForwardedOpen}
          locationFilter={locationFilter}
        />
      ) : null}
      {showReviewedSrf ? (
        <ReviewedSrfsDialog open={reviewedOpen} onOpenChange={setReviewedOpen} />
      ) : null}
      {showIssuedCertificates ? (
        <IssuedCertificatesDialog open={issuedOpen} onOpenChange={setIssuedOpen} />
      ) : null}
    </>
  )
}
