import { useToastContext, type ToastVariant } from '@/lib/toast-context'

export function useToast() {
  const { toast, dismiss } = useToastContext()

  return {
    success: (message: string) => toast(message, 'success'),
    error: (message: string) => toast(message, 'error'),
    info: (message: string) => toast(message, 'info'),
    dismiss,
  }
}
