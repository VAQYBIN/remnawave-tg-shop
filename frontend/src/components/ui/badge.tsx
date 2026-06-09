import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold leading-tight whitespace-nowrap transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]',
        secondary: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
        outline: 'border border-[hsl(var(--border))] text-[hsl(var(--foreground))]',
        success: 'bg-[var(--success-bg)] text-[var(--success)]',
        warning: 'bg-[var(--warning-bg)] text-[#a06a12]',
        danger: 'bg-[var(--danger-bg)] text-[var(--danger)]',
        destructive: 'bg-[var(--danger-bg)] text-[var(--danger)]',
        info: 'bg-[var(--info-bg)] text-[var(--primary-press)]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
