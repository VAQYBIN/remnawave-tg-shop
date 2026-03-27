import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { SubscriptionCard } from '@/components/subscription/SubscriptionCard'
import { PlanSelector } from '@/components/subscription/PlanSelector'
import { PaymentMethodGrid } from '@/components/payment/PaymentMethodGrid'
import { PromoInput } from '@/components/payment/PromoInput'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getSubscription, getPlans, getConnection, setAutoRenew } from '@/api/subscription'
import { createPayment, type PromoApplyResponse } from '@/api/payment'
import { Copy, Check, RefreshCw, ArrowRight } from 'lucide-react'
import { apiRequest } from '@/api/client'

// Available providers returned from the backend config endpoint
function useAvailableProviders() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => apiRequest<{ available_providers: string[] }>('/config').catch(() => ({ available_providers: [] })),
  })
}

export function SubscriptionPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [copied, setCopied] = useState(false)
  const [selectedMonths, setSelectedMonths] = useState<number | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [appliedPromo, setAppliedPromo] = useState<PromoApplyResponse | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: getSubscription,
  })

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: getPlans,
  })

  const { data: connection, isLoading: connLoading, refetch: refetchConn } = useQuery({
    queryKey: ['connection'],
    queryFn: getConnection,
    enabled: !!subscription,
  })

  const { data: configData } = useAvailableProviders()
  const availableProviders = configData?.available_providers ?? []

  const autoRenewMutation = useMutation({
    mutationFn: (enabled: boolean) => setAutoRenew(enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription'] }),
  })

  const paymentMutation = useMutation({
    mutationFn: () => {
      if (!selectedMonths || !selectedProvider) throw new Error('Выберите тариф и способ оплаты')
      return createPayment({
        provider: selectedProvider,
        months: selectedMonths,
        promo_code: appliedPromo?.promo_code,
      })
    },
    onSuccess: (data) => {
      window.location.href = data.redirect_url
    },
    onError: (err: Error) => {
      setPaymentError(err.message || 'Ошибка создания платежа')
    },
  })

  const handleCopy = async () => {
    if (!connection?.link) return
    await navigator.clipboard.writeText(connection.link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePlanSelect = (months: number) => {
    setSelectedMonths(months)
    setPaymentError(null)
  }

  const discountPct = appliedPromo?.discount_percentage

  const selectedPlan = plans?.plans.find(
    (p) => p.kind === 'time' && p.months === selectedMonths,
  )
  const selectedPrice =
    selectedPlan?.kind === 'time'
      ? discountPct
        ? Math.round(selectedPlan.price_rub * (1 - discountPct / 100))
        : selectedPlan.price_rub
      : null

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Подписка</h1>

        {/* Current subscription */}
        {subLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="h-32 bg-[hsl(var(--muted))] rounded animate-pulse" />
            </CardContent>
          </Card>
        ) : subscription ? (
          <>
            <SubscriptionCard subscription={subscription} />

            {/* VPN Connection link */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">VPN-ссылка</CardTitle>
                <CardDescription>Используйте для подключения в клиенте</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {connLoading ? (
                  <div className="h-10 bg-[hsl(var(--muted))] rounded animate-pulse" />
                ) : connection ? (
                  <div className="flex gap-2">
                    <code className="flex-1 text-xs bg-[hsl(var(--muted))] rounded px-3 py-2.5 break-all font-mono">
                      {connection.link}
                    </code>
                    <Button size="sm" variant="outline" onClick={handleCopy} className="shrink-0">
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => refetchConn()}>
                    <RefreshCw size={14} className="mr-2" />
                    Получить ссылку
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Auto-renew toggle */}
            <Card>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Автопродление</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                    Подписка продлится автоматически
                  </p>
                </div>
                <Button
                  variant={subscription.auto_renew_enabled ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => autoRenewMutation.mutate(!subscription.auto_renew_enabled)}
                  disabled={autoRenewMutation.isPending}
                >
                  {subscription.auto_renew_enabled ? 'Вкл' : 'Выкл'}
                </Button>
              </CardContent>
            </Card>
          </>
        ) : null}

        {/* Purchase section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            {subscription ? 'Продлить подписку' : 'Купить подписку'}
          </h2>

          {plansLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 bg-[hsl(var(--muted))] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : plans?.mode === 'time' && plans.plans.length > 0 ? (
            <PlanSelector
              plans={plans.plans}
              selectedMonths={selectedMonths}
              discountPercentage={discountPct}
              onSelect={handlePlanSelect}
            />
          ) : plans?.mode === 'traffic' ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Покупка пакетов трафика доступна только через Telegram-бот
            </p>
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Тарифы не настроены</p>
          )}

          {/* Payment panel — visible after plan selection */}
          {selectedMonths && (
            <Card className="border-[hsl(var(--primary)/30%)]">
              <CardContent className="p-5 space-y-4">
                {/* Promo code */}
                <div>
                  <p className="text-sm font-medium mb-2">Промокод</p>
                  <PromoInput
                    appliedPromo={appliedPromo}
                    onPromoApplied={setAppliedPromo}
                    onPromoRemoved={() => setAppliedPromo(null)}
                  />
                </div>

                {/* Payment method */}
                <div>
                  <p className="text-sm font-medium mb-2">Способ оплаты</p>
                  <PaymentMethodGrid
                    availableProviders={availableProviders}
                    selectedProvider={selectedProvider}
                    onSelect={(p) => {
                      setSelectedProvider(p)
                      setPaymentError(null)
                    }}
                    disabled={paymentMutation.isPending}
                  />
                </div>

                {/* Summary + Buy button */}
                {selectedProvider && selectedPrice !== null && (
                  <div className="pt-2 border-t border-[hsl(var(--border))]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-[hsl(var(--muted-foreground))]">
                        Итого к оплате
                      </span>
                      <span className="text-lg font-bold text-[hsl(var(--primary))]">
                        {selectedPrice} ₽
                      </span>
                    </div>
                    {paymentError && (
                      <p className="text-xs text-red-500 mb-2">{paymentError}</p>
                    )}
                    <Button
                      className="w-full"
                      onClick={() => paymentMutation.mutate()}
                      disabled={paymentMutation.isPending}
                    >
                      {paymentMutation.isPending ? (
                        'Создаём платёж...'
                      ) : (
                        <>
                          Оплатить
                          <ArrowRight size={16} className="ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  )
}
