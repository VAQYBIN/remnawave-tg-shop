import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { GripVertical } from 'lucide-react'
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
import { getAdminPaymentProviders, updatePaymentProvider } from '@/api/admin/payment-providers'
import type { PaymentProviderResponse } from '@/api/admin/payment-providers'

const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  yookassa: 'Банковские карты, СБП (ЮKassa)',
  freekassa: 'Банковские карты, QIWI, ЮMoney',
  platega: 'СБП QR, банковские карты',
  severpay: 'СБП, банковские карты',
  stars: 'Telegram Stars (внутри Telegram)',
  cryptopay: 'Криптовалюта (CryptoPay)',
}

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={[
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
        enabled ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          enabled ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  )
}

interface SortableProviderRowProps {
  provider: PaymentProviderResponse
  index: number
  onToggle: (provider: PaymentProviderResponse) => void
  disabled: boolean
}

function SortableProviderRow({ provider, index, onToggle, disabled }: SortableProviderRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: provider.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="flex items-center gap-4 px-5 py-4 bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted)/0.3)] transition-colors"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] touch-none"
        aria-label="Перетащить для изменения порядка"
      >
        <GripVertical size={18} />
      </button>

      {/* Position badge */}
      <span className="text-xs text-[hsl(var(--muted-foreground))] w-5 text-center select-none">
        {index + 1}
      </span>

      {/* Provider info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[hsl(var(--foreground))]">{provider.display_name}</span>
          <span className="text-xs text-[hsl(var(--muted-foreground))] font-mono bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded">
            {provider.provider_key}
          </span>
        </div>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
          {PROVIDER_DESCRIPTIONS[provider.provider_key] ?? ''}
        </p>
      </div>

      {/* Toggle */}
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium ${provider.is_enabled ? 'text-green-600' : 'text-[hsl(var(--muted-foreground))]'}`}>
          {provider.is_enabled ? 'Включён' : 'Выключен'}
        </span>
        <Toggle
          enabled={provider.is_enabled}
          onChange={() => onToggle(provider)}
          disabled={disabled}
        />
      </div>
    </div>
  )
}

export function PaymentProvidersPage() {
  const qc = useQueryClient()
  const [localOrder, setLocalOrder] = useState<number[] | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'payment-providers'],
    queryFn: getAdminPaymentProviders,
    select: (d) => d.items,
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof updatePaymentProvider>[1] }) =>
      updatePaymentProvider(id, body),
    onSuccess: () => {
      setLocalOrder(null)
      qc.invalidateQueries({ queryKey: ['admin', 'payment-providers'] })
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Apply local order override for optimistic UI
  const providers = (() => {
    if (!data) return []
    if (!localOrder) return data
    return [...data].sort((a, b) => localOrder.indexOf(a.id) - localOrder.indexOf(b.id))
  })()

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const ids = providers.map(p => p.id)
    const oldIndex = ids.indexOf(active.id as number)
    const newIndex = ids.indexOf(over.id as number)
    const newIds = arrayMove(ids, oldIndex, newIndex)
    setLocalOrder(newIds)

    // Persist new sort_order for each provider
    newIds.forEach((id, idx) => {
      const provider = data!.find(p => p.id === id)!
      if (provider.sort_order !== idx + 1) {
        updateMut.mutate({ id, body: { sort_order: idx + 1 } })
      }
    })
  }

  function handleToggle(provider: PaymentProviderResponse) {
    updateMut.mutate({ id: provider.id, body: { is_enabled: !provider.is_enabled } })
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Платёжные провайдеры</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          Включите провайдеры и задайте порядок перетаскиванием. Учётные данные (ключи) задаются в .env.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 bg-[hsl(var(--muted))] rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-[hsl(var(--muted-foreground))]">Ошибка загрузки провайдеров</p>
      )}

      {providers.length > 0 && (
        <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] overflow-hidden divide-y divide-[hsl(var(--border))]">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={providers.map(p => p.id)} strategy={verticalListSortingStrategy}>
              {providers.map((provider, idx) => (
                <SortableProviderRow
                  key={provider.id}
                  provider={provider}
                  index={idx}
                  onToggle={handleToggle}
                  disabled={updateMut.isPending}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      <div className="bg-[hsl(var(--muted)/0.5)] rounded-xl p-4 text-sm text-[hsl(var(--muted-foreground))]">
        <strong className="text-[hsl(var(--foreground))]">Важно:</strong> Провайдер будет доступен
        пользователям только если он включён здесь <em>и</em> его учётные данные заданы в .env.
        Если ключи не заданы, провайдер не будет работать даже при включённом переключателе.
      </div>
    </div>
  )
}
