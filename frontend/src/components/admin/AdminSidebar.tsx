import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  X,
} from 'lucide-react'
import { AdminLanguageToggle } from '@/components/admin/AdminLanguageToggle'

const NAV_ITEMS = [
  { to: '/admin/dashboard', icon: LayoutDashboard, labelKey: 'admin_nav_overview' },
  { to: '/admin/users', icon: Users, labelKey: 'admin_nav_users' },
  { to: '/admin/payments', icon: CreditCard, labelKey: 'admin_nav_payments' },
  { to: '/admin/promos', icon: Tag, labelKey: 'admin_nav_promos' },
  { to: '/admin/broadcast', icon: Megaphone, labelKey: 'admin_nav_broadcast' },
]

const SITE_ITEMS = [
  { to: '/admin/branding', icon: Palette, labelKey: 'admin_nav_branding' },
  { to: '/admin/features', icon: ToggleLeft, labelKey: 'admin_nav_features' },
  { to: '/admin/plans', icon: CalendarDays, labelKey: 'admin_nav_plans' },
  { to: '/admin/payment-providers', icon: Wallet, labelKey: 'admin_nav_providers' },
]

const REMNAWAVE_ITEMS = [
  { to: '/admin/panel', icon: Activity, labelKey: 'admin_nav_monitoring', end: true },
  { to: '/admin/nodes', icon: Server, labelKey: 'admin_nav_nodes' },
  { to: '/admin/panel/users', icon: Users, labelKey: 'admin_nav_panel_users' },
]

interface AdminSidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function AdminSidebar({ mobileOpen = false, onMobileClose }: AdminSidebarProps) {
  const location = useLocation()
  const { t } = useTranslation()

  // Close mobile sidebar on route change
  useEffect(() => {
    onMobileClose?.()
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
      isActive
        ? 'bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] font-semibold'
        : 'text-[hsl(var(--muted-foreground))] font-medium hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
    ].join(' ')

  const groupLabelClass = 'mt-4 mb-1 px-3'
  const groupLabelText = 'text-[10px] font-bold uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]'

  const sidebarContent = (
    <aside className="flex flex-col w-64 h-full bg-[hsl(var(--card))] border-r border-[hsl(var(--border))] p-4">
      <div className="mb-8 px-2 flex items-center justify-between">
        <span className="text-xl font-extrabold text-[hsl(var(--primary))]">{t('admin_title')}</span>
        {/* Close button — only shown in mobile drawer */}
        <button
          onClick={onMobileClose}
          className="md:hidden p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
          aria-label={t('admin_nav_close_menu')}
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, labelKey }) => (
          <NavLink key={to} to={to} className={linkClass}>
            <Icon size={18} />
            {t(labelKey)}
          </NavLink>
        ))}

        <div className={groupLabelClass}>
          <span className={groupLabelText}>
            {t('admin_nav_customization')}
          </span>
        </div>

        {SITE_ITEMS.map(({ to, icon: Icon, labelKey }) => (
          <NavLink key={to} to={to} className={linkClass}>
            <Icon size={18} />
            {t(labelKey)}
          </NavLink>
        ))}

        <div className={groupLabelClass}>
          <span className={groupLabelText}>
            Remnawave
          </span>
        </div>

        {REMNAWAVE_ITEMS.map(({ to, icon: Icon, labelKey, end }) => (
          <NavLink key={to} to={to} end={end} className={linkClass}>
            <Icon size={18} />
            {t(labelKey)}
          </NavLink>
        ))}
      </nav>

      <div className="mt-2 pt-2 border-t border-[hsl(var(--border))]">
        <AdminLanguageToggle />
        <NavLink
          to="/dashboard"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <ArrowLeft size={18} />
          {t('admin_nav_back')}
        </NavLink>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex w-64 sticky top-0 h-screen overflow-y-auto shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        >
          <div className="absolute inset-0 bg-black/50" />
        </div>
      )}

      {/* Mobile drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 md:hidden h-full transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </div>
    </>
  )
}
