import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getPayments, type Payment } from '@/api/payment'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const LIMIT = 10

function PaymentRow({ payment }: { payment: Payment }) {
  const { t, i18n } = useTranslation()

  const STATUS_LABELS: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    succeeded: { label: t('payments_succeeded'), variant: 'success' },
    pending: { label: t('payments_pending'), variant: 'warning' },
    canceled: { label: t('payments_canceled'), variant: 'danger' },
    refunded: { label: t('payments_refunded'), variant: 'info' },
  }

  function getStatusBadge(status: string): { label: string; variant: BadgeProps['variant'] } {
    for (const [key, val] of Object.entries(STATUS_LABELS)) {
      if (status.includes(key)) return val
    }
    return { label: status, variant: 'secondary' }
  }

  const badge = getStatusBadge(payment.status)
  const locale = i18n.language === 'ru' ? 'ru-RU' : 'en-US'
  const formattedDate = new Date(payment.created_at).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="flex items-center justify-between py-3 border-b border-[hsl(var(--border))] last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">
          {payment.description || `${payment.subscription_duration_months} ${t('payments_months_suffix')}`}
        </p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {formattedDate} · {payment.provider}
        </p>
      </div>
      <div className="ml-4 text-right shrink-0">
        <p className="text-sm font-semibold">
          {payment.amount} {payment.currency}
        </p>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
    </div>
  )
}

export function PaymentHistoryPage() {
  const [page, setPage] = useState(1)
  const { t } = useTranslation()

  const { data, isLoading } = useQuery({
    queryKey: ['payments', page, LIMIT],
    queryFn: () => getPayments(page, LIMIT),
  })

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('payments_title')}</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isLoading
                ? t('payments_loading')
                : data
                ? t('payments_count', { total: data.total })
                : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-[hsl(var(--muted))] rounded animate-pulse" />
                ))}
              </div>
            ) : data && data.items.length > 0 ? (
              <div>
                {data.items.map((p) => (
                  <PaymentRow key={p.payment_id} payment={p} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-8">
                {t('payments_empty')}
              </p>
            )}
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
            >
              <ChevronLeft size={16} />
            </Button>
            <span className="text-sm text-[hsl(var(--muted-foreground))]">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page === totalPages}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  )
}
