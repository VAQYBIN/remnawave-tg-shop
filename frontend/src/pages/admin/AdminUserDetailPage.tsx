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
  Monitor,
  Smartphone,
  Tablet,
  Laptop,
  Wifi,
  CreditCard,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import {
  getAdminUserDetail,
  getAdminUserDevices,
  getAdminUserActivity,
  banUser,
  unbanUser,
  resetUserTrial,
  addDaysToUser,
  addTrafficToUser,
} from '@/api/admin/users'
import type {
  AdminUserDetailResponse,
  AdminPaymentItem,
  AdminActivityItem,
  Device,
} from '@/api/admin/users'
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

function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`
}

function initials(name: string): string {
  const parts = name.trim().replace(/^@/, '').split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
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

// ── Devices & activity helpers ────────────────────────────────────────────────

function platformIcon(platform: string | null, model: string | null): LucideIcon {
  const p = `${platform ?? ''} ${model ?? ''}`.toLowerCase()
  if (p.includes('router') || p.includes('openwrt') || p.includes('wrt')) return Wifi
  if (p.includes('tablet') || p.includes('ipad')) return Tablet
  if (p.includes('android') || p.includes('ios') || p.includes('iphone') || p.includes('phone')) return Smartphone
  if (p.includes('mac') || p.includes('windows') || p.includes('linux') || p.includes('book')) return Laptop
  return Monitor
}

function deviceLabel(device: Device): string {
  if (device.model) return device.model
  if (device.name) return device.name
  if (device.platform && device.os_version) return `${device.platform} ${device.os_version}`
  if (device.platform) return device.platform
  return 'Device'
}

/** Treat a device active within the last 5 minutes as online. */
function isOnline(updatedAt: string | null): boolean {
  if (!updatedAt) return false
  const ts = new Date(/[Z+]/.test(updatedAt) ? updatedAt : updatedAt + 'Z').getTime()
  if (Number.isNaN(ts)) return false
  return Date.now() - ts < 5 * 60 * 1000
}

const ACTIVITY_ICON: Record<string, LucideIcon> = {
  signup: Sparkles,
  payment: CreditCard,
  admin_ban: ShieldAlert,
  admin_unban: ShieldCheck,
  admin_add_days: CalendarPlus,
  admin_add_traffic: Database,
  admin_reset_trial: RotateCcw,
}

// ── Small building blocks ─────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-[hsl(var(--muted-foreground))]">
        {label}
      </div>
      <div className="mt-1 text-base font-bold text-[hsl(var(--foreground))]">{value}</div>
    </div>
  )
}

function KVRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-[hsl(var(--border))] last:border-0">
      <span className="text-sm text-[hsl(var(--muted-foreground))] shrink-0">{label}</span>
      <span className="text-sm text-right font-semibold text-[hsl(var(--foreground))] break-all">{value}</span>
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
  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'activity'>('overview')

  const uid = Number(userId)
  const toast = useToast()
  const { t, i18n } = useTranslation()

  const { data: user, isLoading, isError } = useQuery<AdminUserDetailResponse>({
    queryKey: ['admin', 'user', uid],
    queryFn: () => getAdminUserDetail(uid),
    enabled: !isNaN(uid),
  })

  const devicesQuery = useQuery({
    queryKey: ['admin', 'user', uid, 'devices'],
    queryFn: () => getAdminUserDevices(uid),
    enabled: !isNaN(uid) && Boolean(user?.panel_user_uuid),
  })

  const activityQuery = useQuery({
    queryKey: ['admin', 'user', uid, 'activity'],
    queryFn: () => getAdminUserActivity(uid),
    enabled: !isNaN(uid) && activeTab === 'activity',
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

  const sub = user.subscription
  const planLabel = sub?.duration_months
    ? `${sub.duration_months} ${t('admin_month_short')}`
    : t('admin_user_detail_no_subscription_short')
  const locale = i18n.language.startsWith('ru') ? 'ru-RU' : 'en-US'

  function formatActivityTime(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function activityText(item: AdminActivityItem): string {
    switch (item.type) {
      case 'signup':
        return t('admin_activity_signup')
      case 'admin_ban':
        return t('admin_activity_ban')
      case 'admin_unban':
        return t('admin_activity_unban')
      case 'admin_add_days':
        return t('admin_activity_add_days', { count: item.days ?? 0 })
      case 'admin_add_traffic':
        return t('admin_activity_add_traffic', { count: item.gigabytes ?? 0 })
      case 'admin_reset_trial':
        return t('admin_activity_reset_trial')
      case 'payment': {
        const amount =
          item.amount != null
            ? item.amount.toLocaleString(locale, {
                style: 'currency',
                currency: item.currency || 'RUB',
                maximumFractionDigits: 0,
              })
            : '—'
        const plan = item.duration_months ? `, ${item.duration_months} ${t('admin_month_short')}` : ''
        const via = item.provider ? ` (${item.provider})` : ''
        return item.status === 'succeeded'
          ? t('admin_activity_payment_paid', { amount, plan, via })
          : t('admin_activity_payment_other', { amount, plan, via, status: item.status || '' })
      }
      default:
        return item.type
    }
  }

  return (
    <div className="px-4 py-6 sm:p-8 space-y-6 max-w-4xl">
      {/* Back */}
      <button
        onClick={() => navigate('/admin/users')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
      >
        <ArrowLeft size={15} />
        {t('admin_user_detail_back')}
      </button>

      {/* Header card */}
      <Card className="p-6 sm:p-7">
        <div className="flex flex-wrap items-start gap-5">
          {/* Avatar */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-lg font-bold text-[var(--primary-press)]">
            {initials(displayName)}
          </div>

          {/* Identity */}
          <div className="min-w-[200px] flex-1">
            <h1 className="text-2xl font-extrabold tracking-tight text-[hsl(var(--foreground))]">{displayName}</h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              {[user.username ? `@${user.username}` : null, user.email].filter(Boolean).join(' · ') || '—'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {user.is_banned ? (
                <Badge variant="danger" dot>{t('admin_users_banned')}</Badge>
              ) : sub?.is_active ? (
                <Badge variant="success" dot>{t('admin_user_detail_subscription_active')}</Badge>
              ) : (
                <Badge variant="secondary" dot>{t('admin_user_detail_subscription_inactive')}</Badge>
              )}
              <Badge variant="secondary">{planLabel}</Badge>
              <Badge variant="outline">ID {user.user_id}</Badge>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {user.panel_user_uuid && (
              <>
                <Button size="sm" onClick={() => setModal('add-days')}>
                  <CalendarPlus size={15} />
                  {t('admin_user_detail_extend_manual')}
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
            {user.is_banned ? (
              <Button variant="ghost" size="sm" onClick={() => setModal('unban')}>
                <ShieldCheck size={15} />
                {t('admin_users_unban')}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                onClick={() => setModal('ban')}
              >
                <ShieldAlert size={15} />
                {t('admin_users_ban')}
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-[hsl(var(--border))] pt-5 sm:grid-cols-4">
          <Stat
            label={t('admin_user_detail_total_paid')}
            value={user.total_paid.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 })}
          />
          <Stat label={t('admin_user_detail_plan')} value={planLabel} />
          <Stat label={t('admin_user_detail_subscription_end')} value={formatDay(sub?.end_date)} />
          <Stat label={t('admin_users_registered')} value={formatDay(user.registration_date)} />
        </div>
      </Card>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'overview' | 'payments' | 'activity')}
        items={[
          { value: 'overview', label: t('admin_user_detail_overview') },
          { value: 'payments', label: t('admin_user_detail_payments') },
          { value: 'activity', label: t('admin_user_detail_activity') },
        ]}
      />

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Current subscription */}
            <Card className="p-5">
              <h3 className="mb-2 text-sm font-bold text-[hsl(var(--foreground))]">
                {t('admin_user_detail_current_subscription')}
              </h3>
              {sub ? (
                <>
                  <KVRow
                    label={t('admin_status')}
                    value={
                      sub.is_active ? (
                        <Badge variant="success" dot>{t('admin_user_detail_subscription_active')}</Badge>
                      ) : (
                        <Badge variant="secondary">{t('admin_off')}</Badge>
                      )
                    }
                  />
                  <KVRow label={t('admin_user_detail_plan')} value={planLabel} />
                  <KVRow label={t('admin_user_detail_start')} value={formatDay(sub.start_date)} />
                  <KVRow label={t('admin_user_detail_subscription_end')} value={formatDay(sub.end_date)} />
                  <KVRow
                    label={t('admin_user_detail_auto_renew')}
                    value={
                      sub.auto_renew_enabled ? (
                        <Badge variant="success">{t('admin_on')}</Badge>
                      ) : (
                        <Badge variant="secondary">{t('admin_off')}</Badge>
                      )
                    }
                  />
                  <KVRow label={t('admin_provider')} value={sub.provider || '—'} />
                  <KVRow
                    label={t('admin_user_detail_traffic')}
                    value={`${formatBytes(sub.traffic_used_bytes)} / ${
                      sub.traffic_limit_bytes ? formatBytes(sub.traffic_limit_bytes) : '∞'
                    }`}
                  />
                </>
              ) : (
                <p className="py-4 text-sm text-[hsl(var(--muted-foreground))]">
                  {t('admin_user_detail_subscription_inactive')}
                </p>
              )}
            </Card>

            {/* Devices */}
            <Card className="p-5">
              <h3 className="mb-2 text-sm font-bold text-[hsl(var(--foreground))]">
                {t('admin_user_detail_devices')}
              </h3>
              {!user.panel_user_uuid ? (
                <p className="py-4 text-sm text-[hsl(var(--muted-foreground))]">
                  {t('admin_user_detail_devices_empty')}
                </p>
              ) : devicesQuery.isLoading ? (
                <div className="space-y-2 py-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-9 animate-pulse rounded-lg bg-[hsl(var(--muted))]" />
                  ))}
                </div>
              ) : devicesQuery.isError ? (
                <p className="py-4 text-sm text-[var(--danger)]">{t('admin_user_detail_devices_error')}</p>
              ) : !devicesQuery.data || devicesQuery.data.devices.length === 0 ? (
                <p className="py-4 text-sm text-[hsl(var(--muted-foreground))]">
                  {t('admin_user_detail_devices_empty')}
                </p>
              ) : (
                devicesQuery.data.devices.map((device) => {
                  const Icon = platformIcon(device.platform, device.model)
                  const online = isOnline(device.updated_at)
                  return (
                    <div
                      key={device.hwid}
                      className="flex items-center justify-between gap-3 py-2.5 border-b border-[hsl(var(--border))] last:border-0"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Icon size={16} className="shrink-0 text-[hsl(var(--muted-foreground))]" />
                        <span className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
                          {deviceLabel(device)}
                        </span>
                      </span>
                      <Badge variant={online ? 'success' : 'secondary'} dot className="shrink-0">
                        {online ? t('admin_user_detail_online') : t('admin_user_detail_offline')}
                      </Badge>
                    </div>
                  )
                })
              )}
            </Card>
          </div>

          {/* Account info */}
          <Card className="p-5">
            <h3 className="mb-2 text-sm font-bold text-[hsl(var(--foreground))]">
              {t('admin_user_detail_account')}
            </h3>
            <div className="grid gap-x-8 sm:grid-cols-2">
              <KVRow
                label={t('admin_user_detail_first_name')}
                value={[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}
              />
              <KVRow label={t('admin_user_detail_username')} value={user.username ? `@${user.username}` : '—'} />
              <KVRow label={t('admin_users_email')} value={user.email || '—'} />
              <KVRow label={t('admin_user_detail_language')} value={user.language_code || '—'} />
              <KVRow
                label="Referral code"
                value={user.referral_code ? <span className="font-mono">{user.referral_code}</span> : '—'}
              />
              <KVRow label={t('admin_users_registered')} value={formatDate(user.registration_date)} />
              <KVRow
                label={t('admin_user_detail_panel_uuid')}
                value={
                  user.panel_user_uuid ? (
                    <span className="flex items-center justify-end gap-1 font-mono text-xs">
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
            </div>
          </Card>

          {/* Raw panel data */}
          {user.panel_data && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--foreground))]">
                <ExternalLink size={14} />
                {t('admin_user_detail_panel')}
              </h3>
              <div className="rounded-xl bg-[hsl(var(--muted))] p-4">
                <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-[hsl(var(--foreground))]">
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

      {/* Tab: Activity */}
      {activeTab === 'activity' && (
        <Card className="p-5">
          {activityQuery.isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-[hsl(var(--muted))]" />
              ))}
            </div>
          ) : activityQuery.isError ? (
            <p className="py-4 text-sm text-[var(--danger)]">{t('admin_error')}</p>
          ) : !activityQuery.data || activityQuery.data.items.length === 0 ? (
            <p className="py-4 text-sm text-[hsl(var(--muted-foreground))]">
              {t('admin_user_detail_activity_empty')}
            </p>
          ) : (
            <ul className="space-y-1">
              {activityQuery.data.items.map((item) => {
                const Icon = ACTIVITY_ICON[item.type] ?? Sparkles
                return (
                  <li key={item.id} className="flex items-start gap-3 py-2">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[hsl(var(--primary))]">
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{activityText(item)}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {formatActivityTime(item.timestamp)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
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
