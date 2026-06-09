import { type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { useBrandingContext } from '@/hooks/BrandingProvider'
import { resolveLogoUrl } from '@/hooks/useBranding'

function MobileTopBar() {
  const { branding } = useBrandingContext()
  const logo = resolveLogoUrl(branding?.logo_url)
  return (
    <div className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/90 px-4 py-2.5 backdrop-blur md:hidden">
      {logo && <img src={logo} alt="" className="h-7 w-7 rounded-full object-cover" />}
      <span className="truncate text-base font-extrabold text-[hsl(var(--primary))]">
        {branding?.brand_name}
      </span>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[hsl(var(--background))]">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <MobileTopBar />
        <div className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-5 md:px-10 md:pb-20 md:pt-8">
          {children}
        </div>
      </main>
      <MobileNav />
    </div>
  )
}
