import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, ShoppingCart, Gift } from 'lucide-react'

interface ReferralStatsProps {
  invitedCount: number
  purchasedCount: number
  bonusDaysPerMonth: Record<string, number> | null
}

function monthsLabel(months: number, isRu: boolean): string {
  if (!isRu) return months === 1 ? 'month' : 'months'
  if (months === 1) return 'месяц'
  if (months < 5) return 'месяца'
  return 'месяцев'
}

export function ReferralStats({ invitedCount, purchasedCount, bonusDaysPerMonth }: ReferralStatsProps) {
  const { t, i18n } = useTranslation()
  const isRu = i18n.language === 'ru'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[hsl(var(--primary)/0.1)] rounded-lg">
                <Users size={18} className="text-[hsl(var(--primary))]" />
              </div>
              <div>
                <p className="text-2xl font-bold">{invitedCount}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{t('referral_invited')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <ShoppingCart size={18} className="text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{purchasedCount}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{t('referral_purchased')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {bonusDaysPerMonth && Object.keys(bonusDaysPerMonth).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gift size={18} className="text-[hsl(var(--primary))]" />
              {t('referral_bonus_title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(bonusDaysPerMonth).map(([months, days]) => (
                <div
                  key={months}
                  className="flex justify-between items-center bg-[hsl(var(--muted))] rounded-lg px-3 py-2 text-sm"
                >
                  <span className="text-[hsl(var(--muted-foreground))]">
                    {months} {monthsLabel(Number(months), isRu)}
                  </span>
                  <span className="font-semibold text-[hsl(var(--primary))]">
                    +{days} {t('referral_days_suffix')}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
