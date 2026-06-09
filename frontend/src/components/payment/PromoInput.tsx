import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { applyPromo, removeActiveDiscount, type PromoApplyResponse } from '@/api/payment'
import { X } from 'lucide-react'

interface PromoInputProps {
  appliedPromo: PromoApplyResponse | null
  onPromoApplied: (promo: PromoApplyResponse) => void
  onPromoRemoved: () => void
}

export function PromoInput({ appliedPromo, onPromoApplied, onPromoRemoved }: PromoInputProps) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleApply = async () => {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const result = await applyPromo(trimmed)
      onPromoApplied(result)
      setCode('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('promo_invalid')
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async () => {
    try {
      await removeActiveDiscount()
    } catch {
      // ignore
    }
    onPromoRemoved()
    setError(null)
  }

  if (appliedPromo) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="success" className="text-sm px-3 py-1">
          🎉 {appliedPromo.promo_code} — скидка {appliedPromo.discount_percentage}%
        </Badge>
        <button
          type="button"
          onClick={handleRemove}
          className="text-[hsl(var(--muted-foreground))] hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          placeholder={t('promo_placeholder')}
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleApply()}
          className="uppercase"
          maxLength={32}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleApply}
          disabled={loading || !code.trim()}
          className="shrink-0"
        >
          {loading ? '...' : t('promo_apply')}
        </Button>
      </div>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  )
}
