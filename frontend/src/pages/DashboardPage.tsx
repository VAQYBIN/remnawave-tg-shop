import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { SubscriptionCard } from '@/components/subscription/SubscriptionCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/auth/useAuth'
import { getSubscription } from '@/api/subscription'
import { getProfile } from '@/api/profile'
import { getPayments } from '@/api/payment'
import { CreditCard, Receipt, ArrowRight } from 'lucide-react'

export function DashboardPage() {
  const { user } = useAuth()

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
  })

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: getSubscription,
  })

  const { data: payments } = useQuery({
    queryKey: ['payments', 1],
    queryFn: () => getPayments(1, 3),
  })

  const displayName =
    profile?.telegram_first_name ||
    profile?.telegram_username ||
    user?.email?.split('@')[0] ||
    'пользователь'

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Добро пожаловать, {displayName}!</h1>
          <p className="text-[hsl(var(--muted-foreground))] text-sm mt-1">
            Личный кабинет Raccoonito VPN
          </p>
        </div>

        {/* Subscription block */}
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
              <p className="text-[hsl(var(--muted-foreground))]">У вас нет активной подписки</p>
              <Link
                to="/subscription"
                className="inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-semibold transition-colors h-10 px-4 py-2 text-sm bg-[hsl(var(--primary))] text-white hover:bg-[hsl(197,74%,44%)]"
              >
                Купить подписку
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Quick actions */}
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
                <CardTitle className="text-base">Управление подпиской</CardTitle>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                  Тарифы, VPN-ссылка, автопродление
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
                <CardTitle className="text-base">История платежей</CardTitle>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                  {payments?.total ? `${payments.total} платежей` : 'Нет платежей'}
                </p>
              </CardContent>
            </Link>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
