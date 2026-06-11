import { useTranslation } from 'react-i18next'
import type { PubPlan } from '@/api/subscription'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Check } from 'lucide-react'

interface TariffSelectorProps {
  plans: PubPlan[]
  selectedPlanId: number | null
  onSelect: (plan: PubPlan) => void
}

function getPlanName(plan: PubPlan, lang: string): string {
  return lang === 'ru' ? plan.name_ru : (plan.name_en ?? plan.name_ru)
}

function getPlanDesc(plan: PubPlan, lang: string): string | null {
  return lang === 'ru' ? plan.description_ru : (plan.description_en ?? plan.description_ru)
}

function getMinPrice(plan: PubPlan): { rub: number | null; stars: number | null } {
  const opts = plan.options
  const rubs = opts.filter((o) => o.price_rub !== null).map((o) => o.price_rub!)
  const stars = opts.filter((o) => o.price_stars !== null).map((o) => o.price_stars!)
  return {
    rub: rubs.length ? Math.min(...rubs) : null,
    stars: stars.length ? Math.min(...stars) : null,
  }
}

export function TariffSelector({ plans, selectedPlanId, onSelect }: TariffSelectorProps) {
  const { i18n, t } = useTranslation()
  const lang = i18n.language

  return (
    <div className="space-y-3">
      {plans.map((plan) => {
        const selected = selectedPlanId === plan.id
        const { rub, stars } = getMinPrice(plan)
        const name = getPlanName(plan, lang)
        const desc = getPlanDesc(plan, lang)
        const isFree = plan.is_trial || (rub === 0 && stars === null)

        return (
          <div
            key={plan.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(plan)}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(plan)}
            className={cn(
              'relative rounded-xl border-2 p-4 cursor-pointer transition-all select-none',
              selected
                ? 'border-[hsl(var(--primary))] bg-[color-mix(in_srgb,hsl(var(--primary))_6%,white)] shadow-[var(--shadow-md)]'
                : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[color-mix(in_srgb,hsl(var(--primary))_45%,transparent)] hover:shadow-[var(--shadow-sm)]',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-base">{name}</span>
                  {plan.is_trial && (
                    <Badge variant="success">{t('catalog_trial')}</Badge>
                  )}
                  {selected && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </div>
                {desc && (
                  <p className="text-xs text-[hsl(var(--muted-foreground))] leading-snug mb-2 line-clamp-2">
                    {desc}
                  </p>
                )}
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {plan.billing_model === 'time'
                    ? t('catalog_billing_time')
                    : plan.billing_model === 'traffic'
                    ? t('catalog_billing_traffic')
                    : t('catalog_billing_hybrid')}
                </Badge>
              </div>

              <div className="shrink-0 text-right">
                {isFree ? (
                  <span className="text-base font-extrabold text-[var(--success)]">{t('catalog_free')}</span>
                ) : rub !== null ? (
                  <>
                    <p className={cn(
                      'text-lg font-extrabold',
                      selected ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))]',
                    )}>
                      {t('catalog_from_rub', { amount: rub })}
                    </p>
                    {stars !== null && (
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {t('catalog_stars_price', { stars: Math.min(...plan.options.filter(o => o.price_stars !== null).map(o => o.price_stars!)) })}
                      </p>
                    )}
                  </>
                ) : stars !== null ? (
                  <p className="text-base font-extrabold">⭐ {stars}</p>
                ) : null}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
