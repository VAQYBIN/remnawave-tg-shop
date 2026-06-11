import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Power, PowerOff, RefreshCw, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
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
import { useTranslation } from 'react-i18next'

function nodeStatus(node: PanelObject): { label: string; variant: BadgeProps['variant'] } {
  if (getBool(node, 'isDisabled')) return { label: 'disabled', variant: 'secondary' }
  if (getBool(node, 'isConnected')) return { label: 'online', variant: 'success' }
  if (getBool(node, 'isConnecting')) return { label: 'connecting', variant: 'warning' }
  return { label: 'offline', variant: 'danger' }
}

export function NodesPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { t } = useTranslation()
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
      toast.success(t('admin_nodes_restart_toast'))
      await refreshNodes()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('admin_nodes_error_toast')),
  })

  const columns = useMemo<Column<PanelObject>[]>(() => [
    {
      key: 'name',
      header: t('admin_nodes_name'),
      size: 210,
      render: (node) => (
        <div className="flex flex-col">
          <span className="font-semibold">{getString(node, 'name')}</span>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{getString(node, 'address')}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('admin_status'),
      size: 110,
      render: (node) => {
        const status = nodeStatus(node)
        return <Badge variant={status.variant} dot>{status.label}</Badge>
      },
    },
    {
      key: 'traffic',
      header: t('admin_nodes_traffic'),
      size: 160,
      render: (node) => {
        const used = getNumber(node, 'trafficUsedBytes')
        const limit = getNumber(node, 'trafficLimitBytes')
        return (
          <div className="flex flex-col">
            <span className="font-bold tabular-nums">{formatBytes(used)}</span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">{limit ? t('admin_panel_memory_total', { total: formatBytes(limit) }) : 'no limit'}</span>
          </div>
        )
      },
    },
    {
      key: 'users',
      header: t('admin_nodes_online_users'),
      size: 90,
      render: (node) => <span className="font-bold tabular-nums">{getNumber(node, 'usersOnline')}</span>,
    },
    {
      key: 'system',
      header: 'System',
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
      header: t('admin_actions'),
      size: 240,
      enableResizing: false,
      render: (node) => {
        const uuid = getString(node, 'uuid', '')
        const disabled = getBool(node, 'isDisabled')
        return (
          <div className="flex items-center gap-1">
            <Link to={`/admin/nodes/${uuid}`}>
              <Button variant="ghost" size="icon" title={t('admin_open')}><Eye size={16} /></Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              title={disabled ? 'Enable' : 'Disable'}
              onClick={() => setConfirm({
                title: disabled ? t('admin_nodes_enable_confirm') : t('admin_nodes_disable_confirm'),
                description: getString(node, 'name'),
                action: () => actionMutation.mutate({ uuid, action: disabled ? 'enable' : 'disable' }),
              })}
            >
              {disabled ? <Power size={16} /> : <PowerOff size={16} />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title={t('admin_nodes_restart')}
              onClick={() => setConfirm({
                title: t('admin_nodes_restart_confirm'),
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
  ], [actionMutation, t])

  return (
    <div className="px-4 py-6 sm:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('admin_nodes_title')}</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            {t('admin_panel_subtitle')}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setConfirm({
            title: t('admin_nodes_restart_all_confirm'),
            description: t('admin_broadcast_confirm_description'),
            action: () => actionMutation.mutate({ action: 'restart-all' }),
          })}
        >
          <RotateCcw size={16} />
          {t('admin_nodes_restart_all')}
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
        emptyMessage={t('admin_nodes_empty')}
        keyExtractor={(node) => getString(node, 'uuid')}
      />

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        confirmLabel={t('admin_nodes_execute')}
        cancelLabel={t('admin_cancel')}
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
