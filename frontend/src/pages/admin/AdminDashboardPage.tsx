import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Users,
  CreditCard,
  Activity,
  UserPlus,
  Banknote,
  Clock,
  ServerCrash,
  Server,
  RefreshCw,
  Download,
} from 'lucide-react'
import { getDashboard } from '@/api/admin'
import { getPanelNodes } from '@/api/admin/panel'
import { getBool, getString } from './panel-utils'
import { StatsCard } from '@/components/admin/StatsCard'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
      <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">
        {title}
      </h2>
      {children}
    </div>
  )
}

export function AdminDashboardPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
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

  const nodeItems = nodesQuery.data?.items ?? []
  const offlineNodes = nodeItems.filter(
    (node) => !getBool(node, 'isDisabled') && !getBool(node, 'isConnected'),
  )
  const onlineNodes = nodeItems.filter(
    (node) => !getBool(node, 'isDisabled') && getBool(node, 'isConnected'),
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

  function handleExport() {
    if (!data) return
    const header = ['user', 'amount', 'currency', 'provider', 'date']
    const esc = (v: string | number) => {
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = data.recent_payments.map((p) => [
      p.username ? `@${p.username}` : p.first_name ?? `ID ${p.user_id}`,
      p.amount,
      p.currency,
      PROVIDER_LABELS[p.provider ?? ''] ? t(PROVIDER_LABELS[p.provider ?? '']) : p.provider ?? '',
      p.created_at ?? '',
    ])
    const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n')
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `recent-payments.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const subsPercent =
    data.total_subscriptions > 0
      ? Math.round((data.active_subscriptions / data.total_subscriptions) * 100)
      : null

  return (
    <div className="px-4 py-6 sm:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('admin_dashboard_title')}</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{t('admin_dashboard_subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={data.recent_payments.length === 0}>
            <Download size={16} /> {t('admin_dashboard_export')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetch()
              nodesQuery.refetch()
            }}
          >
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : undefined} />
            {t('admin_dashboard_refresh')}
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {(data.expiring_soon_count > 0 || nodesQuery.isError || offlineNodes.length > 0) && (
        <div className="space-y-3">
          {data.expiring_soon_count > 0 && (
            <Alert variant="warning" icon={<Clock size={20} />} className="items-center">
              <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-snug">
                    {t('admin_dashboard_expiring', {
                      count: data.expiring_soon_count,
                      label: t(pluralKey(data.expiring_soon_count, 'admin_dashboard_subscription_one', 'admin_dashboard_subscription_few', 'admin_dashboard_subscription_many')),
                    })}
                  </p>
                  <p className="mt-0.5 text-xs opacity-90">{t('admin_dashboard_check_users')}</p>
                </div>
                <button
                  onClick={() => navigate('/admin/users')}
                  className="shrink-0 whitespace-nowrap text-sm font-bold hover:underline"
                >
                  {t('admin_dashboard_view_users')} →
                </button>
              </div>
            </Alert>
          )}

          {offlineNodes.length > 0 && (
            <Alert variant="danger" icon={<ServerCrash size={20} />} className="items-center">
              <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">
                    {offlineNodes.length}{' '}
                    {t(pluralKey(offlineNodes.length, 'admin_dashboard_node_one', 'admin_dashboard_node_few', 'admin_dashboard_node_many'))}{' '}
                    {t(offlineNodes.length === 1 ? 'admin_dashboard_node_unavailable_one' : 'admin_dashboard_node_unavailable_many')}
                  </p>
                  <p className="mt-0.5 text-xs opacity-90">
                    {offlineNodes.slice(0, 3).map((n) => getString(n, 'name')).join(', ')}
                    {offlineNodes.length > 3 &&
                      ` ${t('admin_dashboard_more_nodes', {
                        count: offlineNodes.length - 3,
                        label: t(pluralKey(offlineNodes.length - 3, 'admin_dashboard_node_one', 'admin_dashboard_node_few', 'admin_dashboard_node_many')),
                      })}`}
                  </p>
                </div>
                <button
                  onClick={() => navigate('/admin/nodes')}
                  className="shrink-0 whitespace-nowrap text-sm font-bold hover:underline"
                >
                  {t('admin_dashboard_go_nodes')} →
                </button>
              </div>
            </Alert>
          )}

          {nodesQuery.isError && (
            <Alert variant="danger" icon={<ServerCrash size={20} />} className="items-center">
              <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{t('admin_dashboard_nodes_load_error')}</p>
                  <p className="mt-0.5 text-xs opacity-90">{t('admin_dashboard_nodes_check')}</p>
                </div>
                <button
                  onClick={() => navigate('/admin/nodes')}
                  className="shrink-0 whitespace-nowrap text-sm font-bold hover:underline"
                >
                  {t('admin_dashboard_go_nodes')} →
                </button>
              </div>
            </Alert>
          )}
        </div>
      )}

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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatsCard title={t('admin_dashboard_new_users')} value={fmt(data.new_users_7days)} icon={UserPlus} />
          <StatsCard title={t('admin_dashboard_revenue')} value={fmtCurrency(data.revenue_7days)} icon={Banknote} />
          <StatsCard
            title={t('admin_dashboard_expiring_soon')}
            value={fmt(data.expiring_soon_count)}
            icon={Clock}
          />
        </div>
      </Section>

      {/* All time */}
      <Section title={t('admin_dashboard_alltime')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard title={t('admin_dashboard_total_users')} value={fmt(data.total_users)} icon={Users} />
          <StatsCard
            title={t('admin_dashboard_active_subscriptions')}
            value={fmt(data.active_subscriptions)}
            subtitle={subsPercent !== null ? `${subsPercent}%` : undefined}
            icon={Activity}
          />
          <StatsCard
            title={t('admin_dashboard_successful_payments_total')}
            value={fmt(data.total_payments)}
            icon={CreditCard}
          />
          <StatsCard
            title={t('admin_dashboard_total_revenue')}
            value={fmtCurrency(data.total_revenue)}
            subtitle={t('admin_dashboard_revenue_30days') + ': ' + fmtCurrency(data.revenue_30days)}
            icon={Banknote}
          />
          <StatsCard
            title={t('admin_dashboard_nodes')}
            value={nodesQuery.isSuccess ? fmt(nodeItems.length) : '—'}
            subtitle={nodesQuery.isSuccess ? t('admin_dashboard_nodes_online', { count: onlineNodes.length }) : undefined}
            icon={Server}
          />
        </div>
      </Section>

      {/* Recent payments */}
      {data.recent_payments.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
            <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">{t('admin_dashboard_recent_payments')}</h2>
            <button
              onClick={() => navigate('/admin/payments')}
              className="shrink-0 whitespace-nowrap text-xs font-semibold text-[hsl(var(--primary))] hover:underline"
            >
              {t('admin_dashboard_all_payments')} →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-y border-[hsl(var(--border))] text-left">
                  <th className="px-4 py-3 uppercase text-[10px] font-bold tracking-[0.06em] text-[hsl(var(--muted-foreground))] sm:px-5">{t('admin_user')}</th>
                  <th className="px-4 py-3 uppercase text-[10px] font-bold tracking-[0.06em] text-[hsl(var(--muted-foreground))]">{t('admin_amount')}</th>
                  <th className="px-4 py-3 uppercase text-[10px] font-bold tracking-[0.06em] text-[hsl(var(--muted-foreground))]">{t('admin_provider')}</th>
                  <th className="px-4 py-3 uppercase text-[10px] font-bold tracking-[0.06em] text-[hsl(var(--muted-foreground))]">{t('admin_date')}</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_payments.map((p) => (
                  <tr
                    key={p.payment_id}
                    className="cursor-pointer border-b border-[hsl(var(--border))] transition-colors last:border-0 hover:bg-[hsl(var(--muted)/0.5)]"
                    onClick={() => navigate(`/admin/users/${p.user_id}`)}
                  >
                    <td className="px-4 py-3.5 font-medium text-[hsl(var(--foreground))] sm:px-5">
                      {p.username ? `@${p.username}` : p.first_name ?? `ID ${p.user_id}`}
                    </td>
                    <td className="px-4 py-3.5 font-bold text-[hsl(var(--primary))] tabular-nums">
                      {fmtCurrency(p.amount, p.currency)}
                    </td>
                    <td className="px-4 py-3.5 text-[hsl(var(--muted-foreground))]">
                      {PROVIDER_LABELS[p.provider ?? ''] ? t(PROVIDER_LABELS[p.provider ?? '']) : p.provider ?? '—'}
                    </td>
                    <td className="px-4 py-3.5 text-[hsl(var(--muted-foreground))]">{fmtDate(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
