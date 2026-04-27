import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ShieldAlert,
  ShieldCheck,
  CalendarPlus,
  Database,
  X,
  Copy,
  ExternalLink,
} from 'lucide-react'
import {
  getAdminUserDetail,
  banUser,
  unbanUser,
  addDaysToUser,
  addTrafficToUser,
} from '@/api/admin/users'
import type { AdminUserDetailResponse, AdminPaymentItem } from '@/api/admin/users'

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes === 0) return '0 Б'
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`
}

const STATUS_LABELS: Record<string, string> = {
  succeeded: 'Оплачен',
  pending: 'Ожидание',
  failed: 'Ошибка',
  processing: 'Обработка',
}

function statusBadge(status: string) {
  const label = STATUS_LABELS[status] ?? status
  const cls =
    status === 'succeeded'
      ? 'bg-green-100 text-green-700'
      : status === 'failed'
      ? 'bg-red-100 text-red-700'
      : 'bg-yellow-100 text-yellow-700'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

// ── Modals ──────────────────────────────────────────────────────────────────

function ConfirmModal({
  title,
  description,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
  isLoading,
}: {
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
  isLoading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[hsl(var(--card))] rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-base font-semibold text-[hsl(var(--foreground))] mb-2">{title}</h3>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5">{description}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--muted))]"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[hsl(var(--primary))] hover:opacity-90'
            }`}
          >
            {isLoading ? 'Выполнение...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddDaysModal({
  onClose,
  onSubmit,
  isLoading,
}: {
  onClose: () => void
  onSubmit: (days: number) => void
  isLoading: boolean
}) {
  const [days, setDays] = useState(30)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[hsl(var(--card))] rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">Добавить дни подписки</h3>
          <button onClick={onClose} className="text-[hsl(var(--muted-foreground))]"><X size={18} /></button>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
            Количество дней
          </label>
          <input
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value)))}
            className="w-full px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--muted))]">
            Отмена
          </button>
          <button
            onClick={() => onSubmit(days)}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {isLoading ? 'Добавление...' : `Добавить ${days} дн.`}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddTrafficModal({
  onClose,
  onSubmit,
  isLoading,
}: {
  onClose: () => void
  onSubmit: (gb: number) => void
  isLoading: boolean
}) {
  const [gb, setGb] = useState(10)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[hsl(var(--card))] rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">Добавить трафик</h3>
          <button onClick={onClose} className="text-[hsl(var(--muted-foreground))]"><X size={18} /></button>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">
            Гигабайт (ГБ)
          </label>
          <input
            type="number"
            min={1}
            max={10240}
            value={gb}
            onChange={(e) => setGb(Math.max(1, Number(e.target.value)))}
            className="w-full px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--muted))]">
            Отмена
          </button>
          <button
            onClick={() => onSubmit(gb)}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {isLoading ? 'Добавление...' : `Добавить ${gb} ГБ`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

type Modal = 'ban' | 'unban' | 'add-days' | 'add-traffic' | null

export function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [modal, setModal] = useState<Modal>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'subscription' | 'payments'>('info')

  const uid = Number(userId)

  const { data: user, isLoading, isError } = useQuery<AdminUserDetailResponse>({
    queryKey: ['admin', 'user', uid],
    queryFn: () => getAdminUserDetail(uid),
    enabled: !isNaN(uid),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'user', uid] })
    qc.invalidateQueries({ queryKey: ['admin', 'users'] })
  }

  const banMut = useMutation({ mutationFn: () => banUser(uid), onSuccess: () => { invalidate(); setModal(null) } })
  const unbanMut = useMutation({ mutationFn: () => unbanUser(uid), onSuccess: () => { invalidate(); setModal(null) } })
  const addDaysMut = useMutation({
    mutationFn: (days: number) => addDaysToUser(uid, days),
    onSuccess: () => { invalidate(); setModal(null) },
  })
  const addTrafficMut = useMutation({
    mutationFn: (gb: number) => addTrafficToUser(uid, gb),
    onSuccess: () => { invalidate(); setModal(null) },
  })

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-[hsl(var(--muted))] rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (isError || !user) {
    return (
      <div className="p-8">
        <p className="text-red-600 text-sm">Пользователь не найден</p>
      </div>
    )
  }

  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(' ') ||
    (user.username ? `@${user.username}` : `ID ${user.user_id}`)

  function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
      <div className="flex items-start justify-between gap-4 py-2.5 border-b border-[hsl(var(--border))] last:border-0">
        <span className="text-sm text-[hsl(var(--muted-foreground))] shrink-0">{label}</span>
        <span className="text-sm text-right text-[hsl(var(--foreground))] break-all">{value}</span>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/admin/users')}
          className="mt-1 p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{displayName}</h1>
            {user.is_banned && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                <ShieldAlert size={12} />
                Забанен
              </span>
            )}
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            Telegram ID: {user.user_id}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {user.is_banned ? (
            <button
              onClick={() => setModal('unban')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700"
            >
              <ShieldCheck size={15} />
              Разбанить
            </button>
          ) : (
            <button
              onClick={() => setModal('ban')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700"
            >
              <ShieldAlert size={15} />
              Забанить
            </button>
          )}
          {user.panel_user_uuid && (
            <>
              <button
                onClick={() => setModal('add-days')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"
              >
                <CalendarPlus size={15} />
                Дни
              </button>
              <button
                onClick={() => setModal('add-traffic')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"
              >
                <Database size={15} />
                Трафик
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[hsl(var(--border))]">
        {(['info', 'subscription', 'payments'] as const).map((tab) => {
          const labels = { info: 'Информация', subscription: 'Подписка', payments: 'Платежи' }
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                  : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              }`}
            >
              {labels[tab]}
            </button>
          )
        })}
      </div>

      {/* Tab: Info */}
      {activeTab === 'info' && (
        <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5">
          <InfoRow label="Имя" value={[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'} />
          <InfoRow
            label="Username"
            value={user.username ? `@${user.username}` : '—'}
          />
          <InfoRow label="Email" value={user.email || '—'} />
          <InfoRow label="Язык" value={user.language_code || '—'} />
          <InfoRow
            label="Реферальный код"
            value={
              user.referral_code ? (
                <span className="font-mono">{user.referral_code}</span>
              ) : (
                '—'
              )
            }
          />
          <InfoRow label="Дата регистрации" value={formatDate(user.registration_date)} />
          <InfoRow
            label="UUID панели"
            value={
              user.panel_user_uuid ? (
                <span className="font-mono text-xs flex items-center gap-1">
                  {user.panel_user_uuid.slice(0, 8)}…
                  <button
                    onClick={() => navigator.clipboard.writeText(user.panel_user_uuid!)}
                    className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  >
                    <Copy size={12} />
                  </button>
                </span>
              ) : (
                '—'
              )
            }
          />
          <InfoRow
            label="Итого оплачено"
            value={
              <span className="font-semibold">
                {user.total_paid.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
              </span>
            }
          />
        </div>
      )}

      {/* Tab: Subscription */}
      {activeTab === 'subscription' && (
        <div className="space-y-4">
          {user.subscription ? (
            <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5">
              <InfoRow label="Статус" value={user.subscription.is_active ? 'Активна' : 'Неактивна'} />
              <InfoRow label="Начало" value={formatDate(user.subscription.start_date)} />
              <InfoRow label="Окончание" value={formatDate(user.subscription.end_date)} />
              <InfoRow
                label="Длительность"
                value={user.subscription.duration_months ? `${user.subscription.duration_months} мес.` : '—'}
              />
              <InfoRow label="Провайдер" value={user.subscription.provider || '—'} />
              <InfoRow
                label="Авто-продление"
                value={user.subscription.auto_renew_enabled ? 'Включено' : 'Выключено'}
              />
              <InfoRow
                label="Лимит трафика"
                value={formatBytes(user.subscription.traffic_limit_bytes)}
              />
              <InfoRow
                label="Использовано трафика"
                value={formatBytes(user.subscription.traffic_used_bytes)}
              />
            </div>
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Активной подписки нет</p>
          )}

          {/* Panel data */}
          {user.panel_data && (
            <div>
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-2 flex items-center gap-1.5">
                <ExternalLink size={14} />
                Данные панели
              </h3>
              <div className="bg-[hsl(var(--muted))] rounded-xl p-4">
                <pre className="text-xs text-[hsl(var(--foreground))] overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(user.panel_data, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Payments */}
      {activeTab === 'payments' && (
        <div>
          {user.recent_payments.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Платежей нет</p>
          ) : (
            <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)]">
                    <th className="text-left px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">ID</th>
                    <th className="text-left px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">Сумма</th>
                    <th className="text-left px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">Провайдер</th>
                    <th className="text-left px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">Статус</th>
                    <th className="text-left px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">Дата</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border))]">
                  {user.recent_payments.map((p: AdminPaymentItem) => (
                    <tr key={p.payment_id} className="hover:bg-[hsl(var(--muted)/0.3)]">
                      <td className="px-4 py-3 font-mono text-xs text-[hsl(var(--muted-foreground))]">#{p.payment_id}</td>
                      <td className="px-4 py-3 font-medium">
                        {p.amount.toLocaleString('ru-RU', { style: 'currency', currency: p.currency })}
                      </td>
                      <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{p.provider || '—'}</td>
                      <td className="px-4 py-3">{statusBadge(p.status)}</td>
                      <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
                        {formatDate(p.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {modal === 'ban' && (
        <ConfirmModal
          title="Забанить пользователя?"
          description={`${displayName} не сможет использовать бота до разбана.`}
          confirmLabel="Забанить"
          danger
          onConfirm={() => banMut.mutate()}
          onClose={() => setModal(null)}
          isLoading={banMut.isPending}
        />
      )}
      {modal === 'unban' && (
        <ConfirmModal
          title="Разбанить пользователя?"
          description={`${displayName} снова получит доступ к боту.`}
          confirmLabel="Разбанить"
          onConfirm={() => unbanMut.mutate()}
          onClose={() => setModal(null)}
          isLoading={unbanMut.isPending}
        />
      )}
      {modal === 'add-days' && (
        <AddDaysModal
          onClose={() => setModal(null)}
          onSubmit={(days) => addDaysMut.mutate(days)}
          isLoading={addDaysMut.isPending}
        />
      )}
      {modal === 'add-traffic' && (
        <AddTrafficModal
          onClose={() => setModal(null)}
          onSubmit={(gb) => addTrafficMut.mutate(gb)}
          isLoading={addTrafficMut.isPending}
        />
      )}
    </div>
  )
}
