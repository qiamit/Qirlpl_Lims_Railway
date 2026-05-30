import { NavLink } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText } from 'lucide-react'

export default function ReportingPage() {
  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">ISO/IEC 17025:2017 — Clause 7.8</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText size={18} className="text-primary" />
            Test report preparation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Draft and issue formal test reports from approved technical results. SRFs appear here after a reviewer
            approves them in <strong className="text-foreground">Results Under Review</strong>.
          </p>
          <Button asChild>
            <NavLink to="/samples/report-preparation">Open Test Report Preparation</NavLink>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
