import { useState, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Send, Users, Activity, UserX, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { startBroadcast, getBroadcastStatus } from '@/api/admin/broadcast'
import type { BroadcastFilter, BroadcastStatusResponse } from '@/api/admin/broadcast'

const FILTER_OPTIONS: { value: BroadcastFilter; label: string; icon: typeof Users; description: string }[] = [
  { value: 'all', label: 'Все пользователи', icon: Users, description: 'Все незабаненные пользователи' },
  { value: 'active', label: 'С активной подпиской', icon: Activity, description: 'Только у кого активна подписка' },
  { value: 'inactive', label: 'Без активной подписки', icon: UserX, description: 'Кто никогда не покупал или подписка истекла' },
]

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="w-full bg-[hsl(var(--muted))] rounded-full h-2">
      <div
        className="bg-[hsl(var(--primary))] h-2 rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function BroadcastPage() {
  const [text, setText] = useState('')
  const [filter, setFilter] = useState<BroadcastFilter>('all')
  const [broadcastId, setBroadcastId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: statusData, isLoading: statusLoading } = useQuery<BroadcastStatusResponse>({
    queryKey: ['admin', 'broadcast-status', broadcastId],
    queryFn: () => getBroadcastStatus(broadcastId!),
    enabled: !!broadcastId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'completed' || status === 'failed') return false
      return 2000
    },
  })

  const mutation = useMutation({
    mutationFn: () => startBroadcast(text, filter),
    onSuccess: (data) => {
      setBroadcastId(data.broadcast_id)
      setConfirming(false)
    },
  })

  const isRunning = statusData?.status === 'pending' || statusData?.status === 'running'
  const isCompleted = statusData?.status === 'completed'
  const isFailed = statusData?.status === 'failed'
  const canSend = text.trim().length > 0 && !mutation.isPending && !isRunning

  function handleSend() {
    if (!canSend) return
    setConfirming(true)
  }

  function handleConfirm() {
    mutation.mutate()
  }

  function handleReset() {
    setBroadcastId(null)
    mutation.reset()
    setText('')
    setFilter('all')
  }

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Рассылка</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          Отправить HTML-сообщение через Telegram-бот
        </p>
      </div>

      {/* Status block */}
      {broadcastId && statusData && (
        <div className={[
          'rounded-xl border p-5 space-y-3',
          isCompleted ? 'border-green-300 bg-green-50' : isFailed ? 'border-red-300 bg-red-50' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]',
        ].join(' ')}>
          <div className="flex items-center gap-2 font-semibold">
            {isCompleted && <CheckCircle2 size={18} className="text-green-600" />}
            {isFailed && <AlertCircle size={18} className="text-red-600" />}
            {isRunning && <Loader2 size={18} className="animate-spin text-[hsl(var(--primary))]" />}
            <span>
              {isCompleted && 'Рассылка завершена'}
              {isFailed && 'Ошибка рассылки'}
              {statusData.status === 'pending' && 'Ожидание…'}
              {statusData.status === 'running' && 'Отправка…'}
            </span>
          </div>

          {statusData.total > 0 && (
            <>
              <ProgressBar value={statusData.sent + statusData.failed} max={statusData.total} />
              <div className="flex gap-6 text-sm">
                <span>Всего: <b>{statusData.total}</b></span>
                <span className="text-green-700">Отправлено: <b>{statusData.sent}</b></span>
                {statusData.failed > 0 && (
                  <span className="text-red-700">Ошибок: <b>{statusData.failed}</b></span>
                )}
              </div>
            </>
          )}

          {statusData.error && (
            <p className="text-sm text-red-700">{statusData.error}</p>
          )}

          {(isCompleted || isFailed) && (
            <button
              onClick={handleReset}
              className="mt-1 text-sm text-[hsl(var(--primary))] hover:underline"
            >
              Новая рассылка
            </button>
          )}
        </div>
      )}

      {/* Form */}
      {!broadcastId && (
        <>
          {/* Message textarea */}
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 space-y-3">
            <label className="block text-sm font-semibold text-[hsl(var(--foreground))]">
              Текст сообщения
            </label>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Введите текст рассылки. Поддерживается HTML: <b>жирный</b>, <i>курсив</i>, <a href='...'>ссылка</a>"
              rows={8}
              className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)] resize-y"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {text.length} символов
            </p>
          </div>

          {/* Filter */}
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 space-y-3">
            <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Получатели</p>
            <div className="space-y-2">
              {FILTER_OPTIONS.map(({ value, label, icon: Icon, description }) => (
                <label
                  key={value}
                  className={[
                    'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                    filter === value
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)]'
                      : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="filter"
                    value={value}
                    checked={filter === value}
                    onChange={() => setFilter(value)}
                    className="accent-[hsl(var(--primary))]"
                  />
                  <Icon size={16} className="text-[hsl(var(--muted-foreground))] shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Send button */}
          {!confirming ? (
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={16} />
              Отправить рассылку
            </button>
          ) : (
            /* Confirmation */
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-3">
              <div className="flex items-center gap-2 text-amber-800 font-semibold">
                <AlertCircle size={18} />
                Подтвердите отправку
              </div>
              <p className="text-sm text-amber-700">
                Сообщение будет отправлено получателям:{' '}
                <b>{FILTER_OPTIONS.find((o) => o.value === filter)?.label}</b>.
                Это действие нельзя отменить.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleConfirm}
                  disabled={mutation.isPending}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition disabled:opacity-50"
                >
                  {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Да, отправить
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="px-5 py-2 rounded-lg border border-[hsl(var(--border))] text-sm font-medium hover:bg-[hsl(var(--muted))] transition"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {mutation.isError && (
            <p className="text-sm text-red-600">
              Ошибка: {(mutation.error as Error)?.message ?? 'Неизвестная ошибка'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
