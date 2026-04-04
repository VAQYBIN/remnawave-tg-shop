import { useQuery } from '@tanstack/react-query'
import { Users, CreditCard, Activity, TrendingUp, UserPlus, Banknote } from 'lucide-react'
import { getDashboard } from '@/api/admin'
import { StatsCard } from '@/components/admin/StatsCard'

function fmt(n: number): string {
  return n.toLocaleString('ru-RU')
}

function fmtRub(n: number): string {
  return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`
}

export function AdminDashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: getDashboard,
    staleTime: 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-[hsl(var(--muted-foreground))]">
        Ошибка загрузки данных
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Обзор</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Статистика магазина</p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
          Сегодня
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatsCard
            title="Новых пользователей"
            value={fmt(data.new_users_today)}
            icon={UserPlus}
          />
          <StatsCard
            title="Успешных платежей"
            value={fmt(data.payments_today)}
            icon={CreditCard}
          />
          <StatsCard
            title="Выручка сегодня"
            value={fmtRub(data.revenue_today)}
            icon={Banknote}
          />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
          Всего
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Пользователей"
            value={fmt(data.total_users)}
            icon={Users}
          />
          <StatsCard
            title="Активных подписок"
            value={fmt(data.active_subscriptions)}
            subtitle={`из ${fmt(data.total_subscriptions)} всего`}
            icon={Activity}
          />
          <StatsCard
            title="Платежей"
            value={fmt(data.total_payments)}
            icon={CreditCard}
          />
          <StatsCard
            title="Общая выручка"
            value={fmtRub(data.total_revenue)}
            icon={TrendingUp}
          />
        </div>
      </div>
    </div>
  )
}
