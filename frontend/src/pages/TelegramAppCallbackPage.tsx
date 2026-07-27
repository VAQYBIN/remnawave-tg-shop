import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Native app bounce: Telegram OIDC redirects here (https, registered in
 * BotFather); we forward code/state/error to the app's custom scheme
 * racc://auth/callback. No PKCE exchange happens here — the verifier lives
 * only inside the native app.
 */
const APP_SCHEME = 'racc://auth/callback'

export function TelegramAppCallbackPage() {
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    const params = new URLSearchParams()
    if (error) {
      params.set('error', error)
    } else {
      if (code) params.set('code', code)
      if (state) params.set('state', state)
    }
    window.location.href = `${APP_SCHEME}?${params.toString()}`
  }, [searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))]">
      <div className="flex flex-col items-center gap-3 text-[hsl(var(--muted-foreground))]">
        <div className="h-8 w-8 rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent animate-spin" />
        <span className="text-sm">Открываем приложение…</span>
      </div>
    </div>
  )
}
