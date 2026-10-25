import { Link } from 'react-router-dom'
import { limsPageShellClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { ComplaintsProcessSection } from './ComplaintsProcessSection'

/**
 * Public complaint process page (ISO/IEC 17025 7.9.3, gap P3-6).
 * Proposed route: /complaints-process inside PublicSiteLayout (the same
 * section is also on /home#complaints).
 */
export default function ComplaintsProcessPage() {
  return (
    <div className={cn(limsPageShellClass, 'max-w-[1100px]')}>
      <ComplaintsProcessSection id="complaints-process" />
      <div className="flex justify-center">
        <Link to="/home" className={cn(limsPrimaryBtnClass, 'inline-flex h-8 items-center px-4')}>
          Back to Home
        </Link>
      </div>
    </div>
  )
}
