import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { Plan } from '@/api/subscription'
import { cn } from '@/lib/utils'

interface PlanSelectorProps {
  plans: Plan[]
  selectedMonths: number | null
  discountPercentage?: number
  onSelect: (months: number) => void
}

export function PlanSelector({ plans, selectedMonths, discountPercentage, onSelect }: PlanSelectorProps) {
  const basePricePerMonth = (() => {
    const first = plans.find((p) => p.kind === 'time')
    return first?.kind === 'time' ? first.price_rub : null
  })()

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {plans.map((plan) => {
        if (plan.kind !== 'time') return null

        const selected = selectedMonths === plan.months
        const savingsDiscount =
          plan.months > 1 && basePricePerMonth
            ? Math.round((1 - plan.price_rub / plan.months / basePricePerMonth) * 100)
            : 0

        const displayPrice = discountPercentage
          ? Math.round(plan.price_rub * (1 - discountPercentage / 100))
          : plan.price_rub

        const monthLabel =
          plan.months === 1 ? 'месяц' : plan.months < 5 ? 'месяца' : 'месяцев'

        return (
          <Card
            key={plan.months}
            className={cn(
              'text-center cursor-pointer transition-all hover:shadow-md',
              selected
                ? 'border-[hsl(var(--primary))] ring-2 ring-[hsl(var(--primary))] shadow-md'
                : 'hover:border-[hsl(var(--primary)/50%)]',
            )}
            onClick={() => onSelect(plan.months)}
          >
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-[hsl(var(--primary))]">{plan.months}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{monthLabel}</p>
              <p className="text-sm font-semibold mt-2">
                {discountPercentage ? (
                  <>
                    <span className="line-through text-[hsl(var(--muted-foreground))] mr-1 text-xs">
                      {plan.price_rub} ₽
                    </span>
                    <span className="text-green-600">{displayPrice} ₽</span>
                  </>
                ) : (
                  `${plan.price_rub} ₽`
                )}
              </p>
              <div className="flex justify-center gap-1 flex-wrap mt-1">
                {savingsDiscount > 0 && (
                  <Badge className="text-xs bg-green-100 text-green-700 hover:bg-green-100">
                    -{savingsDiscount}%
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
