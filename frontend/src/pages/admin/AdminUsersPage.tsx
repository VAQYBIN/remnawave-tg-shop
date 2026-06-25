import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search, X, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react'
import { getAdminUsers } from '@/api/admin/users'
import type { AdminUserListItem } from '@/api/admin/users'
import { DataTable } from '@/components/admin/DataTable'
import type { Column, SortingConfig } from '@/components/admin/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useDebounce } from '@/hooks/useDebounce'
import { useTranslation } from 'react-i18next'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function AdminUsersPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchInput, setSearchInput] = useState('')
  const [isBanned, setIsBanned] = useState<boolean | undefined>(undefined)
  const [hasSub, setHasSub] = useState<boolean | undefined>(undefined)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [sorting, setSorting] = useState<SortingConfig>({
    sortKey: 'registration_date',
    order: 'desc',
  })

  const debouncedSearch = useDebounce(searchInput, 300)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'users', debouncedSearch, isBanned, hasSub, page, pageSize, sorting],
    queryFn: () =>
      getAdminUsers({
        query: debouncedSearch || undefined,
        is_banned: isBanned,
        has_subscription: hasSub,
        page,
        page_size: pageSize,
        order_by: sorting.sortKey,
        order: sorting.order,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  function clearSearch() {
    setSearchInput('')
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
      header: t('admin_user'),
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
      header: t('admin_users_telegram_id'),
      sortKey: 'user_id',
      size: 130,
      render: (row) => (
        <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{row.user_id}</span>
      ),
    },
    {
      key: 'email',
      header: t('admin_users_email'),
      size: 190,
      render: (row) => (
        <span className="text-[hsl(var(--foreground))]">{row.email || '—'}</span>
      ),
    },
    {
      key: 'subscription',
      header: t('admin_users_subscription'),
      sortKey: 'subscription_end_date',
      size: 150,
      render: (row) => (
        <div className="flex items-center gap-1.5">
          {row.has_active_subscription ? (
            <>
              <CheckCircle2 size={14} className="text-[var(--success)] shrink-0" />
              <span className="text-xs text-[var(--success)]">
                {t('admin_users_until', { date: formatDate(row.subscription_end_date) })}
              </span>
            </>
          ) : (
            <>
              <XCircle size={14} className="text-[hsl(var(--muted-foreground))] shrink-0" />
              <span className="text-xs text-[hsl(var(--muted-foreground))]">{t('admin_none')}</span>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: t('admin_status'),
      sortKey: 'is_banned',
      size: 110,
      render: (row) =>
        row.is_banned ? (
          <Badge variant="danger">
            <ShieldAlert size={11} />
            {t('admin_users_banned')}
          </Badge>
        ) : (
          <Badge variant="success" dot>
            {t('admin_users_active')}
          </Badge>
        ),
    },
    {
      key: 'registered',
      header: t('admin_users_registered'),
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/admin/users/${row.user_id}`)}
        >
          {t('admin_details')}
        </Button>
      ),
    },
  ]

  return (
    <div className="px-4 py-6 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('admin_users_title')}</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          {data ? t('admin_total', { count: data.total }) : t('admin_loading')}
        </p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
            <input
              type="text"
              placeholder={t('admin_users_search_placeholder')}
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setPage(0) }}
              className="w-full h-10 pl-9 pr-8 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm text-[hsl(var(--foreground))] transition-[border-color,box-shadow] duration-150 placeholder:text-[#b6ada3] focus:border-[hsl(var(--primary))] focus:outline-none focus:[box-shadow:var(--ring-primary)]"
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
        </div>

        {/* Quick filters */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={isBanned === undefined && hasSub === undefined ? 'default' : 'outline'}
            size="sm"
            onClick={() => { handleFilter('banned', undefined); handleFilter('sub', undefined) }}
          >
            {t('admin_filter_all')}
          </Button>
          <Button
            variant={hasSub === true ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleFilter('sub', hasSub === true ? undefined : true)}
          >
            {t('admin_users_filter_subscribed')}
          </Button>
          <Button
            variant={hasSub === false ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleFilter('sub', hasSub === false ? undefined : false)}
          >
            {t('admin_users_filter_no_sub')}
          </Button>
          <Button
            variant={isBanned === true ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleFilter('banned', isBanned === true ? undefined : true)}
          >
            {t('admin_users_filter_banned')}
          </Button>
        </div>
      </div>

      {isError && (
        <p className="text-sm text-[var(--danger)]">{t('admin_users_load_error')}</p>
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
        emptyMessage={t('admin_users_empty')}
        keyExtractor={(row) => row.user_id}
      />
    </div>
  )
}
