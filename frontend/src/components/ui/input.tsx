import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
  label?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, label, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={id}
            className="text-sm font-medium text-[hsl(var(--foreground))]"
          >
            {label}
          </label>
        )}
        <input
          type={type}
          id={id}
          className={cn(
            'h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-white px-3 py-2 text-sm text-[hsl(var(--foreground))] transition-[border-color,box-shadow] duration-150 placeholder:text-[#b6ada3] focus:border-[hsl(var(--primary))] focus:outline-none focus:[box-shadow:var(--ring-primary)] disabled:opacity-50',
            error && 'border-[var(--danger)] focus:[box-shadow:0_0_0_3px_rgba(220,64,64,0.2)]',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
