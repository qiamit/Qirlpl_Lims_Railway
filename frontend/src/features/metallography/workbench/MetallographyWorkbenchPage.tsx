import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { limsDarkBarBtnClass, limsPageShellClass } from '@/lib/limsThemeUi'
import { EnvHeader, MessageLine } from '@/features/environment/EnvironmentUi'
import { MetallographyGate } from '../MetallographyUi'
import { useMetallographySwitch } from '../useMetallographySwitch'
import { MetallographyWorkbench } from './MetallographyWorkbench'

/**
 * S2 workbench, full page (`/metallography/analyses/:id`). Module access is
 * inherited from `/metallography/analyses`. "Use result" is not offered here:
 * Enter Results picks up the completed analysis ("MA-… completed — Use result").
 */
export default function MetallographyWorkbenchPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { state: switchState } = useMetallographySwitch()

  return (
    <div className={limsPageShellClass}>
      <EnvHeader
        title="Metallography Analysis"
        clause="7.5 · 7.2"
        subtitle="Original images with their hashes, the scale used, the marks and the result."
        actions={
          <Button asChild variant="outline" className={limsDarkBarBtnClass}>
            <Link to="/metallography/analyses">
              <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Analyses</span>
            </Link>
          </Button>
        }
      />
      <MetallographyGate state={switchState}>
        {id ? (
          <MetallographyWorkbench key={id} analysisId={id} mode="page" />
        ) : (
          <MessageLine tone="error" text="No analysis was given in the address." />
        )}
      </MetallographyGate>
    </div>
  )
}
