import { Monitor } from 'lucide-react'
import { pickText, type AppConfig } from '@/api/appConfig'
import { getSvgIcon } from '@/lib/app-config-utils'
import { SvgIcon } from './SvgIcon'

interface PlatformSelectorProps {
  config: AppConfig
  platforms: string[]
  value: string
  onChange: (key: string) => void
  lang: string
}

/** Row of OS pills (icon + localized displayName) shared by the apps list and the guide. */
export function PlatformSelector({ config, platforms, value, onChange, lang }: PlatformSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {platforms.map((key) => {
        const platform = config.platforms[key]
        const active = key === value
        const icon = getSvgIcon(config.svgLibrary, platform?.svgIconKey)
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={[
              'flex items-center gap-2 rounded-[10px] border px-3.5 py-2 text-[13px] font-semibold transition-colors',
              active
                ? 'border-[hsl(var(--primary))] bg-[var(--primary-soft)] text-[hsl(var(--primary))]'
                : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
            ].join(' ')}
          >
            {icon ? <SvgIcon svg={icon} size={16} /> : <Monitor size={16} />}
            {pickText(platform?.displayName, lang)}
          </button>
        )
      })}
    </div>
  )
}
