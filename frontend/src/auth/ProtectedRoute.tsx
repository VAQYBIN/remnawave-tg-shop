import { Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from './useAuth'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading, isMiniApp, miniAppAuthFailed } = useAuth()
  const location = useLocation()
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent animate-spin" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    // Inside Telegram we never bounce to the login screen — if the automatic
    // Mini App auth failed, show an inline error instead of the email login.
    if (isMiniApp) {
      return (
        <div className="min-h-screen flex items-center justify-center px-6">
          <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
            {miniAppAuthFailed ? t('miniapp_auth_failed') : t('error_generic')}
          </p>
        </div>
      )
    }
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
