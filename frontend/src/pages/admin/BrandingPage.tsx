import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Save, Trash2 } from 'lucide-react'
import { getAdminBranding, patchBranding, uploadLogo, uploadFavicon, deleteLogo, deleteFavicon } from '@/api/admin/branding'
import { useToastContext } from '@/lib/toast-context'
import { resolveLogoUrl } from '@/hooks/useBranding'
import { useTranslation } from 'react-i18next'
import { BrandingPreview } from '@/components/admin/BrandingPreview'
import { BrandingPresets, type ColorPreset } from '@/components/admin/BrandingPresets'
import { FontSelect } from '@/components/admin/FontSelect'
import { ThemeEditor } from '@/components/admin/ThemeEditor'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { defaultTheme, normaliseTheme, type Theme, type ColorScheme } from '@/lib/theme'

type PaletteName = 'light' | 'dark'

const SCHEME_OPTIONS: { value: ColorScheme; labelKey: string }[] = [
  { value: 'light', labelKey: 'theme_light' },
  { value: 'dark', labelKey: 'theme_dark' },
  { value: 'system', labelKey: 'theme_system' },
]

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
    theme: defaultTheme() as Theme,
    font_family: '',
    heading_font_family: '',
    default_color_scheme: 'light' as ColorScheme,
    custom_css: '',
    privacy_policy_url: '',
    terms_of_service_url: '',
    personal_data_url: '',
    refund_policy_url: '',
  })
  const [initialized, setInitialized] = useState(false)
  const [editingPalette, setEditingPalette] = useState<PaletteName>('light')

  if (data && !initialized) {
    setForm({
      brand_name: data.brand_name,
      theme: normaliseTheme(data.theme),
      font_family: data.font_family,
      heading_font_family: data.heading_font_family ?? '',
      default_color_scheme: (data.default_color_scheme as ColorScheme) || 'light',
      custom_css: data.custom_css ?? '',
      privacy_policy_url: data.privacy_policy_url ?? '',
      terms_of_service_url: data.terms_of_service_url ?? '',
      personal_data_url: data.personal_data_url ?? '',
      refund_policy_url: data.refund_policy_url ?? '',
    })
    setInitialized(true)
  }

  const setTheme = (theme: Theme) => setForm(f => ({ ...f, theme }))
  const palette = form.theme[editingPalette]

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

  const deleteLogoMutation = useMutation({
    mutationFn: deleteLogo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'branding'] })
      qc.invalidateQueries({ queryKey: ['public', 'branding'] })
      showToast(t('admin_branding_logo_removed'), 'success')
    },
    onError: (err: Error) => showToast(err.message || t('admin_branding_logo_error'), 'error'),
  })

  const deleteFaviconMutation = useMutation({
    mutationFn: deleteFavicon,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'branding'] })
      qc.invalidateQueries({ queryKey: ['public', 'branding'] })
      showToast(t('admin_branding_favicon_removed'), 'success')
    },
    onError: (err: Error) => showToast(err.message || t('admin_branding_favicon_error'), 'error'),
  })

  const handleApplyPreset = (preset: ColorPreset) => {
    setForm(f => ({
      ...f,
      theme: {
        ...f.theme,
        light: {
          ...f.theme.light,
          primary: preset.primary_color,
          secondary: preset.secondary_color,
          background: preset.background_color,
          foreground: preset.foreground_color,
          card: preset.card_color,
          card_foreground: preset.foreground_color,
          border: preset.border_color,
        },
      },
    }))
  }

  const handleSave = () => {
    saveMutation.mutate({
      brand_name: form.brand_name || undefined,
      theme: form.theme,
      font_family: form.font_family || undefined,
      heading_font_family: form.heading_font_family || undefined,
      default_color_scheme: form.default_color_scheme,
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
      <div className="px-4 py-6 sm:p-8 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-[hsl(var(--muted))] rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:p-8">
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
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-bold text-[hsl(var(--foreground))]">{t('admin_branding_logo')}</h2>
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
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    isLoading={logoMutation.isPending}
                  >
                    {logoMutation.isPending ? t('admin_branding_uploading') : t('admin_branding_upload_logo')}
                  </Button>
                  {resolveLogoUrl(data?.logo_url) && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => deleteLogoMutation.mutate()}
                      isLoading={deleteLogoMutation.isPending}
                    >
                      <Trash2 size={16} />
                      {t('admin_branding_remove')}
                    </Button>
                  )}
                </div>
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
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => faviconRef.current?.click()}
                    isLoading={faviconMutation.isPending}
                  >
                    {faviconMutation.isPending ? t('admin_branding_uploading') : t('admin_branding_upload_favicon')}
                  </Button>
                  {resolveLogoUrl(data?.favicon_url) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => deleteFaviconMutation.mutate()}
                      isLoading={deleteFaviconMutation.isPending}
                    >
                      <Trash2 size={14} />
                      {t('admin_branding_remove')}
                    </Button>
                  )}
                </div>
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
          </Card>

          {/* Brand name + fonts + default scheme */}
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-bold text-[hsl(var(--foreground))]">{t('admin_branding_main_settings')}</h2>
            <Input
              label={t('admin_branding_brand_name')}
              value={form.brand_name}
              onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))}
              placeholder="My VPN Shop"
            />
            <FontSelect
              label={t('admin_branding_font_body')}
              description={t('admin_branding_font_body_desc')}
              value={form.font_family}
              onChange={v => setForm(f => ({ ...f, font_family: v }))}
            />
            <FontSelect
              label={t('admin_branding_font_heading')}
              description={t('admin_branding_font_heading_desc')}
              value={form.heading_font_family}
              placeholder={form.font_family}
              onChange={v => setForm(f => ({ ...f, heading_font_family: v }))}
            />
            <div>
              <span className="text-sm font-medium text-[hsl(var(--foreground))]">{t('admin_branding_default_scheme')}</span>
              <p className="mb-2 mt-0.5 text-xs leading-snug text-[hsl(var(--muted-foreground))]">
                {t('admin_branding_default_scheme_desc')}
              </p>
              <div className="inline-flex rounded-lg bg-[hsl(var(--muted))] p-0.5">
                {SCHEME_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, default_color_scheme: opt.value }))}
                    className={[
                      'rounded-md px-3 py-1.5 text-sm font-semibold transition-colors',
                      form.default_color_scheme === opt.value
                        ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-[var(--shadow-xs)]'
                        : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
                    ].join(' ')}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Presets */}
          <BrandingPresets onApply={handleApplyPreset} currentPrimary={form.theme.light.primary} />

          {/* Colors — full token editor (light + dark) */}
          <Card className="p-5 space-y-5">
            <div>
              <h2 className="text-sm font-bold text-[hsl(var(--foreground))]">{t('admin_branding_colors')}</h2>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{t('admin_branding_colors_hint')}</p>
            </div>
            <ThemeEditor
              theme={form.theme}
              onChange={setTheme}
              editing={editingPalette}
              onEditingChange={setEditingPalette}
            />
          </Card>

          {/* Custom CSS */}
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-bold text-[hsl(var(--foreground))]">{t('admin_branding_custom_css')}</h2>
            <textarea
              value={form.custom_css}
              onChange={e => setForm(f => ({ ...f, custom_css: e.target.value }))}
              rows={6}
              className="w-full px-3 py-2 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-white text-sm font-mono text-[hsl(var(--foreground))] resize-y transition-[border-color,box-shadow] duration-150 focus:border-[hsl(var(--primary))] focus:outline-none focus:[box-shadow:var(--ring-primary)]"
              placeholder={t('admin_branding_custom_css_placeholder')}
            />
          </Card>

          {/* Legal documents */}
          <Card className="p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[hsl(var(--foreground))]">{t('admin_branding_legal_title')}</h2>
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
              <Input
                key={field}
                type="url"
                label={t(labelKey)}
                value={form[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                placeholder="https://telegra.ph/..."
              />
            ))}
          </Card>

          <Button
            type="button"
            size="lg"
            onClick={handleSave}
            isLoading={saveMutation.isPending}
          >
            <Save size={16} />
            {saveMutation.isPending ? t('admin_saving') : t('admin_save')}
          </Button>
        </div>

        {/* ── Right: sticky preview ── */}
        <div className="hidden xl:flex flex-col w-80 flex-shrink-0 sticky top-6 self-start">
          <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-[0.08em] mb-3">
            {t('admin_branding_preview')}
          </p>
          <BrandingPreview
            brandName={form.brand_name}
            primaryColor={palette.primary}
            secondaryColor={palette.secondary}
            backgroundColor={palette.background}
            foregroundColor={palette.foreground}
            cardColor={palette.card}
            borderColor={palette.border}
            fontFamily={form.font_family}
          />
        </div>
      </div>
    </div>
  )
}
