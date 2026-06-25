import type { AppConfig, AppEntry } from '@/api/appConfig'

/** Ordered platform keys that actually have apps. */
export function platformKeys(config: AppConfig): string[] {
  const platforms = config.platforms || {}
  return Object.keys(platforms).filter(
    (k) => Array.isArray(platforms[k]?.apps) && platforms[k].apps.length > 0,
  )
}

/** Guess the platform key matching the current device, falling back to the first available. */
export function detectPlatform(available: string[]): string {
  const ua = (navigator.userAgent || '').toLowerCase()
  let guess = ''
  if (/iphone|ipad|ipod/.test(ua)) guess = 'ios'
  else if (/android/.test(ua)) guess = 'android'
  else if (/windows/.test(ua)) guess = 'windows'
  else if (/mac/.test(ua)) guess = 'macos'
  else if (/linux/.test(ua)) guess = 'linux'

  const match = available.find((k) => k.toLowerCase() === guess)
  return match ?? available[0] ?? ''
}

/** Featured app first, otherwise the first entry. */
export function defaultApp(apps: AppEntry[]): AppEntry | undefined {
  return apps.find((a) => a.featured) ?? apps[0]
}

/**
 * Substitute template tokens in a config link, mirroring the subscription page's
 * TemplateEngine ({{SUBSCRIPTION_LINK}}, {{USERNAME}}).
 */
export function applyTemplate(template: string, subscriptionUrl: string, username = ''): string {
  const values: Record<string, string> = {
    SUBSCRIPTION_LINK: subscriptionUrl,
    USERNAME: username,
  }
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? values[key] : match,
  )
}

// Schemes that must never appear in an href (XSS vectors).
const DANGEROUS_SCHEMES = ['javascript', 'data', 'vbscript', 'file', 'blob', 'about']

/**
 * Make a config-provided URL safe to use as an href. Allows http/https and custom
 * app deep-link schemes (incy://, happ://, ...) but blocks javascript:/data:/etc.
 */
export function safeUrl(raw: string): string {
  if (!raw) return '#'
  const trimmed = raw.trim()
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)
  if (match && DANGEROUS_SCHEMES.includes(match[1].toLowerCase())) {
    return '#'
  }
  return trimmed
}

/** Raw SVG markup for an icon key from the config's svgLibrary, or null. */
export function getSvgIcon(
  svgLibrary: Record<string, string> | undefined,
  key: string | undefined,
): string | null {
  if (!svgLibrary || !key) return null
  return svgLibrary[key] ?? null
}
