import { cn } from '@/lib/utils'

interface Provider {
  id: string
  label: string
  icon: string  // empty string — emoji already embedded in label
}

// Labels match bot locales: pay_with_*_button keys
const PROVIDER_META: Provider[] = [
  { id: 'yookassa', label: '💳 Картой/СБП', icon: '' },
  { id: 'lavapay', label: '💳 LavaPay (карта/СБП)', icon: '' },
  { id: 'platega', label: '💳 Platega (СБП/карты)', icon: '' },
  { id: 'freekassa', label: '📱 СБП', icon: '' },
  { id: 'severpay', label: '💳 SeverPay', icon: '' },
  { id: 'cryptopay', label: '💎 CryptoBot', icon: '' },
]

interface PaymentMethodGridProps {
  availableProviders: string[]
  selectedProvider: string | null
  onSelect: (provider: string) => void
  disabled?: boolean
}

export function PaymentMethodGrid({
  availableProviders,
  selectedProvider,
  onSelect,
  disabled,
}: PaymentMethodGridProps) {
  const visible = PROVIDER_META.filter((p) => availableProviders.includes(p.id))

  if (visible.length === 0) {
    return (
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        Нет доступных способов оплаты
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(p.id)}
          className={cn(
            'flex items-center gap-2 rounded-[10px] border px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap',
            'hover:border-[color-mix(in_srgb,hsl(var(--primary))_50%,transparent)] hover:bg-[var(--primary-soft)]',
            selectedProvider === p.id
              ? 'border-[hsl(var(--primary))] bg-[var(--primary-soft)] ring-2 ring-inset ring-[color-mix(in_srgb,hsl(var(--primary))_35%,transparent)]'
              : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
