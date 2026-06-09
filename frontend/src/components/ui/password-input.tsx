import { useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  error?: string
  label?: string
}

export function PasswordInput({ className, error, label, id, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-[hsl(var(--foreground))]">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          id={id}
          className={cn(
            'h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 pr-10 text-sm text-[hsl(var(--foreground))] transition-[border-color,box-shadow] duration-150 placeholder:text-[#b6ada3] focus:border-[hsl(var(--primary))] focus:outline-none focus:[box-shadow:var(--ring-primary)] disabled:opacity-50',
            error && 'border-[var(--danger)] focus:[box-shadow:0_0_0_3px_rgba(220,64,64,0.2)]',
            className,
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
          tabIndex={-1}
          aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
        >
          {visible ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </div>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  )
}
