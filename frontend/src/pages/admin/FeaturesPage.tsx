import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Newspaper, Users, Monitor } from 'lucide-react'
import { getAdminFeatures, patchFeatures } from '@/api/admin/branding'
import { useToastContext } from '@/lib/toast-context'

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
    <div className="flex items-center justify-between py-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[hsl(var(--primary)/0.1)] flex items-center justify-center">
          <Icon size={18} className="text-[hsl(var(--primary))]" />
        </div>
        <div>
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          checked ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          ].join(' ')}
        />
      </button>
    </div>
  )
}

export function FeaturesPage() {
  const qc = useQueryClient()
  const { toast: showToast } = useToastContext()

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'features'],
    queryFn: getAdminFeatures,
  })

  const mutation = useMutation({
    mutationFn: patchFeatures,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'features'] })
      qc.invalidateQueries({ queryKey: ['public', 'branding'] })
      showToast('Настройки разделов сохранены', 'success')
    },
    onError: () => showToast('Ошибка сохранения', 'error'),
  })

  const [local, setLocal] = useState<{ news_enabled?: boolean; referral_enabled?: boolean; devices_enabled?: boolean }>({})

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
      <div className="p-8 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-[hsl(var(--muted))] rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Разделы сайта</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          Включение и отключение разделов для всех пользователей
        </p>
      </div>

      <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] px-5 divide-y divide-[hsl(var(--border))]">
        <ToggleRow
          icon={Newspaper}
          label="Новости"
          description="Лента новостей из Telegram-канала"
          checked={get('news_enabled')}
          onChange={toggle('news_enabled')}
          disabled={mutation.isPending}
        />
        <ToggleRow
          icon={Users}
          label="Рефералы"
          description="Реферальная программа"
          checked={get('referral_enabled')}
          onChange={toggle('referral_enabled')}
          disabled={mutation.isPending}
        />
        <ToggleRow
          icon={Monitor}
          label="Устройства"
          description="Управление подключёнными устройствами"
          checked={get('devices_enabled')}
          onChange={toggle('devices_enabled')}
          disabled={mutation.isPending}
        />
      </div>

      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Изменения применяются немедленно — раздел исчезает из навигации для всех пользователей.
      </p>
    </div>
  )
}
