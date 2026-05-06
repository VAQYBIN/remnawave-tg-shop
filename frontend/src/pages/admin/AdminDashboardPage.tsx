import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Users,
  CreditCard,
  Activity,
  TrendingUp,
  UserPlus,
  Banknote,
  Clock,
  ServerCrash,
} from 'lucide-react'
import { getDashboard } from '@/api/admin'
import { getPanelNodes } from '@/api/admin/panel'
import { getBool, getString } from './panel-utils'
import { StatsCard } from '@/components/admin/StatsCard'
import { useTranslation } from 'react-i18next'

const PROVIDER_LABELS: Record<string, string> = {
  yookassa: 'admin_provider_yookassa',
  freekassa: 'FreeKassa',
  cryptopay: 'CryptoPay',
  platega: 'Platega',
  severpay: 'SeverPay',
  stars: 'Stars',
}

function fmt(n: number): string {
  return n.toLocaleString('ru-RU')
}

function fmtCurrency(amount: number, currency = 'RUB'): string {
  return amount.toLocaleString('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  })
}

function pluralRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10

  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

function pluralKey(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return many
  if (last > 1 && last < 5) return few
  if (last === 1) return one
  return many
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
        {title}
      </h2>
      {children}
    </div>
  )
}

export function AdminDashboardPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: getDashboard,
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  })

  const nodesQuery = useQuery({
    queryKey: ['admin', 'panel', 'nodes'],
    queryFn: getPanelNodes,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const offlineNodes = (nodesQuery.data?.items ?? []).filter(
    node => !getBool(node, 'isDisabled') && !getBool(node, 'isConnected'),
  )

  if (isLoading) {
    return (
      <div className="px-4 py-6 sm:p-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 h-24 animate-pulse"
            />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="px-4 py-6 sm:p-8 text-[hsl(var(--muted-foreground))]">{t('admin_error')}</div>
    )
  }

  return (
    <div className="px-4 py-6 sm:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('admin_dashboard_title')}</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{t('admin_dashboard_subtitle')}</p>
      </div>

      {/* Today */}
      <Section title={t('admin_dashboard_today')}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatsCard title={t('admin_dashboard_new_users')} value={fmt(data.new_users_today)} icon={UserPlus} />
          <StatsCard title={t('admin_dashboard_successful_payments')} value={fmt(data.payments_today)} icon={CreditCard} />
          <StatsCard title={t('admin_dashboard_revenue')} value={fmtCurrency(data.revenue_today)} icon={Banknote} />
        </div>
      </Section>

      {/* 7 days */}
      <Section title={t('admin_dashboard_7days')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatsCard title={t('admin_dashboard_new_users')} value={fmt(data.new_users_7days)} icon={UserPlus} />
          <StatsCard title={t('admin_dashboard_revenue')} value={fmtCurrency(data.revenue_7days)} icon={Banknote} />
        </div>
      </Section>

      {/* Main stats */}
      <Section title={t('admin_dashboard_main_stats')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard title={t('admin_dashboard_revenue_30days')} value={fmtCurrency(data.revenue_30days)} icon={TrendingUp} />
          <StatsCard title={t('admin_dashboard_total_users')} value={fmt(data.total_users)} icon={Users} />
          <StatsCard
            title={t('admin_dashboard_active_subscriptions')}
            value={fmt(data.active_subscriptions)}
            subtitle={`${t('admin_dashboard_subscriptions_total', { total: fmt(data.total_subscriptions) })}${
              data.total_subscriptions > 0
                ? t('admin_dashboard_subscriptions_percent', { percent: Math.round((data.active_subscriptions / data.total_subscriptions) * 100) })
                : ''
            }`}
            icon={Activity}
          />
          <StatsCard
            title={t('admin_dashboard_successful_payments_total')}
            value={fmt(data.total_payments)}
            icon={CreditCard}
          />
          <StatsCard title={t('admin_dashboard_total_revenue')} value={fmtCurrency(data.total_revenue)} icon={Banknote} />
        </div>
      </Section>

      {/* Alerts */}
      {(data.expiring_soon_count > 0 || nodesQuery.isError || (nodesQuery.isSuccess && offlineNodes.length > 0)) && (
        <div className="space-y-3">
          {data.expiring_soon_count > 0 && (
            <div className="flex flex-col gap-3 p-4 rounded-xl border border-amber-300 bg-amber-50 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3 min-w-0">
                <Clock size={20} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-800 leading-snug">
                    {t('admin_dashboard_expiring', {
                      count: data.expiring_soon_count,
                      label: t(pluralKey(data.expiring_soon_count, 'admin_dashboard_subscription_one', 'admin_dashboard_subscription_few', 'admin_dashboard_subscription_many')),
                    })}
                  </p>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                    {t('admin_dashboard_check_users')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/admin/users')}
                className="self-start rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 sm:ml-auto sm:self-center sm:border-0 sm:px-0 sm:py-0 sm:underline sm:hover:bg-transparent sm:hover:no-underline whitespace-nowrap"
              >
                {t('admin_dashboard_view_users')}
              </button>
            </div>
          )}

          {nodesQuery.isSuccess && offlineNodes.length > 0 && (
            <div className="flex flex-col gap-3 p-4 rounded-xl border border-red-300 bg-red-50 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3 min-w-0">
                <ServerCrash size={20} className="text-red-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-red-800">
                    {offlineNodes.length} {t(pluralKey(offlineNodes.length, 'admin_dashboard_node_one', 'admin_dashboard_node_few', 'admin_dashboard_node_many'))}{' '}
                    {t(offlineNodes.length === 1 ? 'admin_dashboard_node_unavailable_one' : 'admin_dashboard_node_unavailable_many')}
                  </p>
                  <p className="text-xs text-red-700 mt-1 leading-relaxed">
                    {offlineNodes
                      .slice(0, 3)
                      .map(n => getString(n, 'name'))
                      .join(', ')}
                    {offlineNodes.length > 3 &&
                    ` ${t('admin_dashboard_more_nodes', {
                      count: offlineNodes.length - 3,
                      label: t(pluralKey(offlineNodes.length - 3, 'admin_dashboard_node_one', 'admin_dashboard_node_few', 'admin_dashboard_node_many')),
                    })}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/admin/nodes')}
                className="self-start rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-100 sm:ml-auto sm:self-center sm:border-0 sm:px-0 sm:py-0 sm:underline sm:hover:bg-transparent sm:hover:no-underline whitespace-nowrap"
              >
                {t('admin_dashboard_go_nodes')}
              </button>
            </div>
          )}

          {nodesQuery.isError && (
            <div className="flex flex-col gap-3 p-4 rounded-xl border border-red-300 bg-red-50 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3 min-w-0">
                <ServerCrash size={20} className="text-red-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-red-800">
                    {t('admin_dashboard_nodes_load_error')}
                  </p>
                  <p className="text-xs text-red-700 mt-1 leading-relaxed">
                    {t('admin_dashboard_nodes_check')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/admin/nodes')}
                className="self-start rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-100 sm:ml-auto sm:self-center sm:border-0 sm:px-0 sm:py-0 sm:underline sm:hover:bg-transparent sm:hover:no-underline whitespace-nowrap"
              >
                {t('admin_dashboard_go_nodes')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Recent payments */}
      {data.recent_payments.length > 0 && (
        <Section title={t('admin_dashboard_recent_payments')}>
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] text-left text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  <th className="px-4 py-3">{t('admin_user')}</th>
                  <th className="px-4 py-3">{t('admin_amount')}</th>
                  <th className="px-4 py-3">{t('admin_provider')}</th>
                  <th className="px-4 py-3">{t('admin_date')}</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_payments.map((p) => (
                  <tr
                    key={p.payment_id}
                    className="border-b last:border-0 border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.4)] cursor-pointer transition-colors"
                    onClick={() => navigate(`/admin/users/${p.user_id}`)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-[hsl(var(--foreground))]">
                        {p.username ? `@${p.username}` : p.first_name ?? `ID ${p.user_id}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-[hsl(var(--primary))]">
                      {fmtCurrency(p.amount, p.currency)}
                    </td>
                    <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                      {PROVIDER_LABELS[p.provider ?? ''] ? t(PROVIDER_LABELS[p.provider ?? '']) : p.provider ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                      {fmtDate(p.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="px-4 py-3 border-t border-[hsl(var(--border))]">
              <button
                onClick={() => navigate('/admin/payments')}
                className="text-xs text-[hsl(var(--primary))] font-semibold hover:underline"
              >
                {t('admin_dashboard_all_payments')} →
              </button>
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}
