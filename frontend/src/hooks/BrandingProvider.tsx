import { createContext, useContext, useCallback, useEffect, useState } from 'react'
import { useBranding, resolveLogoUrl } from './useBranding'
import type { PublicBrandingResponse } from '@/api/admin/branding'
import {
  type ColorScheme,
  type ResolvedScheme,
  applyPalette,
  loadGoogleFont,
  normaliseTheme,
  readStoredScheme,
  resolveScheme,
  systemPrefersDark,
  writeStoredScheme,
} from '@/lib/theme'

interface BrandingContextValue {
  branding: PublicBrandingResponse | undefined
  newsEnabled: boolean
  referralEnabled: boolean
  devicesEnabled: boolean
  supportEnabled: boolean
  colorScheme: ColorScheme
  resolvedScheme: ResolvedScheme
  setColorScheme: (scheme: ColorScheme) => void
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: undefined,
  newsEnabled: true,
  referralEnabled: true,
  devicesEnabled: true,
  supportEnabled: true,
  colorScheme: 'system',
  resolvedScheme: 'light',
  setColorScheme: () => {},
})

const LOCAL_FONTS = new Set(['Nunito'])

/** Apply scheme-independent branding: fonts, radius, custom CSS, favicon, title. */
function applyBrandingChrome(branding: PublicBrandingResponse) {
  const root = document.documentElement
  const theme = normaliseTheme(branding.theme)

  root.style.setProperty('--radius', theme.radius)

  const bodyFont = branding.font_family?.trim()
  if (bodyFont) {
    if (!LOCAL_FONTS.has(bodyFont)) loadGoogleFont(bodyFont)
    document.body.style.fontFamily = `'${bodyFont}', system-ui, sans-serif`
  }
  const headingFont = branding.heading_font_family?.trim() || bodyFont
  if (headingFont) {
    if (!LOCAL_FONTS.has(headingFont)) loadGoogleFont(headingFont)
    root.style.setProperty('--font-heading', `'${headingFont}', system-ui, sans-serif`)
  }

  // Custom CSS
  const styleId = 'branding-custom-css'
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null
  if (branding.custom_css) {
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = branding.custom_css
  } else if (styleEl) {
    styleEl.remove()
  }

  // Favicon
  const faviconUrl = resolveLogoUrl(branding.favicon_url)
  if (faviconUrl) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = faviconUrl
  }

  // Page title
  if (branding.brand_name) document.title = branding.brand_name
}

/** Apply the palette for the active light/dark scheme. */
function applyScheme(branding: PublicBrandingResponse | undefined, resolved: ResolvedScheme) {
  const root = document.documentElement
  const theme = normaliseTheme(branding?.theme)
  applyPalette(root, resolved === 'dark' ? theme.dark : theme.light)
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
}

function useColorSchemeController(adminDefault: string | undefined) {
  // User preference (localStorage) wins; otherwise follow the admin default.
  const [pref, setPref] = useState<ColorScheme>(() => readStoredScheme() ?? 'system')
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark())
  const [hasStored, setHasStored] = useState<boolean>(() => readStoredScheme() !== null)

  // Adopt the admin default until the user makes an explicit choice.
  useEffect(() => {
    if (!hasStored && adminDefault && ['light', 'dark', 'system'].includes(adminDefault)) {
      setPref(adminDefault as ColorScheme)
    }
  }, [adminDefault, hasStored])

  // React to OS theme changes while in "system" mode.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setPref(scheme)
    setHasStored(true)
    writeStoredScheme(scheme)
  }, [])

  const resolved: ResolvedScheme = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
  return { pref, resolved, setColorScheme }
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const branding = useBranding()
  const { pref, resolved, setColorScheme } = useColorSchemeController(branding?.default_color_scheme)

  useEffect(() => {
    if (branding) applyBrandingChrome(branding)
  }, [branding])

  useEffect(() => {
    applyScheme(branding, resolved)
  }, [branding, resolved])

  const value: BrandingContextValue = {
    branding,
    newsEnabled: branding?.news_enabled ?? true,
    referralEnabled: branding?.referral_enabled ?? true,
    devicesEnabled: branding?.devices_enabled ?? true,
    supportEnabled: branding?.support_enabled ?? true,
    colorScheme: pref,
    resolvedScheme: resolved,
    setColorScheme,
  }

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}

export function useBrandingContext() {
  return useContext(BrandingContext)
}
