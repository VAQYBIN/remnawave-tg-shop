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
import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Info } from 'lucide-react'

const PROVIDER_DESCRIPTION_KEYS: Record<string, string> = {
  yookassa: 'admin_provider_desc_yookassa',
  freekassa: 'admin_provider_desc_freekassa',
  platega: 'admin_provider_desc_platega',
  severpay: 'admin_provider_desc_severpay',
  lavapay: 'LavaPay',
  stars: 'admin_provider_desc_stars',
  cryptopay: 'admin_provider_desc_cryptopay',
}

interface SortableProviderRowProps {
  provider: PaymentProviderResponse
  index: number
  onToggle: (provider: PaymentProviderResponse) => void
  disabled: boolean
}

function SortableProviderRow({ provider, index, onToggle, disabled }: SortableProviderRowProps) {
  const { t } = useTranslation()
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
      className="flex items-start gap-3 px-4 py-4 bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted)/0.3)] transition-colors sm:items-center sm:gap-4 sm:px-5"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] touch-none"
        aria-label={t('admin_drag_reorder')}
      >
        <GripVertical size={18} />
      </button>

      {/* Position badge */}
      <span className="mt-1 w-5 select-none text-center text-xs text-[hsl(var(--muted-foreground))] sm:mt-0">
        {index + 1}
      </span>

      {/* Provider info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold leading-snug text-[hsl(var(--foreground))]">{provider.display_name}</span>
          <span className="text-xs text-[hsl(var(--muted-foreground))] font-mono bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded">
            {provider.provider_key}
          </span>
        </div>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 leading-relaxed">
          {PROVIDER_DESCRIPTION_KEYS[provider.provider_key] ? t(PROVIDER_DESCRIPTION_KEYS[provider.provider_key]) : ''}
        </p>
      </div>

      {/* Toggle */}
      <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
        <Badge variant={provider.is_enabled ? 'success' : 'secondary'} dot>
          {provider.is_enabled ? t('admin_enabled') : t('admin_disabled')}
        </Badge>
        <Switch
          checked={provider.is_enabled}
          onCheckedChange={() => onToggle(provider)}
          disabled={disabled}
          aria-label={provider.display_name}
        />
      </div>
    </div>
  )
}

export function PaymentProvidersPage() {
  const qc = useQueryClient()
  const { t } = useTranslation()
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
    <div className="px-4 py-6 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('admin_providers_title')}</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1 max-w-3xl leading-relaxed">
          {t('admin_providers_subtitle')}
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
        <p className="text-[hsl(var(--muted-foreground))]">{t('admin_providers_load_error')}</p>
      )}

      {providers.length > 0 && (
        <Card className="overflow-hidden divide-y divide-[hsl(var(--border))]">
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
        </Card>
      )}

      <Alert variant="info" icon={<Info size={16} />}>
        <strong>{t('admin_providers_important')}</strong> {t('admin_providers_hint')}
      </Alert>
    </div>
  )
}
