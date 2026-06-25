import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { pickText, type AppConfig, type AppEntry } from '@/api/appConfig'
import { platformKeys, detectPlatform, getSvgIcon, safeUrl } from '@/lib/app-config-utils'
import { PlatformSelector } from './PlatformSelector'
import { SvgIcon } from './SvgIcon'
import { AppIcon } from './AppIcon'

/** Collect the app's external (download/store) buttons across all its blocks. */
function downloadButtons(app: AppEntry) {
  return app.blocks.flatMap((b) => b.buttons ?? []).filter((btn) => btn.type === 'external')
}

/** "Where to get a client" — OS selector + downloadable apps from the app config. */
export function AppDownloads({ config }: { config: AppConfig }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const platforms = platformKeys(config)
  const [platform, setPlatform] = useState(() => detectPlatform(platforms))
  const apps = config.platforms[platform]?.apps ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('devices_clients_title')}</CardTitle>
        <CardDescription>{t('devices_apps_desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <PlatformSelector
          config={config}
          platforms={platforms}
          value={platform}
          onChange={setPlatform}
          lang={lang}
        />
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {apps.map((app) => {
            const icon = getSvgIcon(config.svgLibrary, app.svgIconKey)
            const buttons = downloadButtons(app)
            return (
              <div key={app.name} className="rounded-[10px] border border-[hsl(var(--border))] p-4">
                <div className="flex items-center gap-2.5">
                  <AppIcon svg={icon} size={36} fallback={<Download size={18} />} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-bold text-[hsl(var(--foreground))]">
                        {app.name}
                      </span>
                      {app.featured && (
                        <Badge variant="success" className="shrink-0">
                          {t('devices_recommended')}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                {buttons.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {buttons.map((btn, i) => {
                      const btnIcon = getSvgIcon(config.svgLibrary, btn.svgIconKey)
                      return (
                        <a
                          key={i}
                          href={safeUrl(btn.link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonVariants({ variant: 'soft', size: 'sm' })}
                        >
                          {btnIcon ? <SvgIcon svg={btnIcon} size={14} /> : <Download size={14} />}
                          {pickText(btn.text, lang)}
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
