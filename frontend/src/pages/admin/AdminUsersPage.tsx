import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search, X, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react'
import { getAdminUsers } from '@/api/admin/users'
import type { AdminUserListItem } from '@/api/admin/users'
import { DataTable } from '@/components/admin/DataTable'
import type { Column, SortingConfig } from '@/components/admin/DataTable'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function AdminUsersPage() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [isBanned, setIsBanned] = useState<boolean | undefined>(undefined)
  const [hasSub, setHasSub] = useState<boolean | undefined>(undefined)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [sorting, setSorting] = useState<SortingConfig>({
    sortKey: 'registration_date',
    order: 'desc',
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'users', search, isBanned, hasSub, page, pageSize, sorting],
    queryFn: () =>
      getAdminUsers({
        query: search || undefined,
        is_banned: isBanned,
        has_subscription: hasSub,
        page,
        page_size: pageSize,
        order_by: sorting.sortKey,
        order: sorting.order,
      }),
    placeholderData: keepPreviousData,
  })

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearch(searchInput)
    setPage(0)
  }

  function clearSearch() {
    setSearchInput('')
    setSearch('')
    setPage(0)
  }

  function handleFilter(key: 'banned' | 'sub', value: boolean | undefined) {
    if (key === 'banned') setIsBanned(value)
    if (key === 'sub') setHasSub(value)
    setPage(0)
  }

  function handleSortingChange(cfg: SortingConfig) {
    setSorting(cfg)
    setPage(0)
  }

  const columns: Column<AdminUserListItem>[] = [
    {
      key: 'user',
      header: 'Пользователь',
      sortKey: 'first_name',
      size: 220,
      render: (row) => (
        <div>
          <span className="font-medium text-[hsl(var(--foreground))]">
            {row.first_name || '—'}{row.last_name ? ` ${row.last_name}` : ''}
          </span>
          {row.username && (
            <span className="ml-1.5 text-[hsl(var(--muted-foreground))]">@{row.username}</span>
          )}
        </div>
      ),
    },
    {
      key: 'id',
      header: 'Telegram ID',
      sortKey: 'user_id',
      size: 130,
      render: (row) => (
        <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{row.user_id}</span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      size: 190,
      render: (row) => (
        <span className="text-[hsl(var(--foreground))]">{row.email || '—'}</span>
      ),
    },
    {
      key: 'subscription',
      header: 'Подписка',
      sortKey: 'subscription_end_date',
      size: 150,
      render: (row) => (
        <div className="flex items-center gap-1.5">
          {row.has_active_subscription ? (
            <>
              <CheckCircle2 size={14} className="text-green-600 shrink-0" />
              <span className="text-xs text-green-700">
                до {formatDate(row.subscription_end_date)}
              </span>
            </>
          ) : (
            <>
              <XCircle size={14} className="text-[hsl(var(--muted-foreground))] shrink-0" />
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Нет</span>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Статус',
      sortKey: 'is_banned',
      size: 110,
      render: (row) =>
        row.is_banned ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
            <ShieldAlert size={11} />
            Забанен
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
            Активен
          </span>
        ),
    },
    {
      key: 'registered',
      header: 'Регистрация',
      sortKey: 'registration_date',
      size: 120,
      render: (row) => (
        <span className="text-[hsl(var(--muted-foreground))] text-xs">{formatDate(row.registration_date)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      size: 90,
      enableResizing: false,
      render: (row) => (
        <button
          onClick={() => navigate(`/admin/users/${row.user_id}`)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] transition-colors"
        >
          Детали
        </button>
      ),
    },
  ]

  const filterBtnClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
      active
        ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]'
        : 'border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]'
    }`

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Пользователи</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          {data ? `Всего: ${data.total}` : 'Загрузка...'}
        </p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
            <input
              type="text"
              placeholder="Поиск по имени, @username, email или ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-medium hover:opacity-90"
          >
            Найти
          </button>
        </form>

        {/* Quick filters */}
        <div className="flex gap-2 flex-wrap">
          <button
            className={filterBtnClass(isBanned === undefined && hasSub === undefined)}
            onClick={() => { handleFilter('banned', undefined); handleFilter('sub', undefined) }}
          >
            Все
          </button>
          <button
            className={filterBtnClass(hasSub === true)}
            onClick={() => handleFilter('sub', hasSub === true ? undefined : true)}
          >
            С подпиской
          </button>
          <button
            className={filterBtnClass(hasSub === false)}
            onClick={() => handleFilter('sub', hasSub === false ? undefined : false)}
          >
            Без подписки
          </button>
          <button
            className={filterBtnClass(isBanned === true)}
            onClick={() => handleFilter('banned', isBanned === true ? undefined : true)}
          >
            Забаненные
          </button>
        </div>
      </div>

      {isError && (
        <p className="text-sm text-red-600">Ошибка загрузки пользователей</p>
      )}

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize)
          setPage(0)
        }}
        sorting={sorting}
        onSortingChange={handleSortingChange}
        isLoading={isLoading}
        emptyMessage="Пользователи не найдены"
        keyExtractor={(row) => row.user_id}
      />
    </div>
  )
}
