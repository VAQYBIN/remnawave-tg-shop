import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Check, Lock } from 'lucide-react'
import {
  listBrandThemes,
  createBrandTheme,
  deleteBrandTheme,
  type BrandThemeResponse,
} from '@/api/admin/branding'
import { useToastContext } from '@/lib/toast-context'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Theme } from '@/lib/theme'

interface BrandingPresetsProps {
  theme: Theme
  fontFamily: string
  headingFontFamily: string
  currentPrimary: string
  onApply: (theme: Theme, fontFamily: string, headingFontFamily: string) => void
}

const DOT_TOKENS = ['primary', 'secondary', 'background', 'card', 'foreground']

export function BrandingPresets({
  theme,
  fontFamily,
  headingFontFamily,
  currentPrimary,
  onApply,
}: BrandingPresetsProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToastContext()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<BrandThemeResponse | null>(null)

  const { data: themes, isLoading } = useQuery({
    queryKey: ['admin', 'branding', 'themes'],
    queryFn: listBrandThemes,
  })

  const createMutation = useMutation({
    mutationFn: createBrandTheme,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'branding', 'themes'] })
      toast(t('admin_branding_theme_saved'), 'success')
      setSaving(false)
      setName('')
    },
    onError: (e: Error) => toast(e.message || t('admin_branding_theme_save_error'), 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteBrandTheme,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'branding', 'themes'] })
      toast(t('admin_branding_theme_deleted'), 'success')
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast(e.message || t('admin_branding_theme_delete_error'), 'error'),
  })

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    createMutation.mutate({
      name: trimmed,
      theme,
      font_family: fontFamily || undefined,
      heading_font_family: headingFontFamily || undefined,
    })
  }

  return (
    <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('admin_branding_presets')}</h2>
          <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{t('admin_branding_presets_hint')}</p>
        </div>
        {!saving && (
          <Button type="button" variant="outline" size="sm" onClick={() => setSaving(true)}>
            <Plus size={14} />
            {t('admin_branding_save_as_theme')}
          </Button>
        )}
      </div>

      {saving && (
        <div className="flex items-end gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3">
          <div className="flex-1">
            <Input
              label={t('admin_branding_theme_name')}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('admin_branding_theme_name_placeholder')}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              autoFocus
            />
          </div>
          <Button type="button" size="sm" onClick={handleSave} isLoading={createMutation.isPending} disabled={!name.trim()}>
            {t('admin_save')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => { setSaving(false); setName('') }}>
            {t('admin_branding_cancel')}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-[hsl(var(--muted))]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(themes ?? []).map(preset => {
            const lp = preset.theme.light
            const isActive = lp.primary?.toLowerCase() === currentPrimary.toLowerCase()
            return (
              <div
                key={preset.id}
                className="flex items-center gap-2 rounded-lg border p-2 transition-all hover:shadow-sm"
                style={{
                  borderColor: isActive ? lp.primary : 'hsl(var(--border))',
                  backgroundColor: isActive ? `${lp.primary}12` : 'transparent',
                }}
              >
                <button
                  type="button"
                  onClick={() => onApply(preset.theme, preset.font_family ?? '', preset.heading_font_family ?? '')}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  title={t('admin_branding_apply')}
                >
                  <div className="flex flex-shrink-0 gap-0.5">
                    {DOT_TOKENS.map(tk => (
                      <span
                        key={tk}
                        className="h-3.5 w-3.5 rounded-full border border-black/10"
                        style={{ backgroundColor: lp[tk] }}
                      />
                    ))}
                  </div>
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-xs font-medium text-[hsl(var(--foreground))]">{preset.name}</span>
                    {preset.is_builtin && <Lock size={10} className="flex-shrink-0 text-[hsl(var(--muted-foreground))]" />}
                    {isActive && <Check size={12} className="flex-shrink-0 text-[hsl(var(--primary))]" />}
                  </span>
                </button>
                {!preset.is_builtin && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(preset)}
                    title={t('admin_branding_delete_theme')}
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('admin_branding_delete_theme')}
        description={t('admin_branding_delete_theme_confirm', { name: deleteTarget?.name ?? '' })}
        confirmLabel={t('admin_branding_delete_theme')}
        cancelLabel={t('admin_branding_cancel')}
        destructive
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
