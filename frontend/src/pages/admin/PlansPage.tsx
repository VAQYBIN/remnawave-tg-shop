import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, Check, X, GripVertical,
  Package, Puzzle, ChevronDown, Loader2,
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
  createPlanOption, updatePlanOption, deletePlanOption,
} from '@/api/admin/plans'
import type {
  PricingPlanResponse, PricingPlanCreateRequest,
  PricingPlanOptionResponse, PricingPlanOptionCreateRequest,
} from '@/api/admin/plans'
import { getSquads } from '@/api/admin/remnawave'
import { useTranslation } from 'react-i18next'
import { useToastContext } from '@/lib/toast-context'

// ── Helpers ─────────────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: string }) {
  const isAddon = kind === 'addon'
  return (
    <span className={[
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide',
      isAddon ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700',
    ].join(' ')}>
      {isAddon ? <Puzzle size={10} /> : <Package size={10} />}
      {kind}
    </span>
  )
}

function BillingBadge({ model }: { model: string }) {
  const colors: Record<string, string> = {
    time: 'bg-sky-100 text-sky-700',
    traffic: 'bg-orange-100 text-orange-700',
    hybrid: 'bg-teal-100 text-teal-700',
  }
  return (
    <span className={[
      'inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide',
      colors[model] ?? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
    ].join(' ')}>
      {model}
    </span>
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
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg">
          {isError && (
            <p className="px-3 py-2 text-xs text-red-500">{t('admin_plans_squad_error')}</p>
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
          {data?.items.length === 0 && (
            <p className="px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">Нет squads</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Option row in editor ──────────────────────────────────────────────────────

interface OptionDraft {
  id?: number
  duration_months: string
  traffic_gb: string
  traffic_unlimited: boolean
  price_rub: string
  price_stars: string
  is_enabled: boolean
}

function emptyOption(billingModel = 'time'): OptionDraft {
  return {
    duration_months: '',
    traffic_gb: '',
    traffic_unlimited: billingModel === 'time',
    price_rub: '',
    price_stars: '',
    is_enabled: true,
  }
}

function OptionRow({
  opt,
  billingModel,
  onChange,
  onDelete,
}: {
  opt: OptionDraft
  billingModel: string
  onChange: (o: OptionDraft) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const showDuration = billingModel === 'time' || billingModel === 'hybrid'
  const showTraffic = true // all billing models require traffic_gb or traffic_unlimited

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] px-3 py-2">
      {showDuration && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{t('admin_plans_option_months')}</span>
          <input
            type="number" min="1" max="36"
            className="w-14 rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm text-center"
            value={opt.duration_months}
            onChange={e => onChange({ ...opt, duration_months: e.target.value })}
          />
        </div>
      )}
      {showTraffic && !opt.traffic_unlimited && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{t('admin_plans_option_traffic')}</span>
          <input
            type="number" min="1"
            className="w-16 rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm text-center"
            value={opt.traffic_gb}
            onChange={e => onChange({ ...opt, traffic_gb: e.target.value })}
          />
        </div>
      )}
      {showTraffic && (
        <label className="flex items-center gap-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={opt.traffic_unlimited}
            onChange={e => onChange({ ...opt, traffic_unlimited: e.target.checked, traffic_gb: e.target.checked ? '' : opt.traffic_gb })}
          />
          <span className="text-xs">{t('admin_plans_option_unlimited')}</span>
        </label>
      )}
      <div className="flex items-center gap-1">
        <span className="text-xs text-[hsl(var(--muted-foreground))]">{t('admin_plans_option_rub')}</span>
        <input
          type="number" min="0"
          className="w-20 rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm text-center"
          value={opt.price_rub}
          onChange={e => onChange({ ...opt, price_rub: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-[hsl(var(--muted-foreground))]">{t('admin_plans_option_stars')}</span>
        <input
          type="number" min="0"
          className="w-20 rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm text-center"
          value={opt.price_stars}
          onChange={e => onChange({ ...opt, price_stars: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-1 cursor-pointer select-none ml-auto">
        <input
          type="checkbox"
          checked={opt.is_enabled}
          onChange={e => onChange({ ...opt, is_enabled: e.target.checked })}
        />
        <span className="text-xs">{t('admin_plans_option_enabled')}</span>
      </label>
      <button type="button" onClick={onDelete} className="text-red-400 hover:text-red-600 p-0.5">
        <X size={14} />
      </button>
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
  const [squadUuid, setSquadUuid] = useState(plan?.remnawave_squad_uuid ?? '')
  const [isEnabled, setIsEnabled] = useState(plan?.is_enabled ?? true)

  // Options state
  const [existingOptions, setExistingOptions] = useState<PricingPlanOptionResponse[]>(plan?.options ?? [])
  const initialBilling = plan ? plan.billing_model : 'time'
  const [newOptions, setNewOptions] = useState<OptionDraft[]>(isEdit ? [] : [emptyOption(initialBilling)])

  const [saving, setSaving] = useState(false)

  function buildOptionBody(opt: OptionDraft): PricingPlanOptionCreateRequest {
    const body: PricingPlanOptionCreateRequest = {
      is_enabled: opt.is_enabled,
    }
    const months = parseInt(opt.duration_months)
    if (!isNaN(months) && months > 0) body.duration_months = months
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameRu.trim()) return
    if (planKind === 'standalone' && !squadUuid.trim()) {
      toast(t('admin_plans_squad_required'), 'error')
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        await updatePlan(plan.id, {
          name_ru: nameRu.trim(),
          name_en: nameEn.trim() || null,
          description_ru: descRu.trim() || null,
          description_en: descEn.trim() || null,
          remnawave_squad_uuid: squadUuid.trim() || null,
          plan_kind: planKind,
          billing_model: billingModel,
          is_enabled: isEnabled,
        })
        // Create new options
        for (const opt of newOptions) {
          if (!opt.duration_months && !opt.traffic_gb && !opt.traffic_unlimited) continue
          await createPlanOption(plan.id, buildOptionBody(opt))
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
          is_enabled: isEnabled,
        }
        const created = await createPlan(body)
        // Create options
        for (const opt of newOptions) {
          if (!opt.duration_months && !opt.traffic_gb && !opt.traffic_unlimited) continue
          await createPlanOption(created.id, buildOptionBody(opt))
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

  function optionLabel(opt: PricingPlanOptionResponse): string {
    const parts: string[] = []
    if (opt.duration_months) parts.push(`${opt.duration_months} мес.`)
    if (opt.traffic_unlimited) parts.push('∞ трафик')
    else if (opt.traffic_gb) parts.push(`${opt.traffic_gb} ГБ`)
    if (opt.price_rub != null) parts.push(`${opt.price_rub} ₽`)
    if (opt.price_stars != null) parts.push(`${opt.price_stars} ⭐`)
    return parts.join(' · ') || `Option #${opt.id}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-6 px-4">
      <div className="bg-[hsl(var(--card))] rounded-xl shadow-xl w-full max-w-lg mx-auto">
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4">
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">
            {isEdit ? t('admin_plans_edit') : t('admin_plans_create')}
          </h2>
          <button onClick={onClose} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Names */}
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

          {/* Descriptions */}
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

          {/* Kind & Billing */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('admin_plans_kind')}</label>
              <select className={inputCls} value={planKind} onChange={e => setPlanKind(e.target.value)}>
                <option value="standalone">{t('admin_plans_kind_standalone')}</option>
                <option value="addon">{t('admin_plans_kind_addon')}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{t('admin_plans_billing')}</label>
              <select className={inputCls} value={billingModel} onChange={e => setBillingModel(e.target.value)}>
                <option value="time">{t('admin_plans_billing_time')}</option>
                <option value="traffic">{t('admin_plans_billing_traffic')}</option>
                <option value="hybrid">{t('admin_plans_billing_hybrid')}</option>
              </select>
            </div>
          </div>

          {/* Squad UUID */}
          <div>
            <label className={labelCls}>
              {t('admin_plans_squad_uuid')}
              {planKind === 'standalone' && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <SquadPicker value={squadUuid} onChange={setSquadUuid} />
          </div>

          {/* Enabled toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={isEnabled} onChange={e => setIsEnabled(e.target.checked)} />
            <span className="text-sm text-[hsl(var(--foreground))]">{t('admin_plans_enabled')}</span>
          </label>

          {/* Existing options (edit mode) */}
          {isEdit && existingOptions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2">{t('admin_plans_options_title')}</p>
              <div className="space-y-1.5">
                {existingOptions.map(opt => (
                  <div key={opt.id} className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] px-3 py-2 text-sm">
                    <span className="flex-1 text-xs">{optionLabel(opt)}</span>
                    <button
                      type="button"
                      onClick={() => toggleOptMut.mutate({ optId: opt.id, enabled: !opt.is_enabled })}
                      className={[
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
                        opt.is_enabled ? 'bg-green-100 text-green-700' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
                      ].join(' ')}
                    >
                      {opt.is_enabled ? <Check size={10} /> : <X size={10} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => delOptMut.mutate({ optId: opt.id })}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New options */}
          <div>
            <p className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2">{t('admin_plans_options_title')}</p>
            <div className="space-y-2">
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
              className="mt-2 text-xs font-medium text-[hsl(var(--primary))] hover:underline"
            >
              {t('admin_plans_options_add')}
            </button>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-[hsl(var(--border))]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--muted))]"
            >
              {t('admin_cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {t('admin_plans_save')}
            </button>
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
  onToggle: (plan: PricingPlanResponse) => void
  disabled: boolean
}

function SortablePlanRow({ plan, index, onEdit, onDelete, onToggle, disabled }: PlanRowProps) {
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
              <span className="ml-1.5 text-[10px] font-semibold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">trial</span>
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
      <td className="px-4 py-3 text-sm text-[hsl(var(--foreground))]">{optionPriceSummary(plan)}</td>
      <td className="px-4 py-3">
        <button
          onClick={() => onToggle(plan)}
          disabled={disabled}
          className={[
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
            plan.is_enabled
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
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
          <button onClick={() => onDelete(plan.id)} className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-red-600 hover:bg-red-50">
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function PlanMobileCard({ plan, index, onEdit, onDelete, onToggle, disabled }: PlanRowProps) {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] mb-1">
            <span>#{index + 1}</span>
          </div>
          <h3 className="text-base font-semibold leading-snug text-[hsl(var(--foreground))]">{plan.name_ru}</h3>
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
            plan.is_enabled ? 'bg-green-100 text-green-700' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
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
          <div className="mt-0.5 font-semibold text-[hsl(var(--foreground))]">{optionPriceSummary(plan)}</div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          onClick={() => onEdit(plan)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-medium text-[hsl(var(--foreground))]"
        >
          <Pencil size={14} />
          {t('admin_edit')}
        </button>
        <button
          onClick={() => onDelete(plan.id)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600"
        >
          <Trash2 size={14} />
          {t('admin_delete')}
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function PlansPage() {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const { toast } = useToastContext()
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [localOrder, setLocalOrder] = useState<number[] | null>(null)
  const [dialogPlan, setDialogPlan] = useState<PricingPlanResponse | null | undefined>(undefined)
  // undefined = closed, null = create, PricingPlanResponse = edit

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'plans'] }); setDeleteId(null) },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const plans = (() => {
    if (!data) return []
    if (!localOrder) return data
    return [...data].sort((a, b) => localOrder.indexOf(a.id) - localOrder.indexOf(b.id))
  })()

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = plans.map(p => p.id)
    const oldIndex = ids.indexOf(active.id as number)
    const newIndex = ids.indexOf(over.id as number)
    const newIds = arrayMove(ids, oldIndex, newIndex)
    setLocalOrder(newIds)
    newIds.forEach((id, idx) => {
      const plan = data!.find(p => p.id === id)!
      if (plan.sort_order !== idx + 1) {
        updateMut.mutate({ id, body: { sort_order: idx + 1 } })
      }
    })
  }

  return (
    <div className="px-4 py-6 sm:p-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('admin_plans_title')}</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1 max-w-2xl">{t('admin_plans_subtitle')}</p>
        </div>
        <button
          onClick={() => setDialogPlan(null)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 sm:w-auto"
        >
          <Plus size={16} />
          {t('admin_plans_add')}
        </button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-[hsl(var(--muted))] rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {isError && <p className="text-[hsl(var(--muted-foreground))]">{t('admin_plans_load_error')}</p>}

      {data && (
        <>
          {/* Desktop table */}
          <div className="hidden bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] overflow-hidden sm:block">
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
                onToggle={p => toggleMut.mutate({ id: p.id, body: { is_enabled: !p.is_enabled } })}
                disabled={toggleMut.isPending}
              />
            ))}
          </div>
        </>
      )}

      {/* Create / Edit dialog */}
      {dialogPlan !== undefined && (
        <PlanDialog
          plan={dialogPlan ?? undefined}
          onClose={() => setDialogPlan(undefined)}
        />
      )}

      {/* Delete confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[hsl(var(--card))] rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-semibold text-[hsl(var(--foreground))] mb-2">{t('admin_plans_delete_confirm')}</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5">{t('admin_plans_delete_description')}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--muted))]">
                {t('admin_cancel')}
              </button>
              <button
                onClick={() => deleteMut.mutate(deleteId)}
                disabled={deleteMut.isPending}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMut.isPending ? t('admin_deleting') : t('admin_delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
