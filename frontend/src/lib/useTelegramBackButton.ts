import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { showBackButton, hideBackButton, isMiniApp } from '@/lib/telegram'

// Routes that are "roots" of their section — no native back button there.
const ROOT_ROUTES = new Set(['/dashboard', '/admin', '/admin/dashboard'])

/**
 * Drive the native Telegram BackButton from React Router. Shows it on every
 * non-root route and navigates back on click; hides it on root routes and
 * outside Telegram.
 */
export function useTelegramBackButton(): void {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isMiniApp()) return
    if (ROOT_ROUTES.has(location.pathname)) {
      hideBackButton()
      return
    }
    const cleanup = showBackButton(() => navigate(-1))
    return cleanup
  }, [location.pathname, navigate])
}
