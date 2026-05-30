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
  getEntitlements,
  setEntitlementAutoRenew,
  getRenewalBundle,
  type PubPlan,
  type PubPlanOption,
  type AddonPlan,
  type AddonPlanOption,
  type Entitlements,
} from '@/api/subscription'
import { createPayment, type PromoApplyResponse } from '@/api/payment'
import { Copy, Check, RefreshCw, ArrowRight, Repeat2 } from 'lucide-react'
import { apiRequest } from '@/api/client'
import { useToast } from '@/hooks/useToast'

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

  // Catalog flow state — standalone and addon selections are independent so the user
  // can buy/renew a plan and add one addon in the same payment.
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

  const isCatalogMode = plans?.mode === 'catalog' && (plans.catalog_plans?.length ?? 0) > 0

  const { data: entitlements } = useQuery({
    queryKey: ['entitlements'],
    queryFn: getEntitlements,
    enabled: isCatalogMode && !!subscription,
  })

  const autoRenewMutation = useMutation({
    mutationFn: (enabled: boolean) => setAutoRenew(enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription'] }),
  })

  const entitlementAutoRenewMutation = useMutation({
    mutationFn: ({ entitlementId, enabled }: { entitlementId: number; enabled: boolean }) =>
      setEntitlementAutoRenew(entitlementId, enabled),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['entitlements'] }),
        qc.invalidateQueries({ queryKey: ['renewal-bundle'] }),
      ])
    },
    onError: (err: Error) => toast.error(err.message || t('sub_error_select')),
  })

  // Standalone is "active" when an option is chosen in this purchase; the addon is then
  // bundled at full price aligned to the standalone. Without a standalone option the addon
  // (if any) is a prorated top-up to the existing subscription.
  const standaloneActive = isCatalogMode && selectedOption !== null
  const addonActive = isCatalogMode && selectedAddonOption !== null
  const addonMode: 'bundle' | 'topup' = standaloneActive ? 'bundle' : 'topup'

  const { data: renewalBundle } = useQuery({
    queryKey: ['renewal-bundle', selectedOption?.id],
    queryFn: () => getRenewalBundle(selectedOption!.id),
    enabled: isCatalogMode && standaloneActive && !!subscription,
  })

  const discountPct = appliedPromo?.discount_percentage

  // Sum the selected standalone (with its existing-addon renewal bundle) and the selected
  // addon, then apply the promo discount to the rub total (matches backend price math).
  const computeDisplayPrice = (): { rub: number | null; stars: number | null } => {
    let rub: number | null = null
    let stars: number | null = null
    const add = (acc: number | null, v: number | null | undefined): number | null =>
      v == null ? acc : (acc ?? 0) + v

    if (standaloneActive && selectedOption) {
      rub = add(rub, renewalBundle?.has_bundle ? renewalBundle.total_price_rub : selectedOption.price_rub)
      stars = add(stars, renewalBundle?.has_bundle ? renewalBundle.total_price_stars : selectedOption.price_stars)
    }
    if (addonActive && selectedAddonOption) {
      rub = add(rub, selectedAddonOption.prorated_price_rub ?? selectedAddonOption.price_rub)
      stars = add(stars, selectedAddonOption.prorated_price_stars ?? selectedAddonOption.price_stars)
    }

    if (rub !== null && discountPct) rub = Math.round(rub * (1 - discountPct / 100))
    return { rub, stars }
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
        // Standalone (optionally bundled with one new addon)
        if (standaloneActive && selectedOption) {
          return createPayment({
            provider: selectedProvider,
            plan_option_id: selectedOption.id,
            addon_option_id: addonActive ? selectedAddonOption!.id : undefined,
            promo_code: appliedPromo?.promo_code,
          })
        }
        // Addon-only top-up to an existing subscription
        if (addonActive && selectedAddonOption) {
          return createPayment({
            provider: selectedProvider,
            plan_option_id: selectedAddonOption.id,
            promo_code: appliedPromo?.promo_code,
          })
        }
        throw new Error(t('sub_error_select'))
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
    // Reset addon — its price context (topup vs bundle) depends on the standalone choice
    setSelectedAddonPlan(null)
    setSelectedAddonOption(null)
    setSelectedProvider(null)
    setPaymentError(null)
  }

  const handleSelectStandaloneOption = (option: PubPlanOption) => {
    const wasBundle = selectedOption !== null
    setSelectedOption(option)
    // Entering bundle mode from no-standalone: any previously chosen addon was priced as a
    // top-up — clear it so it is re-picked at full (bundle) price.
    if (!wasBundle) {
      setSelectedAddonPlan(null)
      setSelectedAddonOption(null)
    }
    setSelectedProvider(null)
    setPaymentError(null)
  }

  const handleBackToPlans = () => {
    setSelectedPlan(null)
    setSelectedOption(null)
    setSelectedAddonPlan(null)
    setSelectedAddonOption(null)
    setSelectedProvider(null)
    setPaymentError(null)
  }

  const handleSelectAddon = (plan: AddonPlan, option: AddonPlanOption) => {
    // Toggle off when the same option is tapped again
    if (selectedAddonOption?.id === option.id) {
      setSelectedAddonPlan(null)
      setSelectedAddonOption(null)
    } else {
      setSelectedAddonPlan(plan)
      setSelectedAddonOption(option)
    }
    setSelectedProvider(null)
    setPaymentError(null)
  }

  const handlePlanSelect = (months: number) => {
    setSelectedMonths(months)
    setPaymentError(null)
  }

  // Determine if payment section should be visible
  const showPaymentSection =
    (isCatalogMode && (standaloneActive || addonActive)) ||
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

  // Lines describing what we're paying for (standalone and/or addon)
  const purchaseLines: { kind: 'standalone' | 'addon'; label: string }[] = (() => {
    if (!isCatalogMode) return []
    const lines: { kind: 'standalone' | 'addon'; label: string }[] = []
    if (standaloneActive && selectedPlan && selectedOption) {
      const name = isRu ? selectedPlan.name_ru : (selectedPlan.name_en ?? selectedPlan.name_ru)
      lines.push({ kind: 'standalone', label: `${name}: ${formatOptionLabel(selectedOption, isRu)}` })
    }
    if (addonActive && selectedAddonPlan && selectedAddonOption) {
      const name = isRu ? selectedAddonPlan.name_ru : (selectedAddonPlan.name_en ?? selectedAddonPlan.name_ru)
      lines.push({ kind: 'addon', label: `${name}: ${formatOptionLabel(selectedAddonOption, isRu)}` })
    }
    return lines
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

            {isCatalogMode && entitlements?.standalone ? (
              entitlements.auto_renew_available ? (
                <EntitlementAutoRenewCard
                  entitlements={entitlements}
                  lang={i18n.language}
                  t={t}
                  pending={entitlementAutoRenewMutation.isPending}
                  onToggle={(entitlementId, enabled) =>
                    entitlementAutoRenewMutation.mutate({ entitlementId, enabled })
                  }
                />
              ) : null
            ) : subscription.auto_renew_available ? (
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
            ) : null}
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

            {/* Addon section — available when the user has an active subscription (top-up)
                or has chosen a standalone plan in this purchase (bundle, full price). */}
            {(subscription || standaloneActive) && (
              <AddonSelector
                mode={addonMode}
                selectedOptionId={selectedAddonOption?.id ?? null}
                onSelect={handleSelectAddon}
              />
            )}

            {/* Payment card */}
            {showPaymentSection && (
              <Card className="border-[hsl(var(--border))] overflow-hidden">
                {/* What we're paying for */}
                {purchaseLines.length > 0 && (
                  <div className="px-5 pt-5 pb-0">
                    {purchaseLines.map((line) => (
                      <div key={line.kind} className="mb-4">
                        <p className="text-xs text-[hsl(var(--muted-foreground))] font-medium uppercase tracking-wide mb-1">
                          {line.kind === 'addon' ? t('catalog_addon_label') : t('catalog_standalone_label')}
                        </p>
                        <p className="text-sm font-semibold">{line.label}</p>
                      </div>
                    ))}
                    {standaloneActive && renewalBundle?.has_bundle && (
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mb-4">
                        {t('sub_bundle_includes', { count: renewalBundle.addons.length })}
                      </p>
                    )}
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

function EntitlementAutoRenewCard({
  entitlements,
  lang,
  t,
  pending,
  onToggle,
}: {
  entitlements: Entitlements
  lang: string
  t: (key: string, opts?: Record<string, unknown>) => string
  pending: boolean
  onToggle: (entitlementId: number, enabled: boolean) => void
}) {
  const items = [
    entitlements.standalone,
    ...entitlements.addons.filter((addon) => addon.is_active),
  ].filter(Boolean)

  if (!items.length) return null

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-2">
          <Repeat2 size={16} className="mt-0.5 text-[hsl(var(--primary))]" />
          <div>
            <p className="font-medium text-sm">{t('sub_auto_renew')}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
              {t('sub_entitlement_auto_renew_desc')}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {items.map((item) => {
            if (!item) return null
            const name = lang === 'ru' ? item.plan_name_ru : (item.plan_name_en ?? item.plan_name_ru)
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--border))] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {item.plan_kind === 'addon'
                      ? t('catalog_addon_label')
                      : t('catalog_standalone_label')}
                  </p>
                </div>
                <Button
                  variant={item.auto_renew_enabled ? 'default' : 'outline'}
                  size="sm"
                  disabled={pending}
                  onClick={() => onToggle(item.id, !item.auto_renew_enabled)}
                  className="shrink-0"
                >
                  {item.auto_renew_enabled ? t('sub_auto_on') : t('sub_auto_off')}
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
