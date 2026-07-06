import { type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { ThemeToggleButton } from './ThemeToggle'
import { useBrandingContext } from '@/hooks/BrandingProvider'
import { resolveLogoUrl } from '@/hooks/useBranding'
import { useSupportNotifications } from '@/hooks/useSupportNotifications'
import { useTelegramBackButton } from '@/lib/useTelegramBackButton'
import { SupportContacts } from '@/components/support/SupportContacts'

function MobileTopBar() {
  const { branding } = useBrandingContext()
  const logo = resolveLogoUrl(branding?.logo_url)
  return (
    <div
      className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/90 px-4 py-2.5 backdrop-blur md:hidden"
      style={{ paddingTop: 'calc(0.625rem + var(--tg-content-top, 0px))' }}
    >
      {logo && <img src={logo} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full object-cover" />}
      <span className="truncate text-base font-extrabold text-[hsl(var(--primary))]">
        {branding?.brand_name}
      </span>
      <div className="ml-auto">
        <ThemeToggleButton />
      </div>
    </div>
  )
}

export function AppShell({ children, hideSupportFooter = false }: { children: ReactNode; hideSupportFooter?: boolean }) {
  useSupportNotifications()
  useTelegramBackButton()
  return (
    <div className="flex min-h-screen bg-[hsl(var(--background))]">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-4 pb-24 pt-5 md:px-10 md:pb-20 md:pt-8">
          {children}
          {!hideSupportFooter && <SupportContacts className="mt-auto" />}
        </div>
      </main>
      <MobileNav />
    </div>
  )
}
