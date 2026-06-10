import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Newspaper, Users, Monitor, LifeBuoy } from 'lucide-react'
import { getAdminFeatures, patchFeatures } from '@/api/admin/branding'
import { useToastContext } from '@/lib/toast-context'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

interface ToggleRowProps {
  icon: React.ElementType
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

function ToggleRow({ icon: Icon, label, description, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[hsl(var(--primary)/0.1)] flex items-center justify-center shrink-0">
          <Icon size={18} className="text-[hsl(var(--primary))]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{label}</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  )
}

export function FeaturesPage() {
  const qc = useQueryClient()
  const { toast: showToast } = useToastContext()
  const { t } = useTranslation()

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'features'],
    queryFn: getAdminFeatures,
  })

  const mutation = useMutation({
    mutationFn: patchFeatures,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'features'] })
      qc.invalidateQueries({ queryKey: ['public', 'branding'] })
      showToast(t('admin_features_saved'), 'success')
    },
    onError: () => showToast(t('admin_branding_save_error'), 'error'),
  })

  const [local, setLocal] = useState<{ news_enabled?: boolean; referral_enabled?: boolean; devices_enabled?: boolean; support_enabled?: boolean }>({})

  const get = (key: keyof typeof local) => {
    if (key in local) return local[key]!
    return data?.[key] ?? true
  }

  const toggle = (key: keyof typeof local) => (value: boolean) => {
    const updated = { ...local, [key]: value }
    setLocal(updated)
    mutation.mutate(updated)
  }

  if (isLoading) {
    return (
      <div className="px-4 py-6 sm:p-8 max-w-2xl space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-[hsl(var(--muted))] rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:p-8 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('admin_features_title')}</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          {t('admin_features_subtitle')}
        </p>
      </div>

      <Card className="px-5 divide-y divide-[hsl(var(--border))]">
        <ToggleRow
          icon={Newspaper}
          label={t('admin_features_news')}
          description={t('admin_features_news_description')}
          checked={get('news_enabled')}
          onChange={toggle('news_enabled')}
          disabled={mutation.isPending}
        />
        <ToggleRow
          icon={Users}
          label={t('admin_features_referrals')}
          description={t('admin_features_referrals_description')}
          checked={get('referral_enabled')}
          onChange={toggle('referral_enabled')}
          disabled={mutation.isPending}
        />
        <ToggleRow
          icon={Monitor}
          label={t('admin_features_devices')}
          description={t('admin_features_devices_description')}
          checked={get('devices_enabled')}
          onChange={toggle('devices_enabled')}
          disabled={mutation.isPending}
        />
        <ToggleRow
          icon={LifeBuoy}
          label={t('admin_features_support')}
          description={t('admin_features_support_description')}
          checked={get('support_enabled')}
          onChange={toggle('support_enabled')}
          disabled={mutation.isPending}
        />
      </Card>

      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        {t('admin_features_hint')}
      </p>
    </div>
  )
}
