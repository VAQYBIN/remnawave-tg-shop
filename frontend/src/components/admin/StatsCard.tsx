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
    <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-[hsl(var(--muted-foreground))] font-medium">{title}</p>
          <p className="text-2xl font-bold text-[hsl(var(--foreground))] mt-1">{value}</p>
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
          <div className="w-10 h-10 rounded-lg bg-[hsl(var(--primary)/0.1)] flex items-center justify-center shrink-0">
            <Icon size={20} className="text-[hsl(var(--primary))]" />
          </div>
        )}
      </div>
    </div>
  )
}
