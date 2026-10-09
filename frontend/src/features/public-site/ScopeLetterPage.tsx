import { Link, useParams } from 'react-router-dom'
import { FileWarning } from 'lucide-react'
import { limsPageShellClass, limsPanelClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { PUBLIC_BIS, PUBLIC_NABL_CALIBRATION, PUBLIC_NABL_TESTING } from './publicNav'

const LETTERS: Record<string, { title: string; code: string; fileName: string }> = {
  bis: {
    title: 'BIS Scope Letter',
    code: PUBLIC_BIS,
    fileName: 'BIS QIRLPL.pdf',
  },
  'nabl-testing': {
    title: 'NABL Testing Certificate',
    code: PUBLIC_NABL_TESTING,
    fileName: 'NABL Certificate.pdf',
  },
  'nabl-calibration': {
    title: 'NABL Calibration Certificate',
    code: PUBLIC_NABL_CALIBRATION,
    fileName: 'NABL Certificate Calibration.pdf',
  },
}

export default function ScopeLetterPage() {
  const { kind } = useParams()
  const letter = kind ? LETTERS[kind] : undefined

  return (
    <div className={cn(limsPageShellClass, 'flex flex-1 items-center justify-center')}>
      <div className={cn(limsPanelClass, 'max-w-lg space-y-3 p-6 text-center')}>
        <FileWarning className="mx-auto text-amber-700" size={36} />
        <h1 className="text-lg font-bold text-stone-900">
          {letter ? letter.title : 'Scope letter'}
        </h1>
        {letter ? (
          <p className="text-sm font-semibold text-amber-800">{letter.code}</p>
        ) : null}
        <p className="text-sm leading-relaxed text-stone-600">
          {letter
            ? `The certificate file “${letter.fileName}” is not on the server yet, so this page cannot open a PDF.`
            : 'This scope letter is not available.'}
        </p>
        <Link to="/home" className={cn(limsPrimaryBtnClass, 'inline-flex h-8 items-center px-4')}>
          Back to Home
        </Link>
      </div>
    </div>
  )
}
