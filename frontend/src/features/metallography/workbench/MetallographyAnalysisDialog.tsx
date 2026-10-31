import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDarkBarGlowStyle, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { MessageLine } from '@/features/environment/EnvironmentUi'
import { useModuleAccessOptional } from '@/features/settings/module-access/ModuleAccessProvider'
import { MetallographyMissingNotice } from '../MetallographyUi'
import {
  MetallographyMissingError,
  fetchAnalysisInfoForParamRows,
  metallographyErrorText,
  openOrCreateAnalysisForParamRow,
} from '../metallographyApi'
import type { MetallographyParamRowRef, MetallographyUseResult } from '../types'
import { MetallographyWorkbench } from './MetallographyWorkbench'

/**
 * S2d: the workbench in a stacked full-height dialog, opened from Enter
 * Results ("Calculator | Attach | Metallography") and from the register's
 * Pending tab. On open it finds the row's draft or starts one
 * (openOrCreateAnalysisForParamRow), unless an analysis is given or the
 * dialog is read-only. Use result hands back reported_value unchanged.
 */

const ANALYSES_PATH = '/metallography/analyses'

export type MetallographyAnalysisDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  paramRow: MetallographyParamRowRef
  onUseResult: (r: MetallographyUseResult) => void
  /** Review screens: open read-only on the linked / completed analysis. */
  readOnly?: boolean
  /** Open this analysis instead of the row's draft (e.g. the linked one). */
  analysisId?: string | null
  /**
   * False when the user may not run analyses (app_metallography_can_run):
   * the dialog then opens an existing analysis (Use result still works for a
   * completed one) and never starts a new one.
   */
  canRun?: boolean
}

type Target =
  | { status: 'loading'; key: string }
  | { status: 'missing'; key: string }
  | { status: 'none'; key: string }
  | { status: 'error'; key: string; message: string }
  | { status: 'ok'; key: string; id: string }

/** Read-only: the linked analysis, else the completed one, else the draft. */
async function findExistingAnalysisId(paramRowId: string): Promise<'missing' | string | null> {
  const res = await fetchAnalysisInfoForParamRows([paramRowId])
  if (res.status === 'missing') return 'missing'
  const info = res.data[paramRowId]
  return info?.linked?.id ?? info?.completed?.id ?? info?.inProgress?.id ?? null
}

export function MetallographyAnalysisDialog({
  open,
  onOpenChange,
  paramRow,
  onUseResult,
  readOnly = false,
  analysisId = null,
  canRun = true,
}: MetallographyAnalysisDialogProps) {
  const moduleAccess = useModuleAccessOptional()
  // The full page opens in a new tab so unsaved Enter Results edits stay; hidden without access to it.
  const canOpenFullPage = !moduleAccess || moduleAccess.loading || moduleAccess.canAccessPath(ANALYSES_PATH)
  const rowId = paramRow.paramRowId
  const lookupOnly = readOnly || !canRun
  const key = `${rowId}|${analysisId ?? ''}|${readOnly ? 'ro' : 'rw'}|${canRun ? 'run' : 'norun'}`
  const [target, setTarget] = useState<Target>({ status: 'loading', key })
  // Supersede / void inside the workbench may move to another analysis; the
  // workbench follows it itself, so only the header link needs the new id.
  const [shownId, setShownId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || analysisId) return
    let cancelled = false
    const run = async () => {
      try {
        if (lookupOnly) {
          const found = await findExistingAnalysisId(rowId)
          if (cancelled) return
          if (found === 'missing') setTarget({ status: 'missing', key })
          else if (!found) setTarget({ status: 'none', key })
          else setTarget({ status: 'ok', key, id: found })
          return
        }
        const a = await openOrCreateAnalysisForParamRow(rowId)
        if (!cancelled) setTarget({ status: 'ok', key, id: a.id })
      } catch (e) {
        if (cancelled) return
        if (e instanceof MetallographyMissingError) setTarget({ status: 'missing', key })
        else setTarget({ status: 'error', key, message: metallographyErrorText(e) })
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [open, analysisId, lookupOnly, rowId, key])

  // A given analysis needs no lookup; a stale lookup (other row) shows as loading.
  const resolved: Target = analysisId
    ? { status: 'ok', key, id: analysisId }
    : target.key === key
      ? target
      : { status: 'loading', key }
  const linkId = resolved.status === 'ok' ? (shownId ?? resolved.id) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          '!fixed !left-0 !top-0 !flex !h-[100dvh] !max-h-[100dvh] !w-full !max-w-none !translate-x-0 !translate-y-0 !flex-col !gap-0 !overflow-hidden !border-0 !p-0',
          'lg:!left-[268px] lg:!w-[calc(100vw-268px)] lg:!max-w-[calc(100vw-268px)]',
        )}
        onPointerDownOutside={(e) => {
          // The reason-for-change prompt opens above this dialog.
          if (e.target instanceof Element && e.target.closest('[data-reason-for-change-root]')) e.preventDefault()
        }}
      >
        <div className="relative shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="truncate text-base font-semibold text-white">
              Metallography · {paramRow.testLabel || 'Parameter'}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-2 text-[12px] text-stone-300">
              {readOnly ? 'Read-only analysis behind this result.' : 'Image, scale, marks and result for this parameter.'}
              {linkId && canOpenFullPage ? (
                <Link
                  to={`${ANALYSES_PATH}/${linkId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-amber-200 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open in full page
                </Link>
              ) : null}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f3eb] p-2 sm:p-3">
          {!open ? null : resolved.status === 'loading' ? (
            <p className="flex items-center gap-2 p-3 text-[13px] text-stone-600">
              <Loader2 className="h-4 w-4 animate-spin" /> {readOnly ? 'Finding the analysis…' : 'Opening the analysis…'}
            </p>
          ) : resolved.status === 'missing' ? (
            <MetallographyMissingNotice />
          ) : resolved.status === 'none' ? (
            <MessageLine
              text={
                readOnly
                  ? 'No metallography analysis has been recorded for this parameter.'
                  : 'No metallography analysis has been started for this parameter. You need Edit access to Metallography Analyses to start one.'
              }
            />
          ) : resolved.status === 'error' ? (
            <MessageLine tone="error" text={resolved.message} />
          ) : (
            <MetallographyWorkbench
              key={resolved.id}
              analysisId={resolved.id}
              mode="dialog"
              readOnly={readOnly}
              onUseResult={readOnly ? undefined : onUseResult}
              onClose={() => onOpenChange(false)}
              onAnalysisChange={setShownId}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
