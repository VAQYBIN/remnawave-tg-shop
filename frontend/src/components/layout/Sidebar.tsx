import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        className="justify-start gap-3 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
      >
        <LogOut size={18} />
        {t('nav_logout')}
      </Button>

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
