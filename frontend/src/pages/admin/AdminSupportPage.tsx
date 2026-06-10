import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/support/StatusBadge'
import { CATEGORY_KEY, CATEGORY_ORDER, STATUS_KEY, STATUS_ORDER } from '@/components/support/supportMeta'
import { useDebounce } from '@/hooks/useDebounce'
import { getAdminTickets, type AdminTicketListItem } from '@/api/admin/support'

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function AdminSupportPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'support', 'list', status, category, debouncedSearch, page, pageSize],
    queryFn: () =>
      getAdminTickets({
        status: status || undefined,
        category: category || undefined,
        search: debouncedSearch || undefined,
        page,
        page_size: pageSize,
      }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })

  const columns: Column<AdminTicketListItem>[] = [
    {
      key: 'id',
      header: t('admin_support_col_id'),
      size: 70,
      render: (r) => (
        <Link to={`/admin/support/${r.id}`} className="flex items-center gap-1.5 font-semibold text-[hsl(var(--primary))] hover:underline">
          #{r.id}
          {r.unread_by_admin && <span className="h-2 w-2 rounded-full bg-[var(--danger)]" />}
        </Link>
      ),
    },
    {
      key: 'subject',
      header: t('admin_support_col_subject'),
      size: 280,
      render: (r) => (
        <Link to={`/admin/support/${r.id}`} className="text-[hsl(var(--foreground))] hover:underline">
          {r.subject}
        </Link>
      ),
    },
    {
      key: 'user',
      header: t('admin_support_col_user'),
      size: 180,
      render: (r) => <span className="text-[hsl(var(--muted-foreground))]">{r.account_label}</span>,
    },
    {
      key: 'category',
      header: t('admin_support_col_category'),
      size: 170,
      render: (r) => <span className="text-[hsl(var(--muted-foreground))]">{t(CATEGORY_KEY[r.category])}</span>,
    },
    {
      key: 'status',
      header: t('admin_support_col_status'),
      size: 120,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'updated',
      header: t('admin_support_col_updated'),
      size: 140,
      render: (r) => <span className="text-[hsl(var(--muted-foreground))]">{formatDate(r.last_message_at)}</span>,
    },
  ]

  return (
    <div className="space-y-6 px-4 py-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('admin_support_title')}</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{t('admin_support_subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(0)
          }}
          className="w-auto"
        >
          <option value="">{t('admin_support_filter_all_statuses')}</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {t(STATUS_KEY[s])}
            </option>
          ))}
        </Select>
        <Select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value)
            setPage(0)
          }}
          className="w-auto"
        >
          <option value="">{t('admin_support_filter_all_categories')}</option>
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {t(CATEGORY_KEY[c])}
            </option>
          ))}
        </Select>
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
          placeholder={t('admin_support_search_placeholder')}
          className="w-full sm:w-64"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        isLoading={isLoading}
        emptyMessage={t('admin_support_empty')}
        keyExtractor={(row) => row.id}
      />
    </div>
  )
}
