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

/** Fetch public branding (theme, fonts, feature flags). Application of the
 *  theme to the DOM happens in BrandingProvider so it can react to the active
 *  light/dark colour scheme. */
export function useBranding() {
  const { data } = useQuery<PublicBrandingResponse>({
    queryKey: ['public', 'branding'],
    queryFn: getPublicBranding,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
  return data
}
