import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Cpu, HardDrive, Radio, Server, Users } from 'lucide-react'
import { StatsCard } from '@/components/admin/StatsCard'
import { Card } from '@/components/ui/card'
import {
  getPanelBandwidth,
  getPanelHwidStats,
  getPanelMetadata,
  getPanelNodesStats,
  getPanelRealtimeBandwidth,
  getPanelStats,
} from '@/api/admin/panel'
import { formatBytes, getArray, getNumber, getObject, getString } from './panel-utils'
import { useTranslation } from 'react-i18next'

export function PanelStatsPage() {
  const { t } = useTranslation()
  const statsQuery = useQuery({
    queryKey: ['admin', 'panel', 'stats'],
    queryFn: getPanelStats,
    refetchInterval: 30_000,
  })
  const metadataQuery = useQuery({
    queryKey: ['admin', 'panel', 'metadata'],
    queryFn: getPanelMetadata,
    staleTime: 5 * 60_000,
  })
  const bandwidthQuery = useQuery({
    queryKey: ['admin', 'panel', 'bandwidth'],
    queryFn: () => getPanelBandwidth({ top_nodes_limit: 10 }),
    refetchInterval: 30_000,
  })
  const realtimeQuery = useQuery({
    queryKey: ['admin', 'panel', 'bandwidth', 'realtime'],
    queryFn: getPanelRealtimeBandwidth,
    refetchInterval: 30_000,
  })
  const nodesStatsQuery = useQuery({
    queryKey: ['admin', 'panel', 'nodes', 'stats'],
    queryFn: getPanelNodesStats,
    refetchInterval: 30_000,
  })
  const hwidQuery = useQuery({
    queryKey: ['admin', 'panel', 'hwid', 'stats'],
    queryFn: getPanelHwidStats,
    staleTime: 60_000,
  })

  const stats = statsQuery.data?.data ?? {}
  const cpu = getObject(stats, 'cpu')
  const memory = getObject(stats, 'memory')
  const users = getObject(stats, 'users')
  const online = getObject(stats, 'onlineStats')
  const nodes = getObject(stats, 'nodes')
  const metadata = metadataQuery.data?.data ?? {}
  const hwid = getObject(hwidQuery.data?.data ?? {}, 'stats')

  const chartData = useMemo(() => {
    const data = bandwidthQuery.data?.data ?? {}
    const categories = Array.isArray(data.categories) ? data.categories as string[] : []
    const series = getArray(data, 'series')
    return categories.map((category, index) => {
      const row: Record<string, string | number> = { date: category.slice(5) }
      series.forEach((item) => {
        const name = getString(item, 'name')
        const values = Array.isArray(item.data) ? item.data as number[] : []
        row[name] = Number(values[index] ?? 0)
      })
      return row
    })
  }, [bandwidthQuery.data])

  const topNodes = getArray(bandwidthQuery.data?.data ?? {}, 'topNodes')
  const nodeSeries = getArray(bandwidthQuery.data?.data ?? {}, 'series')
  const lastSevenDays = getArray(nodesStatsQuery.data?.data ?? {}, 'lastSevenDays')
  const lastSevenDaysByDate = useMemo(() => {
    const totals = new Map<string, number>()
    lastSevenDays.forEach((item) => {
      const date = getString(item, 'date', '')
      if (!date) return
      totals.set(date, (totals.get(date) ?? 0) + getNumber(item, 'totalBytes'))
    })
    return [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([date, totalBytes]) => ({ date: date.slice(5), totalBytes }))
  }, [lastSevenDays])
  const realtimeNodes = getArray(realtimeQuery.data?.data ?? {}, 'nodes')
  const realtime = realtimeQuery.data?.data ?? {}

  return (
    <div className="px-4 py-6 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('admin_panel_title')}</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          {t('admin_panel_subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatsCard title="CPU" value={t('admin_panel_cpu_cores', { count: getNumber(cpu, 'cores') })} icon={Cpu} />
        <StatsCard
          title="RAM"
          value={formatBytes(getNumber(memory, 'used'))}
          subtitle={t('admin_panel_memory_total', { total: formatBytes(getNumber(memory, 'total')) })}
          icon={HardDrive}
        />
        <StatsCard title={t('admin_panel_online')} value={getNumber(online, 'onlineNow')} icon={Radio} />
        <StatsCard title={t('admin_panel_users')} value={getNumber(users, 'totalUsers')} icon={Users} />
        <StatsCard
          title={t('admin_panel_version')}
          value={getString(metadata, 'version', '—')}
          subtitle={getString(getObject(metadata, 'build'), 'number', '')}
          icon={Server}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 p-5">
          <h2 className="text-sm font-bold mb-4">{t('admin_panel_bandwidth_nodes')}</h2>
          {chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
              {t('admin_no_data')}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatBytes(v)} />
                <Tooltip formatter={(value, name) => [formatBytes(value), name]} />
                {nodeSeries.map((item, index) => (
                  <Area
                    key={getString(item, 'uuid', String(index))}
                    type="monotone"
                    dataKey={getString(item, 'name')}
                    stroke={getString(item, 'color', 'hsl(var(--primary))')}
                    fill={getString(item, 'color', 'hsl(var(--primary))')}
                    fillOpacity={0.14}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-bold mb-4">{t('admin_panel_top_nodes')}</h2>
          <div className="space-y-3">
            {topNodes.map((node) => (
              <div key={getString(node, 'uuid')} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: getString(node, 'color', 'hsl(var(--primary))') }}
                  />
                  <span className="font-medium truncate">{getString(node, 'name')}</span>
                </div>
                <span className="font-bold tabular-nums text-[hsl(var(--muted-foreground))]">{formatBytes(node.total)}</span>
              </div>
            ))}
            {topNodes.length === 0 && <p className="text-sm text-[hsl(var(--muted-foreground))]">{t('admin_no_data')}</p>}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5">
          <h2 className="text-sm font-bold mb-4">{t('admin_panel_nodes_now')}</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">{t('admin_panel_total_online')}</span><strong className="tabular-nums">{getNumber(nodes, 'totalOnline')}</strong></div>
            <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Lifetime traffic</span><strong className="tabular-nums">{formatBytes(nodes.totalBytesLifetime)}</strong></div>
            <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">RX/s</span><strong className="tabular-nums">{formatBytes(getNumber(realtime, 'totalRxBytesPerSec'))}/s</strong></div>
            <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">TX/s</span><strong className="tabular-nums">{formatBytes(getNumber(realtime, 'totalTxBytesPerSec'))}/s</strong></div>
            <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">{t('admin_panel_active_metrics')}</span><strong className="tabular-nums">{realtimeNodes.length}</strong></div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-bold mb-4">HWID</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">{t('admin_panel_unique_devices')}</span><strong className="tabular-nums">{getNumber(hwid, 'totalUniqueDevices')}</strong></div>
            <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">{t('admin_panel_hwid_total')}</span><strong className="tabular-nums">{getNumber(hwid, 'totalHwidDevices')}</strong></div>
            <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">{t('admin_panel_avg_per_user')}</span><strong className="tabular-nums">{getNumber(hwid, 'averageHwidDevicesPerUser').toFixed(1)}</strong></div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-bold mb-4">{t('admin_panel_7days')}</h2>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={lastSevenDaysByDate}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value) => [formatBytes(value), t('admin_panel_traffic')]} />
              <Bar dataKey="totalBytes" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  )
}
