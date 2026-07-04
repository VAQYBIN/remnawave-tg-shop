import { type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { ThemeToggleButton } from './ThemeToggle'
import { Mail, Phone, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useBrandingContext } from '@/hooks/BrandingProvider'
import { resolveLogoUrl } from '@/hooks/useBranding'
import { useSupportNotifications } from '@/hooks/useSupportNotifications'
import { useTelegramBackButton } from '@/lib/useTelegramBackButton'
import { SupportContacts } from '@/components/support/SupportContacts'

function normalizeTelegramUsername(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed.replace(/^@+/, '') : ''
}

function SupportFooter() {
  const { branding } = useBrandingContext()
  const { t } = useTranslation()
  const tgUsername = normalizeTelegramUsername(branding?.contact_support_tg_username)
  const email = branding?.contact_support_email?.trim() ?? ''
  const phone = branding?.contact_support_phone?.trim() ?? ''

  if (!tgUsername && !email && !phone) return null

  return (
    <footer className="mt-8 rounded-2xl bg-neutral-800 px-4 py-4 text-neutral-100 shadow-sm">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-neutral-300">
        {t('support_footer_title')}
      </p>
      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap">
        {tgUsername && (
          <a className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 transition hover:bg-white/15" href={`https://t.me/${tgUsername}`} target="_blank" rel="noreferrer">
            <Send size={16} /> @{tgUsername}
          </a>
        )}
        {email && (
          <a className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 transition hover:bg-white/15" href={`mailto:${email}`}>
            <Mail size={16} /> {email}
          </a>
        )}
        {phone && (
          <a className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 transition hover:bg-white/15" href={`tel:${phone}`}>
            <Phone size={16} /> {phone}
          </a>
        )}
      </div>
    </footer>
  )
}

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
