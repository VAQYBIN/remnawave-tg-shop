import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Check, X, GripVertical, Package, Puzzle } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  getAdminPlans,
  updatePlan,
  deletePlan,
} from '@/api/admin/plans'
import type { PricingPlanResponse, PricingPlanUpdateRequest } from '@/api/admin/plans'
import { useTranslation } from 'react-i18next'
import { useToastContext } from '@/lib/toast-context'

// ── Helpers ─────────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: string }) {
  const isAddon = kind === 'addon'
  return (
    <span className={[
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide',
      isAddon
        ? 'bg-purple-100 text-purple-700'
        : 'bg-blue-100 text-blue-700',
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

// ── Row / Card ──────────────────────────────────────────────────────────

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
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] touch-none p-1"
          aria-label={t('admin_drag_reorder')}
        >
          <GripVertical size={16} />
        </button>
      </td>
      <td className="px-2 py-3 text-xs text-[hsl(var(--muted-foreground))] w-6 text-center select-none">
        {index + 1}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-[hsl(var(--foreground))]">
            {plan.name_ru}
            {plan.is_trial && (
              <span className="ml-1.5 text-[10px] font-semibold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                trial
              </span>
            )}
          </span>
          <div className="flex items-center gap-1.5">
            <KindBadge kind={plan.plan_kind} />
            <BillingBadge model={plan.billing_model} />
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
        {plan.options.length > 0
          ? `${plan.options.length} opt.`
          : <span className="text-[hsl(var(--muted-foreground))]">—</span>}
      </td>
      <td className="px-4 py-3 text-sm text-[hsl(var(--foreground))]">
        {optionPriceSummary(plan)}
      </td>
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
          <button
            onClick={() => onEdit(plan)}
            className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={() => onDelete(plan.id)}
            className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-red-600 hover:bg-red-50"
          >
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
          <h3 className="text-base font-semibold leading-snug text-[hsl(var(--foreground))]">
            {plan.name_ru}
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

// ── Page ────────────────────────────────────────────────────────────────

export function PlansPage() {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const { toast } = useToastContext()
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [localOrder, setLocalOrder] = useState<number[] | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: getAdminPlans,
    select: (d) => d.items,
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: PricingPlanUpdateRequest }) => updatePlan(id, body),
    onSuccess: () => {
      setLocalOrder(null)
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: PricingPlanUpdateRequest }) => updatePlan(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'plans'] }),
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: deletePlan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
      setDeleteId(null)
    },
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

  function handleEdit(plan: PricingPlanResponse) {
    toast(t('admin_plans_full_editor_phase9'), 'info')
    void plan
  }

  return (
    <div className="px-4 py-6 sm:p-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('admin_plans_title')}</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1 max-w-2xl">
            {t('admin_plans_subtitle')}
          </p>
        </div>
        <button
          onClick={() => toast(t('admin_plans_full_editor_phase9'), 'info')}
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

      {isError && (
        <p className="text-[hsl(var(--muted-foreground))]">{t('admin_plans_load_error')}</p>
      )}

      {data && (
        <>
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
                        onEdit={handleEdit}
                        onDelete={setDeleteId}
                        onToggle={(p) => toggleMut.mutate({ id: p.id, body: { is_enabled: !p.is_enabled } })}
                        disabled={toggleMut.isPending}
                      />
                    ))}
                  </tbody>
                </SortableContext>
              </DndContext>
            </table>
          </div>

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
                onEdit={handleEdit}
                onDelete={setDeleteId}
                onToggle={(p) => toggleMut.mutate({ id: p.id, body: { is_enabled: !p.is_enabled } })}
                disabled={toggleMut.isPending}
              />
            ))}
          </div>
        </>
      )}

      {/* Delete Confirmation */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[hsl(var(--card))] rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-semibold text-[hsl(var(--foreground))] mb-2">{t('admin_plans_delete_confirm')}</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5">
              {t('admin_plans_delete_description')}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--muted))]"
              >
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
