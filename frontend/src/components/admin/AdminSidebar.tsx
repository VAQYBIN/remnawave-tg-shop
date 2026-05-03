import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Tag,
  Palette,
  ToggleLeft,
  ArrowLeft,
  CalendarDays,
  Wallet,
  Activity,
  Server,
  Megaphone,
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Обзор' },
  { to: '/admin/users', icon: Users, label: 'Пользователи' },
  { to: '/admin/payments', icon: CreditCard, label: 'Платежи' },
  { to: '/admin/promos', icon: Tag, label: 'Промокоды' },
  { to: '/admin/broadcast', icon: Megaphone, label: 'Рассылка' },
]

const SITE_ITEMS = [
  { to: '/admin/branding', icon: Palette, label: 'Бренд и цвета' },
  { to: '/admin/features', icon: ToggleLeft, label: 'Разделы' },
  { to: '/admin/plans', icon: CalendarDays, label: 'Тарифы' },
  { to: '/admin/payment-providers', icon: Wallet, label: 'Провайдеры оплаты' },
]

const REMNAWAVE_ITEMS = [
  { to: '/admin/panel', icon: Activity, label: 'Мониторинг', end: true },
  { to: '/admin/nodes', icon: Server, label: 'Ноды' },
  { to: '/admin/panel/users', icon: Users, label: 'Юзеры панели' },
]

export function AdminSidebar() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
      isActive
        ? 'bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]'
        : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
    ].join(' ')

  return (
    <aside className="hidden md:flex flex-col w-64 sticky top-0 h-screen overflow-y-auto bg-[hsl(var(--card))] border-r border-[hsl(var(--border))] p-4">
      <div className="mb-8 px-2">
        <span className="text-xl font-bold text-[hsl(var(--primary))]">⚙️ Админка</span>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className={linkClass}>
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        <div className="mt-4 mb-1 px-3">
          <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
            Кастомизация
          </span>
        </div>

        {SITE_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className={linkClass}>
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        <div className="mt-4 mb-1 px-3">
          <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
            Remnawave
          </span>
        </div>

        {REMNAWAVE_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end} className={linkClass}>
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-2 pt-2 border-t border-[hsl(var(--border))]">
        <NavLink
          to="/dashboard"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <ArrowLeft size={18} />
          Личный кабинет
        </NavLink>
      </div>
    </aside>
  )
}
