import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getPublicBranding, type PublicBrandingResponse } from '@/api/admin/branding'
import { API_BASE } from '@/api/client'

// API_BASE is like "https://api.domain.com/api" — strip the trailing /api
const API_ORIGIN = API_BASE.replace(/\/api$/, '')

/** Normalise logo_url: turn relative /static/... into an absolute API URL */
export function resolveLogoUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('/static/')) return `${API_ORIGIN}${url}`
  return url
}

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

function applyBrandingCss(branding: PublicBrandingResponse) {
  const root = document.documentElement

  root.style.setProperty('--primary', hexToHsl(branding.primary_color))
  root.style.setProperty('--secondary', hexToHsl(branding.secondary_color))
  root.style.setProperty('--background', hexToHsl(branding.background_color))

  if (branding.font_family) {
    root.style.setProperty('--font-family', branding.font_family)
    document.body.style.fontFamily = `'${branding.font_family}', sans-serif`
  }

  // Apply custom CSS
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
  if (branding.brand_name) {
    document.title = branding.brand_name
  }
}

export function useBranding() {
  const { data } = useQuery<PublicBrandingResponse>({
    queryKey: ['public', 'branding'],
    queryFn: getPublicBranding,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  useEffect(() => {
    if (data) {
      applyBrandingCss(data)
    }
  }, [data])

  return data
}
