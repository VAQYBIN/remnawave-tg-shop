import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Plus, Copy } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { ConnectionLinkCard } from '@/components/subscription/ConnectionLinkCard'
import { useToast } from '@/hooks/useToast'
import {
  pickText,
  type AppConfig,
  type AppEntry,
  type AppButton,
} from '@/api/appConfig'
import { getConnection } from '@/api/subscription'
import {
  platformKeys,
  detectPlatform,
  defaultApp,
  applyTemplate,
  getSvgIcon,
  safeUrl,
} from '@/lib/app-config-utils'
import { sanitizeHtml } from '@/lib/sanitize'
import { PlatformSelector } from './PlatformSelector'
import { SvgIcon } from './SvgIcon'
import { AppIcon } from './AppIcon'

/** Step-by-step connection guide for a chosen OS + app, rendered from the v2 app config blocks. */
export function ConnectionGuide({ config }: { config: AppConfig }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const toast = useToast()
  const platforms = platformKeys(config)
  const [platform, setPlatform] = useState(() => detectPlatform(platforms))
  const [appIndex, setAppIndex] = useState<number | null>(null)

  const apps = config.platforms[platform]?.apps ?? []
  const selectedApp: AppEntry | undefined = useMemo(() => {
    if (appIndex !== null && apps[appIndex]) return apps[appIndex]
    return defaultApp(apps)
  }, [apps, appIndex])

  const { data: connection } = useQuery({ queryKey: ['connection'], queryFn: getConnection })
  const subscriptionUrl = connection?.link ?? ''

  const handlePlatform = (key: string) => {
    setPlatform(key)
    setAppIndex(null) // reset app selection so it defaults to the featured app
  }

  const renderButton = (btn: AppButton, idx: number) => {
    const icon = getSvgIcon(config.svgLibrary, btn.svgIconKey)
    const label = pickText(btn.text, lang)
    const leftIcon = icon ? (
      <SvgIcon svg={icon} size={14} />
    ) : btn.type === 'subscriptionLink' ? (
      <Plus size={14} />
    ) : (
      <ExternalLink size={14} />
    )

    if (btn.type === 'copyButton') {
      return (
        <Button
          key={idx}
          variant="soft"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(applyTemplate(btn.link, subscriptionUrl))
            toast.success(t('copied'))
          }}
        >
          <Copy size={14} />
          {label}
        </Button>
      )
    }

    const isDeepLink = btn.type === 'subscriptionLink'
    const href = safeUrl(isDeepLink ? applyTemplate(btn.link, subscriptionUrl) : btn.link)
    return (
      <a
        key={idx}
        href={href}
        target={isDeepLink ? undefined : '_blank'}
        rel="noopener noreferrer"
        className={buttonVariants({ variant: isDeepLink ? 'default' : 'soft', size: 'sm' })}
      >
        {leftIcon}
        {label}
      </a>
    )
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{t('guide_subtitle')}</p>
        <PlatformSelector
          config={config}
          platforms={platforms}
          value={platform}
          onChange={handlePlatform}
          lang={lang}
        />
        {apps.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {apps.map((app, idx) => {
              const active = app === selectedApp
              const icon = getSvgIcon(config.svgLibrary, app.svgIconKey)
              return (
                <button
                  key={app.name}
                  type="button"
                  onClick={() => setAppIndex(idx)}
                  className={[
                    'flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-[13px] font-semibold transition-colors',
                    active
                      ? 'border-[hsl(var(--primary))] bg-[var(--primary-soft)] text-[hsl(var(--primary))]'
                      : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
                  ].join(' ')}
                >
                  {icon && <AppIcon svg={icon} size={20} iconSize={13} />}
                  {app.name}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selectedApp && selectedApp.blocks.length > 0 && (
        <Card>
          <CardContent className="space-y-5 p-5">
            {selectedApp.blocks.map((block, idx) => {
              const icon = getSvgIcon(config.svgLibrary, block.svgIconKey)
              return (
                <div key={idx} className="flex gap-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[13px] font-bold text-[hsl(var(--primary))]">
                    {icon ? <SvgIcon svg={icon} size={16} /> : idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[15px] font-bold text-[hsl(var(--foreground))] [&_a]:text-[hsl(var(--primary))] [&_a]:underline"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(pickText(block.title, lang)) }}
                    />
                    {pickText(block.description, lang) && (
                      <div
                        className="mt-1 text-sm leading-relaxed text-[hsl(var(--muted-foreground))] [&_a]:text-[hsl(var(--primary))] [&_a]:underline [&_code]:rounded [&_code]:bg-[hsl(var(--muted))] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(pickText(block.description, lang)) }}
                      />
                    )}
                    {block.buttons && block.buttons.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {block.buttons.map((btn, i) => renderButton(btn, i))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {!subscriptionUrl && (
        <Badge variant="secondary" className="text-xs">
          {t('guide_no_link')}
        </Badge>
      )}

      <ConnectionLinkCard />
    </div>
  )
}
