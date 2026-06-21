import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import i18n from '@/i18n'
import { setAccessToken } from '@/api/client'
import {
  refreshToken,
  logout as apiLogout,
  authTelegramMiniApp,
  type TokenResponse,
} from '@/api/auth'
import { isMiniApp, initMiniApp, getInitData } from '@/lib/telegram'

interface AuthUser {
  accountId: string
  email: string | null
  isEmailVerified: boolean
  languageCode: string
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  /** True when running inside Telegram as a Mini App. */
  isMiniApp: boolean
  /** True while the initial Mini App auto-auth attempt failed (browser fallback active). */
  miniAppAuthFailed: boolean
  setAuth: (resp: TokenResponse) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [miniApp] = useState(() => isMiniApp())
  const [miniAppAuthFailed, setMiniAppAuthFailed] = useState(false)

  const setAuth = useCallback((resp: TokenResponse) => {
    setAccessToken(resp.access_token)
    setUser({
      accountId: resp.account_id,
      email: resp.email,
      isEmailVerified: resp.is_email_verified,
      languageCode: resp.language_code,
    })
    if (resp.language_code && resp.language_code !== i18n.language) {
      i18n.changeLanguage(resp.language_code)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } catch {
      // ignore
    }
    setAccessToken(null)
    setUser(null)
  }, [])

  // On mount: inside Telegram → auto-auth via initData; otherwise restore the
  // session from the HttpOnly refresh cookie (existing web flow).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (miniApp) {
        initMiniApp()
        try {
          const resp = await authTelegramMiniApp(getInitData())
          if (!cancelled) setAuth(resp)
          if (!cancelled) setIsLoading(false)
          return
        } catch {
          // initData rejected — fall back to cookie-based session below.
          if (!cancelled) setMiniAppAuthFailed(true)
        }
      }
      try {
        const resp = await refreshToken()
        if (!cancelled) setAuth(resp)
      } catch {
        // No valid session
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setAuth, miniApp])

  const value = useMemo(
    () => ({ user, isLoading, isMiniApp: miniApp, miniAppAuthFailed, setAuth, logout }),
    [user, isLoading, miniApp, miniAppAuthFailed, setAuth, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider')
  return ctx
}
