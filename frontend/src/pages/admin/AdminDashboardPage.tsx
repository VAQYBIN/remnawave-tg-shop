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

const PROVIDER_LABELS: Record<string, string> = {
  yookassa: 'ЮКасса',
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
      <div className="p-8 space-y-6">
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
      <div className="p-8 text-[hsl(var(--muted-foreground))]">Ошибка загрузки данных</div>
    )
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Обзор</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Статистика магазина</p>
      </div>

      {/* Today */}
      <Section title="Сегодня">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatsCard title="Новых пользователей" value={fmt(data.new_users_today)} icon={UserPlus} />
          <StatsCard title="Успешных платежей" value={fmt(data.payments_today)} icon={CreditCard} />
          <StatsCard title="Выручка" value={fmtCurrency(data.revenue_today)} icon={Banknote} />
        </div>
      </Section>

      {/* 7 days */}
      <Section title="За 7 дней">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatsCard title="Новых пользователей" value={fmt(data.new_users_7days)} icon={UserPlus} />
          <StatsCard title="Выручка" value={fmtCurrency(data.revenue_7days)} icon={Banknote} />
        </div>
      </Section>

      {/* Main stats */}
      <Section title="Основные показатели">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard title="Выручка за 30 дней" value={fmtCurrency(data.revenue_30days)} icon={TrendingUp} />
          <StatsCard title="Пользователей всего" value={fmt(data.total_users)} icon={Users} />
          <StatsCard
            title="Активных подписок"
            value={fmt(data.active_subscriptions)}
            subtitle={`из ${fmt(data.total_subscriptions)} всего${
              data.total_subscriptions > 0
                ? `, ${Math.round((data.active_subscriptions / data.total_subscriptions) * 100)}% активны`
                : ''
            }`}
            icon={Activity}
          />
          <StatsCard
            title="Успешных платежей всего"
            value={fmt(data.total_payments)}
            icon={CreditCard}
          />
          <StatsCard title="Общая выручка" value={fmtCurrency(data.total_revenue)} icon={Banknote} />
        </div>
      </Section>

      {/* Alerts */}
      {(data.expiring_soon_count > 0 || nodesQuery.isError || (nodesQuery.isSuccess && offlineNodes.length > 0)) && (
        <div className="space-y-3">
          {data.expiring_soon_count > 0 && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-300 bg-amber-50">
              <Clock size={20} className="text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  Истекает в ближайшие 3 дня: {data.expiring_soon_count}{' '}
                  {pluralRu(data.expiring_soon_count, ['подписка', 'подписки', 'подписок'])}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Проверьте список пользователей и динамику продлений
                </p>
              </div>
              <button
                onClick={() => navigate('/admin/users')}
                className="ml-auto text-xs font-semibold text-amber-800 underline hover:no-underline whitespace-nowrap"
              >
                Посмотреть пользователей
              </button>
            </div>
          )}

          {nodesQuery.isSuccess && offlineNodes.length > 0 && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-red-300 bg-red-50">
              <ServerCrash size={20} className="text-red-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-800">
                  {offlineNodes.length} {pluralRu(offlineNodes.length, ['нода', 'ноды', 'нод'])}{' '}
                  {offlineNodes.length === 1 ? 'недоступна' : 'недоступны'}
                </p>
                <p className="text-xs text-red-700 mt-0.5">
                  {offlineNodes
                    .slice(0, 3)
                    .map(n => getString(n, 'name'))
                    .join(', ')}
                  {offlineNodes.length > 3 &&
                    ` и ещё ${offlineNodes.length - 3} ${pluralRu(offlineNodes.length - 3, ['нода', 'ноды', 'нод'])}`}
                </p>
              </div>
              <button
                onClick={() => navigate('/admin/nodes')}
                className="ml-auto text-xs font-semibold text-red-800 underline hover:no-underline whitespace-nowrap"
              >
                Перейти к нодам
              </button>
            </div>
          )}

          {nodesQuery.isError && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-red-300 bg-red-50">
              <ServerCrash size={20} className="text-red-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-800">
                  Не удалось загрузить статус нод
                </p>
                <p className="text-xs text-red-700 mt-0.5">
                  Проверьте подключение к панели и доступность мониторинга
                </p>
              </div>
              <button
                onClick={() => navigate('/admin/nodes')}
                className="ml-auto text-xs font-semibold text-red-800 underline hover:no-underline whitespace-nowrap"
              >
                Перейти к нодам
              </button>
            </div>
          )}
        </div>
      )}

      {/* Recent payments */}
      {data.recent_payments.length > 0 && (
        <Section title="Последние платежи">
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] text-left text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  <th className="px-4 py-3">Пользователь</th>
                  <th className="px-4 py-3">Сумма</th>
                  <th className="px-4 py-3">Провайдер</th>
                  <th className="px-4 py-3">Дата</th>
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
                      {PROVIDER_LABELS[p.provider ?? ''] ?? p.provider ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                      {fmtDate(p.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-[hsl(var(--border))]">
              <button
                onClick={() => navigate('/admin/payments')}
                className="text-xs text-[hsl(var(--primary))] font-semibold hover:underline"
              >
                Все платежи →
              </button>
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}
