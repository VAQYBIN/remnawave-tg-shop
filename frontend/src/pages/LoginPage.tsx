import { useState, useEffect, type FormEvent } from 'react'
import { Link, useNavigate, useLocation, useSearchParams, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/useAuth'
import { login, getTelegramClientId } from '@/api/auth'
import { ApiError } from '@/api/client'
import { useBrandingContext } from '@/hooks/BrandingProvider'
import { resolveLogoUrl } from '@/hooks/useBranding'

export function LoginPage() {
  const { setAuth, user, isLoading: isAuthLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard'

  const { branding } = useBrandingContext()
  const logoUrl = resolveLogoUrl(branding?.logo_url)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam === 'telegram_denied') setError(t('login_error_denied'))
    else if (errorParam) setError(t('login_error_telegram'))
  }, [searchParams, t])

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const resp = await login(email, password)
      setAuth(resp)
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError(t('error_generic'))
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[hsl(var(--background))]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {logoUrl && (
            <img src={logoUrl} alt={branding?.brand_name} className="h-16 w-16 object-contain mx-auto mb-3" />
          )}
          <h1 className="text-3xl font-extrabold text-[hsl(var(--primary))]">
            {branding?.brand_name ?? 'VPN'}
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{t('personal_cabinet')}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('login_title')}</CardTitle>
            <CardDescription>{t('login_subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <TelegramLoginButton setError={setError} />

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-[hsl(var(--border))]" />
              <span className="text-xs text-[hsl(var(--muted-foreground))]">{t('or')}</span>
              <div className="flex-1 h-px bg-[hsl(var(--border))]" />
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {error && (
                <div className="rounded-[var(--radius)] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                  {error}
                </div>
              )}
              <Input
                label={t('login_email')}
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <PasswordInput
                label={t('login_password')}
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <div className="text-right">
                <Link
                  to="/forgot-password"
                  className="text-xs text-[hsl(var(--primary))] hover:underline"
                >
                  {t('login_forgot')}
                </Link>
              </div>
              <Button type="submit" isLoading={isLoading} className="w-full">
                {t('login_submit')}
              </Button>
            </form>

            <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
              {t('login_no_account')}{' '}
              <Link to="/register" className="text-[hsl(var(--primary))] hover:underline font-medium">
                {t('login_register')}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─── Telegram OIDC Login ────────────────────────────────────────────────────

const TELEGRAM_OAUTH_URL = 'https://oauth.telegram.org'
const TG_PKCE_KEY = 'tg_pkce_verifier'
const TG_STATE_KEY = 'tg_oauth_state'
const TG_MODE_KEY = 'tg_oauth_mode'

function base64urlEncode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  const verifier = base64urlEncode(array.buffer)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = base64urlEncode(digest)
  return { verifier, challenge }
}

function generateState(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return base64urlEncode(array.buffer)
}

function TelegramLoginButton({ setError }: { setError: (msg: string) => void }) {
  const { t } = useTranslation()

  async function handleClick() {
    let clientId: number
    try {
      const resp = await getTelegramClientId()
      clientId = resp.client_id
    } catch {
      setError(t('login_error_tg_config'))
      return
    }

    const { verifier, challenge } = await generatePKCE()
    const state = generateState()
    const redirectUri = `${window.location.origin}/auth/telegram/callback`

    sessionStorage.setItem(TG_PKCE_KEY, verifier)
    sessionStorage.setItem(TG_STATE_KEY, state)
    sessionStorage.setItem(TG_MODE_KEY, 'login')

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: String(clientId),
      redirect_uri: redirectUri,
      scope: 'openid profile',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })

    window.location.href = `${TELEGRAM_OAUTH_URL}/auth?${params}`
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full flex items-center justify-center gap-2 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-white px-4 py-2 text-sm font-medium hover:bg-[hsl(var(--muted))] transition-colors"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"
          fill="#229ED9"
        />
      </svg>
      {t('login_telegram')}
    </button>
  )
}

export { TELEGRAM_OAUTH_URL, TG_PKCE_KEY, TG_STATE_KEY, TG_MODE_KEY, generatePKCE, generateState }
