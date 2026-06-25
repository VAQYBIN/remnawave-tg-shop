import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { getAddons, getAddonsCatalog, type AddonPlan, type AddonPlanOption } from '@/api/subscription'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Loader2, Check } from 'lucide-react'

interface AddonSelectorProps {
  selectedOptionId: number | null
  onSelect: (plan: AddonPlan, option: AddonPlanOption) => void
  // 'bundle': bought together with a standalone plan in this purchase — full price,
  //           period aligned to the standalone (uses /subscription/addons/catalog).
  // 'topup':  added to an already-active subscription — prorated (uses /subscription/addons).
  mode?: 'bundle' | 'topup'
}

function formatDuration(option: AddonPlanOption, isRu: boolean): string {
  if (option.duration_months) {
    const n = option.duration_months
    if (isRu) {
      if (n === 1) return `${n} мес.`
      return `${n} мес.`
    }
    return `${n} mo.`
  }
  if (option.duration_days) {
    const n = option.duration_days
    return isRu ? `${n} дн.` : `${n} d.`
  }
  return ''
}

export function AddonSelector({ selectedOptionId, onSelect, mode = 'topup' }: AddonSelectorProps) {
  const { i18n, t } = useTranslation()
  const isRu = i18n.language === 'ru'
  const lang = i18n.language

  const { data: addonsList, isLoading } = useQuery({
    queryKey: ['addons', mode],
    queryFn: mode === 'bundle' ? getAddonsCatalog : getAddons,
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] py-2">
        <Loader2 size={14} className="animate-spin" />
        <span>{t('loading')}</span>
      </div>
    )
  }

  if (!addonsList?.addons?.length) return null

  const standaloneEndsAt = addonsList.standalone_ends_at
  const formattedEnd = standaloneEndsAt
    ? new Date(standaloneEndsAt).toLocaleDateString(isRu ? 'ru-RU' : 'en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('catalog_addons_title')}</CardTitle>
        {formattedEnd && (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {t('catalog_addon_until', { date: formattedEnd })}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {addonsList.addons.map((addon) => {
          const name = lang === 'ru' ? addon.name_ru : (addon.name_en ?? addon.name_ru)
          const desc = lang === 'ru' ? addon.description_ru : (addon.description_en ?? addon.description_ru)

          return (
            <div key={addon.id} className="space-y-2">
              <div>
                <p className="font-medium text-sm">{name}</p>
                {desc && (
                  <p className="text-xs text-[hsl(var(--muted-foreground))] leading-snug">{desc}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {addon.options.map((option) => {
                  const selected = selectedOptionId === option.id
                  const duration = formatDuration(option, isRu)
                  const rub = option.prorated_price_rub ?? option.price_rub
                  const stars = option.prorated_price_stars ?? option.price_stars
                  const traffic = option.traffic_unlimited
                    ? t('catalog_unlimited')
                    : option.traffic_gb != null
                    ? `${option.traffic_gb} ГБ`
                    : ''

                  return (
                    <div
                      key={option.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelect(addon, option)}
                      onKeyDown={(e) => e.key === 'Enter' && onSelect(addon, option)}
                      className={cn(
                        'relative rounded-xl border-2 p-3 cursor-pointer transition-all select-none space-y-0.5',
                        selected
                          ? 'border-[hsl(var(--primary))] bg-[color-mix(in_srgb,hsl(var(--primary))_6%,white)] shadow-[var(--shadow-md)]'
                          : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[color-mix(in_srgb,hsl(var(--primary))_45%,transparent)] hover:shadow-[var(--shadow-sm)]',
                      )}
                    >
                      {selected && (
                        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
                          <Check size={10} strokeWidth={3} />
                        </span>
                      )}
                      {duration && <p className="text-xs font-semibold">{duration}</p>}
                      {traffic && (
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">{traffic}</p>
                      )}
                      {rub != null && (
                        <p className={cn(
                          'text-sm font-bold mt-1',
                          selected ? 'text-[hsl(var(--primary))]' : '',
                        )}>
                          {Math.round(rub)} ₽
                        </p>
                      )}
                      {stars != null && (
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">⭐ {stars}</p>
                      )}
                      {mode === 'topup' && (
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                          {t('catalog_addon_prorated')}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
