import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/useAuth'
import { LayoutDashboard, CreditCard, Users, Monitor, User, LogOut } from 'lucide-react'

export function MobileNav() {
  const { logout } = useAuth()
  const { t } = useTranslation()

  const NAV_ITEMS = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav_dashboard') },
    { to: '/subscription', icon: CreditCard, label: t('nav_subscription') },
    { to: '/referral', icon: Users, label: t('nav_referral') },
    { to: '/devices', icon: Monitor, label: t('nav_devices') },
    { to: '/profile', icon: User, label: t('nav_profile') },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-[hsl(var(--card))] border-t border-[hsl(var(--border))] flex z-50">
      {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            [
              'flex flex-col items-center gap-1 flex-1 py-3 text-xs font-medium transition-colors',
              isActive
                ? 'text-[hsl(var(--primary))]'
                : 'text-[hsl(var(--muted-foreground))]',
            ].join(' ')
          }
        >
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
      <button
        onClick={logout}
        className="flex flex-col items-center gap-1 flex-1 py-3 text-xs font-medium transition-colors text-[hsl(var(--muted-foreground))]"
      >
        <LogOut size={20} />
        {t('nav_logout')}
      </button>
    </nav>
  )
}
