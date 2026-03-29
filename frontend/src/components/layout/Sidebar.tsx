import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { patchLanguage } from '@/api/profile'
import {
  LayoutDashboard,
  CreditCard,
  Receipt,
  Users,
  Monitor,
  User,
  LogOut,
  Newspaper,
} from 'lucide-react'

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
  const { logout } = useAuth()
  const { t } = useTranslation()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const NAV_ITEMS = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav_dashboard') },
    { to: '/subscription', icon: CreditCard, label: t('nav_subscription') },
    { to: '/payments', icon: Receipt, label: t('nav_payments') },
    { to: '/news', icon: Newspaper, label: t('nav_news') },
    { to: '/referral', icon: Users, label: t('nav_referral') },
    { to: '/devices', icon: Monitor, label: t('nav_devices') },
    { to: '/profile', icon: User, label: t('nav_profile') },
  ]

  return (
    <aside className="hidden md:flex flex-col w-56 min-h-screen bg-[hsl(var(--card))] border-r border-[hsl(var(--border))] p-4">
      <div className="mb-8 px-2">
        <span className="text-xl font-bold text-[hsl(var(--primary))]">🦝 Raccoonito</span>
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
