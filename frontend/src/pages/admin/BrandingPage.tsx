import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Save } from 'lucide-react'
import { getAdminBranding, patchBranding, uploadLogo } from '@/api/admin/branding'
import { useToastContext } from '@/lib/toast-context'
import { resolveLogoUrl } from '@/hooks/useBranding'

interface ColorFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
}

function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border border-[hsl(var(--border))] cursor-pointer p-0.5 bg-transparent"
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          maxLength={7}
          className="flex-1 px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm font-mono"
          placeholder="#000000"
        />
      </div>
    </div>
  )
}

export function BrandingPage() {
  const qc = useQueryClient()
  const { toast: showToast } = useToastContext()

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'branding'],
    queryFn: getAdminBranding,
  })

  const [form, setForm] = useState({
    brand_name: '',
    primary_color: '',
    secondary_color: '',
    background_color: '',
    font_family: '',
    custom_css: '',
  })
  const [initialized, setInitialized] = useState(false)

  if (data && !initialized) {
    setForm({
      brand_name: data.brand_name,
      primary_color: data.primary_color,
      secondary_color: data.secondary_color,
      background_color: data.background_color,
      font_family: data.font_family,
      custom_css: data.custom_css ?? '',
    })
    setInitialized(true)
  }

  const saveMutation = useMutation({
    mutationFn: patchBranding,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'branding'] })
      qc.invalidateQueries({ queryKey: ['public', 'branding'] })
      showToast('Настройки бренда сохранены', 'success')
    },
    onError: () => showToast('Ошибка сохранения', 'error'),
  })

  const logoMutation = useMutation({
    mutationFn: uploadLogo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'branding'] })
      qc.invalidateQueries({ queryKey: ['public', 'branding'] })
      showToast('Логотип загружен', 'success')
    },
    onError: (err: Error) => showToast(err.message || 'Ошибка загрузки', 'error'),
  })

  const fileRef = useRef<HTMLInputElement>(null)

  const handleSave = () => {
    saveMutation.mutate({
      brand_name: form.brand_name || undefined,
      primary_color: form.primary_color || undefined,
      secondary_color: form.secondary_color || undefined,
      background_color: form.background_color || undefined,
      font_family: form.font_family || undefined,
      custom_css: form.custom_css || undefined,
    })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) logoMutation.mutate(file)
  }

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-[hsl(var(--muted))] rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Кастомизация бренда</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          Название, цвета и логотип сайта
        </p>
      </div>

      {/* Logo */}
      <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Логотип</h2>
        <div className="flex items-center gap-4">
          {resolveLogoUrl(data?.logo_url) ? (
            <img
              src={resolveLogoUrl(data?.logo_url)!}
              alt="Logo"
              className="w-16 h-16 object-contain rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg border-2 border-dashed border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))]">
              <Upload size={20} />
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={logoMutation.isPending}
              className="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {logoMutation.isPending ? 'Загрузка…' : 'Загрузить логотип'}
            </button>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">PNG, JPG, SVG, WebP — до 2 МБ</p>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Brand name */}
      <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Основные настройки</h2>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[hsl(var(--foreground))]">Название бренда</label>
          <input
            type="text"
            value={form.brand_name}
            onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
            placeholder="Raccoonito"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[hsl(var(--foreground))]">Шрифт</label>
          <input
            type="text"
            value={form.font_family}
            onChange={e => setForm(f => ({ ...f, font_family: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
            placeholder="Nunito"
          />
        </div>
      </div>

      {/* Colors */}
      <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Цвета</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorField
            label="Основной цвет"
            value={form.primary_color}
            onChange={v => setForm(f => ({ ...f, primary_color: v }))}
          />
          <ColorField
            label="Вторичный цвет"
            value={form.secondary_color}
            onChange={v => setForm(f => ({ ...f, secondary_color: v }))}
          />
          <ColorField
            label="Цвет фона"
            value={form.background_color}
            onChange={v => setForm(f => ({ ...f, background_color: v }))}
          />
        </div>
      </div>

      {/* Custom CSS */}
      <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Дополнительный CSS</h2>
        <textarea
          value={form.custom_css}
          onChange={e => setForm(f => ({ ...f, custom_css: e.target.value }))}
          rows={6}
          className="w-full px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm font-mono resize-y"
          placeholder="/* Ваш CSS */"
        />
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saveMutation.isPending}
        className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[hsl(var(--primary))] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        <Save size={16} />
        {saveMutation.isPending ? 'Сохранение…' : 'Сохранить'}
      </button>
    </div>
  )
}
