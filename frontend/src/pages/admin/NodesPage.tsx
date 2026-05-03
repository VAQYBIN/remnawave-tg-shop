import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Power, PowerOff, RefreshCw, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { useToast } from '@/hooks/useToast'
import {
  disablePanelNode,
  enablePanelNode,
  getPanelNodes,
  restartAllPanelNodes,
  restartPanelNode,
  type PanelObject,
} from '@/api/admin/panel'
import { formatBytes, getBool, getNumber, getObject, getString } from './panel-utils'

function nodeStatus(node: PanelObject) {
  if (getBool(node, 'isDisabled')) return { label: 'disabled', className: 'bg-gray-100 text-gray-600' }
  if (getBool(node, 'isConnected')) return { label: 'online', className: 'bg-green-100 text-green-700' }
  if (getBool(node, 'isConnecting')) return { label: 'connecting', className: 'bg-yellow-100 text-yellow-700' }
  return { label: 'offline', className: 'bg-red-100 text-red-700' }
}

export function NodesPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [confirm, setConfirm] = useState<null | { title: string; description: string; action: () => void }>(null)

  const nodesQuery = useQuery({
    queryKey: ['admin', 'panel', 'nodes'],
    queryFn: getPanelNodes,
    refetchInterval: 30_000,
  })

  const refreshNodes = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'panel', 'nodes'] })
  }

  const actionMutation = useMutation({
    mutationFn: async ({ uuid, action }: { uuid?: string; action: 'enable' | 'disable' | 'restart' | 'restart-all' }) => {
      if (action === 'restart-all') return restartAllPanelNodes()
      if (!uuid) throw new Error('Node UUID is required')
      if (action === 'enable') return enablePanelNode(uuid)
      if (action === 'disable') return disablePanelNode(uuid)
      return restartPanelNode(uuid)
    },
    onSuccess: async () => {
      toast.success('Команда отправлена')
      await refreshNodes()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка Panel API'),
  })

  const columns = useMemo<Column<PanelObject>[]>(() => [
    {
      key: 'name',
      header: 'Нода',
      size: 210,
      render: (node) => (
        <div className="flex flex-col">
          <span className="font-medium">{getString(node, 'name')}</span>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{getString(node, 'address')}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Статус',
      size: 110,
      render: (node) => {
        const status = nodeStatus(node)
        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`}>{status.label}</span>
      },
    },
    {
      key: 'traffic',
      header: 'Трафик',
      size: 160,
      render: (node) => {
        const used = getNumber(node, 'trafficUsedBytes')
        const limit = getNumber(node, 'trafficLimitBytes')
        return (
          <div className="flex flex-col">
            <span className="font-medium">{formatBytes(used)}</span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">{limit ? `из ${formatBytes(limit)}` : 'без лимита'}</span>
          </div>
        )
      },
    },
    {
      key: 'users',
      header: 'Онлайн',
      size: 90,
      render: (node) => getNumber(node, 'usersOnline'),
    },
    {
      key: 'system',
      header: 'Система',
      size: 150,
      render: (node) => {
        const system = getObject(node, 'system')
        const info = getObject(system, 'info')
        const versions = getObject(node, 'versions')
        return (
          <div className="flex flex-col">
            <span>{getString(info, 'hostname')}</span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">xray {getString(versions, 'xray')}</span>
          </div>
        )
      },
    },
    {
      key: 'actions',
      header: 'Действия',
      size: 240,
      enableResizing: false,
      render: (node) => {
        const uuid = getString(node, 'uuid', '')
        const disabled = getBool(node, 'isDisabled')
        return (
          <div className="flex items-center gap-1">
            <Link to={`/admin/nodes/${uuid}`}>
              <Button variant="ghost" size="icon" title="Открыть"><Eye size={16} /></Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              title={disabled ? 'Enable' : 'Disable'}
              onClick={() => setConfirm({
                title: disabled ? 'Включить ноду?' : 'Отключить ноду?',
                description: getString(node, 'name'),
                action: () => actionMutation.mutate({ uuid, action: disabled ? 'enable' : 'disable' }),
              })}
            >
              {disabled ? <Power size={16} /> : <PowerOff size={16} />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Restart"
              onClick={() => setConfirm({
                title: 'Перезагрузить ноду?',
                description: getString(node, 'name'),
                action: () => actionMutation.mutate({ uuid, action: 'restart' }),
              })}
            >
              <RefreshCw size={16} />
            </Button>
          </div>
        )
      },
    },
  ], [actionMutation])

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Ноды Remnawave</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            Статусы, трафик и команды управления
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setConfirm({
            title: 'Перезагрузить все ноды?',
            description: 'Команда будет отправлена на все подключенные ноды.',
            action: () => actionMutation.mutate({ action: 'restart-all' }),
          })}
        >
          <RotateCcw size={16} />
          Restart All
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={nodesQuery.data?.items ?? []}
        total={nodesQuery.data?.total ?? 0}
        page={0}
        pageSize={Math.max(nodesQuery.data?.total ?? 0, 1)}
        onPageChange={() => undefined}
        isLoading={nodesQuery.isLoading}
        emptyMessage="Ноды не найдены"
        keyExtractor={(node) => getString(node, 'uuid')}
      />

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        confirmLabel="Выполнить"
        cancelLabel="Отмена"
        destructive
        onConfirm={() => {
          const action = confirm?.action
          setConfirm(null)
          action?.()
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

