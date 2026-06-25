import { useTranslation } from 'react-i18next'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useBrandingContext } from '@/hooks/BrandingProvider'
import type { ColorScheme } from '@/lib/theme'

const ORDER: ColorScheme[] = ['light', 'dark', 'system']

function iconFor(scheme: ColorScheme, size: number) {
  if (scheme === 'light') return <Sun size={size} />
  if (scheme === 'dark') return <Moon size={size} />
  return <Monitor size={size} />
}

function useThemeCycle() {
  const { colorScheme, setColorScheme } = useBrandingContext()
  const next = () => {
    const idx = ORDER.indexOf(colorScheme)
    setColorScheme(ORDER[(idx + 1) % ORDER.length])
  }
  return { colorScheme, next }
}

/** Full-width row for the sidebar (matches LangToggle styling). */
export function ThemeToggleRow() {
  const { t } = useTranslation()
  const { colorScheme, next } = useThemeCycle()
  const label =
    colorScheme === 'light' ? t('theme_light') : colorScheme === 'dark' ? t('theme_dark') : t('theme_system')

  return (
    <button
      type="button"
      onClick={next}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
      aria-label={t('theme_appearance')}
    >
      {iconFor(colorScheme, 18)}
      <span>{label}</span>
    </button>
  )
}

/** Compact icon button for the mobile top bar. */
export function ThemeToggleButton() {
  const { t } = useTranslation()
  const { colorScheme, next } = useThemeCycle()

  return (
    <button
      type="button"
      onClick={next}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
      aria-label={t('theme_appearance')}
      title={t('theme_appearance')}
    >
      {iconFor(colorScheme, 18)}
    </button>
  )
}
