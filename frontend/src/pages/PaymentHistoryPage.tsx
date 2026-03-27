import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getPayments, type Payment } from '@/api/payment'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const LIMIT = 10

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  succeeded: { label: 'Успешно', className: 'bg-green-100 text-green-700' },
  pending: { label: 'Ожидание', className: 'bg-yellow-100 text-yellow-700' },
  canceled: { label: 'Отменён', className: 'bg-red-100 text-red-700' },
  refunded: { label: 'Возврат', className: 'bg-blue-100 text-blue-700' },
}

function getStatusBadge(status: string) {
  for (const [key, val] of Object.entries(STATUS_LABELS)) {
    if (status.includes(key)) return val
  }
  return { label: status, className: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]' }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function PaymentRow({ payment }: { payment: Payment }) {
  const badge = getStatusBadge(payment.status)

  return (
    <div className="flex items-center justify-between py-3 border-b border-[hsl(var(--border))] last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">
          {payment.description || `${payment.subscription_duration_months} мес.`}
        </p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {formatDate(payment.created_at)} · {payment.provider}
        </p>
      </div>
      <div className="ml-4 text-right shrink-0">
        <p className="text-sm font-semibold">
          {payment.amount} {payment.currency}
        </p>
        <Badge className={`text-xs ${badge.className}`}>{badge.label}</Badge>
      </div>
    </div>
  )
}

export function PaymentHistoryPage() {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['payments', page],
    queryFn: () => getPayments(page, LIMIT),
  })

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">История платежей</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {data ? `${data.total} платежей` : 'Загрузка...'}
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
                Платежей пока нет
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
