import { apiRequest } from './client'

// Remnawave Subscription Page "v2" app config (app-config-v2.json).
// Localized string map, e.g. { ru, en }.
export type LocalizedText = Record<string, string>

export interface AppButton {
  // 'external' opens a link, 'subscriptionLink' is a deep link (templated),
  // 'copyButton' copies the (templated) link to the clipboard.
  type: 'external' | 'subscriptionLink' | 'copyButton' | string
  link: string
  text: LocalizedText
  svgIconKey?: string
}

export interface AppBlock {
  svgIconKey?: string
  svgIconColor?: string
  title: LocalizedText
  description: LocalizedText
  buttons?: AppButton[]
}

export interface AppEntry {
  name: string
  svgIconKey?: string
  featured?: boolean
  blocks: AppBlock[]
}

export interface PlatformConfig {
  displayName: LocalizedText
  svgIconKey?: string
  apps: AppEntry[]
}

export interface AppConfig {
  version?: string
  locales?: string[]
  brandingSettings?: { title?: string; logoUrl?: string; supportUrl?: string }
  uiConfig?: Record<string, string>
  baseSettings?: Record<string, unknown>
  baseTranslations?: Record<string, LocalizedText>
  svgLibrary?: Record<string, string>
  platforms: Record<string, PlatformConfig>
}

interface AppConfigResponse {
  config: AppConfig | null
}

export function getAppConfig(): Promise<AppConfig | null> {
  return apiRequest<AppConfigResponse>('/devices/app-config').then((r) => r.config)
}

/** Pick the best localized string for the current language with sensible fallbacks. */
export function pickText(text: LocalizedText | undefined, lang: string): string {
  if (!text) return ''
  const short = lang.slice(0, 2)
  return text[lang] ?? text[short] ?? text.en ?? text.ru ?? Object.values(text)[0] ?? ''
}
