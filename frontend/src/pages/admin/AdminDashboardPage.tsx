import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Users,
  CreditCard,
  Activity,
  TrendingUp,
  UserPlus,
  Banknote,
  CalendarDays,
  AlertTriangle,
} from 'lucide-react'
import { getDashboard } from '@/api/admin'
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

function fmtRub(n: number): string {
  return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`
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
          <StatsCard title="Выручка" value={fmtRub(data.revenue_today)} icon={Banknote} />
        </div>
      </Section>

      {/* 7 days */}
      <Section title="За 7 дней">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatsCard title="Новых пользователей" value={fmt(data.new_users_7days)} icon={UserPlus} />
          <StatsCard title="Выручка" value={fmtRub(data.revenue_7days)} icon={Banknote} />
        </div>
      </Section>

      {/* 30 days + All-time */}
      <Section title="За 30 дней / Всего">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="Выручка за 30 дней" value={fmtRub(data.revenue_30days)} icon={TrendingUp} />
          <StatsCard title="Пользователей всего" value={fmt(data.total_users)} icon={Users} />
          <StatsCard
            title="Активных подписок"
            value={fmt(data.active_subscriptions)}
            subtitle={`из ${fmt(data.total_subscriptions)} всего`}
            icon={Activity}
          />
          <StatsCard title="Общая выручка" value={fmtRub(data.total_revenue)} icon={TrendingUp} />
        </div>
      </Section>

      {/* Expiring soon */}
      {data.expiring_soon_count > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-300 bg-amber-50">
          <AlertTriangle size={20} className="text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              Истекает в ближайшие 3 дня: {data.expiring_soon_count} подписок
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Пользователи могут потерять доступ — проверьте статус нод Remnawave
            </p>
          </div>
          <button
            onClick={() => navigate('/admin/panel')}
            className="ml-auto text-xs font-semibold text-amber-800 underline hover:no-underline whitespace-nowrap"
          >
            Перейти к мониторингу
          </button>
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
                      {fmtRub(p.amount)}
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

      {/* Subscription summary */}
      <Section title="Подписки">
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-sm text-[hsl(var(--foreground))]">
                Активные: <b>{fmt(data.active_subscriptions)}</b>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[hsl(var(--muted-foreground))]" />
              <span className="text-sm text-[hsl(var(--foreground))]">
                Неактивные: <b>{fmt(data.total_subscriptions - data.active_subscriptions)}</b>
              </span>
            </div>
            {data.expiring_soon_count > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <span className="text-sm text-[hsl(var(--foreground))]">
                  Истекает скоро: <b>{fmt(data.expiring_soon_count)}</b>
                </span>
              </div>
            )}
          </div>

          <div className="mt-4 relative h-4 bg-[hsl(var(--muted))] rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full bg-green-500 transition-all"
              style={{
                width: `${data.total_subscriptions > 0
                  ? (data.active_subscriptions / data.total_subscriptions) * 100
                  : 0}%`,
              }}
            />
          </div>
          <p className="mt-1.5 text-xs text-[hsl(var(--muted-foreground))]">
            {data.total_subscriptions > 0
              ? `${Math.round((data.active_subscriptions / data.total_subscriptions) * 100)}% активны`
              : 'Нет данных'}
          </p>
        </div>
      </Section>

      {/* Misc stats */}
      <Section title="Итого">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatsCard
            title="Всего платежей (успешных)"
            value={fmt(data.total_payments)}
            icon={CreditCard}
          />
          <StatsCard
            title="Общая выручка"
            value={fmtRub(data.total_revenue)}
            icon={CalendarDays}
          />
        </div>
      </Section>
    </div>
  )
}
