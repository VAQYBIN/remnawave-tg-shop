import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { useToastContext, type Toast, type ToastVariant } from '@/lib/toast-context'

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'bg-[hsl(var(--card))] border-green-500/40 text-[hsl(var(--foreground))]',
  error:   'bg-[hsl(var(--card))] border-red-500/40   text-[hsl(var(--foreground))]',
  info:    'bg-[hsl(var(--card))] border-[hsl(var(--primary)/0.4)] text-[hsl(var(--foreground))]',
}

const ICON_STYLES: Record<ToastVariant, string> = {
  success: 'text-green-500',
  error:   'text-red-500',
  info:    'text-[hsl(var(--primary))]',
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  const cls = `${ICON_STYLES[variant]} shrink-0`
  if (variant === 'success') return <CheckCircle size={16} className={cls} />
  if (variant === 'error')   return <AlertCircle size={16} className={cls} />
  return <Info size={16} className={cls} />
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className={[
        'flex items-start gap-3 min-w-[240px] max-w-sm rounded-xl border shadow-lg px-4 py-3',
        'animate-slide-in-down',
        VARIANT_STYLES[toast.variant],
      ].join(' ')}
    >
      <ToastIcon variant={toast.variant} />
      <p className="flex-1 text-sm font-medium leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        aria-label="Close"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function Toaster() {
  const { toasts, dismiss } = useToastContext()

  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={() => dismiss(t.id)} />
        </div>
      ))}
    </div>
  )
}
