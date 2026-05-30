import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FlaskConical, ShieldCheck, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signIn } from '@/hooks/useAuth'

export default function AuthPage() {
  const navigate = useNavigate()
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = useMemo(() => {
    return Boolean(email.trim() && password.trim())
  }, [email, password])

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    try {
      const { error: loginError } = await signIn(email.trim(), password)
      if (loginError) throw loginError
      navigate('/', { replace: true })
    } catch (err) {
      const isObject = typeof err === 'object' && err !== null
      const name = isObject && 'name' in err ? String((err as { name?: unknown }).name) : ''
      const rawMessage = isObject && 'message' in err ? String((err as { message?: unknown }).message) : ''
      const message = rawMessage || 'Authentication failed'

      const isFailedToFetch =
        (name === 'TypeError' && message.toLowerCase().includes('failed to fetch')) ||
        message.toLowerCase().includes('failed to fetch')

      if (isFailedToFetch) {
        const host = (() => {
          try {
            return supabaseUrl ? new URL(supabaseUrl).host : 'unknown-host'
          } catch {
            return 'invalid-supabase-url'
          }
        })()
        setError(
          `${message}\n\n` +
            `Unable to reach Supabase host: ${host}\n` +
            `Check VITE_SUPABASE_URL in your .env and verify the project is active in Supabase dashboard.\n` +
            `If URL is correct, this is usually DNS/firewall/proxy blocking in your network or IDE preview.\n` +
            `Try in system Chrome and/or switch DNS to 8.8.8.8 or 1.1.1.1.\n\n` +
            `Origin: ${window.location.origin}\n` +
            `User-Agent: ${navigator.userAgent}`,
        )
        return
      }

      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canSubmit && !loading) {
      void handleSubmit()
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-muted/30 via-background to-muted/30">
      <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[0.38fr_0.62fr]">
        <div className="relative hidden lg:flex flex-col items-center justify-center p-12 border-r border-border/50 bg-gradient-to-br from-lab-950 via-lab-900 to-lab-800 text-white overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(56,170,244,0.12),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(14,143,225,0.08),transparent_50%)]" />

          <div className="relative w-full max-w-md space-y-10">
            <div className="space-y-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10">
                <FlaskConical size={28} className="text-lab-300" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lab-300/80 mb-2">
                  Quality International Research & Laboratories Pvt. Ltd.
                </p>
                <h1 className="text-3xl font-bold tracking-tight">
                  QIR&L LIMS Portal
                </h1>
                <p className="text-sm text-white/60 mt-2 leading-relaxed max-w-sm">
                  Manage ISO/IEC 17025 operations in one place: samples, equipment, tests, reports, and user access.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                {
                  title: 'Secure Access',
                  desc: 'Role-based authentication with director-controlled provisioning.',
                },
                {
                  title: 'Operational Clarity',
                  desc: 'Track samples, equipment and reports with ISO/IEC 17025 focus.',
                },
                {
                  title: 'Governed Deployment',
                  desc: 'First account is seeded in Supabase; directors create and assign roles.',
                },
              ].map((info) => (
                <div key={info.title} className="rounded-xl border border-white/8 bg-white/5 backdrop-blur-sm px-4 py-3">
                  <p className="text-sm font-semibold text-white/90">{info.title}</p>
                  <p className="text-xs text-white/50 mt-0.5">{info.desc}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 space-y-1.5">
              <p className="text-xs font-semibold tracking-wide text-white/70">Support & Contact</p>
              <p className="text-xs text-white/50">Email: support@qirl.co.in</p>
              <p className="text-xs text-white/50">Phone: +91 771 123 4567</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center p-6 lg:p-14">
          <div className="w-full max-w-md space-y-6">
            <div className="lg:hidden text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white">
                <FlaskConical size={22} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Quality International Research & Laboratories Pvt. Ltd.
                </p>
                <h1 className="text-2xl font-bold tracking-tight mt-1">QIR&L LIMS Portal</h1>
              </div>
            </div>

            <Card className="shadow-lg border-border/50">
              <CardHeader className="space-y-2 pb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={20} className="text-primary" />
                  <CardTitle className="text-xl">Sign In</CardTitle>
                </div>
                <CardDescription>
                  Enter your credentials to access the laboratory management system.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-4" onKeyDown={handleKeyDown}>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      autoComplete="email"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5">
                    <p className="text-sm text-destructive whitespace-pre-line">{error}</p>
                  </div>
                )}

                <Button
                  type="button"
                  className="w-full h-10"
                  onClick={handleSubmit}
                  disabled={!canSubmit || loading}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  For login access issues, contact your Laboratory Director
                  <br />
                  or write to <span className="font-medium text-primary">support@qirl.co.in</span>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
