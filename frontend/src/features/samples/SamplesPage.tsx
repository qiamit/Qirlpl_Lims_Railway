import { NavLink } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronRight } from 'lucide-react'

const steps = [
  { to: '/samples/receiving', title: 'Sample Receiving', desc: 'Clause 7.4 — Registration & contract review' },
  { to: '/samples/allocation', title: 'Sample Allocation', desc: 'Section-wise allocation to departments' },
  { to: '/samples/test-allocation', title: 'Test Allocation', desc: 'Assign tests and analysts' },
  { to: '/samples/under-testing', title: 'Sample Under Testing', desc: 'Technical records & results entry' },
  { to: '/samples/results-review', title: 'Results Under Review', desc: 'Independent review before reporting' },
  { to: '/samples/report-preparation', title: 'Test Report Preparation', desc: 'Clause 7.8 — Draft & issue test report' },
  { to: '/samples/completed', title: 'Completed Results', desc: 'Issued reports & closed SRFs' },
] as const

export default function SamplesPage() {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Sample Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ISO/IEC 17025:2017 — Clause 7.4 (handling) through Clause 7.8 (reporting)
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {steps.map((s) => (
          <NavLink key={s.to} to={s.to} className="block group">
            <Card className="h-full transition-all hover:border-primary/30 hover:shadow-md">
              <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                <CardTitle className="text-base font-semibold">{s.title}</CardTitle>
                <ChevronRight
                  size={18}
                  className="text-muted-foreground shrink-0 group-hover:text-primary transition-colors"
                />
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </CardContent>
            </Card>
          </NavLink>
        ))}
      </div>
    </div>
  )
}
