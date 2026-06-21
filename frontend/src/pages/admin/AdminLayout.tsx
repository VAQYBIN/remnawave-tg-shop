import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAdminSupportNotifications } from '@/hooks/useAdminSupportNotifications'
import { useTelegramBackButton } from '@/lib/useTelegramBackButton'

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { t } = useTranslation()
  useAdminSupportNotifications()
  useTelegramBackButton()

  return (
    <div className="flex h-screen bg-[hsl(var(--background))]">
      <AdminSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
            aria-label={t('admin_nav_open_menu')}
          >
            <Menu size={20} />
          </button>
          <span className="text-base font-semibold text-[hsl(var(--primary))]">⚙️ {t('admin_title')}</span>
        </div>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
