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
    <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[hsl(var(--muted-foreground))] font-medium leading-snug">{title}</p>
          <p className="text-xl sm:text-2xl font-bold text-[hsl(var(--foreground))] mt-1 leading-tight break-words">{value}</p>
          {subtitle && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{subtitle}</p>
          )}
          {trend && (
            <p className={`text-xs mt-1 font-medium ${trend.value >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {trend.value >= 0 ? '+' : ''}{trend.value} {trend.label}
            </p>
          )}
        </div>
        {Icon && (
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[hsl(var(--primary)/0.1)] flex items-center justify-center shrink-0">
            <Icon size={18} className="text-[hsl(var(--primary))] sm:size-5" />
          </div>
        )}
      </div>
    </div>
  )
}
