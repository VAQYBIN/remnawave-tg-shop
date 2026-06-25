import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowLeft, HardDrive, Radio, Server, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatsCard } from '@/components/admin/StatsCard'
import { getPanelNode } from '@/api/admin/panel'
import { formatBytes, getArray, getBool, getNumber, getObject, getString } from './panel-utils'
import { useTranslation } from 'react-i18next'

export function NodeDetailPage() {
  const { uuid } = useParams<{ uuid: string }>()
  const { t } = useTranslation()
  const nodeQuery = useQuery({
    queryKey: ['admin', 'panel', 'nodes', uuid],
    queryFn: () => getPanelNode(uuid!, { top_users_limit: 15 }),
    enabled: Boolean(uuid),
    refetchInterval: 30_000,
  })

  const node = nodeQuery.data?.data ?? {}
  const system = getObject(node, 'system')
  const info = getObject(system, 'info')
  const stats = getObject(system, 'stats')
  const iface = getObject(stats, 'interface')
  const versions = getObject(node, 'versions')
  const bandwidth = nodeQuery.data?.users_bandwidth ?? {}
  const topUsers = getArray(bandwidth, 'topUsers')
  const topUsersChartHeight = Math.max(300, topUsers.length * 28)
  const status = getBool(node, 'isDisabled')
    ? 'disabled'
    : getBool(node, 'isConnected')
      ? 'online'
      : 'offline'

  return (
    <div className="px-4 py-6 sm:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin/nodes">
          <Button variant="ghost" size="icon"><ArrowLeft size={18} /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{getString(node, 'name', t('admin_nodes_name'))}</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{getString(node, 'address')}:{getNumber(node, 'port')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatsCard title={t('admin_status')} value={status} icon={Radio} />
        <StatsCard title={t('admin_nodes_online_users')} value={getNumber(node, 'usersOnline')} icon={Users} />
        <StatsCard title={t('admin_nodes_traffic')} value={formatBytes(getNumber(node, 'trafficUsedBytes'))} subtitle={getNumber(node, 'trafficLimitBytes') ? t('admin_panel_memory_total', { total: formatBytes(getNumber(node, 'trafficLimitBytes')) }) : 'no limit'} icon={HardDrive} />
        <StatsCard title="Host" value={getString(info, 'hostname')} subtitle={getString(info, 'platform')} icon={Server} />
        <StatsCard title={t('admin_panel_version')} value={getString(versions, 'node')} subtitle={`xray ${getString(versions, 'xray')}`} icon={Server} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 p-5">
          <h2 className="text-sm font-bold mb-4">{t('admin_nodes_top_users')}</h2>
          {topUsers.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
              {t('admin_no_data')}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={topUsersChartHeight}>
              <BarChart data={topUsers} layout="vertical" margin={{ left: 24, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={(v) => formatBytes(v)} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="username"
                  interval={0}
                  tick={{ fontSize: 11 }}
                  width={130}
                />
                <Tooltip formatter={(value) => [formatBytes(value), t('admin_nodes_traffic')]} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-bold mb-4">System</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-[hsl(var(--muted-foreground))]">CPU</span><strong>{getString(info, 'cpuModel')}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-[hsl(var(--muted-foreground))]">RAM</span><strong className="tabular-nums">{formatBytes(getNumber(stats, 'memoryUsed'))} / {formatBytes(getNumber(info, 'memoryTotal'))}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-[hsl(var(--muted-foreground))]">RX/s</span><strong className="tabular-nums">{formatBytes(getNumber(iface, 'rxBytesPerSec'))}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-[hsl(var(--muted-foreground))]">TX/s</span><strong className="tabular-nums">{formatBytes(getNumber(iface, 'txBytesPerSec'))}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-[hsl(var(--muted-foreground))]">Country</span><strong>{getString(node, 'countryCode')}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-[hsl(var(--muted-foreground))]">Provider</span><strong>{getString(getObject(node, 'provider'), 'name')}</strong></div>
          </div>
        </Card>
      </div>
    </div>
  )
}
