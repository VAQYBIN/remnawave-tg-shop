import { useTranslation } from 'react-i18next'
import type { PubPlan, PubPlanOption } from '@/api/subscription'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Check } from 'lucide-react'

interface TariffOptionSelectorProps {
  plan: PubPlan
  selectedOptionId: number | null
  discountPercentage?: number
  onSelect: (option: PubPlanOption) => void
  onBack: () => void
}

function formatDuration(option: PubPlanOption, isRu: boolean): string {
  if (option.duration_months) {
    const n = option.duration_months
    if (isRu) {
      if (n === 1) return `${n} месяц`
      if (n < 5) return `${n} месяца`
      return `${n} месяцев`
    }
    return `${n} ${n === 1 ? 'month' : 'months'}`
  }
  if (option.duration_days) {
    const n = option.duration_days
    return isRu ? `${n} дн.` : `${n} d.`
  }
  return ''
}

function formatTraffic(option: PubPlanOption, unlimitedLabel: string): string {
  if (option.traffic_unlimited) return unlimitedLabel
  if (option.traffic_gb != null) return `${option.traffic_gb} ГБ`
  return ''
}

export function TariffOptionSelector({
  plan,
  selectedOptionId,
  discountPercentage,
  onSelect,
  onBack,
}: TariffOptionSelectorProps) {
  const { i18n, t } = useTranslation()
  const isRu = i18n.language === 'ru'

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2 -ml-2">
        <ArrowLeft size={15} className="mr-1" />
        {t('catalog_back_to_tariffs')}
      </Button>

      <div className="grid grid-cols-2 gap-3">
        {plan.options.map((option) => {
          const selected = selectedOptionId === option.id
          const duration = formatDuration(option, isRu)
          const traffic = formatTraffic(option, t('catalog_unlimited'))
          const isFree = option.price_rub === 0 && option.price_stars === null

          const rawRub = option.price_rub
          const displayRub =
            rawRub !== null && discountPercentage
              ? Math.round(rawRub * (1 - discountPercentage / 100))
              : rawRub
          const hasDiscount = discountPercentage != null && discountPercentage > 0 && rawRub !== null && rawRub > 0

          return (
            <div
              key={option.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(option)}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(option)}
              className={cn(
                'relative rounded-xl border-2 p-4 cursor-pointer transition-all select-none space-y-1',
                selected
                  ? 'border-[hsl(var(--primary))] bg-[color-mix(in_srgb,hsl(var(--primary))_6%,white)] shadow-[var(--shadow-md)]'
                  : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[color-mix(in_srgb,hsl(var(--primary))_45%,transparent)] hover:shadow-[var(--shadow-sm)]',
              )}
            >
              {selected && (
                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
              {duration && (
                <p className="font-semibold text-sm leading-tight">{duration}</p>
              )}
              {traffic && (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{traffic}</p>
              )}

              <div className="pt-1">
                {isFree ? (
                  <span className="text-lg font-extrabold text-[var(--success)]">{t('catalog_free')}</span>
                ) : displayRub !== null ? (
                  <div className="flex items-baseline gap-1.5">
                    <span className={cn(
                      'text-xl font-extrabold',
                      selected ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))]',
                    )}>
                      {displayRub} ₽
                    </span>
                    {hasDiscount && (
                      <span className="text-xs text-[hsl(var(--muted-foreground))] line-through">
                        {rawRub} ₽
                      </span>
                    )}
                  </div>
                ) : null}

                {option.price_stars != null && (
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                    {t('catalog_stars_price', { stars: option.price_stars })}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
