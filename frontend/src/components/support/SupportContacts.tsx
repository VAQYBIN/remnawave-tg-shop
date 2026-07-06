import { Mail, Phone, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useBrandingContext } from '@/hooks/BrandingProvider'
import { cn } from '@/lib/utils'

function normalizeTelegramUsername(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed.replace(/^@+/, '') : ''
}

export function hasSupportContacts(branding: {
  contact_support_tg_username?: string | null
  contact_support_email?: string | null
  contact_support_phone?: string | null
} | null | undefined) {
  return Boolean(
    normalizeTelegramUsername(branding?.contact_support_tg_username) ||
    branding?.contact_support_email?.trim() ||
    branding?.contact_support_phone?.trim(),
  )
}

export function SupportContacts({ className }: { className?: string }) {
  const { branding } = useBrandingContext()
  const { t } = useTranslation()
  const tgUsername = normalizeTelegramUsername(branding?.contact_support_tg_username)
  const email = branding?.contact_support_email?.trim() ?? ''
  const phone = branding?.contact_support_phone?.trim() ?? ''

  if (!tgUsername && !email && !phone) return null

  return (
    <section className={cn('rounded-2xl bg-neutral-800 px-4 py-4 text-neutral-100 shadow-sm', className)}>
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-neutral-300">
        {t('support_footer_title')}
      </p>
      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap">
        {tgUsername && (
          <a
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 transition hover:bg-white/15"
            href={`https://t.me/${tgUsername}`}
            target="_blank"
            rel="noreferrer"
          >
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
    </section>
  )
}
