import { useTranslation } from 'react-i18next'
import { type Subscription } from '@/api/subscription'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface SubscriptionCardProps {
  subscription: Subscription
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} ГБ`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} МБ`
  return `${bytes} Б`
}

function daysLeft(endDate: string): number {
  const diff = new Date(endDate).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 86_400_000))
}

export function SubscriptionCard({ subscription: sub }: SubscriptionCardProps) {
  const { t, i18n } = useTranslation()
  const days = daysLeft(sub.end_date)
  const isExpiring = days <= 3

  const formattedDate = new Date(sub.end_date).toLocaleDateString(
    i18n.language === 'ru' ? 'ru-RU' : 'en-US',
    { day: 'numeric', month: 'long', year: 'numeric' },
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{t('subcard_title')}</CardTitle>
          <Badge dot variant={sub.is_active ? 'success' : 'danger'}>
            {sub.is_active ? t('subcard_active') : t('subcard_inactive')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-[hsl(var(--muted-foreground))]">{t('subcard_valid_until')}</span>
          <span className={`font-medium ${isExpiring ? 'text-[var(--danger)]' : ''}`}>
            {formattedDate}
          </span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-[hsl(var(--muted-foreground))]">{t('subcard_days_left')}</span>
          <span className={`font-bold ${isExpiring ? 'text-[var(--danger)]' : 'text-[hsl(var(--primary))]'}`}>
            {days} {t('subcard_days_suffix')}
          </span>
        </div>

        {sub.traffic_used_bytes != null && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-[hsl(var(--muted-foreground))]">{t('subcard_traffic')}</span>
              <span className="font-medium">
                {formatBytes(sub.traffic_used_bytes)}
                {sub.traffic_limit_bytes ? ` / ${formatBytes(sub.traffic_limit_bytes)}` : ' / ∞'}
              </span>
            </div>
            {sub.traffic_limit_bytes ? (
              (() => {
                const pct = Math.min(100, (sub.traffic_used_bytes! / sub.traffic_limit_bytes) * 100)
                const color = pct >= 90 ? 'var(--danger)' : pct >= 75 ? 'var(--warning)' : 'hsl(var(--primary))'
                return (
                  <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct.toFixed(1)}%`, background: color }}
                    />
                  </div>
                )
              })()
            ) : (
              <div className="h-2 rounded-full bg-[hsl(var(--muted))]" />
            )}
          </div>
        )}

        {sub.auto_renew_enabled && sub.auto_renew_available && (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {t('subcard_auto_renew')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
