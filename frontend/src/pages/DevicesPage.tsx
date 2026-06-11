import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { getDevices, disconnectDevice, type Device } from '@/api/devices'
import { getAppConfig } from '@/api/appConfig'
import { platformKeys } from '@/lib/app-config-utils'
import { AppDownloads } from '@/components/devices/AppDownloads'
import { ConnectionGuide } from '@/components/devices/ConnectionGuide'
import { useToast } from '@/hooks/useToast'
import { Monitor, Smartphone, Tablet, Laptop, Trash2, Wifi, BookOpen } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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

function deviceSubtitle(device: Device): string {
  // Second line shows the raw User-Agent of the connecting client.
  if (device.user_agent) return device.user_agent
  const parts: string[] = []
  if (device.platform) parts.push(device.platform)
  if (device.os_version) parts.push(device.os_version)
  return parts.join(' · ')
}

/** Treat a device active within the last 5 minutes as online. */
function isOnline(updatedAt: string | null): boolean {
  if (!updatedAt) return false
  const ts = new Date(/[Z+]/.test(updatedAt) ? updatedAt : updatedAt + 'Z').getTime()
  if (Number.isNaN(ts)) return false
  return Date.now() - ts < 5 * 60 * 1000
}

// Fallback client list shown when the panel doesn't expose an app config.
const CLIENT_APPS: { name: string; platsRu: string; platsEn: string; icon: LucideIcon }[] = [
  { name: 'v2RayTun', platsRu: 'iOS · Android', platsEn: 'iOS · Android', icon: Smartphone },
  { name: 'Streisand', platsRu: 'iOS', platsEn: 'iOS', icon: Smartphone },
  { name: 'Hiddify', platsRu: 'macOS · Windows · Linux', platsEn: 'macOS · Windows · Linux', icon: Laptop },
  { name: 'OpenWRT', platsRu: 'Роутер', platsEn: 'Router', icon: Wifi },
]

function FallbackClients() {
  const { t, i18n } = useTranslation()
  const isRu = i18n.language.startsWith('ru')
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('devices_clients_title')}</CardTitle>
        <CardDescription>{t('devices_clients_desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          {CLIENT_APPS.map((app) => (
            <div
              key={app.name}
              className="flex items-center gap-2.5 rounded-[10px] border border-[hsl(var(--border))] p-3.5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[hsl(var(--primary))]">
                <app.icon size={18} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-bold text-[hsl(var(--foreground))]">{app.name}</div>
                <div className="truncate text-[11px] text-[hsl(var(--muted-foreground))]">
                  {isRu ? app.platsRu : app.platsEn}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function DevicesPage() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const toast = useToast()
  const [pendingHwid, setPendingHwid] = useState<string | null>(null)
  const [tab, setTab] = useState<'devices' | 'guide'>('devices')

  const { data, isLoading, error } = useQuery({
    queryKey: ['devices'],
    queryFn: getDevices,
  })

  const { data: appConfig } = useQuery({
    queryKey: ['app-config'],
    queryFn: getAppConfig,
    staleTime: 30 * 60 * 1000,
  })

  const hasAppConfig = !!appConfig && platformKeys(appConfig).length > 0

  const mutation = useMutation({
    mutationFn: (hwid: string) => disconnectDevice(hwid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      toast.success(t('devices_disconnected'))
    },
    onError: () => toast.error(t('error_generic')),
  })

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return t('devices_just_now')
    try {
      const date = new Date(/[Z+]/.test(dateStr) ? dateStr : dateStr + 'Z')
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      const minutes = Math.floor(diff / 60000)
      if (minutes < 1) return t('devices_just_now')
      if (minutes < 60) return t('devices_minutes_ago', { count: minutes })
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return t('devices_hours_ago', { count: hours })
      const days = Math.floor(hours / 24)
      if (days < 7) return t('devices_days_ago', { count: days })
      return date.toLocaleDateString()
    } catch {
      return dateStr
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t('devices_title')}</h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              {data ? t('devices_count', { count: data.total }) : t('devices_subtitle')}
            </p>
          </div>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as 'devices' | 'guide')}
          items={[
            { value: 'devices', label: t('devices_tab_devices') },
            { value: 'guide', label: t('devices_tab_guide') },
          ]}
        />

        {tab === 'devices' && (
          <div className="space-y-6">
            {isLoading && (
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-44 animate-pulse rounded-xl bg-[hsl(var(--muted))]" />
                ))}
              </div>
            )}

            {error && (
              <Card>
                <CardContent className="p-8 text-center">
                  <Wifi size={40} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
                  <p className="font-bold">{t('devices_unavailable')}</p>
                  <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{t('devices_need_sub')}</p>
                </CardContent>
              </Card>
            )}

            {data && data.devices.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <Monitor size={40} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
                  <p className="font-bold">{t('devices_empty')}</p>
                  <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{t('devices_first_connect')}</p>
                </CardContent>
              </Card>
            )}

            {data && data.devices.length > 0 && (
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
                {data.devices.map((device) => {
                  const Icon = platformIcon(device.platform, device.model)
                  const online = isOnline(device.updated_at)
                  const subtitle = deviceSubtitle(device)
                  return (
                    <Card key={device.hwid}>
                      <CardContent className="p-5">
                        <div className="flex items-start gap-3.5">
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[hsl(var(--primary))]">
                            <Icon size={22} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[15px] font-extrabold text-[hsl(var(--foreground))]">
                                {deviceLabel(device)}
                              </span>
                              <Badge dot variant={online ? 'success' : 'secondary'} className="shrink-0">
                                {online ? t('devices_online') : t('devices_offline')}
                              </Badge>
                            </div>
                            {subtitle && (
                              <p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">{subtitle}</p>
                            )}
                            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                              <span className="truncate">
                                ID:{' '}
                                <code className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-1.5 py-0.5 font-mono text-[11px]">
                                  {device.hwid.slice(0, 8)}…
                                </code>
                              </span>
                              <span className="shrink-0">{formatDate(device.updated_at)}</span>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPendingHwid(device.hwid)}
                          isLoading={mutation.isPending && mutation.variables === device.hwid}
                          className="mt-4 w-full text-[var(--danger)] hover:border-[var(--danger)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
                        >
                          <Trash2 size={16} />
                          {t('devices_disconnect_btn')}
                        </Button>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}

            {/* Where to get a client: dynamic app list from the panel, or built-in fallback */}
            {hasAppConfig ? <AppDownloads config={appConfig} /> : <FallbackClients />}
          </div>
        )}

        {tab === 'guide' && (
          <div>
            {hasAppConfig ? (
              <ConnectionGuide config={appConfig} />
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <BookOpen size={40} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
                  <p className="font-bold">{t('guide_unavailable')}</p>
                  <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{t('guide_unavailable_hint')}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingHwid !== null}
        title={t('devices_disconnect_confirm')}
        description=""
        confirmLabel={t('devices_disconnect_btn')}
        cancelLabel={t('logout_confirm_cancel')}
        destructive
        onConfirm={() => {
          if (pendingHwid) mutation.mutate(pendingHwid)
          setPendingHwid(null)
        }}
        onCancel={() => setPendingHwid(null)}
      />
    </AppShell>
  )
}
