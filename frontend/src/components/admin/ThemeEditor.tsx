import { useTranslation } from 'react-i18next'
import { Copy, RotateCcw } from 'lucide-react'
import { ColorPickerField } from './ColorPickerField'
import { Button } from '@/components/ui/button'
import {
  TOKEN_GROUPS,
  TOKEN_META,
  DEFAULT_LIGHT,
  DEFAULT_DARK,
  type Theme,
  type Palette,
} from '@/lib/theme'

type PaletteName = 'light' | 'dark'

interface ThemeEditorProps {
  theme: Theme
  onChange: (theme: Theme) => void
  editing: PaletteName
  onEditingChange: (p: PaletteName) => void
}

const contrastFor = (palette: Palette, token: string): string | undefined => {
  const meta = TOKEN_META.find(m => m.token === token)
  return meta?.contrastWith ? palette[meta.contrastWith] : undefined
}

export function ThemeEditor({ theme, onChange, editing, onEditingChange }: ThemeEditorProps) {
  const { t } = useTranslation()
  const palette = theme[editing]
  const defaults = editing === 'light' ? DEFAULT_LIGHT : DEFAULT_DARK
  const other: PaletteName = editing === 'light' ? 'dark' : 'light'

  const setToken = (token: string, value: string) =>
    onChange({ ...theme, [editing]: { ...palette, [token]: value } })

  const copyFromOther = () =>
    onChange({ ...theme, [editing]: { ...theme[other] } })

  const resetPalette = () =>
    onChange({ ...theme, [editing]: { ...defaults } })

  const paletteTab = (name: PaletteName, label: string) => (
    <button
      type="button"
      onClick={() => onEditingChange(name)}
      className={[
        'flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors',
        editing === name
          ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-[var(--shadow-xs)]'
          : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
      ].join(' ')}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-5">
      {/* Palette switch + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
            {t('admin_branding_edit_palette')}
          </span>
          <div className="inline-flex rounded-lg bg-[hsl(var(--muted))] p-0.5">
            {paletteTab('light', t('admin_branding_palette_light'))}
            {paletteTab('dark', t('admin_branding_palette_dark'))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={copyFromOther}>
            <Copy size={14} />
            {editing === 'dark' ? t('admin_branding_copy_to_dark') : t('admin_branding_copy_to_light')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={resetPalette}>
            <RotateCcw size={14} />
            {t('admin_branding_reset_palette')}
          </Button>
        </div>
      </div>

      {/* Token groups */}
      {TOKEN_GROUPS.map(group => (
        <div key={group.label} className="space-y-4">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">
            {t(`admin_branding_group_${group.label}`)}
          </h3>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {group.tokens.map(token => (
              <ColorPickerField
                key={token}
                label={t(`brand_token_${token}`)}
                value={palette[token]}
                onChange={v => setToken(token, v)}
                defaultValue={defaults[token]}
                checkContrastWith={contrastFor(palette, token)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
