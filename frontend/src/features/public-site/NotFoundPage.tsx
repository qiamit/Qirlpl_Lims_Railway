import { Link } from 'react-router-dom'
import { limsPageShellClass, limsPanelClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export default function NotFoundPage() {
  return (
    <div className={cn(limsPageShellClass, 'flex flex-1 items-center justify-center')}>
      <div className={cn(limsPanelClass, 'max-w-md space-y-3 p-6 text-center')}>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800">404</p>
        <h1 className="text-lg font-bold text-stone-900">Page not found</h1>
        <p className="text-sm text-stone-600">This address is not part of the QIRLPL site.</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link to="/home" className={cn(limsPrimaryBtnClass, 'inline-flex h-8 items-center px-4')}>
            Home
          </Link>
          <Link
            to="/auth"
            className="inline-flex h-8 items-center border-2 border-stone-500 px-4 text-sm font-semibold text-stone-800"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}
