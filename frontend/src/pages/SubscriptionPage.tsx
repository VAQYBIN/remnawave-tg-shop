import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AppShell } from '@/components/layout/AppShell'
import { SubscriptionCard } from '@/components/subscription/SubscriptionCard'
import { TrialBanner } from '@/components/subscription/TrialBanner'
import { PlanSelector } from '@/components/subscription/PlanSelector'
import { TariffSelector } from '@/components/subscription/TariffSelector'
import { TariffOptionSelector } from '@/components/subscription/TariffOptionSelector'
import { AddonSelector } from '@/components/subscription/AddonSelector'
import { PaymentMethodGrid } from '@/components/payment/PaymentMethodGrid'
import { PromoInput } from '@/components/payment/PromoInput'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  getSubscription,
  getPlans,
  getConnection,
  setAutoRenew,
  type PubPlan,
  type PubPlanOption,
  type AddonPlan,
  type AddonPlanOption,
} from '@/api/subscription'
import { createPayment, type PromoApplyResponse } from '@/api/payment'
import { Copy, Check, RefreshCw, ArrowRight } from 'lucide-react'
import { apiRequest } from '@/api/client'
import { useToast } from '@/hooks/useToast'

type PurchaseMode = 'none' | 'standalone' | 'addon'

function useAvailableProviders() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () =>
      apiRequest<{ available_providers: string[] }>('/config').catch(() => ({
        available_providers: [],
      })),
  })
}

function formatOptionLabel(option: PubPlanOption | AddonPlanOption, isRu: boolean): string {
  const parts: string[] = []
  if ('duration_months' in option && option.duration_months) {
    const n = option.duration_months
    if (isRu) {
      if (n === 1) parts.push(`${n} месяц`)
      else if (n < 5) parts.push(`${n} месяца`)
      else parts.push(`${n} месяцев`)
    } else {
      parts.push(`${n} ${n === 1 ? 'month' : 'months'}`)
    }
  }
  if ('duration_days' in option && option.duration_days) {
    parts.push(isRu ? `${option.duration_days} дн.` : `${option.duration_days} d.`)
  }
  if (option.traffic_unlimited) parts.push(isRu ? 'Безлимит' : 'Unlimited')
  else if (option.traffic_gb != null) parts.push(`${option.traffic_gb} ГБ`)
  return parts.join(' · ')
}

export function SubscriptionPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const isRu = i18n.language === 'ru'
  const toast = useToast()

  const [copied, setCopied] = useState(false)

  // Legacy flow state
  const [selectedMonths, setSelectedMonths] = useState<number | null>(null)

  // Catalog flow state
  const [purchaseMode, setPurchaseMode] = useState<PurchaseMode>('none')
  const [selectedPlan, setSelectedPlan] = useState<PubPlan | null>(null)
  const [selectedOption, setSelectedOption] = useState<PubPlanOption | null>(null)
  const [selectedAddonPlan, setSelectedAddonPlan] = useState<AddonPlan | null>(null)
  const [selectedAddonOption, setSelectedAddonOption] = useState<AddonPlanOption | null>(null)

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

  const isCatalogMode = plans?.mode === 'catalog' && (plans.catalog_plans?.length ?? 0) > 0

  // Determine current payment item
  const activeOption: PubPlanOption | AddonPlanOption | null =
    purchaseMode === 'standalone' ? selectedOption :
    purchaseMode === 'addon' ? selectedAddonOption :
    null

  const discountPct = appliedPromo?.discount_percentage

  // Price for the payment section
  const computeDisplayPrice = (): { rub: number | null; stars: number | null } => {
    if (!activeOption) return { rub: null, stars: null }

    if (purchaseMode === 'addon') {
      const ao = selectedAddonOption!
      const rawRub = ao.prorated_price_rub ?? ao.price_rub
      const rub = rawRub !== null && discountPct
        ? Math.round(rawRub * (1 - discountPct / 100))
        : rawRub
      return {
        rub,
        stars: ao.prorated_price_stars ?? ao.price_stars,
      }
    }

    if (purchaseMode === 'standalone' && selectedOption) {
      const rawRub = selectedOption.price_rub
      const rub = rawRub !== null && discountPct
        ? Math.round(rawRub * (1 - discountPct / 100))
        : rawRub
      return { rub, stars: selectedOption.price_stars }
    }

    return { rub: null, stars: null }
  }

  const { rub: displayRub, stars: displayStars } = computeDisplayPrice()

  // Legacy flow price
  const selectedLegacyPlan = plans?.plans.find(
    (p) => p.kind === 'time' && p.months === selectedMonths,
  )
  const selectedLegacyPrice =
    selectedLegacyPlan?.kind === 'time'
      ? discountPct
        ? Math.round(selectedLegacyPlan.price_rub * (1 - discountPct / 100))
        : selectedLegacyPlan.price_rub
      : null

  const isStarsSelected = selectedProvider === 'stars'

  const paymentMutation = useMutation({
    mutationFn: () => {
      if (!selectedProvider) throw new Error(t('sub_error_select'))

      // Catalog mode payment
      if (isCatalogMode) {
        if (!activeOption) throw new Error(t('sub_error_select'))
        return createPayment({
          provider: selectedProvider,
          plan_option_id: activeOption.id,
          promo_code: appliedPromo?.promo_code,
        })
      }

      // Legacy mode payment
      if (!selectedMonths) throw new Error(t('sub_error_select'))
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

  const handleSelectStandalonePlan = (plan: PubPlan) => {
    setSelectedPlan(plan)
    setSelectedOption(null)
    setPurchaseMode('none')
    // Clear addon selection
    setSelectedAddonPlan(null)
    setSelectedAddonOption(null)
    setSelectedProvider(null)
    setPaymentError(null)
  }

  const handleSelectStandaloneOption = (option: PubPlanOption) => {
    setSelectedOption(option)
    setPurchaseMode('standalone')
    setSelectedAddonPlan(null)
    setSelectedAddonOption(null)
    setSelectedProvider(null)
    setPaymentError(null)
  }

  const handleBackToPlans = () => {
    setSelectedPlan(null)
    setSelectedOption(null)
    setPurchaseMode('none')
    setSelectedProvider(null)
    setPaymentError(null)
  }

  const handleSelectAddon = (plan: AddonPlan, option: AddonPlanOption) => {
    setSelectedAddonPlan(plan)
    setSelectedAddonOption(option)
    setPurchaseMode('addon')
    // Clear standalone selection
    setSelectedPlan(null)
    setSelectedOption(null)
    setSelectedProvider(null)
    setPaymentError(null)
  }

  const handlePlanSelect = (months: number) => {
    setSelectedMonths(months)
    setPaymentError(null)
  }

  // Determine if payment section should be visible
  const showPaymentSection =
    (isCatalogMode && activeOption !== null) ||
    (!isCatalogMode && selectedMonths !== null)

  // Price to show in the payment section total
  const totalDisplayPrice: string | null = (() => {
    if (!showPaymentSection) return null
    if (isCatalogMode) {
      if (isStarsSelected && displayStars !== null) return `⭐ ${displayStars}`
      if (displayRub !== null) return `${displayRub} ₽`
      if (displayStars !== null) return `⭐ ${displayStars}`
      return null
    }
    return selectedLegacyPrice !== null ? `${selectedLegacyPrice} ₽` : null
  })()

  // Label for what we're paying for
  const purchaseLabel = (() => {
    if (!isCatalogMode) return null
    if (purchaseMode === 'addon' && selectedAddonPlan) {
      const name = isRu ? selectedAddonPlan.name_ru : (selectedAddonPlan.name_en ?? selectedAddonPlan.name_ru)
      return `${name}: ${formatOptionLabel(selectedAddonOption!, isRu)}`
    }
    if (purchaseMode === 'standalone' && selectedPlan && selectedOption) {
      const name = isRu ? selectedPlan.name_ru : (selectedPlan.name_en ?? selectedPlan.name_ru)
      return `${name}: ${formatOptionLabel(selectedOption, isRu)}`
    }
    return null
  })()

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('sub_title')}</h1>

        <TrialBanner />

        {/* Current subscription block */}
        {subLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="h-32 bg-[hsl(var(--muted))] rounded animate-pulse" />
            </CardContent>
          </Card>
        ) : subscription ? (
          <>
            <SubscriptionCard subscription={subscription} />

            {/* VPN link */}
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

            {/* Auto-renew (legacy subscriptions) */}
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

        {/* ── Catalog purchase flow ─────────────────────────────────────────── */}
        {isCatalogMode && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">
              {subscription ? t('sub_renew') : t('sub_buy')}
            </h2>

            {plansLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-[hsl(var(--muted))] rounded-xl animate-pulse" />
                ))}
              </div>
            ) : !selectedPlan ? (
              /* Step 1: choose tariff */
              <TariffSelector
                plans={plans!.catalog_plans}
                selectedPlanId={null}
                onSelect={handleSelectStandalonePlan}
              />
            ) : (
              /* Step 2: choose option */
              <TariffOptionSelector
                plan={selectedPlan}
                selectedOptionId={selectedOption?.id ?? null}
                discountPercentage={discountPct}
                onSelect={handleSelectStandaloneOption}
                onBack={handleBackToPlans}
              />
            )}

            {/* Addon section — shown only when user has a standalone subscription */}
            {subscription && (
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">{t('catalog_addons_title')}</h2>
                <AddonSelector
                  selectedOptionId={purchaseMode === 'addon' ? selectedAddonOption?.id ?? null : null}
                  onSelect={handleSelectAddon}
                />
              </div>
            )}

            {/* Payment card */}
            {showPaymentSection && (
              <Card className="border-[hsl(var(--border))] overflow-hidden">
                {/* What we're paying for */}
                {purchaseLabel && (
                  <div className="px-5 pt-5 pb-0">
                    <p className="text-xs text-[hsl(var(--muted-foreground))] font-medium uppercase tracking-wide mb-1">
                      {purchaseMode === 'addon' ? t('catalog_addon_label') : t('catalog_standalone_label')}
                    </p>
                    <p className="text-sm font-semibold mb-4">{purchaseLabel}</p>
                  </div>
                )}

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
                      {totalDisplayPrice ?? '—'}
                    </span>
                  </div>
                  {paymentError && (
                    <p className="text-xs text-red-500">{paymentError}</p>
                  )}
                  <Button
                    className="w-full h-11 font-bold text-base"
                    onClick={() => paymentMutation.mutate()}
                    disabled={
                      paymentMutation.isPending ||
                      !selectedProvider ||
                      totalDisplayPrice === null
                    }
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
        )}

        {/* ── Legacy purchase flow ──────────────────────────────────────────── */}
        {!isCatalogMode && (
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
                      {selectedLegacyPrice !== null ? `${selectedLegacyPrice} ₽` : '—'}
                    </span>
                  </div>
                  {paymentError && (
                    <p className="text-xs text-red-500">{paymentError}</p>
                  )}
                  <Button
                    className="w-full h-11 font-bold text-base"
                    onClick={() => paymentMutation.mutate()}
                    disabled={
                      paymentMutation.isPending ||
                      !selectedProvider ||
                      selectedLegacyPrice === null
                    }
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
        )}
      </div>
    </AppShell>
  )
}
