import { useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/useAuth'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { patchLanguage } from '@/api/profile'
import { getAdminMe } from '@/api/admin'
import { useBrandingContext } from '@/hooks/BrandingProvider'
import { resolveLogoUrl } from '@/hooks/useBranding'
import {
  LayoutDashboard,
  CreditCard,
  Receipt,
  Users,
  Monitor,
  User,
  LogOut,
  Newspaper,
  Settings,
} from 'lucide-react'

function FitText({ text }: { text: string }) {
  const spanRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = spanRef.current
    if (!el) return
    let size = 20
    el.style.fontSize = `${size}px`
    while (el.scrollWidth > el.offsetWidth && size > 11) {
      size -= 1
      el.style.fontSize = `${size}px`
    }
  }, [text])

  return (
    <span
      ref={spanRef}
      style={{ whiteSpace: 'nowrap', overflow: 'hidden', display: 'block' }}
      className="font-bold text-[hsl(var(--primary))]"
    >
      {text}
    </span>
  )
}

function LangToggle() {
  const { i18n } = useTranslation()
  const current = i18n.language.startsWith('ru') ? 'ru' : 'en'

  const toggle = async () => {
    const next = current === 'ru' ? 'en' : 'ru'
    i18n.changeLanguage(next)
    try { await patchLanguage(next) } catch { /* best effort */ }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] transition-colors"
    >
      <span className="text-base leading-none">{current === 'ru' ? '🇷🇺' : '🇬🇧'}</span>
      {current === 'ru' ? 'Русский' : 'English'}
    </button>
  )
}

export function Sidebar() {
  const { logout, user } = useAuth()
  const { t } = useTranslation()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { newsEnabled, referralEnabled, devicesEnabled, branding } = useBrandingContext()

  const { data: adminData } = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: getAdminMe,
    enabled: !!user,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
  const isAdmin = !!adminData?.is_admin

  const NAV_ITEMS = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav_dashboard') },
    { to: '/subscription', icon: CreditCard, label: t('nav_subscription') },
    { to: '/payments', icon: Receipt, label: t('nav_payments') },
    ...(newsEnabled ? [{ to: '/news', icon: Newspaper, label: t('nav_news') }] : []),
    ...(referralEnabled ? [{ to: '/referral', icon: Users, label: t('nav_referral') }] : []),
    ...(devicesEnabled ? [{ to: '/devices', icon: Monitor, label: t('nav_devices') }] : []),
    { to: '/profile', icon: User, label: t('nav_profile') },
  ]

  return (
    <aside className="hidden md:flex flex-col w-64 sticky top-0 h-screen overflow-y-auto bg-[hsl(var(--card))] border-r border-[hsl(var(--border))] p-4">
      <div className="mb-8 px-2">
        <div className="flex items-center gap-2 min-w-0">
          {resolveLogoUrl(branding?.logo_url) && (
            <img src={resolveLogoUrl(branding?.logo_url)!} alt={branding?.brand_name} className="h-8 w-8 object-contain flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <FitText text={branding?.brand_name ?? 'Raccoonito'} />
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
              ].join(' ')
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-1 mt-2 pt-2 border-t border-[hsl(var(--border))]">
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
              ].join(' ')
            }
          >
            <Settings size={18} />
            Админка
          </NavLink>
        )}
        <LangToggle />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          className="w-full justify-start gap-3 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          <LogOut size={18} />
          {t('nav_logout')}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t('logout_confirm_title')}
        description={t('logout_confirm_description')}
        confirmLabel={t('logout_confirm_yes')}
        cancelLabel={t('logout_confirm_cancel')}
        destructive
        onConfirm={logout}
        onCancel={() => setConfirmOpen(false)}
      />
    </aside>
  )
}
