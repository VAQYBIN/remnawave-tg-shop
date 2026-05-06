import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
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
import { useToast } from '@/hooks/useToast'

function useAvailableProviders() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => apiRequest<{ available_providers: string[] }>('/config').catch(() => ({ available_providers: [] })),
  })
}

export function SubscriptionPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const toast = useToast()
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
      if (!selectedMonths || !selectedProvider) throw new Error(t('sub_error_select'))
      return createPayment({
        provider: selectedProvider,
        months: selectedMonths,
        promo_code: appliedPromo?.promo_code,
      })
    },
    onSuccess: (data) => {
      navigate(`/payment/${data.payment_id}`)
    },
    onError: (err: Error) => {
      const msg = err.message || t('sub_error_select')
      setPaymentError(msg)
      toast.error(msg)
    },
  })

  const handleCopy = async () => {
    if (!connection?.link) return
    await navigator.clipboard.writeText(connection.link)
    setCopied(true)
    toast.success(t('copied'))
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
        <h1 className="text-2xl font-bold">{t('sub_title')}</h1>

        {subLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="h-32 bg-[hsl(var(--muted))] rounded animate-pulse" />
            </CardContent>
          </Card>
        ) : subscription ? (
          <>
            <SubscriptionCard subscription={subscription} />

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('sub_vpn_link')}</CardTitle>
                <CardDescription>{t('sub_vpn_link_desc')}</CardDescription>
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
                    {t('sub_get_link')}
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{t('sub_auto_renew')}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                    {t('sub_auto_renew_desc')}
                  </p>
                </div>
                <Button
                  variant={subscription.auto_renew_enabled ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => autoRenewMutation.mutate(!subscription.auto_renew_enabled)}
                  disabled={autoRenewMutation.isPending}
                >
                  {subscription.auto_renew_enabled ? t('sub_auto_on') : t('sub_auto_off')}
                </Button>
              </CardContent>
            </Card>
          </>
        ) : null}

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            {subscription ? t('sub_renew') : t('sub_buy')}
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
              {t('sub_traffic_bot')}
            </p>
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{t('sub_no_plans')}</p>
          )}

          {selectedMonths && (
            <Card className="border-[hsl(var(--border))] overflow-hidden">
              {/* Promo */}
              <div className="px-5 pt-5 pb-4">
                <p className="text-sm font-semibold mb-3">{t('sub_promo')}</p>
                <PromoInput
                  appliedPromo={appliedPromo}
                  onPromoApplied={setAppliedPromo}
                  onPromoRemoved={() => setAppliedPromo(null)}
                />
              </div>

              <div className="border-t border-[hsl(var(--border))]" />

              {/* Payment method */}
              <div className="px-5 py-4">
                <p className="text-sm font-semibold mb-3">{t('sub_payment_method')}</p>
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

              <div className="border-t border-[hsl(var(--border))]" />

              {/* Total + Pay */}
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">
                    {t('sub_total')}
                  </span>
                  <span className="text-xl font-bold text-[hsl(var(--primary))]">
                    {selectedPrice !== null ? `${selectedPrice} ₽` : '—'}
                  </span>
                </div>
                {paymentError && (
                  <p className="text-xs text-red-500">{paymentError}</p>
                )}
                <Button
                  className="w-full h-11 font-bold text-base"
                  onClick={() => paymentMutation.mutate()}
                  disabled={paymentMutation.isPending || !selectedProvider || selectedPrice === null}
                >
                  {paymentMutation.isPending ? (
                    t('sub_paying')
                  ) : (
                    <>
                      {t('sub_pay')}
                      <ArrowRight size={16} className="ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  )
}
