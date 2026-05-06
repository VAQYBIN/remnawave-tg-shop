import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { getPanelUsers, type PanelObject } from '@/api/admin/panel'
import { formatBytes, formatScalar, getNumber, getObject, getString } from './panel-utils'

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  DISABLED: 'bg-gray-100 text-gray-600',
  LIMITED: 'bg-yellow-100 text-yellow-700',
  EXPIRED: 'bg-red-100 text-red-700',
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
          <span className="font-medium">{getString(user, 'username')}</span>
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
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-600'}`}>
            {status}
          </span>
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
            <span className="font-medium">{formatBytes(getNumber(traffic, 'usedTrafficBytes'))}</span>
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
    <div className="p-8 space-y-6">
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
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('admin_panel_users_search_placeholder')}
          className="h-10 w-full max-w-sm px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.3)]"
        />
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
