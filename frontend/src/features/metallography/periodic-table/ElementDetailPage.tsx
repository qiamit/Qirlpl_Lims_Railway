import { useEffect } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { limsDarkBarBtnClass, limsPageShellClass, limsPanelClass } from '@/lib/limsThemeUi'
import { MessageLine } from '@/features/environment/EnvironmentUi'
import { ElementDetailPanel } from './ElementDetailPanel'
import { PeriodicTableHeader } from './PeriodicTableView'
import { findElementBySymbol, formatTempInUnit, parseTempParam, periodicTableUrl } from './periodicTable'

/** True when Escape should be left alone: an open dialog / menu, or the user is typing. */
function escapeBelongsElsewhere(e: KeyboardEvent): boolean {
  if (e.defaultPrevented) return true
  if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return true
  const target = e.target as HTMLElement | null
  return Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'))
}

/**
 * S6 Element detail (`/metallography/periodic-table/:symbol?temp=`). A missing or bad `?temp` means 27 °C.
 * Escape goes back to the table at the same temperature.
 */
export default function ElementDetailPage() {
  const { symbol = '' } = useParams<{ symbol: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const tempC = parseTempParam(searchParams.get('temp'))
  const element = findElementBySymbol(symbol)
  const backTo = periodicTableUrl(tempC)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape' || escapeBelongsElsewhere(e)) return
      navigate(backTo)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [backTo, navigate])

  const backButton = (
    <Button asChild size="sm" className={limsDarkBarBtnClass}>
      <Link to={backTo}>
        <ArrowLeft /> Periodic Table
      </Link>
    </Button>
  )

  return (
    <div className={limsPageShellClass}>
      <PeriodicTableHeader
        subtitle={element ? `${element.name} at ${formatTempInUnit(tempC, 'C')}` : undefined}
        actions={backButton}
      />
      {element ? (
        <section className={limsPanelClass} aria-labelledby="mg-pt-element-title">
          <ElementDetailPanel element={element} tempC={tempC} titleId="mg-pt-element-title" />
        </section>
      ) : (
        <MessageLine tone="error" text={`No element has the symbol "${symbol}". Go back to the Periodic Table and pick one.`} />
      )}
    </div>
  )
}
