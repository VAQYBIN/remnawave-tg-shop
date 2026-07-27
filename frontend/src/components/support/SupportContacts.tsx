import { Mail, Phone, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useBrandingContext } from '@/hooks/BrandingProvider'
import { cn } from '@/lib/utils'

interface SupportContactFields {
  contact_support_tg_username?: string | null
  contact_support_email?: string | null
  contact_support_phone?: string | null
}

function normalizeTelegramUsername(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed.replace(/^@+/, '') : ''
}

export function hasSupportContacts(branding: SupportContactFields | null | undefined) {
  return Boolean(
    normalizeTelegramUsername(branding?.contact_support_tg_username) ||
    branding?.contact_support_email?.trim() ||
    branding?.contact_support_phone?.trim(),
  )
}

const linkClass =
  'inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2 ' +
  'text-[hsl(var(--foreground))] transition hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]'

export function SupportContacts({ className }: { className?: string }) {
  const { branding } = useBrandingContext()
  const { t } = useTranslation()
  const tgUsername = normalizeTelegramUsername(branding?.contact_support_tg_username)
  const email = branding?.contact_support_email?.trim() ?? ''
  const phone = branding?.contact_support_phone?.trim() ?? ''

  if (!tgUsername && !email && !phone) return null

  return (
    <section
      className={cn(
        'rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-4 shadow-[var(--shadow-sm)]',
        className,
      )}
    >
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">
        {t('support_footer_title')}
      </p>
      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap">
        {tgUsername && (
          <a className={linkClass} href={`https://t.me/${tgUsername}`} target="_blank" rel="noreferrer">
            <Send size={16} /> @{tgUsername}
          </a>
        )}
        {email && (
          <a className={linkClass} href={`mailto:${email}`}>
            <Mail size={16} /> {email}
          </a>
        )}
        {phone && (
          <a className={linkClass} href={`tel:${phone.replace(/[^+\d]/g, '')}`}>
            <Phone size={16} /> {phone}
          </a>
        )}
      </div>
    </section>
  )
}
