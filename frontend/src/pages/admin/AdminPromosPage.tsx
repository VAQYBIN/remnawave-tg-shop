import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Tag, Pencil } from 'lucide-react'
import { DataTable, type Column } from '@/components/admin/DataTable'
import {
  getAdminPromos,
  createPromo,
  updatePromo,
  deletePromo,
  type AdminPromoItem,
  type PromoCreateRequest,
  type PromoUpdateRequest,
} from '@/api/admin/promos'

function fmtDate(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('ru-RU')
}

function PromoTypeBadge({ type }: { type: string }) {
  const cls =
    type === 'discount'
      ? 'bg-purple-100 text-purple-700'
      : 'bg-blue-100 text-blue-700'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {type === 'discount' ? 'Скидка' : 'Бонус дней'}
    </span>
  )
}

interface CreateModalProps {
  onClose: () => void
  onCreated: () => void
}

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const [code, setCode] = useState('')
  const [promoType, setPromoType] = useState<'bonus_days' | 'discount'>('bonus_days')
  const [bonusDays, setBonusDays] = useState('')
  const [discountPct, setDiscountPct] = useState('')
  const [maxActivations, setMaxActivations] = useState('100')
  const [validUntil, setValidUntil] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: createPromo,
    onSuccess: () => {
      onCreated()
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setError('')
    if (!code.trim()) return setError('Введите код')
    if (!maxActivations || Number(maxActivations) < 1) return setError('Укажите макс. активаций')
    if (promoType === 'bonus_days' && (!bonusDays || Number(bonusDays) < 1))
      return setError('Укажите количество бонусных дней')
    if (promoType === 'discount' && (!discountPct || Number(discountPct) < 1 || Number(discountPct) > 100))
      return setError('Скидка должна быть от 1 до 100%')

    const payload: PromoCreateRequest = {
      code: code.trim().toUpperCase(),
      promo_type: promoType,
      max_activations: Number(maxActivations),
      ...(promoType === 'bonus_days' ? { bonus_days: Number(bonusDays) } : {}),
      ...(promoType === 'discount' ? { discount_percentage: Number(discountPct) } : {}),
      ...(validUntil ? { valid_until: new Date(validUntil).toISOString() } : {}),
    }
    mutation.mutate(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[hsl(var(--card))] rounded-2xl border border-[hsl(var(--border))] w-full max-w-md p-6 shadow-xl">
        <h2 className="text-lg font-bold mb-4">Создать промокод</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Код</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="SUMMER25"
              className="w-full h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.3)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Тип</label>
            <div className="flex gap-2">
              {(['bonus_days', 'discount'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPromoType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    promoType === t
                      ? 'bg-[hsl(var(--primary))] text-white border-transparent'
                      : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]'
                  }`}
                >
                  {t === 'bonus_days' ? 'Бонус дней' : 'Скидка %'}
                </button>
              ))}
            </div>
          </div>

          {promoType === 'bonus_days' ? (
            <div>
              <label className="block text-sm font-medium mb-1">Бонусных дней</label>
              <input
                type="number"
                min={1}
                value={bonusDays}
                onChange={(e) => setBonusDays(e.target.value)}
                placeholder="30"
                className="w-full h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.3)]"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-1">Скидка (%)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={discountPct}
                onChange={(e) => setDiscountPct(e.target.value)}
                placeholder="20"
                className="w-full h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.3)]"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Макс. активаций</label>
            <input
              type="number"
              min={1}
              value={maxActivations}
              onChange={(e) => setMaxActivations(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.3)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Действует до (необязательно)</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.3)]"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 rounded-lg border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--muted))] transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 h-9 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {mutation.isPending ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface DeleteConfirmProps {
  promo: AdminPromoItem
  onClose: () => void
  onDeleted: () => void
}

function DeleteConfirm({ promo, onClose, onDeleted }: DeleteConfirmProps) {
  const mutation = useMutation({
    mutationFn: () => deletePromo(promo.promo_code_id),
    onSuccess: () => {
      onDeleted()
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[hsl(var(--card))] rounded-2xl border border-[hsl(var(--border))] w-full max-w-sm p-6 shadow-xl">
        <h2 className="text-lg font-bold mb-2">Удалить промокод?</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
          Промокод <span className="font-mono font-semibold">{promo.code}</span> будет удалён
          без возможности восстановления. Все связанные активации будут очищены.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-9 rounded-lg border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--muted))] transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex-1 h-9 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {mutation.isPending ? 'Удаление...' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface EditModalProps {
  promo: AdminPromoItem
  onClose: () => void
  onUpdated: () => void
}

function EditModal({ promo, onClose, onUpdated }: EditModalProps) {
  const [maxActivations, setMaxActivations] = useState(String(promo.max_activations))
  const [validUntil, setValidUntil] = useState(
    promo.valid_until ? promo.valid_until.slice(0, 10) : ''
  )
  const [bonusDays, setBonusDays] = useState(String(promo.bonus_days ?? ''))
  const [discountPct, setDiscountPct] = useState(String(promo.discount_percentage ?? ''))
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (data: PromoUpdateRequest) => updatePromo(promo.promo_code_id, data),
    onSuccess: () => {
      onUpdated()
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setError('')
    if (!maxActivations || Number(maxActivations) < 1) return setError('Укажите макс. активаций')
    if (promo.promo_type === 'bonus_days' && (!bonusDays || Number(bonusDays) < 1))
      return setError('Укажите количество бонусных дней')
    if (
      promo.promo_type === 'discount' &&
      (!discountPct || Number(discountPct) < 1 || Number(discountPct) > 100)
    )
      return setError('Скидка должна быть от 1 до 100%')

    const payload: PromoUpdateRequest = {
      max_activations: Number(maxActivations),
      valid_until: validUntil ? new Date(validUntil).toISOString() : null,
      ...(promo.promo_type === 'bonus_days' ? { bonus_days: Number(bonusDays) } : {}),
      ...(promo.promo_type === 'discount' ? { discount_percentage: Number(discountPct) } : {}),
    }
    mutation.mutate(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[hsl(var(--card))] rounded-2xl border border-[hsl(var(--border))] w-full max-w-md p-6 shadow-xl">
        <h2 className="text-lg font-bold mb-1">Редактировать промокод</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4 font-mono">{promo.code}</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {promo.promo_type === 'bonus_days' ? (
            <div>
              <label className="block text-sm font-medium mb-1">Бонусных дней</label>
              <input
                type="number"
                min={1}
                value={bonusDays}
                onChange={(e) => setBonusDays(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.3)]"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-1">Скидка (%)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={discountPct}
                onChange={(e) => setDiscountPct(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.3)]"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Макс. активаций</label>
            <input
              type="number"
              min={1}
              value={maxActivations}
              onChange={(e) => setMaxActivations(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.3)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Действует до (необязательно)</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.3)]"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 rounded-lg border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--muted))] transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 h-9 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {mutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function AdminPromosPage() {
  const [page, setPage] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminPromoItem | null>(null)
  const [editTarget, setEditTarget] = useState<AdminPromoItem | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'promos', page],
    queryFn: () => getAdminPromos(page, 20),
    staleTime: 30_000,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      updatePromo(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'promos'] }),
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'promos'] })
  }

  const columns: Column<AdminPromoItem>[] = [
    {
      key: 'code',
      header: 'Код',
      size: 140,
      render: (r) => (
        <span className="font-mono font-semibold text-sm">{r.code}</span>
      ),
    },
    {
      key: 'type',
      header: 'Тип',
      size: 120,
      render: (r) => <PromoTypeBadge type={r.promo_type} />,
    },
    {
      key: 'value',
      header: 'Значение',
      size: 110,
      render: (r) =>
        r.promo_type === 'discount'
          ? `${r.discount_percentage}%`
          : `${r.bonus_days} дн.`,
    },
    {
      key: 'activations',
      header: 'Активации',
      size: 110,
      render: (r) => (
        <div className="flex flex-col">
          <span>
            {r.current_activations} / {r.max_activations}
          </span>
          <div className="mt-1 h-1.5 bg-[hsl(var(--muted))] rounded-full overflow-hidden w-20">
            <div
              className="h-full bg-[hsl(var(--primary))] rounded-full"
              style={{
                width: `${Math.min(100, (r.current_activations / r.max_activations) * 100)}%`,
              }}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'valid_until',
      header: 'До',
      size: 100,
      render: (r) => fmtDate(r.valid_until),
    },
    {
      key: 'status',
      header: 'Статус',
      size: 90,
      render: (r) => (
        <button
          onClick={() =>
            toggleMutation.mutate({ id: r.promo_code_id, is_active: !r.is_active })
          }
          disabled={toggleMutation.isPending}
          role="switch"
          aria-checked={r.is_active}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            r.is_active ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted-foreground)/0.4)]'
          }`}
          title={r.is_active ? 'Отключить' : 'Включить'}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
              r.is_active ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      ),
    },
    {
      key: 'actions',
      header: '',
      size: 90,
      enableResizing: false,
      render: (r) => (
        <div className="flex gap-1">
          <button
            onClick={() => setEditTarget(r)}
            className="p-1.5 rounded-lg hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] transition-colors"
            title="Редактировать"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => setDeleteTarget(r)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
            title="Удалить"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Промокоды</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            Управление скидочными кодами и бонусными днями
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus size={16} />
          Создать
        </button>
      </div>

      {data?.total === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-[hsl(var(--muted-foreground))]">
          <Tag size={40} className="mb-3 opacity-30" />
          <p className="text-sm">Промокодов пока нет</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-[hsl(var(--primary))] text-sm font-medium hover:underline"
          >
            Создать первый
          </button>
        </div>
      )}

      {(isLoading || (data?.total ?? 0) > 0) && (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          total={data?.total ?? 0}
          page={page}
          pageSize={20}
          onPageChange={setPage}
          isLoading={isLoading}
          emptyMessage="Промокоды не найдены"
          keyExtractor={(r) => r.promo_code_id}
        />
      )}

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={invalidate} />
      )}

      {deleteTarget && (
        <DeleteConfirm
          promo={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={invalidate}
        />
      )}

      {editTarget && (
        <EditModal
          promo={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdated={invalidate}
        />
      )}
    </div>
  )
}
