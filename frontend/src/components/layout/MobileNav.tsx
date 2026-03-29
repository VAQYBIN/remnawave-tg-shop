import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/useAuth'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  LayoutDashboard,
  CreditCard,
  Newspaper,
  User,
  MoreHorizontal,
  History,
  Users,
  Monitor,
  LogOut,
  X,
} from 'lucide-react'

export function MobileNav() {
  const { logout } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const PRIMARY_ITEMS = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav_dashboard') },
    { to: '/subscription', icon: CreditCard, label: t('nav_subscription') },
    { to: '/news', icon: Newspaper, label: t('nav_news') },
    { to: '/profile', icon: User, label: t('nav_profile') },
  ]

  const MORE_ITEMS = [
    { to: '/payments', icon: History, label: t('nav_payments') },
    { to: '/referral', icon: Users, label: t('nav_referral') },
    { to: '/devices', icon: Monitor, label: t('nav_devices') },
  ]

  const handleMoreNav = (to: string) => {
    setMoreOpen(false)
    navigate(to)
  }

  const handleLogoutClick = () => {
    setConfirmOpen(true)
  }

  return (
    <>
      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-[hsl(var(--card))] border-t border-[hsl(var(--border))] flex z-50">
        {PRIMARY_ITEMS.map(({ to, icon: Icon, label }) => (
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
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center gap-1 flex-1 py-3 text-xs font-medium transition-colors text-[hsl(var(--muted-foreground))]"
        >
          <MoreHorizontal size={20} />
          {t('nav_more')}
        </button>
      </nav>

      {/* Backdrop */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 md:hidden"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More drawer */}
      <div
        className={[
          'fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[hsl(var(--card))] rounded-t-2xl',
          'transition-transform duration-200',
          moreOpen ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {t('nav_more')}
          </span>
          <button
            type="button"
            onClick={() => setMoreOpen(false)}
            className="p-1 text-[hsl(var(--muted-foreground))]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-3 pb-6 space-y-1">
          {MORE_ITEMS.map(({ to, icon: Icon, label }) => (
            <button
              key={to}
              type="button"
              onClick={() => handleMoreNav(to)}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
            >
              <Icon size={20} className="text-[hsl(var(--muted-foreground))]" />
              {label}
            </button>
          ))}

          <div className="h-px bg-[hsl(var(--border))] my-2" />

          <button
            type="button"
            onClick={handleLogoutClick}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
          >
            <LogOut size={20} />
            {t('nav_logout')}
          </button>
        </div>
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
    </>
  )
}
