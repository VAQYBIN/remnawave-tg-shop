import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  CreditCard,
  Receipt,
  Users,
  Monitor,
  User,
  LogOut,
} from 'lucide-react'

export function Sidebar() {
  const { logout } = useAuth()
  const { t } = useTranslation()

  const NAV_ITEMS = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav_dashboard') },
    { to: '/subscription', icon: CreditCard, label: t('nav_subscription') },
    { to: '/payments', icon: Receipt, label: t('nav_payments') },
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
        onClick={logout}
        className="justify-start gap-3 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
      >
        <LogOut size={18} />
        {t('nav_logout')}
      </Button>
    </aside>
  )
}
