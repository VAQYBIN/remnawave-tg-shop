import { NavLink } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'
import { LayoutDashboard, CreditCard, Receipt, LogOut } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Обзор' },
  { to: '/subscription', icon: CreditCard, label: 'Подписка' },
  { to: '/payments', icon: Receipt, label: 'Платежи' },
]

export function MobileNav() {
  const { logout } = useAuth()

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
        Выйти
      </button>
    </nav>
  )
}
