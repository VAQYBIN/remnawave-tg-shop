import { useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnSizingState,
} from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => React.ReactNode
  /**
   * Если задан — колонка сортируемая.
   * Значение — имя поля для передачи в API (order_by=<sortKey>).
   */
  sortKey?: string
  className?: string
  /** Ширина колонки в пикселях (по умолчанию 150). */
  size?: number
  /** Минимальная ширина при ресайзе (по умолчанию 60). */
  minSize?: number
  /** Разрешить ресайз (по умолчанию true). */
  enableResizing?: boolean
}

export interface SortingConfig {
  sortKey: string
  order: 'asc' | 'desc'
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
  sorting?: SortingConfig | null
  onSortingChange?: (cfg: SortingConfig) => void
  isLoading?: boolean
  emptyMessage?: string
  keyExtractor: (row: T) => string | number
}

function SortIcon({ state }: { state: 'asc' | 'desc' | null }) {
  if (state === 'asc') return <ChevronUp size={13} className="shrink-0" />
  if (state === 'desc') return <ChevronDown size={13} className="shrink-0" />
  return <ChevronsUpDown size={13} className="shrink-0 opacity-40" />
}

export function DataTable<T>({
  columns,
  data,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 30, 50, 100],
  sorting,
  onSortingChange,
  isLoading,
  emptyMessage = 'Нет данных',
  keyExtractor,
}: DataTableProps<T>) {
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})

  const tanstackColumns: ColumnDef<T>[] = columns.map((col) => ({
    id: col.key,
    size: col.size ?? 150,
    minSize: col.minSize ?? 60,
    maxSize: 600,
    enableSorting: false,
    enableResizing: col.enableResizing !== false,
    header: () => {
      if (!col.sortKey || !onSortingChange) {
        return (
          <span className="font-medium text-[hsl(var(--muted-foreground))]">
            {col.header}
          </span>
        )
      }
      const isActive = sorting?.sortKey === col.sortKey
      const currentOrder = isActive ? sorting!.order : null

      function handleClick() {
        if (!col.sortKey) return
        // Первый клик → desc, второй → asc, третий → desc и т.д.
        const nextOrder: 'asc' | 'desc' =
          isActive && currentOrder === 'desc' ? 'asc' : 'desc'
        onSortingChange!({ sortKey: col.sortKey, order: nextOrder })
      }

      return (
        <button
          onClick={handleClick}
          className={[
            'flex items-center gap-1 font-medium transition-colors select-none',
            isActive
              ? 'text-[hsl(var(--foreground))]'
              : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
          ].join(' ')}
        >
          {col.header}
          <SortIcon state={currentOrder} />
        </button>
      )
    },
    cell: ({ row }) => col.render(row.original),
  }))

  const table = useReactTable<T>({
    data,
    columns: tanstackColumns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    columnResizeMode: 'onChange',
    state: {
      sorting: [] as SortingState,
      columnSizing,
    },
    onColumnSizingChange: setColumnSizing,
    enableColumnResizing: true,
  })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : page * pageSize + 1
  const to = Math.min((page + 1) * pageSize, total)

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className="text-sm"
            style={{ tableLayout: 'fixed', width: '100%', minWidth: table.getTotalSize() }}
          >
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)]"
                >
                  {headerGroup.headers.map((header) => {
                    const col = columns.find((c) => c.key === header.id)
                    return (
                      <th
                        key={header.id}
                        className={`relative text-left px-4 py-3 select-none ${col?.className ?? ''}`}
                        style={{ width: header.getSize() }}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}

                        {/* Resize handle */}
                        {header.column.getCanResize() && (
                          <div
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            className={[
                              'absolute right-0 top-0 h-full w-[5px] cursor-col-resize touch-none',
                              'flex items-center justify-center group',
                            ].join(' ')}
                          >
                            <div
                              className={[
                                'w-[2px] h-4 rounded-full transition-colors',
                                header.column.getIsResizing()
                                  ? 'bg-[hsl(var(--primary))]'
                                  : 'bg-transparent group-hover:bg-[hsl(var(--border))]',
                              ].join(' ')}
                            />
                          </div>
                        )}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))]">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3">
                        <div className="h-4 bg-[hsl(var(--muted))] rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-10 text-center text-[hsl(var(--muted-foreground))]"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={keyExtractor(row.original)}
                    className="hover:bg-[hsl(var(--muted)/0.3)] transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => {
                      const col = columns.find((c) => c.key === cell.column.id)
                      return (
                        <td
                          key={cell.id}
                          className={`px-4 py-3 overflow-hidden ${col?.className ?? ''}`}
                          style={{ width: cell.column.getSize() }}
                        >
                          <div className="truncate">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-[hsl(var(--muted-foreground))]">
        <span>
          {total === 0 ? '0 записей' : `${from}–${to} из ${total}`}
        </span>
        <div className="flex items-center gap-3">
          {onPageSizeChange && (
            <label className="flex items-center gap-2">
              <span>Строк</span>
              <select
                value={pageSize}
                onChange={(event) => onPageSizeChange(Number(event.target.value))}
                disabled={isLoading}
                className="h-8 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.25)] disabled:opacity-50"
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0 || isLoading}
              className="p-1.5 rounded-lg hover:bg-[hsl(var(--muted))] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-2">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1 || isLoading}
              className="p-1.5 rounded-lg hover:bg-[hsl(var(--muted))] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
