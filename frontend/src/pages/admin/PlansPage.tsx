import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, Check, X, GripVertical,
  Package, Puzzle, ChevronDown, Loader2, Clock, Archive, ArchiveRestore,
} from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor,
  KeyboardSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  getAdminPlans, createPlan, updatePlan, deletePlan,
  archivePlan, unarchivePlan,
  createPlanOption, updatePlanOption, deletePlanOption,
} from '@/api/admin/plans'
import type {
  PricingPlanResponse, PricingPlanCreateRequest,
  PricingPlanOptionResponse, PricingPlanOptionCreateRequest,
  PricingPlanOptionUpdateRequest,
} from '@/api/admin/plans'
import { getSquads } from '@/api/admin/remnawave'
import { useTranslation } from 'react-i18next'
import { useToastContext } from '@/lib/toast-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs } from '@/components/ui/tabs'

// ── Constants ─────────────────────────────────────────────────────────────────

const RESET_STRATEGIES = ['NO_RESET', 'DAY', 'WEEK', 'MONTH', 'MONTH_ROLLING'] as const
type ResetStrategy = typeof RESET_STRATEGIES[number]

// ── Helpers ─────────────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: string }) {
  const isAddon = kind === 'addon'
  return (
    <Badge variant={isAddon ? 'secondary' : 'info'} className="uppercase tracking-wide">
      {isAddon ? <Puzzle size={10} /> : <Package size={10} />}
      {kind}
    </Badge>
  )
}

function BillingBadge({ model }: { model: string }) {
  const variants: Record<string, 'info' | 'warning' | 'success'> = {
    time: 'info',
    traffic: 'warning',
    hybrid: 'success',
  }
  return (
    <Badge variant={variants[model] ?? 'secondary'} className="uppercase tracking-wide">
      {model}
    </Badge>
  )
}

function optionPriceSummary(plan: PricingPlanResponse): string {
  const enabled = plan.options.filter(o => o.is_enabled)
  if (enabled.length === 0) return '—'
  const rubles = enabled.filter(o => o.price_rub != null).map(o => o.price_rub!)
  if (rubles.length === 0) return '—'
  const min = Math.min(...rubles)
  const max = Math.max(...rubles)
  return min === max
    ? `${min.toLocaleString('ru-RU')} ₽`
    : `${min.toLocaleString('ru-RU')}–${max.toLocaleString('ru-RU')} ₽`
}

const inputCls = 'w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]'
const labelCls = 'block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1'

// ── Squad picker ─────────────────────────────────────────────────────────────

function SquadPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['admin', 'remnawave', 'squads'],
    queryFn: getSquads,
    enabled: false,
    staleTime: 5 * 60 * 1000,
  })

  function handleOpen() {
    setOpen(v => !v)
    refetch()
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          className={inputCls + ' flex-1'}
          placeholder={t('admin_plans_squad_placeholder')}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={handleOpen}
          className="flex items-center gap-1 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] shrink-0"
        >
          {isFetching ? <Loader2 size={12} className="animate-spin" /> : <ChevronDown size={12} />}
          {t('admin_plans_squad_load')}
        </button>
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-md)]">
          {isError && (
            <p className="px-3 py-2 text-xs text-[var(--danger)]">{t('admin_plans_squad_error')}</p>
          )}
          {isFetching && (
            <p className="px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">{t('admin_plans_squad_loading')}</p>
          )}
          {data?.items.map(sq => (
            <button
              key={sq.uuid}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-[hsl(var(--muted))] flex justify-between items-center gap-2"
              onClick={() => { onChange(sq.uuid); setOpen(false) }}
            >
              <span className="font-medium">{sq.name}</span>
              <span className="text-[10px] text-[hsl(var(--muted-foreground))] truncate max-w-[180px]">{sq.uuid}</span>
            </button>
          ))}
          {data && data.items.length === 0 && (
            <p className="px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">Нет squads</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Option draft types ────────────────────────────────────────────────────────

interface OptionDraft {
  id?: number
  duration_type: 'months' | 'days'
  duration_months: string
  duration_days: string
  traffic_gb: string
  traffic_unlimited: boolean
  price_rub: string
  price_stars: string
  is_enabled: boolean
}

function emptyOption(billingModel = 'time', isTrial = false): OptionDraft {
  return {
    duration_type: isTrial ? 'days' : 'months',
    duration_months: '',
    duration_days: '',
    traffic_gb: '',
    traffic_unlimited: billingModel === 'time',
    price_rub: isTrial ? '0' : '',
    price_stars: '',
    is_enabled: true,
  }
}

function optionResponseToDraft(opt: PricingPlanOptionResponse): OptionDraft {
  return {
    id: opt.id,
    duration_type: opt.duration_days != null ? 'days' : 'months',
    duration_months: opt.duration_months?.toString() ?? '',
    duration_days: opt.duration_days?.toString() ?? '',
    traffic_gb: opt.traffic_gb?.toString() ?? '',
    traffic_unlimited: opt.traffic_unlimited,
    price_rub: opt.price_rub?.toString() ?? '',
    price_stars: opt.price_stars?.toString() ?? '',
    is_enabled: opt.is_enabled,
  }
}

// ── Option row in editor ──────────────────────────────────────────────────────

function OptionRow({
  opt,
  billingModel,
  isTrial,
  onChange,
  onDelete,
  onSave,
  onCancelEdit,
  saveLabel,
  isPending,
}: {
  opt: OptionDraft
  billingModel: string
  isTrial?: boolean
  onChange: (o: OptionDraft) => void
  onDelete?: () => void
  onSave?: () => void
  onCancelEdit?: () => void
  saveLabel?: string
  isPending?: boolean
}) {
  const { t } = useTranslation()
  const showDuration = billingModel === 'time' || billingModel === 'hybrid'

  const trafficField = (
    <div>
      <label className="flex items-center gap-2 cursor-pointer select-none mb-1.5">
        <Switch
          checked={opt.traffic_unlimited}
          onCheckedChange={checked => onChange({ ...opt, traffic_unlimited: checked, traffic_gb: checked ? '' : opt.traffic_gb })}
        />
        <span className="text-[11px] text-[hsl(var(--muted-foreground))]">{t('admin_plans_option_unlimited')}</span>
      </label>
      {opt.traffic_unlimited ? (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] italic">
          ∞ Без ограничений
        </div>
      ) : (
        <div className="relative">
          <input
            type="number" min="1"
            className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-sm pr-8"
            value={opt.traffic_gb}
            onChange={e => onChange({ ...opt, traffic_gb: e.target.value })}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[hsl(var(--muted-foreground))] pointer-events-none">ГБ</span>
        </div>
      )}
    </div>
  )

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] overflow-hidden">
      {/* Top: Period & Traffic */}
      <div className="bg-[hsl(var(--card))] px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[hsl(var(--muted-foreground))]">
            Период и трафик
          </span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Switch
                checked={opt.is_enabled}
                onCheckedChange={checked => onChange({ ...opt, is_enabled: checked })}
              />
              <span className="text-[11px] text-[hsl(var(--muted-foreground))]">{t('admin_plans_option_enabled')}</span>
            </label>
            {onSave && (
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={onSave}
                  isLoading={isPending}
                >
                  {!isPending && <Check size={10} />}
                  {saveLabel ?? t('admin_plans_save')}
                </Button>
                {onCancelEdit && (
                  <button type="button" onClick={onCancelEdit} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
                    <X size={14} />
                  </button>
                )}
              </>
            )}
            {onDelete && !onSave && (
              <button type="button" onClick={onDelete} className="text-[hsl(var(--muted-foreground))] hover:text-[var(--danger)] transition-colors">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {showDuration ? (
          <div className="grid grid-cols-[78px_78px_1fr] gap-2.5 items-end">
            <div>
              <label className="block text-[11px] text-[hsl(var(--muted-foreground))] mb-1.5">Ед. периода</label>
              <select
                className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-xs"
                value={opt.duration_type}
                onChange={e => onChange({ ...opt, duration_type: e.target.value as 'months' | 'days', duration_months: '', duration_days: '' })}
              >
                <option value="months">{t('admin_plans_option_use_months')}</option>
                <option value="days">{t('admin_plans_option_use_days')}</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[hsl(var(--muted-foreground))] mb-1.5">Кол-во</label>
              <input
                type="number"
                min="1"
                max={opt.duration_type === 'months' ? '36' : '365'}
                className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm text-center"
                value={opt.duration_type === 'months' ? opt.duration_months : opt.duration_days}
                onChange={e => {
                  if (opt.duration_type === 'months') onChange({ ...opt, duration_months: e.target.value })
                  else onChange({ ...opt, duration_days: e.target.value })
                }}
              />
            </div>
            {trafficField}
          </div>
        ) : (
          trafficField
        )}
      </div>

      {/* Bottom: Prices */}
      <div className="bg-[hsl(var(--muted)/0.45)] px-4 py-3 border-t border-[hsl(var(--border))]">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-[hsl(var(--muted-foreground))] mb-2.5">Цены</span>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] text-[hsl(var(--muted-foreground))] mb-1.5">Цена в рублях ₽</label>
            <input
              type="number" min="0"
              className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-sm"
              value={opt.price_rub}
              readOnly={isTrial}
              onChange={e => !isTrial && onChange({ ...opt, price_rub: e.target.value })}
            />
          </div>
          {!isTrial && (
            <div>
              <label className="block text-[11px] text-[hsl(var(--muted-foreground))] mb-1.5">Цена в звёздах ⭐</label>
              <input
                type="number" min="0"
                className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-sm"
                value={opt.price_stars}
                onChange={e => onChange({ ...opt, price_stars: e.target.value })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Plan Dialog ───────────────────────────────────────────────────────────────

interface PlanDialogProps {
  plan?: PricingPlanResponse
  onClose: () => void
}

function PlanDialog({ plan, onClose }: PlanDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToastContext()
  const qc = useQueryClient()
  const isEdit = !!plan

  // Plan fields
  const [nameRu, setNameRu] = useState(plan?.name_ru ?? '')
  const [nameEn, setNameEn] = useState(plan?.name_en ?? '')
  const [descRu, setDescRu] = useState(plan?.description_ru ?? '')
  const [descEn, setDescEn] = useState(plan?.description_en ?? '')
  const [planKind, setPlanKind] = useState(plan?.plan_kind ?? 'standalone')
  const [billingModel, setBillingModel] = useState(plan?.billing_model ?? 'time')
  const [resetStrategy, setResetStrategy] = useState<ResetStrategy>(
    (plan?.traffic_reset_strategy as ResetStrategy) ?? 'NO_RESET'
  )
  const [squadUuid, setSquadUuid] = useState(plan?.remnawave_squad_uuid ?? '')
  const [isEnabled, setIsEnabled] = useState(plan?.is_enabled ?? true)
  const [minPriceRub, setMinPriceRub] = useState(plan?.min_price_rub?.toString() ?? '')
  const [minPriceStars, setMinPriceStars] = useState(plan?.min_price_stars?.toString() ?? '')
  const [hwidDeviceLimit, setHwidDeviceLimit] = useState(plan?.hwid_device_limit?.toString() ?? '')

  // Options state
  const [existingOptions, setExistingOptions] = useState<PricingPlanOptionResponse[]>(plan?.options ?? [])
  const [newOptions, setNewOptions] = useState<OptionDraft[]>(isEdit ? [] : [emptyOption(billingModel)])
  const [editingOptId, setEditingOptId] = useState<number | null>(null)
  const [editingOptDraft, setEditingOptDraft] = useState<OptionDraft | null>(null)

  const [saving, setSaving] = useState(false)

  // When billingModel changes to 'time', force resetStrategy to NO_RESET
  function handleBillingModelChange(model: string) {
    setBillingModel(model)
    if (model === 'time') setResetStrategy('NO_RESET')
  }

  function buildCreateOptionBody(opt: OptionDraft): PricingPlanOptionCreateRequest {
    const body: PricingPlanOptionCreateRequest = { is_enabled: opt.is_enabled }
    if (opt.duration_type === 'months') {
      const months = parseInt(opt.duration_months)
      if (!isNaN(months) && months > 0) body.duration_months = months
    } else {
      const days = parseInt(opt.duration_days)
      if (!isNaN(days) && days > 0) body.duration_days = days
    }
    if (opt.traffic_unlimited) {
      body.traffic_unlimited = true
    } else {
      const gb = parseFloat(opt.traffic_gb)
      if (!isNaN(gb) && gb > 0) body.traffic_gb = gb
    }
    const rub = parseFloat(opt.price_rub)
    if (!isNaN(rub) && rub >= 0) body.price_rub = rub
    const stars = parseInt(opt.price_stars)
    if (!isNaN(stars) && stars >= 0) body.price_stars = stars
    return body
  }

  function buildUpdateOptionBody(opt: OptionDraft): PricingPlanOptionUpdateRequest {
    const body: PricingPlanOptionUpdateRequest = { is_enabled: opt.is_enabled }
    if (opt.duration_type === 'months') {
      const months = parseInt(opt.duration_months)
      body.duration_months = !isNaN(months) && months > 0 ? months : null
      body.duration_days = null
    } else {
      const days = parseInt(opt.duration_days)
      body.duration_days = !isNaN(days) && days > 0 ? days : null
      body.duration_months = null
    }
    if (opt.traffic_unlimited) {
      body.traffic_unlimited = true
      body.traffic_gb = null
    } else {
      const gb = parseFloat(opt.traffic_gb)
      body.traffic_gb = !isNaN(gb) && gb > 0 ? gb : null
      body.traffic_unlimited = false
    }
    const rub = parseFloat(opt.price_rub)
    body.price_rub = !isNaN(rub) && rub >= 0 ? rub : null
    const stars = parseInt(opt.price_stars)
    body.price_stars = !isNaN(stars) && stars >= 0 ? stars : null
    return body
  }

  function isNewOptionNonEmpty(opt: OptionDraft): boolean {
    return !!(opt.duration_months || opt.duration_days || opt.traffic_gb || opt.traffic_unlimited)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameRu.trim()) return
    if (planKind === 'standalone' && !squadUuid.trim()) {
      toast(t('admin_plans_squad_required'), 'error')
      return
    }
    setSaving(true)
    try {
      const minRub = parseFloat(minPriceRub)
      const minStars = parseInt(minPriceStars)
      // Пусто = наследовать лимит устройств из .env; 0 = без лимита
      const hwidLimit = parseInt(hwidDeviceLimit)
      const hwidLimitValue = !isNaN(hwidLimit) && hwidLimit >= 0 ? hwidLimit : null

      if (isEdit) {
        await updatePlan(plan.id, {
          name_ru: nameRu.trim(),
          name_en: nameEn.trim() || null,
          description_ru: descRu.trim() || null,
          description_en: descEn.trim() || null,
          remnawave_squad_uuid: squadUuid.trim() || null,
          plan_kind: planKind,
          billing_model: billingModel,
          traffic_reset_strategy: resetStrategy,
          is_enabled: isEnabled,
          min_price_rub: !isNaN(minRub) && minRub > 0 ? minRub : null,
          min_price_stars: !isNaN(minStars) && minStars > 0 ? minStars : null,
          hwid_device_limit: hwidLimitValue,
        })
        for (const opt of newOptions) {
          if (!isNewOptionNonEmpty(opt)) continue
          await createPlanOption(plan.id, buildCreateOptionBody(opt))
        }
        toast(t('admin_plans_update_success'), 'success')
      } else {
        const body: PricingPlanCreateRequest = {
          name_ru: nameRu.trim(),
          name_en: nameEn.trim() || undefined,
          description_ru: descRu.trim() || undefined,
          description_en: descEn.trim() || undefined,
          remnawave_squad_uuid: squadUuid.trim() || undefined,
          plan_kind: planKind,
          billing_model: billingModel,
          traffic_reset_strategy: resetStrategy,
          is_trial: false,
          is_enabled: isEnabled,
          min_price_rub: !isNaN(minRub) && minRub > 0 ? minRub : undefined,
          min_price_stars: !isNaN(minStars) && minStars > 0 ? minStars : undefined,
          hwid_device_limit: hwidLimitValue ?? undefined,
        }
        const created = await createPlan(body)
        for (const opt of newOptions) {
          if (!isNewOptionNonEmpty(opt)) continue
          await createPlanOption(created.id, buildCreateOptionBody(opt))
        }
        toast(t('admin_plans_create_success'), 'success')
      }
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
      onClose()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  // Delete existing option
  const delOptMut = useMutation({
    mutationFn: ({ optId }: { optId: number }) => deletePlanOption(plan!.id, optId),
    onSuccess: (_, { optId }) => {
      setExistingOptions(prev => prev.filter(o => o.id !== optId))
      toast(t('admin_plans_option_deleted'), 'success')
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  // Toggle existing option
  const toggleOptMut = useMutation({
    mutationFn: ({ optId, enabled }: { optId: number; enabled: boolean }) =>
      updatePlanOption(plan!.id, optId, { is_enabled: enabled }),
    onSuccess: (updated) => {
      setExistingOptions(prev => prev.map(o => o.id === updated.id ? updated : o))
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  // Update existing option (inline edit)
  const updateOptMut = useMutation({
    mutationFn: ({ optId, body }: { optId: number; body: PricingPlanOptionUpdateRequest }) =>
      updatePlanOption(plan!.id, optId, body),
    onSuccess: (updated) => {
      setExistingOptions(prev => prev.map(o => o.id === updated.id ? updated : o))
      setEditingOptId(null)
      setEditingOptDraft(null)
      toast(t('admin_plans_option_updated'), 'success')
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  function startEditOption(opt: PricingPlanOptionResponse) {
    setEditingOptId(opt.id)
    setEditingOptDraft(optionResponseToDraft(opt))
  }

  function cancelEditOption() {
    setEditingOptId(null)
    setEditingOptDraft(null)
  }

  function saveEditOption() {
    if (!editingOptDraft || editingOptId == null) return
    updateOptMut.mutate({ optId: editingOptId, body: buildUpdateOptionBody(editingOptDraft) })
  }

  function optionLabel(opt: PricingPlanOptionResponse): string {
    const parts: string[] = []
    if (opt.duration_months) parts.push(`${opt.duration_months} мес.`)
    if (opt.duration_days) parts.push(`${opt.duration_days} дн.`)
    if (opt.traffic_unlimited) parts.push('∞')
    else if (opt.traffic_gb) parts.push(`${opt.traffic_gb} ГБ`)
    if (opt.price_rub != null) parts.push(`${opt.price_rub} ₽`)
    if (opt.price_stars != null) parts.push(`${opt.price_stars} ⭐`)
    return parts.join(' · ') || `Option #${opt.id}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className="bg-[hsl(var(--card))] rounded-2xl shadow-[var(--shadow-lg)] w-full max-w-xl mx-auto flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4">
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">
            {isEdit ? t('admin_plans_edit') : t('admin_plans_create')}
          </h2>
          <button onClick={onClose} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 72px)' }}>

          {/* ── Section 1: Basic info ─────────────────────────────────── */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[hsl(var(--muted-foreground))]">
              Основная информация
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('admin_plans_name_ru')} *</label>
                <input className={inputCls} required value={nameRu} onChange={e => setNameRu(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('admin_plans_name_en')}</label>
                <input className={inputCls} value={nameEn} onChange={e => setNameEn(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('admin_plans_desc_ru')}</label>
                <textarea className={inputCls + ' resize-none'} rows={2} value={descRu} onChange={e => setDescRu(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('admin_plans_desc_en')}</label>
                <textarea className={inputCls + ' resize-none'} rows={2} value={descEn} onChange={e => setDescEn(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="h-px bg-[hsl(var(--border))]" />

          {/* ── Section 2: Billing & Type ─────────────────────────────── */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[hsl(var(--muted-foreground))]">
              Биллинг и тип
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>{t('admin_plans_kind')}</label>
                <Tabs
                  value={planKind}
                  onValueChange={setPlanKind}
                  className="flex w-full"
                  items={[
                    { value: 'standalone', label: t('admin_plans_kind_standalone') },
                    { value: 'addon', label: t('admin_plans_kind_addon') },
                  ]}
                />
              </div>
              <div>
                <label className={labelCls}>{t('admin_plans_billing')}</label>
                <Tabs
                  value={billingModel}
                  onValueChange={handleBillingModelChange}
                  className="flex w-full"
                  items={[
                    { value: 'time', label: t('admin_plans_billing_time') },
                    { value: 'traffic', label: t('admin_plans_billing_traffic') },
                    { value: 'hybrid', label: t('admin_plans_billing_hybrid') },
                  ]}
                />
              </div>
            </div>

            {billingModel !== 'time' && (
              <div>
                <label className={labelCls}>{t('admin_plans_reset_strategy')}</label>
                <select className={inputCls} value={resetStrategy} onChange={e => setResetStrategy(e.target.value as ResetStrategy)}>
                  <option value="NO_RESET">{t('admin_plans_reset_no_reset')}</option>
                  <option value="DAY">{t('admin_plans_reset_day')}</option>
                  <option value="WEEK">{t('admin_plans_reset_week')}</option>
                  <option value="MONTH">{t('admin_plans_reset_month')}</option>
                  <option value="MONTH_ROLLING">{t('admin_plans_reset_month_rolling')}</option>
                </select>
              </div>
            )}

            <div>
              <label className={labelCls}>
                {t('admin_plans_squad_uuid')}
                {planKind === 'standalone' && <span className="text-[var(--danger)] ml-0.5">*</span>}
              </label>
              <SquadPicker value={squadUuid} onChange={setSquadUuid} />
            </div>

            <div>
              <label className={labelCls}>{t('admin_plans_hwid_limit')}</label>
              <input
                type="number" min="0"
                className={inputCls}
                placeholder={t('admin_plans_hwid_limit_placeholder')}
                value={hwidDeviceLimit}
                onChange={e => setHwidDeviceLimit(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                {t('admin_plans_hwid_limit_hint')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('admin_plans_min_price_rub')} (prorate)</label>
                <input
                  type="number" min="0" step="0.01"
                  className={inputCls}
                  placeholder="—"
                  value={minPriceRub}
                  onChange={e => setMinPriceRub(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>{t('admin_plans_min_price_stars')} (prorate)</label>
                <input
                  type="number" min="0"
                  className={inputCls}
                  placeholder="—"
                  value={minPriceStars}
                  onChange={e => setMinPriceStars(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-5 pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
                <span className="text-sm text-[hsl(var(--foreground))]">{t('admin_plans_enabled')}</span>
              </label>
            </div>
          </div>

          <div className="h-px bg-[hsl(var(--border))]" />

          {/* ── Section 3: Options ───────────────────────────────────── */}
          <div className="px-5 py-4 space-y-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[hsl(var(--muted-foreground))] mb-0.5">
                Опции подписки
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Каждая опция — отдельный вариант срока и стоимости</p>
            </div>

            {/* Existing options in edit mode */}
            {isEdit && existingOptions.length > 0 && (
              <div className="space-y-2.5">
                {existingOptions.map(opt => (
                  <div key={opt.id}>
                    {editingOptId === opt.id && editingOptDraft ? (
                      <OptionRow
                        opt={editingOptDraft}
                        billingModel={billingModel}
                        onChange={setEditingOptDraft}
                        onSave={saveEditOption}
                        onCancelEdit={cancelEditOption}
                        saveLabel={t('admin_plans_save')}
                        isPending={updateOptMut.isPending}
                      />
                    ) : (
                      <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2.5">
                        <span className="flex-1 text-xs text-[hsl(var(--foreground))]">{optionLabel(opt)}</span>
                        <button
                          type="button"
                          onClick={() => toggleOptMut.mutate({ optId: opt.id, enabled: !opt.is_enabled })}
                          className={[
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0',
                            opt.is_enabled ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
                          ].join(' ')}
                        >
                          {opt.is_enabled ? <Check size={10} /> : <X size={10} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditOption(opt)}
                          className="shrink-0 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] p-0.5 transition-colors"
                          title={t('admin_edit')}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => delOptMut.mutate({ optId: opt.id })}
                          className="shrink-0 text-[hsl(var(--muted-foreground))] hover:text-[var(--danger)] p-0.5 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* New options */}
            <div className="space-y-2.5">
              {newOptions.map((opt, idx) => (
                <OptionRow
                  key={idx}
                  opt={opt}
                  billingModel={billingModel}
                  onChange={updated => setNewOptions(prev => prev.map((o, i) => i === idx ? updated : o))}
                  onDelete={() => setNewOptions(prev => prev.filter((_, i) => i !== idx))}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setNewOptions(prev => [...prev, emptyOption(billingModel)])}
              className="w-full rounded-xl border border-dashed border-[hsl(var(--primary)/0.4)] py-2.5 text-sm text-[hsl(var(--primary))] font-medium hover:bg-[hsl(var(--primary)/0.04)] transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus size={15} />
              {t('admin_plans_options_add')}
            </button>
          </div>

          {/* ── Footer ───────────────────────────────────────────────── */}
          <div className="flex justify-end gap-3 px-5 py-4 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('admin_cancel')}
            </Button>
            <Button type="submit" isLoading={saving}>
              {t('admin_plans_save')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Plan row ──────────────────────────────────────────────────────────────────

interface PlanRowProps {
  plan: PricingPlanResponse
  index: number
  onEdit: (plan: PricingPlanResponse) => void
  onDelete: (id: number) => void
  onArchive?: (id: number) => void
  onToggle: (plan: PricingPlanResponse) => void
  disabled: boolean
}

function SortablePlanRow({ plan, index, onEdit, onDelete, onArchive, onToggle, disabled }: PlanRowProps) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: plan.id })

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="hover:bg-[hsl(var(--muted)/0.3)] transition-colors"
    >
      <td className="px-2 py-3 w-8">
        <button
          {...attributes} {...listeners}
          className="cursor-grab active:cursor-grabbing text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] touch-none p-1"
        >
          <GripVertical size={16} />
        </button>
      </td>
      <td className="px-2 py-3 text-xs text-[hsl(var(--muted-foreground))] w-6 text-center select-none">{index + 1}</td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-[hsl(var(--foreground))]">
            {plan.name_ru}
            {plan.is_trial && (
              <span className="ml-1.5 inline-flex items-center text-[10px] font-bold uppercase bg-[var(--warning-bg)] text-[#a06a12] px-1.5 py-0.5 rounded">trial</span>
            )}
          </span>
          <div className="flex items-center gap-1.5">
            <KindBadge kind={plan.plan_kind} />
            <BillingBadge model={plan.billing_model} />
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
        {plan.options.length > 0 ? `${plan.options.length} opt.` : '—'}
      </td>
      <td className="px-4 py-3 text-sm font-extrabold text-[hsl(var(--foreground))]">{optionPriceSummary(plan)}</td>
      <td className="px-4 py-3">
        <button
          onClick={() => onToggle(plan)}
          disabled={disabled}
          className={[
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
            plan.is_enabled
              ? 'bg-[var(--success-bg)] text-[var(--success)] hover:opacity-90'
              : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--border))]',
          ].join(' ')}
        >
          {plan.is_enabled ? <Check size={12} /> : <X size={12} />}
          {plan.is_enabled ? t('admin_enabled') : t('admin_disabled')}
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 justify-end">
          <button onClick={() => onEdit(plan)} className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]">
            <Pencil size={15} />
          </button>
          {onArchive && (
            <button onClick={() => onArchive(plan.id)} className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[#a06a12] hover:bg-[var(--warning-bg)]" title="В архив">
              <Archive size={15} />
            </button>
          )}
          <button onClick={() => onDelete(plan.id)} className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)]">
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function PlanMobileCard({ plan, index, onEdit, onDelete, onArchive, onToggle, disabled }: PlanRowProps) {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] mb-1">
            <span>#{index + 1}</span>
          </div>
          <h3 className="text-base font-semibold leading-snug text-[hsl(var(--foreground))]">
            {plan.name_ru}
            {plan.is_trial && (
              <span className="ml-1.5 inline-flex items-center text-[10px] font-bold uppercase bg-[var(--warning-bg)] text-[#a06a12] px-1.5 py-0.5 rounded">trial</span>
            )}
          </h3>
          <div className="flex items-center gap-1.5 mt-1">
            <KindBadge kind={plan.plan_kind} />
            <BillingBadge model={plan.billing_model} />
          </div>
        </div>
        <button
          onClick={() => onToggle(plan)}
          disabled={disabled}
          className={[
            'shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
            plan.is_enabled ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
          ].join(' ')}
        >
          {plan.is_enabled ? <Check size={12} /> : <X size={12} />}
          {plan.is_enabled ? t('admin_enabled') : t('admin_off')}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-[hsl(var(--muted)/0.45)] px-3 py-2">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">{t('admin_plans_options')}</div>
          <div className="mt-0.5 font-semibold text-[hsl(var(--foreground))]">{plan.options.length}</div>
        </div>
        <div className="rounded-lg bg-[hsl(var(--muted)/0.45)] px-3 py-2">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">{t('admin_plans_price_rub')}</div>
          <div className="mt-0.5 font-extrabold text-[hsl(var(--foreground))]">{optionPriceSummary(plan)}</div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => onEdit(plan)}>
          <Pencil size={14} />
          {t('admin_edit')}
        </Button>
        {onArchive && (
          <button
            onClick={() => onArchive(plan.id)}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-[hsl(var(--border))] px-3 h-8 text-xs font-semibold text-[#a06a12] hover:bg-[var(--warning-bg)] transition-colors"
          >
            <Archive size={14} />
            {t('admin_plans_archive_submit')}
          </button>
        )}
        <Button variant="destructive" size="sm" onClick={() => onDelete(plan.id)}>
          <Trash2 size={14} />
          {t('admin_delete')}
        </Button>
      </div>
    </div>
  )
}

// ── Archived plan row / card ──────────────────────────────────────────────────

function ArchivedPlanRow({
  plan,
  onUnarchive,
  onDelete,
  disabled,
}: {
  plan: PricingPlanResponse
  onUnarchive: (id: number) => void
  onDelete: (id: number) => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  return (
    <tr className="opacity-60 hover:opacity-80 transition-opacity">
      <td className="px-2 py-3 w-8" />
      <td className="px-4 py-3" colSpan={4}>
        <div className="flex flex-col gap-1">
          <span className="font-medium text-[hsl(var(--foreground))] flex items-center gap-2">
            {plan.name_ru}
            <span className="text-[10px] font-semibold uppercase bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] px-1.5 py-0.5 rounded">
              {t('admin_plans_archived_badge')}
            </span>
          </span>
          <div className="flex items-center gap-1.5">
            <KindBadge kind={plan.plan_kind} />
            <BillingBadge model={plan.billing_model} />
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => onUnarchive(plan.id)}
            disabled={disabled}
            className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[var(--success)] hover:bg-[var(--success-bg)] disabled:opacity-40"
            title={t('admin_plans_unarchive_submit')}
          >
            <ArchiveRestore size={15} />
          </button>
          <button
            onClick={() => onDelete(plan.id)}
            disabled={disabled}
            className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] disabled:opacity-40"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function ArchivedPlanCard({
  plan,
  onUnarchive,
  onDelete,
  disabled,
}: {
  plan: PricingPlanResponse
  onUnarchive: (id: number) => void
  onDelete: (id: number) => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 opacity-60">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-[hsl(var(--foreground))]">{plan.name_ru}</span>
        <span className="text-[10px] font-semibold uppercase bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] px-1.5 py-0.5 rounded">
          {t('admin_plans_archived_badge')}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mb-3">
        <KindBadge kind={plan.plan_kind} />
        <BillingBadge model={plan.billing_model} />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => onUnarchive(plan.id)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-[hsl(var(--border))] px-3 h-8 text-xs font-semibold text-[var(--success)] hover:bg-[var(--success-bg)] transition-colors disabled:opacity-40"
        >
          <ArchiveRestore size={14} />
          {t('admin_plans_unarchive_submit')}
        </button>
        <Button variant="destructive" size="sm" onClick={() => onDelete(plan.id)} disabled={disabled}>
          <Trash2 size={14} />
          {t('admin_delete')}
        </Button>
      </div>
    </div>
  )
}

// ── Trial Settings Block ──────────────────────────────────────────────────────

function TrialModal({
  trialPlan,
  trialOption,
  onClose,
  onSaved,
}: {
  trialPlan: PricingPlanResponse | null
  trialOption: PricingPlanResponse['options'][0] | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToastContext()

  const [days, setDays] = useState(String(trialOption?.duration_days ?? ''))
  const [trafficGb, setTrafficGb] = useState(String(trialOption?.traffic_gb ?? ''))
  const [trafficUnlimited, setTrafficUnlimited] = useState(trialOption?.traffic_unlimited ?? false)
  const [squadUuid, setSquadUuid] = useState(trialPlan?.remnawave_squad_uuid ?? '')
  const [hwidDeviceLimit, setHwidDeviceLimit] = useState(trialPlan?.hwid_device_limit?.toString() ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const daysVal = parseInt(days)
      const trafficVal = parseFloat(trafficGb)
      // Пусто = наследовать TRIAL_HWID_DEVICE_LIMIT из .env; 0 = без лимита
      const hwidLimit = parseInt(hwidDeviceLimit)
      const hwidLimitValue = !isNaN(hwidLimit) && hwidLimit >= 0 ? hwidLimit : null

      if (trialPlan) {
        await updatePlan(trialPlan.id, {
          remnawave_squad_uuid: squadUuid || null,
          hwid_device_limit: hwidLimitValue,
        })
        if (trialOption) {
          await updatePlanOption(trialPlan.id, trialOption.id, {
            duration_days: !isNaN(daysVal) && daysVal > 0 ? daysVal : null,
            duration_months: null,
            traffic_gb: !trafficUnlimited && !isNaN(trafficVal) && trafficVal > 0 ? trafficVal : null,
            traffic_unlimited: trafficUnlimited,
            price_rub: 0,
            price_stars: null,
            is_enabled: true,
          })
        } else {
          await createPlanOption(trialPlan.id, {
            duration_days: !isNaN(daysVal) && daysVal > 0 ? daysVal : undefined,
            traffic_gb: !trafficUnlimited && !isNaN(trafficVal) && trafficVal > 0 ? trafficVal : undefined,
            traffic_unlimited: trafficUnlimited || undefined,
            price_rub: 0,
            is_enabled: true,
          })
        }
      } else {
        const created = await createPlan({
          name_ru: 'Пробный период',
          name_en: 'Trial',
          plan_kind: 'standalone',
          billing_model: 'time',
          traffic_reset_strategy: 'NO_RESET',
          is_trial: true,
          is_enabled: false,
          remnawave_squad_uuid: squadUuid || undefined,
          hwid_device_limit: hwidLimitValue ?? undefined,
        })
        await createPlanOption(created.id, {
          duration_days: !isNaN(daysVal) && daysVal > 0 ? daysVal : undefined,
          traffic_gb: !trafficUnlimited && !isNaN(trafficVal) && trafficVal > 0 ? trafficVal : undefined,
          traffic_unlimited: trafficUnlimited || undefined,
          price_rub: 0,
          is_enabled: true,
        })
      }

      onSaved()
      onClose()
      toast(t('admin_trial_saved'), 'success')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className="bg-[hsl(var(--card))] rounded-2xl shadow-[var(--shadow-lg)] w-full max-w-sm mx-auto flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">{t('admin_trial_title')}</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{t('admin_trial_subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {/* Days */}
          <div>
            <label className={labelCls}>{t('admin_trial_days')}</label>
            <input
              type="number"
              min="1"
              className={inputCls}
              placeholder="Например, 7"
              value={days}
              onChange={e => setDays(e.target.value)}
            />
          </div>

          {/* Traffic */}
          <div>
            <label className={labelCls}>{t('admin_trial_traffic')}</label>
            <label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
              <Switch checked={trafficUnlimited} onCheckedChange={setTrafficUnlimited} />
              <span className="text-sm text-[hsl(var(--foreground))]">{t('admin_trial_unlimited')}</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              className={inputCls}
              placeholder="ГБ"
              value={trafficGb}
              onChange={e => setTrafficGb(e.target.value)}
              disabled={trafficUnlimited}
            />
          </div>

          {/* Device limit */}
          <div>
            <label className={labelCls}>{t('admin_plans_hwid_limit')}</label>
            <input
              type="number"
              min="0"
              className={inputCls}
              placeholder={t('admin_plans_hwid_limit_placeholder')}
              value={hwidDeviceLimit}
              onChange={e => setHwidDeviceLimit(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
              {t('admin_plans_hwid_limit_hint')}
            </p>
          </div>

          {/* Squad */}
          <div>
            <label className={labelCls}>
              {t('admin_trial_squad')} <span className="text-[var(--danger)]">*</span>
            </label>
            <SquadPicker value={squadUuid} onChange={setSquadUuid} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('admin_cancel')}
          </Button>
          <Button type="button" onClick={handleSave} isLoading={saving}>
            {t('admin_trial_save')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function TrialSettingsBlock({
  allPlans,
  onOpen,
}: {
  allPlans: PricingPlanResponse[]
  onOpen: () => void
}) {
  const { t } = useTranslation()

  const trialPlan = allPlans.find(p => p.is_trial) ?? null
  const trialOption = trialPlan?.options[0] ?? null

  const hasConfig = trialPlan && trialOption

  const infoParts: string[] = []
  if (trialOption?.duration_days) infoParts.push(`${trialOption.duration_days} ${t('admin_trial_days_short')}`)
  if (trialOption?.traffic_unlimited) infoParts.push(t('admin_trial_unlimited'))
  else if (trialOption?.traffic_gb != null) infoParts.push(`${trialOption.traffic_gb} ГБ`)

  return (
    <>
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)] px-5 py-4 flex items-center gap-4">
        {/* Icon */}
        <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary-soft)]">
          <Clock size={16} className="text-[var(--primary-press)]" />
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('admin_trial_title')}</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">{t('admin_trial_subtitle')}</p>
        </div>

        {/* Status pill */}
        {!hasConfig ? (
          <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">
            {t('admin_trial_not_configured')}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-[hsl(var(--muted))] px-3 py-1 text-xs font-medium text-[hsl(var(--foreground))]">
            {infoParts.join(' · ')}
          </span>
        )}

        {/* Action button */}
        <Button type="button" variant="outline" size="sm" onClick={onOpen} className="shrink-0">
          {hasConfig ? t('admin_trial_edit') : t('admin_trial_setup')}
        </Button>
      </div>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function PlansPage() {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const { toast } = useToastContext()
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [archiveId, setArchiveId] = useState<number | null>(null)
  const [unarchiveId, setUnarchiveId] = useState<number | null>(null)
  const [localOrder, setLocalOrder] = useState<number[] | null>(null)
  const [dialogPlan, setDialogPlan] = useState<PricingPlanResponse | null | undefined>(undefined)
  // undefined = closed, null = create, PricingPlanResponse = edit
  const [trialModalOpen, setTrialModalOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: getAdminPlans,
    select: (d) => d.items,
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof updatePlan>[1] }) => updatePlan(id, body),
    onSuccess: () => { setLocalOrder(null); qc.invalidateQueries({ queryKey: ['admin', 'plans'] }) },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof updatePlan>[1] }) => updatePlan(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'plans'] }),
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: deletePlan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
      setDeleteId(null)
      toast(t('admin_plans_delete_success'), 'success')
    },
    onError: (e: Error) => {
      const msg = e.message.includes('409') || e.message.toLowerCase().includes('пользовател')
        ? t('admin_plans_delete_has_users')
        : e.message
      toast(msg, 'error')
      setDeleteId(null)
    },
  })

  const archiveMut = useMutation({
    mutationFn: (id: number) => archivePlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
      setArchiveId(null)
      toast(t('admin_plans_archive_success'), 'success')
    },
    onError: (e: Error) => { toast(e.message, 'error'); setArchiveId(null) },
  })

  const unarchiveMut = useMutation({
    mutationFn: (id: number) => unarchivePlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
      setUnarchiveId(null)
      toast(t('admin_plans_unarchive_success'), 'success')
    },
    onError: (e: Error) => { toast(e.message, 'error'); setUnarchiveId(null) },
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const archivedPlans = data ? data.filter(p => p.is_archived) : []

  const plans = (() => {
    if (!data) return []
    const nonTrial = data.filter(p => !p.is_trial && !p.is_archived)
    if (!localOrder) return nonTrial
    return [...nonTrial].sort((a, b) => localOrder.indexOf(a.id) - localOrder.indexOf(b.id))
  })()

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = plans.map(p => p.id)
    const oldIndex = ids.indexOf(active.id as number)
    const newIndex = ids.indexOf(over.id as number)
    const newIds = arrayMove(ids, oldIndex, newIndex)
    setLocalOrder(newIds)
    const updates = newIds
      .map((id, idx) => ({ id, sort_order: idx + 1 }))
      .filter(({ id, sort_order }) => data!.find(p => p.id === id)!.sort_order !== sort_order)
    Promise.all(updates.map(({ id, sort_order }) => updatePlan(id, { sort_order })))
      .then(() => qc.invalidateQueries({ queryKey: ['admin', 'plans'] }).then(() => setLocalOrder(null)))
      .catch((e: Error) => { toast(e.message, 'error'); setLocalOrder(null) })
  }

  return (
    <div className="px-4 py-6 sm:p-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('admin_plans_title')}</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1 max-w-2xl">{t('admin_plans_subtitle')}</p>
        </div>
        <Button onClick={() => setDialogPlan(null)} className="w-full sm:w-auto">
          <Plus size={16} />
          {t('admin_plans_add')}
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-[hsl(var(--muted))] rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {isError && <p className="text-[hsl(var(--muted-foreground))]">{t('admin_plans_load_error')}</p>}

      <TrialSettingsBlock
        allPlans={data ?? []}
        onOpen={() => setTrialModalOpen(true)}
      />

      {data && (
        <>
          {/* Desktop table */}
          <div className="hidden bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] shadow-[var(--shadow-sm)] overflow-hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)]">
                  <th className="px-2 py-3 w-8" />
                  <th className="px-2 py-3 w-6" />
                  <th className="text-left px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">{t('admin_plans_plan')}</th>
                  <th className="text-left px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">{t('admin_plans_options')}</th>
                  <th className="text-left px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">{t('admin_plans_price_rub')}</th>
                  <th className="text-left px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">{t('admin_status')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={plans.map(p => p.id)} strategy={verticalListSortingStrategy}>
                  <tbody className="divide-y divide-[hsl(var(--border))]">
                    {plans.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-[hsl(var(--muted-foreground))]">
                          {t('admin_plans_empty')}
                        </td>
                      </tr>
                    )}
                    {plans.map((plan, idx) => (
                      <SortablePlanRow
                        key={plan.id}
                        plan={plan}
                        index={idx}
                        onEdit={p => setDialogPlan(p)}
                        onDelete={setDeleteId}
                        onArchive={setArchiveId}
                        onToggle={p => toggleMut.mutate({ id: p.id, body: { is_enabled: !p.is_enabled } })}
                        disabled={toggleMut.isPending}
                      />
                    ))}
                  </tbody>
                </SortableContext>
              </DndContext>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 sm:hidden">
            {plans.length === 0 && (
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                {t('admin_plans_empty')}
              </div>
            )}
            {plans.map((plan, idx) => (
              <PlanMobileCard
                key={plan.id}
                plan={plan}
                index={idx}
                onEdit={p => setDialogPlan(p)}
                onDelete={setDeleteId}
                onArchive={setArchiveId}
                onToggle={p => toggleMut.mutate({ id: p.id, body: { is_enabled: !p.is_enabled } })}
                disabled={toggleMut.isPending}
              />
            ))}
          </div>
        </>
      )}

      {/* Archived plans section */}
      {archivedPlans.length > 0 && (
        <div className="space-y-3 mt-2">
          <h2 className="text-[11px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-[0.06em] flex items-center gap-2">
            <Archive size={14} />
            {t('admin_plans_archived_section')}
          </h2>

          {/* Desktop */}
          <div className="hidden bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] shadow-[var(--shadow-sm)] overflow-hidden sm:block">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[hsl(var(--border))]">
                {archivedPlans.map(plan => (
                  <ArchivedPlanRow
                    key={plan.id}
                    plan={plan}
                    onUnarchive={setUnarchiveId}
                    onDelete={setDeleteId}
                    disabled={unarchiveMut.isPending || deleteMut.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="space-y-3 sm:hidden">
            {archivedPlans.map(plan => (
              <ArchivedPlanCard
                key={plan.id}
                plan={plan}
                onUnarchive={setUnarchiveId}
                onDelete={setDeleteId}
                disabled={unarchiveMut.isPending || deleteMut.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Create / Edit dialog */}
      {dialogPlan !== undefined && (
        <PlanDialog
          plan={dialogPlan ?? undefined}
          onClose={() => setDialogPlan(undefined)}
        />
      )}

      {/* Trial settings modal */}
      {trialModalOpen && (
        <TrialModal
          trialPlan={data?.find(p => p.is_trial) ?? null}
          trialOption={data?.find(p => p.is_trial)?.options[0] ?? null}
          onClose={() => setTrialModalOpen(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['admin', 'plans'] })}
        />
      )}

      {/* Archive confirm */}
      {archiveId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="bg-[hsl(var(--card))] rounded-2xl shadow-[var(--shadow-lg)] w-full max-w-sm mx-auto p-6">
            <h3 className="text-base font-semibold text-[hsl(var(--foreground))] mb-2">{t('admin_plans_archive_confirm')}</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5">{t('admin_plans_archive_description')}</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setArchiveId(null)}>
                {t('admin_cancel')}
              </Button>
              <Button
                onClick={() => archiveMut.mutate(archiveId)}
                isLoading={archiveMut.isPending}
                className="bg-[var(--warning)] text-white hover:opacity-90"
              >
                {t('admin_plans_archive_submit')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Unarchive confirm */}
      {unarchiveId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="bg-[hsl(var(--card))] rounded-2xl shadow-[var(--shadow-lg)] w-full max-w-sm mx-auto p-6">
            <h3 className="text-base font-semibold text-[hsl(var(--foreground))] mb-2">{t('admin_plans_unarchive_confirm')}</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5">{t('admin_plans_unarchive_description')}</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setUnarchiveId(null)}>
                {t('admin_cancel')}
              </Button>
              <Button
                onClick={() => unarchiveMut.mutate(unarchiveId)}
                isLoading={unarchiveMut.isPending}
                className="bg-[var(--success)] text-white hover:opacity-90"
              >
                {t('admin_plans_unarchive_submit')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="bg-[hsl(var(--card))] rounded-2xl shadow-[var(--shadow-lg)] w-full max-w-sm mx-auto p-6">
            <h3 className="text-base font-semibold text-[hsl(var(--foreground))] mb-2">{t('admin_plans_delete_confirm')}</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5">{t('admin_plans_delete_description')}</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteId(null)}>
                {t('admin_cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteMut.mutate(deleteId)}
                isLoading={deleteMut.isPending}
              >
                {deleteMut.isPending ? t('admin_deleting') : t('admin_delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
