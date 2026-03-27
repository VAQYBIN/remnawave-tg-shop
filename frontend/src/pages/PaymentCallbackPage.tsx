import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getPaymentStatus } from '@/api/payment'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

type Status = 'polling' | 'succeeded' | 'failed' | 'error'

export function PaymentCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const paymentId = searchParams.get('payment_id')

  const [status, setStatus] = useState<Status>('polling')
  const [message, setMessage] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const attemptsRef = useRef(0)
  const MAX_ATTEMPTS = 60 // 2 min at 2s intervals

  useEffect(() => {
    if (!paymentId) {
      setStatus('error')
      setMessage('Идентификатор платежа не найден')
      return
    }

    const poll = async () => {
      try {
        const data = await getPaymentStatus(Number(paymentId))
        attemptsRef.current += 1

        if (data.status === 'succeeded') {
          clearInterval(intervalRef.current!)
          setStatus('succeeded')
          setMessage(`Оплата прошла успешно. Подписка активирована.`)
          return
        }

        if (data.status === 'failed' || data.status === 'cancelled' || data.status === 'canceled') {
          clearInterval(intervalRef.current!)
          setStatus('failed')
          setMessage('Платёж не был завершён.')
          return
        }

        if (attemptsRef.current >= MAX_ATTEMPTS) {
          clearInterval(intervalRef.current!)
          setStatus('error')
          setMessage('Время ожидания истекло. Проверьте статус в истории платежей.')
        }
      } catch {
        clearInterval(intervalRef.current!)
        setStatus('error')
        setMessage('Не удалось получить статус платежа.')
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 2000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [paymentId])

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center space-y-4">
          {status === 'polling' && (
            <>
              <Loader2 size={48} className="mx-auto animate-spin text-[hsl(var(--primary))]" />
              <p className="font-semibold text-lg">Ожидаем подтверждения оплаты</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Это может занять несколько секунд...
              </p>
            </>
          )}

          {status === 'succeeded' && (
            <>
              <CheckCircle size={48} className="mx-auto text-green-500" />
              <p className="font-semibold text-lg">Оплата успешна!</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">{message}</p>
              <Button onClick={() => navigate('/subscription')} className="w-full">
                Перейти к подписке
              </Button>
            </>
          )}

          {(status === 'failed' || status === 'error') && (
            <>
              <XCircle size={48} className="mx-auto text-red-500" />
              <p className="font-semibold text-lg">
                {status === 'failed' ? 'Платёж не завершён' : 'Ошибка'}
              </p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">{message}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate('/subscription')} className="flex-1">
                  К тарифам
                </Button>
                <Button variant="outline" onClick={() => navigate('/payments')} className="flex-1">
                  История
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
