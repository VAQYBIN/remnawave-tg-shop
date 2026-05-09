import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { getDevices, disconnectDevice, type Device } from '@/api/devices'
import { useToast } from '@/hooks/useToast'
import { Monitor, Smartphone, Tablet, Laptop, Trash2, Wifi } from 'lucide-react'

function DeviceIcon({ platform }: { platform: string | null }) {
  const p = platform?.toLowerCase() ?? ''
  if (p.includes('android') || p.includes('ios') || p.includes('phone')) return <Smartphone size={20} />
  if (p.includes('tablet') || p.includes('ipad')) return <Tablet size={20} />
  if (p.includes('mac') || p.includes('windows') || p.includes('linux')) return <Laptop size={20} />
  return <Monitor size={20} />
}

function deviceLabel(device: Device): string {
  if (device.model) return device.model
  if (device.platform && device.os_version) return `${device.platform} ${device.os_version}`
  if (device.platform) return device.platform
  return 'Device'
}

export function DevicesPage() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const toast = useToast()
  const [pendingHwid, setPendingHwid] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['devices'],
    queryFn: getDevices,
  })

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
      const date = new Date(dateStr)
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
        <div>
          <h1 className="text-2xl font-bold">{t('devices_title')}</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">
            {t('devices_subtitle')}
          </p>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-[hsl(var(--muted))] animate-pulse rounded-xl" />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-[hsl(var(--muted))] p-6 text-center">
            <Wifi size={40} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
            <p className="font-medium">{t('devices_unavailable')}</p>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              {t('devices_need_sub')}
            </p>
          </div>
        )}

        {data && data.devices.length === 0 && (
          <div className="rounded-xl bg-[hsl(var(--muted))] p-6 text-center">
            <Monitor size={40} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
            <p className="font-medium">{t('devices_empty')}</p>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              {t('devices_first_connect')}
            </p>
          </div>
        )}

        {data && data.devices.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {t('devices_count', { count: data.total })}
            </p>
            {data.devices.map((device) => (
              <Card key={device.hwid}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[hsl(var(--muted))] rounded-lg text-[hsl(var(--muted-foreground))]">
                      <DeviceIcon platform={device.platform} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {deviceLabel(device)}
                      </p>
                      {device.os_version && device.model && (
                        <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                          {device.platform} {device.os_version}
                        </p>
                      )}
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {t('devices_last_active', { time: formatDate(device.updated_at) })}
                        {' · '}
                        <span className="font-mono opacity-60">{device.hwid.slice(0, 8)}…</span>
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingHwid(device.hwid)}
                      disabled={mutation.isPending && mutation.variables === device.hwid}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
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
