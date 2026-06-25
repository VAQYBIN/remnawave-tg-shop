import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { getPanelUsers, type PanelObject } from '@/api/admin/panel'
import { formatBytes, formatScalar, getNumber, getObject, getString } from './panel-utils'

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  ACTIVE: 'success',
  DISABLED: 'secondary',
  LIMITED: 'warning',
  EXPIRED: 'danger',
}

function fmtDate(value: unknown) {
  if (typeof value !== 'string' || !value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}

export function PanelUsersPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')

  const usersQuery = useQuery({
    queryKey: ['admin', 'panel', 'users', page, pageSize, search],
    queryFn: () => getPanelUsers({ page, page_size: pageSize, query: search || undefined }),
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  })

  const columns: Column<PanelObject>[] = [
    {
      key: 'username',
      header: t('admin_user'),
      size: 190,
      render: (user) => (
        <div className="flex flex-col">
          <span className="font-semibold">{getString(user, 'username')}</span>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{getString(user, 'uuid')}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('admin_status'),
      size: 110,
      render: (user) => {
        const status = getString(user, 'status')
        return (
          <Badge variant={STATUS_VARIANT[status] ?? 'secondary'} dot>
            {status}
          </Badge>
        )
      },
    },
    {
      key: 'traffic',
      header: t('admin_nodes_traffic'),
      size: 150,
      render: (user) => {
        const traffic = getObject(user, 'userTraffic')
        return (
          <div className="flex flex-col">
            <span className="font-bold tabular-nums">{formatBytes(getNumber(traffic, 'usedTrafficBytes'))}</span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              {t('admin_panel_user_detail_limit', { limit: formatBytes(user.trafficLimitBytes) })}
            </span>
          </div>
        )
      },
    },
    { key: 'telegram', header: 'Telegram', size: 130, render: (user) => formatScalar(user.telegramId) },
    { key: 'expire', header: t('admin_promos_valid_until'), size: 110, render: (user) => fmtDate(user.expireAt) },
    {
      key: 'actions',
      header: '',
      size: 70,
      enableResizing: false,
      render: (user) => (
        <Link to={`/admin/panel/users/${getString(user, 'uuid', '')}`}>
          <Button variant="ghost" size="icon" title={t('admin_open')}><ExternalLink size={16} /></Button>
        </Link>
      ),
    },
  ]

  return (
    <div className="px-4 py-6 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('admin_panel_users_title')}</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          {t('admin_panel_users_subtitle')}
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setPage(0)
          setSearch(query.trim())
        }}
      >
        <div className="w-full max-w-sm">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('admin_panel_users_search_placeholder')}
          />
        </div>
        <Button type="submit">{t('admin_search')}</Button>
        {search && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setQuery('')
              setSearch('')
              setPage(0)
            }}
          >
            {t('admin_reset')}
          </Button>
        )}
      </form>

      <DataTable
        columns={columns}
        data={usersQuery.data?.items ?? []}
        total={usersQuery.data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize)
          setPage(0)
        }}
        isLoading={usersQuery.isLoading}
        emptyMessage={t('admin_panel_users_empty')}
        keyExtractor={(user) => getString(user, 'uuid')}
      />
    </div>
  )
}
