import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
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
import { useTranslation } from 'react-i18next'

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

export function AdminPaymentsPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [status, setStatus] = useState('')
  const [provider, setProvider] = useState('')

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin', 'payments', 'stats'],
    queryFn: () => getPaymentStats(30),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'payments', 'list', page, pageSize, status, provider],
    queryFn: () =>
      getAdminPayments({
        page,
        page_size: pageSize,
        status: status || undefined,
        provider: provider || undefined,
      }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })

  const chartData = (stats?.daily_chart ?? []).map((d) => ({
    ...d,
    date: d.date.slice(5), // "MM-DD"
  }))

  const statusOptions = [
    { value: '', label: t('admin_payments_all_statuses') },
    { value: 'succeeded', label: t('admin_payments_status_succeeded') },
    { value: 'pending', label: t('admin_payments_status_pending') },
    { value: 'canceled', label: t('admin_payments_status_canceled') },
    { value: 'failed', label: t('admin_payments_status_failed') },
  ]

  const columns: Column<AdminPaymentListItem>[] = [
    {
      key: 'payment_id',
      header: '#',
      size: 70,
      render: (r) => <span className="text-[hsl(var(--muted-foreground))]">#{r.payment_id}</span>,
    },
    {
      key: 'user',
      header: t('admin_user'),
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
      header: t('admin_amount'),
      size: 130,
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-semibold">{fmt(r.amount, r.currency)}</span>
          {r.discount_applied != null && r.discount_applied > 0 && (
            <span className="text-xs text-green-600">
              {t('admin_payments_discount', { amount: fmt(r.discount_applied, r.currency) })}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: t('admin_status'),
      size: 120,
      render: (r) => (
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {r.status}
        </span>
      ),
    },
    { key: 'provider', header: t('admin_provider'), size: 110, render: (r) => r.provider ?? '—' },
    {
      key: 'months',
      header: t('admin_period'),
      size: 80,
      render: (r) => r.subscription_duration_months ? `${r.subscription_duration_months} ${t('admin_month_short')}` : '—',
    },
    {
      key: 'promo',
      header: t('admin_nav_promos'),
      size: 110,
      render: (r) => r.promo_code ? <span className="font-mono text-xs bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded">{r.promo_code}</span> : '—',
    },
    {
      key: 'created_at',
      header: t('admin_date'),
      size: 130,
      render: (r) => <span className="text-xs text-[hsl(var(--muted-foreground))]">{fmtDate(r.created_at)}</span>,
    },
  ]

  return (
    <div className="px-4 py-6 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('admin_payments_title')}</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          {t('admin_payments_subtitle')}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatsCard
          title={t('admin_dashboard_today')}
          value={statsLoading ? '...' : fmt(stats?.today_revenue ?? 0)}
          subtitle={t('admin_payments_count', { count: stats?.today_payments_count ?? 0 })}
          icon={CreditCard}
        />
        <StatsCard
          title={t('admin_dashboard_7days')}
          value={statsLoading ? '...' : fmt(stats?.week_revenue ?? 0)}
          icon={Calendar}
        />
        <StatsCard
          title={t('admin_payments_chart_title')}
          value={statsLoading ? '...' : fmt(stats?.month_revenue ?? 0)}
          icon={TrendingUp}
        />
        <StatsCard
          title={t('admin_filter_all')}
          value={statsLoading ? '...' : fmt(stats?.all_time_revenue ?? 0)}
          icon={DollarSign}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily chart */}
        <div className="lg:col-span-2 bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4">
            {t('admin_payments_chart_title')}
          </h2>
          {statsLoading ? (
            <div className="h-32 sm:h-40 flex items-center justify-center text-[hsl(var(--muted-foreground))]">
              {t('admin_loading')}
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-32 sm:h-40 flex items-center justify-center text-[hsl(var(--muted-foreground))] text-sm">
              {t('admin_payments_no_period_data')}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={130} className="sm:!h-40">
              <BarChart data={chartData} margin={{ top: 2, right: 2, left: -26, bottom: 0 }}>
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
                  formatter={(value) => [fmt(Number(value ?? 0)), t('admin_payments_income')]}
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
        <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4">
            {t('admin_payments_by_provider')}
          </h2>
          {statsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 bg-[hsl(var(--muted))] rounded animate-pulse" />
              ))}
            </div>
          ) : (stats?.by_provider ?? []).length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{t('admin_no_data')}</p>
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
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">{t('admin_payments_count', { count: p.count })}</div>
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
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder={t('admin_payments_provider_placeholder')}
          value={provider}
          onChange={(e) => { setProvider(e.target.value); setPage(0) }}
          className="h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.3)]"
        />
        {(status || provider) && (
          <button
            onClick={() => { setStatus(''); setProvider(''); setPage(0) }}
            className="h-9 px-3 rounded-lg border border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
          >
            {t('admin_reset')}
          </button>
        )}
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={data?.items ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize)
          setPage(0)
        }}
        isLoading={isLoading}
        emptyMessage={t('admin_payments_empty')}
        keyExtractor={(r) => r.payment_id}
      />
    </div>
  )
}
