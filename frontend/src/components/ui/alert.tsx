import { type HTMLAttributes, type ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const alertVariants = cva(
  'flex items-start gap-3 rounded-xl border p-4 text-[13px] leading-relaxed',
  {
    variants: {
      variant: {
        info: 'border-[color-mix(in_srgb,hsl(var(--primary))_25%,transparent)] bg-[var(--info-bg)] text-[var(--primary-press)]',
        success: 'border-[#b6e2c7] bg-[var(--success-bg)] text-[#186e45]',
        warning: 'border-[#f2d399] bg-[var(--warning-bg)] text-[#8c5e10]',
        danger: 'border-[#f2b6b6] bg-[var(--danger-bg)] text-[#9c2828]',
      },
    },
    defaultVariants: { variant: 'info' },
  }
)

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  icon?: ReactNode
}

export function Alert({ className, variant, icon, children, ...props }: AlertProps) {
  return (
    <div className={cn(alertVariants({ variant }), className)} {...props}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
