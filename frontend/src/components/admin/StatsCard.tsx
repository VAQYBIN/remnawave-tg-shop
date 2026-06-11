import type { LucideIcon } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  trend?: { value: number; label: string }
}

export function StatsCard({ title, value, subtitle, icon: Icon, trend }: StatsCardProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-sm)]">
      {Icon && (
        <Icon
          size={20}
          className="absolute right-4 top-4 text-[hsl(var(--primary)/0.55)]"
        />
      )}
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[hsl(var(--muted-foreground))]">
        {title}
      </p>
      <p className="mt-1.5 break-words text-[28px] font-extrabold leading-[1.1] tracking-[-0.01em] text-[hsl(var(--foreground))]">
        {value}
      </p>
      {subtitle && (
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{subtitle}</p>
      )}
      {trend && (
        <span
          className={`mt-1.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-bold ${
            trend.value >= 0
              ? 'bg-[var(--success-bg)] text-[var(--success)]'
              : 'bg-[var(--danger-bg)] text-[var(--danger)]'
          }`}
        >
          {trend.value >= 0 ? '↑' : '↓'} {trend.value >= 0 ? '+' : ''}
          {trend.value} {trend.label}
        </span>
      )}
    </div>
  )
}
