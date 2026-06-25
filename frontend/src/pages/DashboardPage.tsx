import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '@/components/layout/AppShell'
import { SubscriptionCard } from '@/components/subscription/SubscriptionCard'
import { ConnectionLinkCard } from '@/components/subscription/ConnectionLinkCard'
import { TrialBanner } from '@/components/subscription/TrialBanner'
import { Card, CardContent } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { useAuth } from '@/auth/useAuth'
import { getSubscription } from '@/api/subscription'
import { getProfile } from '@/api/profile'
import { getPaymentsCount, getPendingPayment, type PaymentStatus } from '@/api/payment'
import { useBrandingContext } from '@/hooks/BrandingProvider'
import { CreditCard, Receipt, ArrowRight, AlertCircle, X } from 'lucide-react'

const PAYMENT_EXPIRY_MS = 65 * 60 * 1000

function parseUtcMs(isoString: string): number {
  // Append 'Z' if the string has no timezone designator so JavaScript
  // always interprets the timestamp as UTC, not local time.
  const s = /[Z+]/.test(isoString) ? isoString : isoString + 'Z'
  return new Date(s).getTime()
}

function isPendingPaymentExpired(payment: PaymentStatus): boolean {
  return Date.now() - parseUtcMs(payment.created_at) > PAYMENT_EXPIRY_MS
}

export function DashboardPage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const { branding } = useBrandingContext()
  const navigate = useNavigate()
  const [bannerDismissed, setBannerDismissed] = useState(
    () => sessionStorage.getItem('pending_payment_banner_dismissed') === '1'
  )

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
  })

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: getSubscription,
  })

  const { data: paymentsCount } = useQuery({
    queryKey: ['payments-count'],
    queryFn: getPaymentsCount,
  })

  const { data: pendingPayment } = useQuery({
    queryKey: ['pending-payment'],
    queryFn: getPendingPayment,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })

  function dismissBanner() {
    sessionStorage.setItem('pending_payment_banner_dismissed', '1')
    setBannerDismissed(true)
  }

  const displayName =
    profile?.telegram_first_name ||
    profile?.telegram_username ||
    user?.email?.split('@')[0] ||
    'пользователь'

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t('dashboard_greeting', { name: displayName })}</h1>
          <p className="text-[hsl(var(--muted-foreground))] text-sm mt-1">
            {t('dashboard_subtitle', { brand: branding?.brand_name ?? '' })}
          </p>
        </div>

        {pendingPayment && !bannerDismissed && !isPendingPaymentExpired(pendingPayment) && (
          <Alert variant="warning" icon={<AlertCircle size={18} />}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">У вас есть незавершённый платёж</p>
                <p className="mt-0.5">
                  {pendingPayment.subscription_duration_months
                    ? `${pendingPayment.subscription_duration_months} мес. — `
                    : ''}
                  {pendingPayment.amount.toFixed(0)}{' '}
                  {pendingPayment.currency === 'RUB' ? '₽' : pendingPayment.currency}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => navigate(`/payment/${pendingPayment.payment_id}`)}
                  className="text-xs font-bold underline underline-offset-2 hover:opacity-80"
                >
                  Оплатить →
                </button>
                <button onClick={dismissBanner} className="opacity-60 hover:opacity-100" aria-label="Закрыть">
                  <X size={16} />
                </button>
              </div>
            </div>
          </Alert>
        )}

        <TrialBanner />

        {subLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="h-24 bg-[hsl(var(--muted))] rounded animate-pulse" />
            </CardContent>
          </Card>
        ) : subscription ? (
          <>
            <SubscriptionCard subscription={subscription} />
            <ConnectionLinkCard />
          </>
        ) : (
          <Card>
            <CardContent className="space-y-3 p-6 text-center">
              <p className="text-[hsl(var(--muted-foreground))]">{t('dashboard_no_subscription')}</p>
              <Link
                to="/subscription"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-[var(--shadow-xs)] transition-colors hover:bg-[var(--primary-press)]"
              >
                {t('dashboard_buy')}
              </Link>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            to="/subscription"
            className="group flex items-center gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-sm)] transition-[box-shadow,transform] hover:shadow-[var(--shadow-md)] active:scale-[0.995]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[hsl(var(--primary))]">
              <CreditCard size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-[hsl(var(--foreground))]">{t('dashboard_manage')}</h3>
              <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{t('dashboard_manage_desc')}</p>
            </div>
            <ArrowRight size={18} className="shrink-0 text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-0.5" />
          </Link>

          <Link
            to="/payments"
            className="group flex items-center gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-sm)] transition-[box-shadow,transform] hover:shadow-[var(--shadow-md)] active:scale-[0.995]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[hsl(var(--primary))]">
              <Receipt size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-[hsl(var(--foreground))]">{t('dashboard_history')}</h3>
              <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                {paymentsCount?.total
                  ? t('dashboard_payments_count', { count: paymentsCount.total })
                  : t('dashboard_no_payments')}
              </p>
            </div>
            <ArrowRight size={18} className="shrink-0 text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </AppShell>
  )
}
