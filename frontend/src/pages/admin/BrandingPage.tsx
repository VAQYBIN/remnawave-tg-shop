import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Save } from 'lucide-react'
import { getAdminBranding, patchBranding, uploadLogo, uploadFavicon } from '@/api/admin/branding'
import { useToastContext } from '@/lib/toast-context'
import { resolveLogoUrl } from '@/hooks/useBranding'
import { useTranslation } from 'react-i18next'
import { ColorPickerField } from '@/components/admin/ColorPickerField'
import { BrandingPreview } from '@/components/admin/BrandingPreview'
import { BrandingPresets, type ColorPreset } from '@/components/admin/BrandingPresets'
import { FontSelect } from '@/components/admin/FontSelect'

const COLOR_DEFAULTS = {
  primary_color: '#2AACDF',
  secondary_color: '#897569',
  background_color: '#F5F1ED',
  foreground_color: '#2B2B2B',
  card_color: '#FFFFFF',
  border_color: '#DDD8D3',
}

export function BrandingPage() {
  const qc = useQueryClient()
  const { toast: showToast } = useToastContext()
  const { t } = useTranslation()

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'branding'],
    queryFn: getAdminBranding,
  })

  const [form, setForm] = useState({
    brand_name: '',
    primary_color: '',
    secondary_color: '',
    background_color: '',
    foreground_color: '',
    card_color: '',
    border_color: '',
    font_family: '',
    custom_css: '',
    privacy_policy_url: '',
    terms_of_service_url: '',
    personal_data_url: '',
    refund_policy_url: '',
  })
  const [initialized, setInitialized] = useState(false)

  if (data && !initialized) {
    setForm({
      brand_name: data.brand_name,
      primary_color: data.primary_color,
      secondary_color: data.secondary_color,
      background_color: data.background_color,
      foreground_color: data.foreground_color,
      card_color: data.card_color,
      border_color: data.border_color,
      font_family: data.font_family,
      custom_css: data.custom_css ?? '',
      privacy_policy_url: data.privacy_policy_url ?? '',
      terms_of_service_url: data.terms_of_service_url ?? '',
      personal_data_url: data.personal_data_url ?? '',
      refund_policy_url: data.refund_policy_url ?? '',
    })
    setInitialized(true)
  }

  const saveMutation = useMutation({
    mutationFn: patchBranding,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'branding'] })
      qc.invalidateQueries({ queryKey: ['public', 'branding'] })
      showToast(t('admin_branding_saved'), 'success')
    },
    onError: () => showToast(t('admin_branding_save_error'), 'error'),
  })

  const logoMutation = useMutation({
    mutationFn: uploadLogo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'branding'] })
      qc.invalidateQueries({ queryKey: ['public', 'branding'] })
      showToast(t('admin_branding_logo_uploaded'), 'success')
    },
    onError: (err: Error) => showToast(err.message || t('admin_branding_logo_error'), 'error'),
  })

  const fileRef = useRef<HTMLInputElement>(null)
  const faviconRef = useRef<HTMLInputElement>(null)

  const faviconMutation = useMutation({
    mutationFn: uploadFavicon,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'branding'] })
      qc.invalidateQueries({ queryKey: ['public', 'branding'] })
      showToast(t('admin_branding_favicon_uploaded'), 'success')
    },
    onError: (err: Error) => showToast(err.message || t('admin_branding_favicon_error'), 'error'),
  })

  const handleApplyPreset = (preset: ColorPreset) => {
    setForm(f => ({
      ...f,
      primary_color: preset.primary_color,
      secondary_color: preset.secondary_color,
      background_color: preset.background_color,
      foreground_color: preset.foreground_color,
      card_color: preset.card_color,
      border_color: preset.border_color,
    }))
  }

  const handleSave = () => {
    saveMutation.mutate({
      brand_name: form.brand_name || undefined,
      primary_color: form.primary_color || undefined,
      secondary_color: form.secondary_color || undefined,
      background_color: form.background_color || undefined,
      foreground_color: form.foreground_color || undefined,
      card_color: form.card_color || undefined,
      border_color: form.border_color || undefined,
      font_family: form.font_family || undefined,
      custom_css: form.custom_css || undefined,
      privacy_policy_url: form.privacy_policy_url || undefined,
      terms_of_service_url: form.terms_of_service_url || undefined,
      personal_data_url: form.personal_data_url || undefined,
      refund_policy_url: form.refund_policy_url || undefined,
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
    <div className="p-6 xl:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('admin_branding_title')}</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{t('admin_branding_subtitle')}</p>
      </div>

      {/* 2-column layout: form left, sticky preview right */}
      <div className="flex gap-8 items-start">
        {/* ── Left: form ── */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* Logo */}
          <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('admin_branding_logo')}</h2>
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
                  {logoMutation.isPending ? t('admin_branding_uploading') : t('admin_branding_upload_logo')}
                </button>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{t('admin_branding_logo_hint')}</p>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

            {/* Favicon */}
            <div className="border-t border-[hsl(var(--border))] pt-4 flex items-center gap-4">
              {resolveLogoUrl(data?.favicon_url) ? (
                <img
                  src={resolveLogoUrl(data?.favicon_url)!}
                  alt="Favicon"
                  className="w-8 h-8 object-contain rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
                />
              ) : (
                <div className="w-8 h-8 rounded border border-dashed border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))] text-[10px]">
                  ico
                </div>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => faviconRef.current?.click()}
                  disabled={faviconMutation.isPending}
                  className="px-3 py-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm font-medium hover:bg-[hsl(var(--muted))] transition-colors disabled:opacity-50"
                >
                  {faviconMutation.isPending ? t('admin_branding_uploading') : t('admin_branding_upload_favicon')}
                </button>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{t('admin_branding_favicon_hint')}</p>
              </div>
            </div>
            <input
              ref={faviconRef}
              type="file"
              accept="image/png,image/x-icon,image/svg+xml,image/jpeg"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) faviconMutation.mutate(f) }}
            />
          </div>

          {/* Brand name + font */}
          <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('admin_branding_main_settings')}</h2>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[hsl(var(--foreground))]">{t('admin_branding_brand_name')}</label>
              <input
                type="text"
                value={form.brand_name}
                onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))}
                className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
                placeholder="My VPN Shop"
              />
            </div>
            <FontSelect
              label={t('admin_branding_font')}
              description={t('admin_branding_font_desc')}
              value={form.font_family}
              onChange={v => setForm(f => ({ ...f, font_family: v }))}
            />
          </div>

          {/* Presets */}
          <BrandingPresets onApply={handleApplyPreset} currentPrimary={form.primary_color} />

          {/* Colors */}
          <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('admin_branding_colors')}</h2>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{t('admin_branding_colors_hint')}</p>
            </div>
            <div className="grid grid-cols-1 gap-5">
              <ColorPickerField
                label={t('admin_branding_primary_color')}
                description={t('admin_branding_primary_color_desc')}
                value={form.primary_color}
                onChange={v => setForm(f => ({ ...f, primary_color: v }))}
                defaultValue={COLOR_DEFAULTS.primary_color}
                checkContrastWith="#FFFFFF"
              />
              <ColorPickerField
                label={t('admin_branding_secondary_color')}
                description={t('admin_branding_secondary_color_desc')}
                value={form.secondary_color}
                onChange={v => setForm(f => ({ ...f, secondary_color: v }))}
                defaultValue={COLOR_DEFAULTS.secondary_color}
              />
              <ColorPickerField
                label={t('admin_branding_background_color')}
                description={t('admin_branding_background_color_desc')}
                value={form.background_color}
                onChange={v => setForm(f => ({ ...f, background_color: v }))}
                defaultValue={COLOR_DEFAULTS.background_color}
              />
              <ColorPickerField
                label={t('admin_branding_foreground_color')}
                description={t('admin_branding_foreground_color_desc')}
                value={form.foreground_color}
                onChange={v => setForm(f => ({ ...f, foreground_color: v }))}
                defaultValue={COLOR_DEFAULTS.foreground_color}
              />
              <ColorPickerField
                label={t('admin_branding_card_color')}
                description={t('admin_branding_card_color_desc')}
                value={form.card_color}
                onChange={v => setForm(f => ({ ...f, card_color: v }))}
                defaultValue={COLOR_DEFAULTS.card_color}
              />
              <ColorPickerField
                label={t('admin_branding_border_color')}
                description={t('admin_branding_border_color_desc')}
                value={form.border_color}
                onChange={v => setForm(f => ({ ...f, border_color: v }))}
                defaultValue={COLOR_DEFAULTS.border_color}
              />
            </div>
          </div>

          {/* Custom CSS */}
          <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('admin_branding_custom_css')}</h2>
            <textarea
              value={form.custom_css}
              onChange={e => setForm(f => ({ ...f, custom_css: e.target.value }))}
              rows={6}
              className="w-full px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm font-mono resize-y"
              placeholder={t('admin_branding_custom_css_placeholder')}
            />
          </div>

          {/* Legal documents */}
          <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('admin_branding_legal_title')}</h2>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{t('admin_branding_legal_hint')}</p>
            </div>
            {(
              [
                ['privacy_policy_url', 'admin_branding_legal_privacy'] as const,
                ['terms_of_service_url', 'admin_branding_legal_terms'] as const,
                ['personal_data_url', 'admin_branding_legal_personal_data'] as const,
                ['refund_policy_url', 'admin_branding_legal_refund'] as const,
              ] as const
            ).map(([field, labelKey]) => (
              <div key={field} className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[hsl(var(--foreground))]">{t(labelKey)}</label>
                <input
                  type="url"
                  value={form[field]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
                  placeholder="https://telegra.ph/..."
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[hsl(var(--primary))] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Save size={16} />
            {saveMutation.isPending ? t('admin_saving') : t('admin_save')}
          </button>
        </div>

        {/* ── Right: sticky preview ── */}
        <div className="hidden xl:flex flex-col w-80 flex-shrink-0 sticky top-6 self-start">
          <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-3">
            {t('admin_branding_preview')}
          </p>
          <BrandingPreview
            brandName={form.brand_name}
            primaryColor={form.primary_color || COLOR_DEFAULTS.primary_color}
            secondaryColor={form.secondary_color || COLOR_DEFAULTS.secondary_color}
            backgroundColor={form.background_color || COLOR_DEFAULTS.background_color}
            foregroundColor={form.foreground_color || COLOR_DEFAULTS.foreground_color}
            cardColor={form.card_color || COLOR_DEFAULTS.card_color}
            borderColor={form.border_color || COLOR_DEFAULTS.border_color}
            fontFamily={form.font_family}
          />
        </div>
      </div>
    </div>
  )
}
