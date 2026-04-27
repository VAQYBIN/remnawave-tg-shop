import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Check, X, GripVertical } from 'lucide-react'
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
import { getAdminPlans, createPlan, updatePlan, deletePlan } from '@/api/admin/plans'
import type { PlanResponse, PlanCreateRequest, PlanUpdateRequest } from '@/api/admin/plans'

function monthLabel(months: number): string {
  if (months === 1) return '1 месяц'
  if (months < 5) return `${months} месяца`
  return `${months} месяцев`
}

interface PlanFormData {
  duration_months: number
  label: string
  price_rub: string
  price_stars: string
  is_enabled: boolean
}

const emptyForm: PlanFormData = {
  duration_months: 1,
  label: '',
  price_rub: '',
  price_stars: '',
  is_enabled: false,
}

function planToForm(plan: PlanResponse): PlanFormData {
  return {
    duration_months: plan.duration_months,
    label: plan.label ?? '',
    price_rub: plan.price_rub != null ? String(plan.price_rub) : '',
    price_stars: plan.price_stars != null ? String(plan.price_stars) : '',
    is_enabled: plan.is_enabled,
  }
}

interface PlanModalProps {
  plan?: PlanResponse
  onClose: () => void
  onSave: (data: PlanCreateRequest | PlanUpdateRequest) => void
  isLoading: boolean
  error: string | null
}

function PlanModal({ plan, onClose, onSave, isLoading, error }: PlanModalProps) {
  const [form, setForm] = useState<PlanFormData>(plan ? planToForm(plan) : emptyForm)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const data: PlanCreateRequest = {
      duration_months: Number(form.duration_months),
      label: form.label || undefined,
      price_rub: form.price_rub ? Number(form.price_rub) : undefined,
      price_stars: form.price_stars ? Number(form.price_stars) : undefined,
      is_enabled: form.is_enabled,
    }
    onSave(data)
  }

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[hsl(var(--card))] rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
            {plan ? 'Редактировать тариф' : 'Создать тариф'}
          </h2>
          <button onClick={onClose} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
              Длительность (мес.)
            </label>
            <input
              type="number"
              min={1}
              required
              className={inputClass}
              value={form.duration_months}
              onChange={e => setForm(f => ({ ...f, duration_months: Number(e.target.value) }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
              Название (необязательно)
            </label>
            <input
              type="text"
              className={inputClass}
              placeholder={monthLabel(form.duration_months)}
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
                Цена (₽)
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                className={inputClass}
                placeholder="0.00"
                value={form.price_rub}
                onChange={e => setForm(f => ({ ...f, price_rub: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
                Цена (Stars)
              </label>
              <input
                type="number"
                min={0}
                className={inputClass}
                placeholder="0"
                value={form.price_stars}
                onChange={e => setForm(f => ({ ...f, price_stars: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_enabled"
              checked={form.is_enabled}
              onChange={e => setForm(f => ({ ...f, is_enabled: e.target.checked }))}
              className="w-4 h-4 rounded accent-[hsl(var(--primary))]"
            />
            <label htmlFor="is_enabled" className="text-sm text-[hsl(var(--foreground))]">
              Включён (отображается пользователям)
            </label>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {isLoading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface SortablePlanRowProps {
  plan: PlanResponse
  index: number
  onEdit: (plan: PlanResponse) => void
  onDelete: (id: number) => void
  onToggle: (plan: PlanResponse) => void
  disabled: boolean
}

function SortablePlanRow({ plan, index, onEdit, onDelete, onToggle, disabled }: SortablePlanRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: plan.id,
  })

  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="hover:bg-[hsl(var(--muted)/0.3)] transition-colors"
    >
      <td className="px-2 py-3 w-8">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] touch-none p-1"
          aria-label="Перетащить для изменения порядка"
        >
          <GripVertical size={16} />
        </button>
      </td>
      <td className="px-2 py-3 text-xs text-[hsl(var(--muted-foreground))] w-6 text-center select-none">
        {index + 1}
      </td>
      <td className="px-4 py-3 font-medium text-[hsl(var(--foreground))]">
        {plan.label || monthLabel(plan.duration_months)}
        {plan.label && (
          <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
            ({plan.duration_months} мес.)
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-[hsl(var(--foreground))]">
        {plan.price_rub != null ? `${plan.price_rub.toLocaleString('ru-RU')} ₽` : '—'}
      </td>
      <td className="px-4 py-3 text-[hsl(var(--foreground))]">
        {plan.price_stars != null ? `${plan.price_stars} ⭐` : '—'}
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
          {plan.is_enabled ? 'Включён' : 'Выключен'}
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

export function PlansPage() {
  const qc = useQueryClient()
  const [modalPlan, setModalPlan] = useState<PlanResponse | null | 'new'>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [mutError, setMutError] = useState<string | null>(null)
  const [localOrder, setLocalOrder] = useState<number[] | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: getAdminPlans,
    select: (d) => d.items,
  })

  const createMut = useMutation({
    mutationFn: createPlan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
      setModalPlan(null)
    },
    onError: (e: Error) => setMutError(e.message),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: PlanUpdateRequest }) => updatePlan(id, body),
    onSuccess: () => {
      setLocalOrder(null)
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
      setModalPlan(null)
    },
    onError: (e: Error) => setMutError(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: deletePlan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
      setDeleteId(null)
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Apply local order override for optimistic UI
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

  function handleSave(formData: PlanCreateRequest | PlanUpdateRequest) {
    setMutError(null)
    if (modalPlan === 'new') {
      createMut.mutate(formData as PlanCreateRequest)
    } else if (modalPlan) {
      updateMut.mutate({ id: modalPlan.id, body: formData })
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Тарифные планы</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            Управление доступными тарифами подписки. Порядок задаётся перетаскиванием.
          </p>
        </div>
        <button
          onClick={() => { setMutError(null); setModalPlan('new') }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-medium hover:opacity-90"
        >
          <Plus size={16} />
          Добавить тариф
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
        <p className="text-[hsl(var(--muted-foreground))]">Ошибка загрузки тарифов</p>
      )}

      {data && (
        <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)]">
                <th className="px-2 py-3 w-8" />
                <th className="px-2 py-3 w-6" />
                <th className="text-left px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">Тариф</th>
                <th className="text-left px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">Цена ₽</th>
                <th className="text-left px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">Stars</th>
                <th className="text-left px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">Статус</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={plans.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <tbody className="divide-y divide-[hsl(var(--border))]">
                  {plans.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-[hsl(var(--muted-foreground))]">
                        Нет тарифов. Нажмите «Добавить тариф».
                      </td>
                    </tr>
                  )}
                  {plans.map((plan, idx) => (
                    <SortablePlanRow
                      key={plan.id}
                      plan={plan}
                      index={idx}
                      onEdit={(p) => { setMutError(null); setModalPlan(p) }}
                      onDelete={setDeleteId}
                      onToggle={(p) => updateMut.mutate({ id: p.id, body: { is_enabled: !p.is_enabled } })}
                      disabled={updateMut.isPending}
                    />
                  ))}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalPlan !== null && (
        <PlanModal
          plan={modalPlan === 'new' ? undefined : modalPlan}
          onClose={() => setModalPlan(null)}
          onSave={handleSave}
          isLoading={createMut.isPending || updateMut.isPending}
          error={mutError}
        />
      )}

      {/* Delete Confirmation */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[hsl(var(--card))] rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-semibold text-[hsl(var(--foreground))] mb-2">Удалить тариф?</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5">
              Это действие необратимо.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--muted))]"
              >
                Отмена
              </button>
              <button
                onClick={() => deleteMut.mutate(deleteId)}
                disabled={deleteMut.isPending}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMut.isPending ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
