import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getPaymentStatus, expirePayment, type PaymentStatus } from '@/api/payment'
import { CheckCircle, XCircle, Loader2, Clock, AlertTriangle, ExternalLink, BookOpen } from 'lucide-react'

const PROVIDER_LABELS: Record<string, string> = {
  yookassa: 'YooKassa',
  platega: 'Platega',
  freekassa: 'FreeKassa',
  severpay: 'SeverPay',
  cryptopay: 'CryptoPay',
  stars: 'Telegram Stars',
}

function formatCurrency(amount: number, currency: string) {
  const symbol = currency === 'RUB' ? '₽' : currency
  return `${amount.toFixed(0)} ${symbol}`
}

function monthsLabel(n: number) {
  if (n === 1) return 'месяц'
  if (n >= 2 && n <= 4) return 'месяца'
  return 'месяцев'
}

function parseUtcMs(isoString: string): number {
  // Append 'Z' if the string has no timezone designator so JavaScript
  // always interprets the timestamp as UTC, not local time.
  const s = /[Z+]/.test(isoString) ? isoString : isoString + 'Z'
  return new Date(s).getTime()
}

function isExpired(payment: PaymentStatus) {
  return Date.now() - parseUtcMs(payment.created_at) > 65 * 60 * 1000
}

type PageState = 'loading' | 'countdown' | 'checking' | 'succeeded' | 'expired' | 'failed' | 'error'

export function PaymentPendingPage() {
  const { paymentId } = useParams<{ paymentId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [pageState, setPageState] = useState<PageState>('loading')
  const [payment, setPayment] = useState<PaymentStatus | null>(null)
  const [countdown, setCountdown] = useState(5)
  const [errorMsg, setErrorMsg] = useState('')

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const redirectedKey = paymentId ? `payment_redirected_${paymentId}` : null
  // Set by SubscriptionPage for first-ever purchases — drives the "connect now" nudge.
  const firstPurchase = paymentId ? sessionStorage.getItem(`payment_first_${paymentId}`) === '1' : false

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
  }, [])

  const handleRedirectNow = useCallback((url: string) => {
    if (redirectedKey) sessionStorage.setItem(redirectedKey, '1')
    stopCountdown()
    window.location.href = url
  }, [redirectedKey, stopCountdown])

  const markExpiredAndInvalidate = useCallback((id: number) => {
    queryClient.invalidateQueries({ queryKey: ['pending-payment'] })
    expirePayment(id).catch(() => {})
  }, [queryClient])

  const applyPaymentStatus = useCallback((p: PaymentStatus) => {
    if (p.status === 'succeeded') {
      stopPolling()
      stopCountdown()
      setPageState('succeeded')
      queryClient.invalidateQueries({ queryKey: ['pending-payment'] })
      return
    }
    if (p.status === 'failed' || p.status === 'cancelled' || p.status === 'canceled') {
      stopPolling()
      stopCountdown()
      setPageState('failed')
      queryClient.invalidateQueries({ queryKey: ['pending-payment'] })
      return
    }
    if (p.status === 'pending' && isExpired(p)) {
      stopPolling()
      stopCountdown()
      setPageState('expired')
      markExpiredAndInvalidate(p.payment_id)
    }
  }, [stopPolling, stopCountdown, navigate, queryClient, markExpiredAndInvalidate])

  // Initial load
  useEffect(() => {
    if (!paymentId) {
      setPageState('error')
      setErrorMsg('Идентификатор платежа не найден')
      return
    }

    getPaymentStatus(Number(paymentId))
      .then((p) => {
        setPayment(p)

        if (p.status === 'succeeded') {
          setPageState('succeeded')
          queryClient.invalidateQueries({ queryKey: ['pending-payment'] })
          return
        }
        if (p.status === 'failed' || p.status === 'cancelled' || p.status === 'canceled') {
          setPageState('failed')
          queryClient.invalidateQueries({ queryKey: ['pending-payment'] })
          return
        }
        if (p.status === 'pending' && isExpired(p)) {
          setPageState('expired')
          markExpiredAndInvalidate(p.payment_id)
          return
        }

        // Pending — determine if this is a first visit or a return from provider
        const alreadyRedirected = redirectedKey ? sessionStorage.getItem(redirectedKey) : null

        if (alreadyRedirected) {
          // User returned from payment provider — show checking state
          setPageState('checking')
        } else {
          // First visit — show countdown
          setPageState('countdown')
        }
      })
      .catch(() => {
        setPageState('error')
        setErrorMsg('Не удалось загрузить информацию о платеже')
      })
  }, [paymentId, redirectedKey, navigate, queryClient, markExpiredAndInvalidate])

  // Countdown → auto-redirect
  useEffect(() => {
    if (pageState !== 'countdown' || !payment?.redirect_url) return

    setCountdown(5)
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          stopCountdown()
          handleRedirectNow(payment.redirect_url!)
          return 0
        }
        return c - 1
      })
    }, 1000)

    return () => stopCountdown()
  }, [pageState, payment, stopCountdown, handleRedirectNow])

  // Polling when in 'checking' state
  useEffect(() => {
    if (pageState !== 'checking' || !paymentId) return

    const poll = async () => {
      try {
        const p = await getPaymentStatus(Number(paymentId))
        setPayment(p)
        applyPaymentStatus(p)
      } catch {
        // silently ignore transient errors
      }
    }

    poll()
    pollRef.current = setInterval(poll, 3000)
    return () => stopPolling()
  }, [pageState, paymentId, applyPaymentStatus, stopPolling])

  const supportLink = import.meta.env.VITE_SUPPORT_LINK as string | undefined

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 space-y-4">

          {/* Loading */}
          {pageState === 'loading' && (
            <div className="text-center space-y-3">
              <Loader2 size={48} className="mx-auto animate-spin text-[hsl(var(--primary))]" />
              <p className="font-semibold text-lg">Загрузка...</p>
            </div>
          )}

          {/* Countdown → redirect to provider */}
          {pageState === 'countdown' && payment && (
            <div className="space-y-5">
              <div className="text-center space-y-2">
                <div className="mx-auto w-16 h-16 rounded-full bg-[var(--primary-soft)] flex items-center justify-center">
                  <span className="text-2xl font-bold text-[hsl(var(--primary))]">{countdown}</span>
                </div>
                <p className="font-semibold text-lg">Переход к оплате через {countdown} сек.</p>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Вы будете перенаправлены на страницу провайдера{' '}
                  <span className="font-medium">{PROVIDER_LABELS[payment.provider] ?? payment.provider}</span>
                </p>
              </div>

              <PaymentSummary payment={payment} />

              <div className="flex flex-col gap-2">
                {payment.redirect_url && (
                  <Button
                    className="w-full"
                    onClick={() => handleRedirectNow(payment.redirect_url!)}
                  >
                    <ExternalLink size={16} className="mr-2" />
                    Оплатить сейчас
                  </Button>
                )}
                <Button variant="outline" className="w-full" onClick={() => navigate('/subscription')}>
                  Отмена
                </Button>
              </div>
            </div>
          )}

          {/* Checking — user returned from provider */}
          {pageState === 'checking' && (
            <div className="space-y-5">
              <div className="text-center space-y-2">
                <Loader2 size={48} className="mx-auto animate-spin text-[hsl(var(--primary))]" />
                <p className="font-semibold text-lg">Проверяем оплату...</p>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Это может занять несколько секунд
                </p>
              </div>

              {payment && <PaymentSummary payment={payment} />}

              <div className="flex flex-col gap-2">
                {payment?.redirect_url && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleRedirectNow(payment.redirect_url!)}
                  >
                    <ExternalLink size={16} className="mr-2" />
                    Вернуться к оплате
                  </Button>
                )}
                <Button variant="outline" className="w-full" onClick={() => navigate('/payments')}>
                  История платежей
                </Button>
              </div>
            </div>
          )}

          {/* Success */}
          {pageState === 'succeeded' && (
            <div className="text-center space-y-4">
              <CheckCircle size={56} className="mx-auto text-[var(--success)]" />
              <p className="font-semibold text-lg">
                {firstPurchase ? 'Спасибо за покупку! 🎉' : 'Оплата прошла успешно!'}
              </p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {firstPurchase
                  ? 'Подписка активирована. Осталось только подключить — откройте инструкцию по подключению.'
                  : 'Подписка активирована.'}
              </p>
              {firstPurchase ? (
                <div className="flex flex-col gap-2">
                  <Button className="w-full" onClick={() => navigate('/devices?tab=guide')}>
                    <BookOpen size={16} className="mr-2" />
                    Перейти к инструкции
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => navigate('/subscription')}>
                    Перейти к подписке
                  </Button>
                </div>
              ) : (
                <Button className="w-full" onClick={() => navigate('/subscription')}>
                  Перейти к подписке
                </Button>
              )}
            </div>
          )}

          {/* Expired */}
          {pageState === 'expired' && (
            <div className="text-center space-y-4">
              <Clock size={56} className="mx-auto text-[hsl(var(--muted-foreground))]" />
              <p className="font-semibold text-lg">Счёт недействителен</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Оплата по этому счёту не поступила, и срок его действия истёк.
                {supportLink && (
                  <>
                    {' '}Если вы считаете, что это ошибка —{' '}
                    <a
                      href={supportLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[hsl(var(--primary))] underline"
                    >
                      напишите в поддержку
                    </a>
                    .
                  </>
                )}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => navigate('/subscription')}>
                  К тарифам
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => navigate('/payments')}>
                  История
                </Button>
              </div>
            </div>
          )}

          {/* Failed */}
          {pageState === 'failed' && (
            <div className="text-center space-y-4">
              <XCircle size={56} className="mx-auto text-[var(--danger)]" />
              <p className="font-semibold text-lg">Платёж не завершён</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Оплата была отклонена или отменена.
                {supportLink && (
                  <>
                    {' '}Если вы считаете, что это ошибка —{' '}
                    <a
                      href={supportLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[hsl(var(--primary))] underline"
                    >
                      напишите в поддержку
                    </a>
                    .
                  </>
                )}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => navigate('/subscription')}>
                  К тарифам
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => navigate('/payments')}>
                  История
                </Button>
              </div>
            </div>
          )}

          {/* Error */}
          {pageState === 'error' && (
            <div className="text-center space-y-4">
              <AlertTriangle size={56} className="mx-auto text-[var(--warning)]" />
              <p className="font-semibold text-lg">Ошибка</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">{errorMsg}</p>
              <Button variant="outline" className="w-full" onClick={() => navigate('/payments')}>
                История платежей
              </Button>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  )
}

function PaymentSummary({ payment }: { payment: PaymentStatus }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] p-4 space-y-2 text-sm">
      {payment.subscription_duration_months && (
        <div className="flex justify-between">
          <span className="text-[hsl(var(--muted-foreground))]">Тариф</span>
          <span className="font-medium">
            {payment.subscription_duration_months} {monthsLabel(payment.subscription_duration_months)}
          </span>
        </div>
      )}
      <div className="flex justify-between">
        <span className="text-[hsl(var(--muted-foreground))]">Сумма</span>
        <span className="font-semibold">
          {formatCurrency(payment.amount, payment.currency)}
          {payment.original_amount && payment.discount_applied && (
            <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))] line-through">
              {formatCurrency(payment.original_amount, payment.currency)}
            </span>
          )}
        </span>
      </div>
      {payment.promo_code && (
        <div className="flex justify-between">
          <span className="text-[hsl(var(--muted-foreground))]">Промокод</span>
          <code className="font-mono text-xs bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded">
            {payment.promo_code}
          </code>
        </div>
      )}
    </div>
  )
}
