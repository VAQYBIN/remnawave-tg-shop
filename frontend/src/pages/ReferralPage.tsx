import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getReferral, type ReferralFriend } from '@/api/referral'
import { useToast } from '@/hooks/useToast'
import { Gift, Users, Award, Copy, Check, Send } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  unit,
  icon: Icon,
  accent,
}: {
  label: string
  value: string
  unit: string
  icon: LucideIcon
  accent?: boolean
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            {label}
          </span>
          <Icon size={22} className="shrink-0 text-[hsl(var(--primary)/0.55)]" />
        </div>
        <p
          className={`mt-2 text-3xl font-extrabold ${
            accent ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))]'
          }`}
        >
          {value}
        </p>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{unit}</p>
      </CardContent>
    </Card>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initialsFrom(name: string): string {
  const cleaned = name.replace(/^@/, '').replace(/[^a-zA-Zа-яА-Я0-9 ]/g, ' ').trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return '••'
}

function formatDate(iso: string | null, lang: string): string {
  if (!iso) return '—'
  const d = new Date(/[Z+]/.test(iso) ? iso : iso + 'Z')
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

// ─── Friend row ───────────────────────────────────────────────────────────────

function FriendRow({ friend }: { friend: ReferralFriend }) {
  const { t, i18n } = useTranslation()
  const displayName = friend.name || t('referral_friend_fallback')
  const activated = friend.status === 'activated'

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-[hsl(var(--border))] px-1 py-3.5 sm:grid-cols-[2fr_1fr_1.2fr_1fr] sm:gap-4">
      {/* Friend identity */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary-press)]">
          {initialsFrom(displayName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[hsl(var(--foreground))]">{displayName}</p>
          {friend.handle && (
            <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{friend.handle}</p>
          )}
        </div>
      </div>

      {/* Date (hidden on mobile, shown in status cell area) */}
      <div className="hidden text-sm text-[hsl(var(--muted-foreground))] sm:block">
        {formatDate(friend.registered_at, i18n.language)}
      </div>

      {/* Status */}
      <div className="hidden sm:block">
        <Badge dot variant={activated ? 'success' : 'info'}>
          {activated ? t('referral_status_activated') : t('referral_status_registered')}
        </Badge>
      </div>

      {/* Bonus + mobile-stacked status */}
      <div className="flex flex-col items-end gap-1 sm:items-start sm:justify-self-start">
        <span className="sm:hidden">
          <Badge dot variant={activated ? 'success' : 'info'}>
            {activated ? t('referral_status_activated') : t('referral_status_registered')}
          </Badge>
        </span>
        {activated && friend.bonus_days > 0 ? (
          <span className="text-sm font-bold text-[var(--success)]">
            {t('referral_bonus_days_value', { count: friend.bonus_days })}
          </span>
        ) : (
          <span className="text-sm text-[hsl(var(--muted-foreground))]">—</span>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ReferralPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['referral'],
    queryFn: getReferral,
  })

  const handleCopy = async () => {
    if (!data?.referral_link) return
    await navigator.clipboard.writeText(data.referral_link)
    setCopied(true)
    toast.success(t('copied'))
    setTimeout(() => setCopied(false), 2000)
  }

  const handleTelegramShare = () => {
    if (!data?.referral_link) return
    const url = encodeURIComponent(data.referral_link)
    const text = encodeURIComponent(t('referral_share_text'))
    window.open(`https://t.me/share/url?url=${url}&text=${text}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t('referral_title')}</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{t('referral_subtitle')}</p>
        </div>

        {isLoading && (
          <div className="space-y-4">
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl bg-[hsl(var(--muted))]" />
              ))}
            </div>
            <div className="h-32 animate-pulse rounded-xl bg-[hsl(var(--muted))]" />
          </div>
        )}

        {data && (
          <>
            {/* Stats */}
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              <StatCard
                label={t('referral_stat_bonus_days')}
                value={`+${data.total_bonus_days}`}
                unit={t('referral_stat_bonus_days_unit')}
                icon={Gift}
                accent
              />
              <StatCard
                label={t('referral_stat_invited')}
                value={String(data.invited_count)}
                unit={t('referral_stat_invited_unit')}
                icon={Users}
              />
              <StatCard
                label={t('referral_stat_activated')}
                value={String(data.purchased_count)}
                unit={t('referral_stat_activated_unit')}
                icon={Award}
              />
            </div>

            {/* Referral link */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('referral_your_link')}</CardTitle>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">{t('referral_link_desc')}</p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <code className="min-w-0 flex-1 truncate rounded-[var(--radius)] bg-[hsl(var(--muted))] px-3 py-2.5 font-mono text-sm text-[hsl(var(--foreground))]">
                    {data.referral_link}
                  </code>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button variant="outline" onClick={handleCopy}>
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                      {t('referral_copy_link')}
                    </Button>
                    {data.telegram_link && (
                      <Button onClick={handleTelegramShare}>
                        <Send size={16} />
                        {t('referral_send_telegram')}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Invitations */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('referral_invitations_title')}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.friends.length === 0 ? (
                  <div className="py-8 text-center">
                    <Users size={36} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">{t('referral_empty')}</p>
                  </div>
                ) : (
                  <div>
                    {/* Column headers (desktop) */}
                    <div className="hidden grid-cols-[2fr_1fr_1.2fr_1fr] gap-4 px-1 pb-1 text-xs font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))] sm:grid">
                      <span>{t('referral_col_friend')}</span>
                      <span>{t('referral_col_when')}</span>
                      <span>{t('referral_col_status')}</span>
                      <span>{t('referral_col_bonus')}</span>
                    </div>
                    {data.friends.map((friend, i) => (
                      <FriendRow key={i} friend={friend} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  )
}
