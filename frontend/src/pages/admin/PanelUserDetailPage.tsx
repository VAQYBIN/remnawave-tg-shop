import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, HardDrive, User, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatsCard } from '@/components/admin/StatsCard'
import { getPanelUser } from '@/api/admin/panel'
import { formatBytes, formatScalar, getNumber, getObject, getString } from './panel-utils'

function fmtDate(value: unknown) {
  if (typeof value !== 'string' || !value) return '—'
  return new Date(value).toLocaleString('ru-RU')
}

export function PanelUserDetailPage() {
  const { uuid } = useParams<{ uuid: string }>()
  const userQuery = useQuery({
    queryKey: ['admin', 'panel', 'users', uuid],
    queryFn: () => getPanelUser(uuid!),
    enabled: Boolean(uuid),
    refetchInterval: 30_000,
  })

  const user = userQuery.data?.data ?? {}
  const traffic = getObject(user, 'userTraffic')

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin/panel/users">
          <Button variant="ghost" size="icon"><ArrowLeft size={18} /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{getString(user, 'username', 'Panel user')}</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{getString(user, 'uuid')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Статус" value={getString(user, 'status')} icon={User} />
        <StatsCard title="Трафик" value={formatBytes(getNumber(traffic, 'usedTrafficBytes'))} subtitle={`limit ${formatBytes(user.trafficLimitBytes)}`} icon={HardDrive} />
        <StatsCard title="Lifetime" value={formatBytes(getNumber(traffic, 'lifetimeUsedTrafficBytes'))} icon={HardDrive} />
        <StatsCard title="Онлайн" value={fmtDate(traffic.onlineAt)} icon={Wifi} />
      </div>

      <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5">
        <h2 className="text-sm font-semibold mb-4">Данные</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex justify-between gap-4"><span>Email</span><strong>{getString(user, 'email')}</strong></div>
          <div className="flex justify-between gap-4"><span>Telegram ID</span><strong>{formatScalar(user.telegramId)}</strong></div>
          <div className="flex justify-between gap-4"><span>Expire at</span><strong>{fmtDate(user.expireAt)}</strong></div>
          <div className="flex justify-between gap-4"><span>Traffic strategy</span><strong>{getString(user, 'trafficLimitStrategy')}</strong></div>
          <div className="flex justify-between gap-4"><span>Created</span><strong>{fmtDate(user.createdAt)}</strong></div>
          <div className="flex justify-between gap-4"><span>Updated</span><strong>{fmtDate(user.updatedAt)}</strong></div>
        </div>
      </div>
    </div>
  )
}
