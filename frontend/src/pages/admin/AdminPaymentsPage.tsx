import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  CreditCard,
  TrendingUp,
  Calendar,
  DollarSign,
} from 'lucide-react'
import { StatsCard } from '@/components/admin/StatsCard'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { getAdminPayments, getPaymentStats, type AdminPaymentListItem } from '@/api/admin/payments'

const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'succeeded', label: 'Успешные' },
  { value: 'pending', label: 'Ожидание' },
  { value: 'canceled', label: 'Отменённые' },
  { value: 'failed', label: 'Неуспешные' },
]

const STATUS_BADGE: Record<string, string> = {
  succeeded: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  canceled: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-100 text-red-700',
  processing: 'bg-blue-100 text-blue-700',
}

function fmt(amount: number, currency = 'RUB') {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

function fmtDate(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const COLUMNS: Column<AdminPaymentListItem>[] = [
  {
    key: 'payment_id',
    header: '#',
    size: 70,
    render: (r) => <span className="text-[hsl(var(--muted-foreground))]">#{r.payment_id}</span>,
  },
  {
    key: 'user',
    header: 'Пользователь',
    size: 160,
    render: (r) => (
      <div className="flex flex-col">
        <span className="font-medium">{r.first_name ?? '—'}</span>
        {r.username && (
          <span className="text-xs text-[hsl(var(--muted-foreground))]">@{r.username}</span>
        )}
      </div>
    ),
  },
  {
    key: 'amount',
    header: 'Сумма',
    size: 130,
    render: (r) => (
      <div className="flex flex-col">
        <span className="font-semibold">{fmt(r.amount, r.currency)}</span>
        {r.discount_applied != null && r.discount_applied > 0 && (
          <span className="text-xs text-green-600">
            −{fmt(r.discount_applied, r.currency)}
          </span>
        )}
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Статус',
    size: 120,
    render: (r) => (
      <span
        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
          STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-600'
        }`}
      >
        {r.status}
      </span>
    ),
  },
  {
    key: 'provider',
    header: 'Провайдер',
    size: 110,
    render: (r) => r.provider ?? '—',
  },
  {
    key: 'months',
    header: 'Срок',
    size: 80,
    render: (r) =>
      r.subscription_duration_months ? `${r.subscription_duration_months} мес.` : '—',
  },
  {
    key: 'promo',
    header: 'Промокод',
    size: 110,
    render: (r) =>
      r.promo_code ? (
        <span className="font-mono text-xs bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded">
          {r.promo_code}
        </span>
      ) : (
        '—'
      ),
  },
  {
    key: 'created_at',
    header: 'Дата',
    size: 130,
    render: (r) => (
      <span className="text-xs text-[hsl(var(--muted-foreground))]">{fmtDate(r.created_at)}</span>
    ),
  },
]

export function AdminPaymentsPage() {
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState('')
  const [provider, setProvider] = useState('')

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin', 'payments', 'stats'],
    queryFn: () => getPaymentStats(30),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'payments', 'list', page, status, provider],
    queryFn: () =>
      getAdminPayments({
        page,
        page_size: 20,
        status: status || undefined,
        provider: provider || undefined,
      }),
    staleTime: 30_000,
  })

  const chartData = (stats?.daily_chart ?? []).map((d) => ({
    ...d,
    date: d.date.slice(5), // "MM-DD"
  }))

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Платежи</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          История транзакций и статистика доходов
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Сегодня"
          value={statsLoading ? '...' : fmt(stats?.today_revenue ?? 0)}
          subtitle={`${stats?.today_payments_count ?? 0} платежей`}
          icon={CreditCard}
        />
        <StatsCard
          title="За 7 дней"
          value={statsLoading ? '...' : fmt(stats?.week_revenue ?? 0)}
          icon={Calendar}
        />
        <StatsCard
          title="За 30 дней"
          value={statsLoading ? '...' : fmt(stats?.month_revenue ?? 0)}
          icon={TrendingUp}
        />
        <StatsCard
          title="Всего"
          value={statsLoading ? '...' : fmt(stats?.all_time_revenue ?? 0)}
          icon={DollarSign}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily chart */}
        <div className="lg:col-span-2 bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5">
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4">
            Доход за 30 дней
          </h2>
          {statsLoading ? (
            <div className="h-40 flex items-center justify-center text-[hsl(var(--muted-foreground))]">
              Загрузка...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-[hsl(var(--muted-foreground))] text-sm">
              Нет данных за период
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value) => [fmt(Number(value ?? 0)), 'Доход']}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: '1px solid hsl(var(--border))',
                    background: 'hsl(var(--card))',
                  }}
                />
                <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By provider */}
        <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5">
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4">
            По провайдерам
          </h2>
          {statsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 bg-[hsl(var(--muted))] rounded animate-pulse" />
              ))}
            </div>
          ) : (stats?.by_provider ?? []).length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Нет данных</p>
          ) : (
            <div className="flex flex-col gap-2">
              {stats!.by_provider.map((p) => (
                <div
                  key={p.provider}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="capitalize font-medium">{p.provider}</span>
                  <div className="text-right">
                    <div className="font-semibold">{fmt(p.amount)}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">{p.count} платежей</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(0) }}
          className="h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.3)]"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Провайдер..."
          value={provider}
          onChange={(e) => { setProvider(e.target.value); setPage(0) }}
          className="h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.3)]"
        />
        {(status || provider) && (
          <button
            onClick={() => { setStatus(''); setProvider(''); setPage(0) }}
            className="h-9 px-3 rounded-lg border border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
          >
            Сбросить
          </button>
        )}
      </div>

      {/* Table */}
      <DataTable
        columns={COLUMNS}
        data={data?.items ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={20}
        onPageChange={setPage}
        isLoading={isLoading}
        emptyMessage="Платежи не найдены"
        keyExtractor={(r) => r.payment_id}
      />
    </div>
  )
}
