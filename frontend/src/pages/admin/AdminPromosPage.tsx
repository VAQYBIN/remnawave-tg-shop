import { useState } from 'react'
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import { useToast } from '@/hooks/useToast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from 'react-i18next'

function fmtDate(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('ru-RU')
}

function PromoTypeBadge({ type }: { type: string }) {
  const { t } = useTranslation()
  return (
    <Badge variant={type === 'discount' ? 'info' : 'secondary'}>
      {type === 'discount' ? t('admin_promos_discount') : t('admin_promos_bonus_days')}
    </Badge>
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
  const toast = useToast()
  const { t } = useTranslation()

  const mutation = useMutation({
    mutationFn: createPromo,
    onSuccess: () => {
      toast.success(t('admin_promos_created_toast'))
      onCreated()
      onClose()
    },
    onError: (e: Error) => {
      const message = e.message || t('admin_promos_create_error')
      setError(message)
      toast.error(message)
    },
  })

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setError('')
    if (!code.trim()) return setError(t('admin_promos_enter_code'))
    if (!maxActivations || Number(maxActivations) < 1) return setError(t('admin_promos_enter_max_activations'))
    if (promoType === 'bonus_days' && (!bonusDays || Number(bonusDays) < 1))
      return setError(t('admin_promos_enter_bonus_days'))
    if (promoType === 'discount' && (!discountPct || Number(discountPct) < 1 || Number(discountPct) > 100))
      return setError(t('admin_promos_discount_range'))

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
        <h2 className="text-lg font-bold mb-4">{t('admin_promos_create')}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label={t('admin_code')}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="SUMMER25"
            className="font-mono"
          />

          <div>
            <label className="block text-sm font-medium mb-1">{t('admin_type')}</label>
            <div className="flex gap-2">
              {(['bonus_days', 'discount'] as const).map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={promoType === type ? 'default' : 'outline'}
                  onClick={() => setPromoType(type)}
                  className="flex-1"
                >
                  {type === 'bonus_days' ? t('admin_promos_bonus_days') : t('admin_promos_discount_percent')}
                </Button>
              ))}
            </div>
          </div>

          {promoType === 'bonus_days' ? (
            <Input
              label={t('admin_promos_label_bonus_days')}
              type="number"
              min={1}
              value={bonusDays}
              onChange={(e) => setBonusDays(e.target.value)}
              placeholder="30"
            />
          ) : (
            <Input
              label={t('admin_promos_label_discount')}
              type="number"
              min={1}
              max={100}
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
              placeholder="20"
            />
          )}

          <Input
            label={t('admin_promos_label_max_activations')}
            type="number"
            min={1}
            value={maxActivations}
            onChange={(e) => setMaxActivations(e.target.value)}
          />

          <Input
            label={t('admin_promos_label_valid_until')}
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

          <div className="flex gap-2 mt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              {t('admin_cancel')}
            </Button>
            <Button type="submit" isLoading={mutation.isPending} className="flex-1">
              {mutation.isPending ? t('admin_creating') : t('admin_create')}
            </Button>
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
  const toast = useToast()
  const { t } = useTranslation()
  const mutation = useMutation({
    mutationFn: () => deletePromo(promo.promo_code_id),
    onSuccess: () => {
      toast.success(t('admin_promos_deleted_toast'))
      onDeleted()
      onClose()
    },
    onError: () => toast.error(t('admin_promos_delete_error')),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[hsl(var(--card))] rounded-2xl border border-[hsl(var(--border))] w-full max-w-sm p-6 shadow-xl">
        <h2 className="text-lg font-bold mb-2">{t('admin_promos_delete_confirm')}</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
          {t('admin_promos_delete_description', { code: promo.code })}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            {t('admin_cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            isLoading={mutation.isPending}
            className="flex-1"
          >
            {mutation.isPending ? t('admin_deleting') : t('admin_delete')}
          </Button>
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
  const toast = useToast()
  const { t } = useTranslation()

  const mutation = useMutation({
    mutationFn: (data: PromoUpdateRequest) => updatePromo(promo.promo_code_id, data),
    onSuccess: () => {
      toast.success(t('admin_promos_updated_toast'))
      onUpdated()
      onClose()
    },
    onError: (e: Error) => {
      const message = e.message || t('admin_promos_update_error')
      setError(message)
      toast.error(message)
    },
  })

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setError('')
    if (!maxActivations || Number(maxActivations) < 1) return setError(t('admin_promos_enter_max_activations'))
    if (promo.promo_type === 'bonus_days' && (!bonusDays || Number(bonusDays) < 1))
      return setError(t('admin_promos_enter_bonus_days'))
    if (
      promo.promo_type === 'discount' &&
      (!discountPct || Number(discountPct) < 1 || Number(discountPct) > 100)
    )
      return setError(t('admin_promos_discount_range'))

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
        <h2 className="text-lg font-bold mb-1">{t('admin_edit')} {t('admin_nav_promos').toLowerCase()}</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4 font-mono">{promo.code}</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {promo.promo_type === 'bonus_days' ? (
            <Input
              label={t('admin_promos_label_bonus_days')}
              type="number"
              min={1}
              value={bonusDays}
              onChange={(e) => setBonusDays(e.target.value)}
            />
          ) : (
            <Input
              label={t('admin_promos_label_discount')}
              type="number"
              min={1}
              max={100}
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
            />
          )}

          <Input
            label={t('admin_promos_label_max_activations')}
            type="number"
            min={1}
            value={maxActivations}
            onChange={(e) => setMaxActivations(e.target.value)}
          />

          <Input
            label={t('admin_promos_label_valid_until')}
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

          <div className="flex gap-2 mt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              {t('admin_cancel')}
            </Button>
            <Button type="submit" isLoading={mutation.isPending} className="flex-1">
              {mutation.isPending ? t('admin_saving') : t('admin_save')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function AdminPromosPage() {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminPromoItem | null>(null)
  const [editTarget, setEditTarget] = useState<AdminPromoItem | null>(null)
  const queryClient = useQueryClient()
  const toast = useToast()
  const { t } = useTranslation()

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'promos', page, pageSize],
    queryFn: () => getAdminPromos(page, pageSize),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      updatePromo(id, { is_active }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'promos'] })
      toast.success(vars.is_active ? t('admin_promos_activated_toast') : t('admin_promos_deactivated_toast'))
    },
    onError: () => toast.error(t('admin_promos_status_error')),
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'promos'] })
  }

  const columns: Column<AdminPromoItem>[] = [
    {
      key: 'code',
      header: t('admin_code'),
      size: 140,
      render: (r) => (
        <span className="font-mono font-semibold text-sm">{r.code}</span>
      ),
    },
    {
      key: 'type',
      header: t('admin_type'),
      size: 120,
      render: (r) => <PromoTypeBadge type={r.promo_type} />,
    },
    {
      key: 'value',
      header: t('admin_value'),
      size: 110,
      render: (r) =>
        r.promo_type === 'discount'
          ? `${r.discount_percentage}%`
          : `${r.bonus_days} ${t('admin_days_short')}`,
    },
    {
      key: 'activations',
      header: t('admin_promos_activations'),
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
      header: t('admin_promos_valid_until'),
      size: 100,
      render: (r) => fmtDate(r.valid_until),
    },
    {
      key: 'status',
      header: t('admin_status'),
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
          title={r.is_active ? t('admin_promos_deactivate_title') : t('admin_promos_activate_title')}
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
            title={t('admin_edit')}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => setDeleteTarget(r)}
            className="p-1.5 rounded-lg hover:bg-[var(--danger-bg)] text-[var(--danger)] transition-colors"
            title={t('admin_delete')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="px-4 py-6 sm:p-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('admin_promos_title')}</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1 max-w-xl">
            {t('admin_promos_subtitle')}
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="w-full sm:w-auto"
        >
          <Plus size={16} />
          {t('admin_promos_create_short')}
        </Button>
      </div>

      {data?.total === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-[hsl(var(--muted-foreground))]">
          <Tag size={40} className="mb-3 opacity-30" />
          <p className="text-sm">{t('admin_promos_empty')}</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-[hsl(var(--primary))] text-sm font-medium hover:underline"
          >
            {t('admin_promos_create_first')}
          </button>
        </div>
      )}

      {(isLoading || (data?.total ?? 0) > 0) && (
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
          isLoading={isLoading}
          emptyMessage={t('admin_promos_empty_table')}
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
