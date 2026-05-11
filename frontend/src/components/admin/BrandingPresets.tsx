import { useTranslation } from 'react-i18next'

export interface ColorPreset {
  name: string
  primary_color: string
  secondary_color: string
  background_color: string
  foreground_color: string
  card_color: string
  border_color: string
}

export const PRESETS: ColorPreset[] = [
  {
    name: 'Default',
    primary_color: '#2AACDF',
    secondary_color: '#897569',
    background_color: '#F5F1ED',
    foreground_color: '#2B2B2B',
    card_color: '#FFFFFF',
    border_color: '#DDD8D3',
  },
  {
    name: 'Dark Slate',
    primary_color: '#6366F1',
    secondary_color: '#8B8FA8',
    background_color: '#1E1E2E',
    foreground_color: '#CDD6F4',
    card_color: '#313244',
    border_color: '#45475A',
  },
  {
    name: 'Forest',
    primary_color: '#22C55E',
    secondary_color: '#4ADE80',
    background_color: '#F0FDF4',
    foreground_color: '#14532D',
    card_color: '#FFFFFF',
    border_color: '#BBF7D0',
  },
  {
    name: 'Corporate Red',
    primary_color: '#EF4444',
    secondary_color: '#F87171',
    background_color: '#FFF5F5',
    foreground_color: '#1C1C1C',
    card_color: '#FFFFFF',
    border_color: '#FECACA',
  },
  {
    name: 'Purple Wave',
    primary_color: '#A855F7',
    secondary_color: '#C084FC',
    background_color: '#FAF5FF',
    foreground_color: '#1C1C1C',
    card_color: '#FFFFFF',
    border_color: '#E9D5FF',
  },
  {
    name: 'Ocean',
    primary_color: '#0EA5E9',
    secondary_color: '#38BDF8',
    background_color: '#F0F9FF',
    foreground_color: '#0C4A6E',
    card_color: '#FFFFFF',
    border_color: '#BAE6FD',
  },
]

interface BrandingPresetsProps {
  onApply: (preset: ColorPreset) => void
  currentPrimary: string
}

export function BrandingPresets({ onApply, currentPrimary }: BrandingPresetsProps) {
  const { t } = useTranslation()

  return (
    <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">{t('admin_branding_presets')}</h2>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{t('admin_branding_presets_hint')}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {PRESETS.map(preset => {
          const isActive = preset.primary_color.toLowerCase() === currentPrimary.toLowerCase()
          return (
            <button
              key={preset.name}
              type="button"
              onClick={() => onApply(preset)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all hover:shadow-sm"
              style={{
                borderColor: isActive ? preset.primary_color : 'hsl(var(--border))',
                backgroundColor: isActive ? `${preset.primary_color}12` : 'transparent',
              }}
            >
              {/* Color swatches */}
              <div className="flex gap-0.5 flex-shrink-0">
                {[preset.primary_color, preset.secondary_color, preset.background_color].map((c, i) => (
                  <div
                    key={i}
                    className="w-3 h-3 rounded-full border border-black/10"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <span className="text-xs font-medium text-[hsl(var(--foreground))] truncate">{preset.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
