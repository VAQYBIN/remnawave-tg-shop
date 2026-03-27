import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'
import { authTelegram } from '@/api/auth'
import { TG_PKCE_KEY, TG_STATE_KEY } from '@/pages/LoginPage'

/**
 * Handles the redirect from Telegram after OpenID Connect Authorization Code flow.
 * URL: /auth/telegram/callback?code=...&state=...
 */
export function TelegramCallbackPage() {
  const [searchParams] = useSearchParams()
  const { setAuth } = useAuth()
  const navigate = useNavigate()
  const didRun = useRef(false)

  useEffect(() => {
    if (didRun.current) return
    didRun.current = true

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      navigate('/login?error=telegram_denied', { replace: true })
      return
    }

    if (!code || !state) {
      navigate('/login?error=telegram_invalid', { replace: true })
      return
    }

    const storedState = sessionStorage.getItem(TG_STATE_KEY)
    const codeVerifier = sessionStorage.getItem(TG_PKCE_KEY)

    sessionStorage.removeItem(TG_STATE_KEY)
    sessionStorage.removeItem(TG_PKCE_KEY)

    if (!storedState || state !== storedState) {
      navigate('/login?error=telegram_state_mismatch', { replace: true })
      return
    }

    if (!codeVerifier) {
      navigate('/login?error=telegram_no_verifier', { replace: true })
      return
    }

    const redirectUri = `${window.location.origin}/auth/telegram/callback`

    authTelegram({ code, code_verifier: codeVerifier, redirect_uri: redirectUri })
      .then((resp) => {
        setAuth(resp)
        navigate('/dashboard', { replace: true })
      })
      .catch(() => {
        navigate('/login?error=telegram_auth_failed', { replace: true })
      })
  }, [searchParams, setAuth, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))]">
      <div className="flex flex-col items-center gap-3 text-[hsl(var(--muted-foreground))]">
        <svg
          className="animate-spin h-8 w-8 text-[hsl(var(--primary))]"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span className="text-sm">Выполняется вход через Telegram…</span>
      </div>
    </div>
  )
}
