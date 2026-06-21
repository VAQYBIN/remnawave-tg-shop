import { cn } from '@/lib/utils'

export interface TabItem {
  value: string
  label: string
}

interface TabsProps {
  items: TabItem[]
  value: string
  onValueChange: (value: string) => void
  className?: string
}

/** Segmented pill tabs (matches the design system .tabs). */
export function Tabs({ items, value, onValueChange, className }: TabsProps) {
  return (
    <div className={cn('inline-flex gap-0.5 rounded-[10px] bg-[hsl(var(--muted))] p-1', className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onValueChange(item.value)}
          className={cn(
            'rounded-[7px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
            value === item.value
              ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-[var(--shadow-xs)]'
              : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
