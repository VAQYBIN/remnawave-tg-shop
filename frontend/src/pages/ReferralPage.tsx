import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AppShell } from '@/components/layout/AppShell'
import { ReferralLink } from '@/components/referral/ReferralLink'
import { ReferralStats } from '@/components/referral/ReferralStats'
import { getReferral } from '@/api/referral'
import { Users } from 'lucide-react'

export function ReferralPage() {
  const { t } = useTranslation()
  const { data, isLoading, error } = useQuery({
    queryKey: ['referral'],
    queryFn: getReferral,
  })

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t('referral_title')}</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">
            {t('referral_subtitle')}
          </p>
        </div>

        {isLoading && (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 bg-[hsl(var(--muted))] animate-pulse rounded-xl" />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-[hsl(var(--muted))] p-6 text-center">
            <Users size={40} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
            <p className="font-medium">{t('referral_unavailable')}</p>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              {t('referral_need_telegram')}
            </p>
          </div>
        )}

        {data && (
          <>
            <ReferralLink referralCode={data.referral_code} referralLink={data.referral_link} />
            <ReferralStats
              invitedCount={data.invited_count}
              purchasedCount={data.purchased_count}
              bonusDaysPerMonth={data.bonus_days_per_month}
            />
          </>
        )}
      </div>
    </AppShell>
  )
}
