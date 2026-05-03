import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
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

const COLUMNS: Column<PanelObject>[] = [
  {
    key: 'username',
    header: 'Пользователь',
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
    header: 'Статус',
    size: 110,
    render: (user) => {
      const status = getString(user, 'status')
      return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-600'}`}>{status}</span>
    },
  },
  {
    key: 'traffic',
    header: 'Трафик',
    size: 150,
    render: (user) => {
      const traffic = getObject(user, 'userTraffic')
      return (
        <div className="flex flex-col">
          <span className="font-medium">{formatBytes(getNumber(traffic, 'usedTrafficBytes'))}</span>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">limit {formatBytes(user.trafficLimitBytes)}</span>
        </div>
      )
    },
  },
  {
    key: 'telegram',
    header: 'Telegram',
    size: 130,
    render: (user) => formatScalar(user.telegramId),
  },
  {
    key: 'expire',
    header: 'До',
    size: 110,
    render: (user) => fmtDate(user.expireAt),
  },
  {
    key: 'actions',
    header: '',
    size: 70,
    enableResizing: false,
    render: (user) => (
      <Link to={`/admin/panel/users/${getString(user, 'uuid', '')}`}>
        <Button variant="ghost" size="icon" title="Открыть"><ExternalLink size={16} /></Button>
      </Link>
    ),
  },
]

export function PanelUsersPage() {
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

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Юзеры панели</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          Пагинация и поиск по Remnawave users
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
          placeholder="Username, email или Telegram ID"
          className="h-10 w-full max-w-sm px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.3)]"
        />
        <Button type="submit">Найти</Button>
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
            Сбросить
          </Button>
        )}
      </form>

      <DataTable
        columns={COLUMNS}
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
        emptyMessage="Пользователи панели не найдены"
        keyExtractor={(user) => getString(user, 'uuid')}
      />
    </div>
  )
}
