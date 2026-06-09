import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ShieldAlert,
  ShieldCheck,
  CalendarPlus,
  Database,
  RotateCcw,
  X,
  Copy,
  ExternalLink,
} from 'lucide-react'
import {
  getAdminUserDetail,
  banUser,
  unbanUser,
  resetUserTrial,
  addDaysToUser,
  addTrafficToUser,
} from '@/api/admin/users'
import type { AdminUserDetailResponse, AdminPaymentItem } from '@/api/admin/users'
import { useToast } from '@/hooks/useToast'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs } from '@/components/ui/tabs'
import { useTranslation } from 'react-i18next'

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
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`
}

const STATUS_LABELS: Record<string, string> = {
  succeeded: 'admin_payments_status_succeeded',
  pending: 'admin_payments_status_pending',
  failed: 'admin_payments_status_failed',
  processing: 'admin_loading_action',
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const label = STATUS_LABELS[status] ? t(STATUS_LABELS[status]) : status
  const variant: BadgeProps['variant'] =
    status === 'succeeded' ? 'success' : status === 'failed' ? 'danger' : 'warning'
  return (
    <Badge variant={variant} dot>
      {label}
    </Badge>
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
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[hsl(var(--card))] rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-base font-semibold text-[hsl(var(--foreground))] mb-2">{title}</h3>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5">{description}</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            {t('admin_cancel')}
          </Button>
          <Button
            variant={danger ? 'destructive' : 'default'}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {isLoading ? t('admin_loading_action') : confirmLabel}
          </Button>
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
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[hsl(var(--card))] rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">{t('admin_users_add_days')}</h3>
          <button onClick={onClose} className="text-[hsl(var(--muted-foreground))]"><X size={18} /></button>
        </div>
        <div className="mb-4">
          <Input
            label={t('admin_promos_label_bonus_days')}
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value)))}
          />
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            {t('admin_cancel')}
          </Button>
          <Button onClick={() => onSubmit(days)} isLoading={isLoading}>
            {isLoading ? t('admin_loading_action') : t('admin_users_add_days_button', { count: days })}
          </Button>
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
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[hsl(var(--card))] rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">{t('admin_users_add_traffic')}</h3>
          <button onClick={onClose} className="text-[hsl(var(--muted-foreground))]"><X size={18} /></button>
        </div>
        <div className="mb-4">
          <Input
            label="GB"
            type="number"
            min={1}
            max={10240}
            value={gb}
            onChange={(e) => setGb(Math.max(1, Number(e.target.value)))}
          />
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            {t('admin_cancel')}
          </Button>
          <Button onClick={() => onSubmit(gb)} isLoading={isLoading}>
            {isLoading ? t('admin_loading_action') : t('admin_users_add_traffic_button', { count: gb })}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

type Modal = 'ban' | 'unban' | 'reset-trial' | 'add-days' | 'add-traffic' | null

export function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [modal, setModal] = useState<Modal>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'subscription' | 'payments'>('info')

  const uid = Number(userId)
  const toast = useToast()
  const { t } = useTranslation()

  const { data: user, isLoading, isError } = useQuery<AdminUserDetailResponse>({
    queryKey: ['admin', 'user', uid],
    queryFn: () => getAdminUserDetail(uid),
    enabled: !isNaN(uid),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'user', uid] })
    qc.invalidateQueries({ queryKey: ['admin', 'users'] })
  }

  const banMut = useMutation({
    mutationFn: () => banUser(uid),
    onSuccess: () => { invalidate(); setModal(null); toast.success(t('admin_users_banned_toast')) },
    onError: () => toast.error(t('admin_users_ban_error')),
  })
  const unbanMut = useMutation({
    mutationFn: () => unbanUser(uid),
    onSuccess: () => { invalidate(); setModal(null); toast.success(t('admin_users_unbanned_toast')) },
    onError: () => toast.error(t('admin_users_unban_error')),
  })
  const resetTrialMut = useMutation({
    mutationFn: () => resetUserTrial(uid),
    onSuccess: (res) => {
      invalidate()
      setModal(null)
      if (res.trial_eligible) {
        toast.success(t('admin_users_trial_reset_toast'))
      } else if (res.trial_block_reason === 'has_subscription') {
        toast.success(t('admin_users_trial_reset_has_subscription_toast'))
      } else if (res.trial_block_reason === 'disabled') {
        toast.success(t('admin_users_trial_reset_disabled_toast'))
      } else {
        toast.success(t('admin_users_trial_reset_blocked_toast'))
      }
    },
    onError: () => toast.error(t('admin_users_trial_reset_error')),
  })
  const addDaysMut = useMutation({
    mutationFn: (days: number) => addDaysToUser(uid, days),
    onSuccess: (res) => {
      invalidate()
      setModal(null)
      toast.success(t('admin_users_days_added_toast', { count: res.days_added }))
    },
    onError: () => toast.error(t('admin_users_add_days_error')),
  })
  const addTrafficMut = useMutation({
    mutationFn: (gb: number) => addTrafficToUser(uid, gb),
    onSuccess: (res) => {
      invalidate()
      setModal(null)
      toast.success(t('admin_users_traffic_added_toast', { count: res.gigabytes_added }))
    },
    onError: () => toast.error(t('admin_users_add_traffic_error')),
  })

  if (isLoading) {
    return (
      <div className="px-4 py-6 sm:p-8 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-[hsl(var(--muted))] rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (isError || !user) {
    return (
      <div className="px-4 py-6 sm:p-8">
        <p className="text-[var(--danger)] text-sm">{t('admin_error')}</p>
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
    <div className="px-4 py-6 sm:p-8 space-y-6 max-w-3xl">
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
              <Badge variant="danger">
                <ShieldAlert size={12} />
                {t('admin_users_banned')}
              </Badge>
            )}
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            Telegram ID: {user.user_id}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {user.is_banned ? (
            <Button size="sm" onClick={() => setModal('unban')}>
              <ShieldCheck size={15} />
              {t('admin_users_unban')}
            </Button>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => setModal('ban')}>
              <ShieldAlert size={15} />
              {t('admin_users_ban')}
            </Button>
          )}
          {user.panel_user_uuid && (
            <>
              <Button variant="outline" size="sm" onClick={() => setModal('add-days')}>
                <CalendarPlus size={15} />
                {t('admin_users_add_days')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setModal('add-traffic')}>
                <Database size={15} />
                {t('admin_users_add_traffic')}
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setModal('reset-trial')}>
            <RotateCcw size={15} />
            {t('admin_users_reset_trial')}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'info' | 'subscription' | 'payments')}
        items={[
          { value: 'info', label: t('admin_user_detail_info') },
          { value: 'subscription', label: t('admin_user_detail_subscription') },
          { value: 'payments', label: t('admin_user_detail_payments') },
        ]}
      />

      {/* Tab: Info */}
      {activeTab === 'info' && (
        <Card className="p-5">
          <InfoRow label={t('admin_user_detail_first_name')} value={[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'} />
          <InfoRow
            label={t('admin_user_detail_username')}
            value={user.username ? `@${user.username}` : '—'}
          />
          <InfoRow label={t('admin_users_email')} value={user.email || '—'} />
          <InfoRow label={t('admin_user_detail_language')} value={user.language_code || '—'} />
          <InfoRow
            label="Referral code"
            value={
              user.referral_code ? (
                <span className="font-mono">{user.referral_code}</span>
              ) : (
                '—'
              )
            }
          />
          <InfoRow label={t('admin_users_registered')} value={formatDate(user.registration_date)} />
          <InfoRow
            label={t('admin_user_detail_panel_uuid')}
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
            label={t('admin_user_detail_total_paid')}
            value={
              <span className="font-semibold">
                {user.total_paid.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
              </span>
            }
          />
        </Card>
      )}

      {/* Tab: Subscription */}
      {activeTab === 'subscription' && (
        <div className="space-y-4">
          {user.subscription ? (
            <Card className="p-5">
              <InfoRow label={t('admin_status')} value={user.subscription.is_active ? t('admin_user_detail_subscription_active') : t('admin_user_detail_subscription_inactive')} />
              <InfoRow label="Start" value={formatDate(user.subscription.start_date)} />
              <InfoRow label={t('admin_user_detail_subscription_end')} value={formatDate(user.subscription.end_date)} />
              <InfoRow
                label={t('admin_period')}
                value={user.subscription.duration_months ? `${user.subscription.duration_months} ${t('admin_month_short')}` : '—'}
              />
              <InfoRow label={t('admin_provider')} value={user.subscription.provider || '—'} />
              <InfoRow
                label="Auto-renew"
                value={user.subscription.auto_renew_enabled ? t('admin_on') : t('admin_off')}
              />
              <InfoRow
                label="Traffic limit"
                value={formatBytes(user.subscription.traffic_limit_bytes)}
              />
              <InfoRow
                label="Traffic used"
                value={formatBytes(user.subscription.traffic_used_bytes)}
              />
            </Card>
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{t('admin_user_detail_subscription_inactive')}</p>
          )}

          {/* Panel data */}
          {user.panel_data && (
            <div>
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-2 flex items-center gap-1.5">
                <ExternalLink size={14} />
                {t('admin_user_detail_panel')}
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
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{t('admin_user_detail_no_payments')}</p>
          ) : (
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)]">
                    <th className="text-left px-4 py-3.5 uppercase text-[10px] font-bold tracking-[0.06em] text-[hsl(var(--muted-foreground))]">ID</th>
                    <th className="text-left px-4 py-3.5 uppercase text-[10px] font-bold tracking-[0.06em] text-[hsl(var(--muted-foreground))]">{t('admin_amount')}</th>
                    <th className="text-left px-4 py-3.5 uppercase text-[10px] font-bold tracking-[0.06em] text-[hsl(var(--muted-foreground))]">{t('admin_provider')}</th>
                    <th className="text-left px-4 py-3.5 uppercase text-[10px] font-bold tracking-[0.06em] text-[hsl(var(--muted-foreground))]">{t('admin_status')}</th>
                    <th className="text-left px-4 py-3.5 uppercase text-[10px] font-bold tracking-[0.06em] text-[hsl(var(--muted-foreground))]">{t('admin_date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {user.recent_payments.map((p: AdminPaymentItem) => (
                    <tr key={p.payment_id} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.5)]">
                      <td className="px-4 py-3.5 font-mono text-xs text-[hsl(var(--muted-foreground))]">#{p.payment_id}</td>
                      <td className="px-4 py-3.5 font-bold text-[hsl(var(--primary))] tabular-nums">
                        {p.amount.toLocaleString('ru-RU', { style: 'currency', currency: p.currency })}
                      </td>
                      <td className="px-4 py-3.5 text-[hsl(var(--muted-foreground))]">{p.provider || '—'}</td>
                      <td className="px-4 py-3.5"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3.5 text-xs text-[hsl(var(--muted-foreground))]">
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
          title={t('admin_users_ban_confirm')}
          description={t('admin_users_ban_description', { name: displayName })}
          confirmLabel={t('admin_users_ban')}
          danger
          onConfirm={() => banMut.mutate()}
          onClose={() => setModal(null)}
          isLoading={banMut.isPending}
        />
      )}
      {modal === 'unban' && (
        <ConfirmModal
          title={t('admin_users_unban_confirm')}
          description={t('admin_users_unban_description', { name: displayName })}
          confirmLabel={t('admin_users_unban')}
          onConfirm={() => unbanMut.mutate()}
          onClose={() => setModal(null)}
          isLoading={unbanMut.isPending}
        />
      )}
      {modal === 'reset-trial' && (
        <ConfirmModal
          title={t('admin_users_reset_trial_confirm')}
          description={t('admin_users_reset_trial_description', { name: displayName })}
          confirmLabel={t('admin_users_reset_trial')}
          onConfirm={() => resetTrialMut.mutate()}
          onClose={() => setModal(null)}
          isLoading={resetTrialMut.isPending}
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
