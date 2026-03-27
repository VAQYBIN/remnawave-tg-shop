import { cn } from '@/lib/utils'

interface Provider {
  id: string
  label: string
  icon: string  // empty string — emoji already embedded in label
}

// Labels match bot locales: pay_with_*_button keys
const PROVIDER_META: Provider[] = [
  { id: 'yookassa', label: '💳 Картой/СБП', icon: '' },
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
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {visible.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(p.id)}
          className={cn(
            'flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-all',
            'hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/5%)]',
            selectedProvider === p.id
              ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/10%)] ring-1 ring-[hsl(var(--primary))]'
              : 'border-[hsl(var(--border))] bg-white',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
