import { type SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

const chevron =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B6056' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")"

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, id, children, ...props }, ref) => {
    const el = (
      <select
        ref={ref}
        id={id}
        className={cn(
          'h-10 w-full appearance-none rounded-[var(--radius)] border border-[hsl(var(--border))] bg-white bg-no-repeat pl-3 pr-8 text-sm text-[hsl(var(--foreground))] transition-[border-color,box-shadow] duration-150 focus:border-[hsl(var(--primary))] focus:outline-none focus:[box-shadow:var(--ring-primary)] disabled:opacity-50',
          className
        )}
        style={{ backgroundImage: chevron, backgroundPosition: 'right 12px center' }}
        {...props}
      >
        {children}
      </select>
    )
    if (!label) return el
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-semibold text-[hsl(var(--foreground))]">
          {label}
        </label>
        {el}
      </div>
    )
  }
)
Select.displayName = 'Select'

export { Select }
