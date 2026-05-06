import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { patchLanguage } from '@/api/profile'

export function AdminLanguageToggle() {
  const { i18n, t } = useTranslation()
  const current = i18n.language.startsWith('ru') ? 'ru' : 'en'

  const toggle = async () => {
    const next = current === 'ru' ? 'en' : 'ru'
    i18n.changeLanguage(next)
    try {
      await patchLanguage(next)
    } catch {
      // Best effort: keep local language switch even if profile persistence fails.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
    >
      <Globe size={18} />
      <span className="flex-1 text-left">
        {current === 'ru' ? t('admin_language_switch_to_en') : t('admin_language_switch_to_ru')}
      </span>
    </button>
  )
}
