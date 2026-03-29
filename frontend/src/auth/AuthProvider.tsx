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
import { refreshToken, logout as apiLogout, type TokenResponse } from '@/api/auth'

interface AuthUser {
  accountId: string
  email: string | null
  isEmailVerified: boolean
  languageCode: string
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  setAuth: (resp: TokenResponse) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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

  // Try silent refresh on mount (restore session from HttpOnly cookie)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
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
  }, [setAuth])

  const value = useMemo(
    () => ({ user, isLoading, setAuth, logout }),
    [user, isLoading, setAuth, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider')
  return ctx
}
