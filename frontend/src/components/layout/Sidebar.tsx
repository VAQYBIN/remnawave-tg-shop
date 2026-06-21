import { useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/useAuth'
import { useQuery } from '@tanstack/react-query'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { patchLanguage, getProfile } from '@/api/profile'
import { getAdminMe } from '@/api/admin'
import { getSupportUnread } from '@/api/support'
import { useBrandingContext } from '@/hooks/BrandingProvider'
import { resolveLogoUrl } from '@/hooks/useBranding'
import { ThemeToggleRow } from './ThemeToggle'
import {
  LayoutDashboard,
  CreditCard,
  Receipt,
  Users,
  Monitor,
  User,
  LogOut,
  Newspaper,
  Shield,
  Globe,
  LifeBuoy,
} from 'lucide-react'

function FitText({ text }: { text: string }) {
  const spanRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = spanRef.current
    if (!el) return
    let size = 18
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
      className="font-extrabold tracking-[-0.01em] text-[hsl(var(--primary))]"
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
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
    >
      <Globe size={18} />
      <span>{current === 'ru' ? 'Русский' : 'English'}</span>
      <span className="ml-auto text-base leading-none">{current === 'ru' ? '🇷🇺' : '🇬🇧'}</span>
    </button>
  )
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
    isActive
      ? 'bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] font-semibold'
      : 'text-[hsl(var(--muted-foreground))] font-medium hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
  ].join(' ')

export function Sidebar() {
  const { logout, user } = useAuth()
  const { t } = useTranslation()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { newsEnabled, referralEnabled, devicesEnabled, supportEnabled, branding } = useBrandingContext()

  const { data: adminData } = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: getAdminMe,
    enabled: !!user,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
  const { data: supportUnread } = useQuery({
    queryKey: ['support', 'unread'],
    queryFn: getSupportUnread,
    enabled: !!user && supportEnabled,
    staleTime: 30_000,
  })
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })
  const isAdmin = !!adminData?.is_admin
  const logo = resolveLogoUrl(branding?.logo_url)
  const email = profile?.email ?? user?.email ?? ''
  // If Telegram is linked — show the Telegram name as the primary line and the
  // email below it. Otherwise the email is the only identity shown.
  const telegramName = profile?.telegram_first_name?.trim() || ''
  const primaryName = telegramName || email || t('nav_profile')
  const secondaryEmail = telegramName ? email : ''
  const initial = (primaryName[0] ?? 'U').toUpperCase()

  const NAV_ITEMS = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav_dashboard'), badge: 0 },
    { to: '/subscription', icon: CreditCard, label: t('nav_subscription'), badge: 0 },
    { to: '/payments', icon: Receipt, label: t('nav_payments'), badge: 0 },
    ...(newsEnabled ? [{ to: '/news', icon: Newspaper, label: t('nav_news'), badge: 0 }] : []),
    ...(referralEnabled ? [{ to: '/referral', icon: Users, label: t('nav_referral'), badge: 0 }] : []),
    ...(devicesEnabled ? [{ to: '/devices', icon: Monitor, label: t('nav_devices'), badge: 0 }] : []),
    ...(supportEnabled
      ? [{ to: '/support', icon: LifeBuoy, label: t('nav_support'), badge: supportUnread?.count ?? 0 }]
      : []),
    { to: '/profile', icon: User, label: t('nav_profile'), badge: 0 },
  ]

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 md:flex">
      {/* Brand */}
      <div className="mb-4 flex items-center gap-2.5 px-2 py-2">
        {logo && <img src={logo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover shadow-[var(--shadow-xs)]" />}
        <div className="min-w-0 flex-1">
          <FitText text={branding?.brand_name ?? ''} />
        </div>
      </div>

      {/* User card */}
      <div className="mb-2 flex items-center gap-2.5 rounded-[10px] bg-[hsl(var(--background))] p-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-sm font-extrabold text-[var(--primary-press)]">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold leading-tight text-[hsl(var(--foreground))]">
            {primaryName}
          </div>
          {secondaryEmail && (
            <div className="truncate text-[11px] leading-tight text-[hsl(var(--muted-foreground))]">
              {secondaryEmail}
            </div>
          )}
          {isAdmin && (
            <div className="text-[11px] leading-tight text-[hsl(var(--muted-foreground))]">
              {t('admin_title')}
            </div>
          )}
        </div>
      </div>

      <div className="px-3 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">
        {t('personal_cabinet')}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV_ITEMS.map(({ to, icon: Icon, label, badge }) => (
          <NavLink key={to} to={to} className={navClass}>
            <Icon size={18} />
            <span className="flex-1">{label}</span>
            {badge > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--danger)] px-1.5 text-[11px] font-bold text-white">
                {badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-2 flex flex-col gap-0.5 border-t border-[hsl(var(--border))] pt-2">
        {isAdmin && (
          <NavLink to="/admin" className={navClass}>
            <Shield size={18} />
            {t('admin_title')}
          </NavLink>
        )}
        <ThemeToggleRow />
        <LangToggle />
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
        >
          <LogOut size={18} />
          {t('nav_logout')}
        </button>
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
