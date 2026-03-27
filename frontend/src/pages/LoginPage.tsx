import { useState, useEffect, type FormEvent } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/useAuth'
import { login, getTelegramClientId } from '@/api/auth'
import { ApiError } from '@/api/client'

export function LoginPage() {
  const { setAuth } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam === 'telegram_denied') setError('Вход через Telegram отменён')
    else if (errorParam) setError('Ошибка входа через Telegram. Попробуйте снова.')
  }, [searchParams])

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
        setError('Произошла ошибка. Попробуйте позже.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[hsl(var(--background))]">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-[hsl(197,74%,40%)]">Raccoonito</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Личный кабинет</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Вход</CardTitle>
            <CardDescription>Войдите в свой аккаунт</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Telegram Login */}
            <TelegramLoginButton setError={setError} />

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-[hsl(var(--border))]" />
              <span className="text-xs text-[hsl(var(--muted-foreground))]">или</span>
              <div className="flex-1 h-px bg-[hsl(var(--border))]" />
            </div>

            {/* Email form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {error && (
                <div className="rounded-[var(--radius)] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                  {error}
                </div>
              )}
              <Input
                label="Email"
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <Input
                label="Пароль"
                id="password"
                type="password"
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
                  Забыли пароль?
                </Link>
              </div>
              <Button type="submit" isLoading={isLoading} className="w-full">
                Войти
              </Button>
            </form>

            <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
              Нет аккаунта?{' '}
              <Link to="/register" className="text-[hsl(var(--primary))] hover:underline font-medium">
                Зарегистрироваться
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─── Telegram OIDC Login (Authorization Code + PKCE) ───────────────────────

const TELEGRAM_OAUTH_URL = 'https://oauth.telegram.org'
const TG_PKCE_KEY = 'tg_pkce_verifier'
const TG_STATE_KEY = 'tg_oauth_state'

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
  async function handleClick() {
    let clientId: number
    try {
      const resp = await getTelegramClientId()
      clientId = resp.client_id
    } catch {
      setError('Не удалось получить конфигурацию Telegram')
      return
    }

    const { verifier, challenge } = await generatePKCE()
    const state = generateState()
    const redirectUri = `${window.location.origin}/auth/telegram/callback`

    sessionStorage.setItem(TG_PKCE_KEY, verifier)
    sessionStorage.setItem(TG_STATE_KEY, state)

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
      Войти через Telegram
    </button>
  )
}

export { TG_PKCE_KEY, TG_STATE_KEY }
