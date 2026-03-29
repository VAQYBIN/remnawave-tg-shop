import { useTranslation } from 'react-i18next'
import type { Plan } from '@/api/subscription'
import { cn } from '@/lib/utils'

interface PlanSelectorProps {
  plans: Plan[]
  selectedMonths: number | null
  discountPercentage?: number
  onSelect: (months: number) => void
}

function monthsLabel(months: number, ru: boolean): string {
  if (!ru) return months === 1 ? 'month' : 'months'
  if (months === 1) return 'месяц'
  if (months < 5) return 'месяца'
  return 'месяцев'
}

export function PlanSelector({ plans, selectedMonths, discountPercentage, onSelect }: PlanSelectorProps) {
  const { i18n } = useTranslation()
  const isRu = i18n.language === 'ru'

  const timePlans = plans.filter((p) => p.kind === 'time')

  const basePricePerMonth = (() => {
    const first = timePlans[0]
    return first?.kind === 'time' ? first.price_rub : null
  })()

  const bestMonths = timePlans.reduce<number | null>((best, p) => {
    if (p.kind !== 'time') return best
    return best === null || p.months > best ? p.months : best
  }, null)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {timePlans.map((plan) => {
        if (plan.kind !== 'time') return null

        const selected = selectedMonths === plan.months
        const isBest = plan.months === bestMonths && timePlans.length > 1

        const savingsPct =
          plan.months > 1 && basePricePerMonth
            ? Math.round((1 - plan.price_rub / plan.months / basePricePerMonth) * 100)
            : 0

        const pricePerMonth = Math.round(plan.price_rub / plan.months)
        const displayTotal = discountPercentage
          ? Math.round(plan.price_rub * (1 - discountPercentage / 100))
          : plan.price_rub
        const displayPerMonth = discountPercentage
          ? Math.round(pricePerMonth * (1 - discountPercentage / 100))
          : pricePerMonth

        const savingsRub = basePricePerMonth
          ? basePricePerMonth * plan.months - plan.price_rub
          : 0

        return (
          <div
            key={plan.months}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(plan.months)}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(plan.months)}
            className={cn(
              'relative rounded-xl border-2 p-4 cursor-pointer transition-all select-none',
              selected
                ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/8%)] shadow-md'
                : 'border-[hsl(var(--border))] bg-white hover:border-[hsl(var(--primary)/50%)] hover:shadow-sm',
            )}
          >
            {/* Badge row */}
            <div className="h-5 mb-2">
              {isBest ? (
                <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-[hsl(var(--primary))] text-white">
                  {isRu ? 'Лучший выбор' : 'Best value'}
                </span>
              ) : savingsPct > 0 ? (
                <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-[hsl(var(--primary)/15%)] text-[hsl(var(--primary))]">
                  -{savingsPct}%
                </span>
              ) : null}
            </div>

            {/* Price per month */}
            <div className="flex items-baseline gap-1 leading-none mb-1">
              <span className={cn(
                'text-2xl font-extrabold',
                selected ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))]',
              )}>
                {displayPerMonth}
              </span>
              <span className="text-xs text-[hsl(var(--muted-foreground))] font-medium">
                {isRu ? '₽/мес' : '₽/mo'}
              </span>
            </div>

            {/* Duration */}
            <p className="text-xs text-[hsl(var(--muted-foreground))] mb-2">
              {plan.months} {monthsLabel(plan.months, isRu)}
            </p>

            {/* Total */}
            <p className="text-xs font-semibold text-[hsl(var(--foreground))]">
              {displayTotal} ₽ {isRu ? 'итого' : 'total'}
            </p>

            {/* Savings */}
            {savingsRub > 0 && (
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">
                {isRu ? `экономия ${savingsRub} ₽` : `save ${savingsRub} ₽`}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
