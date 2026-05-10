import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '@/components/layout/AppShell'
import { SubscriptionCard } from '@/components/subscription/SubscriptionCard'
import { TrialBanner } from '@/components/subscription/TrialBanner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/auth/useAuth'
import { getSubscription } from '@/api/subscription'
import { getProfile } from '@/api/profile'
import { getPaymentsCount, getPendingPayment, type PaymentStatus } from '@/api/payment'
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
            {t('dashboard_subtitle')}
          </p>
        </div>

        {pendingPayment && !bannerDismissed && !isPendingPaymentExpired(pendingPayment) && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
            <AlertCircle size={18} className="shrink-0 mt-0.5 text-amber-500" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-amber-800">У вас есть незавершённый платёж</p>
              <p className="text-amber-700 mt-0.5">
                {pendingPayment.subscription_duration_months
                  ? `${pendingPayment.subscription_duration_months} мес. — `
                  : ''}
                {pendingPayment.amount.toFixed(0)}{' '}
                {pendingPayment.currency === 'RUB' ? '₽' : pendingPayment.currency}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate(`/payment/${pendingPayment.payment_id}`)}
                className="text-xs font-semibold text-amber-700 underline underline-offset-2 hover:text-amber-900"
              >
                Оплатить →
              </button>
              <button
                onClick={dismissBanner}
                className="text-amber-400 hover:text-amber-600"
                aria-label="Закрыть"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        <TrialBanner />

        {subLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="h-24 bg-[hsl(var(--muted))] rounded animate-pulse" />
            </CardContent>
          </Card>
        ) : subscription ? (
          <SubscriptionCard subscription={subscription} />
        ) : (
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <p className="text-[hsl(var(--muted-foreground))]">{t('dashboard_no_subscription')}</p>
              <Link
                to="/subscription"
                className="inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-semibold transition-colors h-10 px-4 py-2 text-sm bg-[hsl(var(--primary))] text-white hover:bg-[hsl(197,74%,44%)]"
              >
                {t('dashboard_buy')}
              </Link>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="hover:shadow-md transition-shadow">
            <Link to="/subscription">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CreditCard size={20} className="text-[hsl(var(--primary))]" />
                  <ArrowRight size={16} className="text-[hsl(var(--muted-foreground))]" />
                </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-base">{t('dashboard_manage')}</CardTitle>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                  {t('dashboard_manage_desc')}
                </p>
              </CardContent>
            </Link>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <Link to="/payments">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Receipt size={20} className="text-[hsl(var(--primary))]" />
                  <ArrowRight size={16} className="text-[hsl(var(--muted-foreground))]" />
                </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-base">{t('dashboard_history')}</CardTitle>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                  {paymentsCount?.total
                    ? t('dashboard_payments_count', { count: paymentsCount.total })
                    : t('dashboard_no_payments')}
                </p>
              </CardContent>
            </Link>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
