import { apiRequest, API_BASE, getAccessToken } from '@/api/client'
import type { Theme } from '@/lib/theme'

export interface BrandingResponse {
  brand_name: string
  logo_url: string | null
  favicon_url: string | null
  primary_color: string
  secondary_color: string
  background_color: string
  foreground_color: string
  card_color: string
  border_color: string
  font_family: string
  heading_font_family: string | null
  theme: Theme
  default_color_scheme: string
  custom_css: string | null
  privacy_policy_url: string | null
  terms_of_service_url: string | null
  personal_data_url: string | null
  refund_policy_url: string | null
  contact_support_tg_username: string | null
  contact_support_email: string | null
  contact_support_phone: string | null
}

export interface PublicBrandingResponse extends BrandingResponse {
  news_enabled: boolean
  referral_enabled: boolean
  devices_enabled: boolean
  support_enabled: boolean
}

export interface BrandingUpdateRequest {
  brand_name?: string
  logo_url?: string
  favicon_url?: string
  font_family?: string
  heading_font_family?: string
  theme?: Theme
  default_color_scheme?: string
  custom_css?: string
  // null = очистить поле (бэкенд различает «не прислано» и «прислано пустым»)
  privacy_policy_url?: string | null
  terms_of_service_url?: string | null
  personal_data_url?: string | null
  refund_policy_url?: string | null
  contact_support_tg_username?: string | null
  contact_support_email?: string | null
  contact_support_phone?: string | null
}

export interface BrandThemeResponse {
  id: number
  name: string
  is_builtin: boolean
  theme: Theme
  font_family: string | null
  heading_font_family: string | null
  created_at: string | null
}

export interface BrandThemeCreateRequest {
  name: string
  theme: Theme
  font_family?: string
  heading_font_family?: string
}

export function getLegalContent(url: string): Promise<{ content: string }> {
  return fetch(`${API_BASE}/legal/content?url=${encodeURIComponent(url)}`).then(r => {
    if (!r.ok) throw new Error('Failed to load document')
    return r.json()
  })
}

export interface FeaturesResponse {
  news_enabled: boolean
  referral_enabled: boolean
  devices_enabled: boolean
  support_enabled: boolean
}

export interface FeaturesUpdateRequest {
  news_enabled?: boolean
  referral_enabled?: boolean
  devices_enabled?: boolean
  support_enabled?: boolean
}

export function getPublicBranding(): Promise<PublicBrandingResponse> {
  return fetch(`${API_BASE}/config/branding`).then(r => r.json())
}

export function getAdminBranding(): Promise<BrandingResponse> {
  return apiRequest<BrandingResponse>('/admin/branding')
}

export function patchBranding(body: BrandingUpdateRequest): Promise<BrandingResponse> {
  return apiRequest<BrandingResponse>('/admin/branding', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function uploadFavicon(file: File): Promise<BrandingResponse> {
  const form = new FormData()
  form.append('file', file)
  const resp = await fetch(`${API_BASE}/admin/branding/favicon`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
    },
    credentials: 'include',
    body: form,
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ detail: 'Upload failed' }))
    throw new Error(body.detail ?? 'Upload failed')
  }
  return resp.json()
}

export async function uploadLogo(file: File): Promise<BrandingResponse> {
  const form = new FormData()
  form.append('file', file)
  const resp = await fetch(`${API_BASE}/admin/branding/logo`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
    },
    credentials: 'include',
    body: form,
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ detail: 'Upload failed' }))
    throw new Error(body.detail ?? 'Upload failed')
  }
  return resp.json()
}

export function deleteLogo(): Promise<BrandingResponse> {
  return apiRequest<BrandingResponse>('/admin/branding/logo', { method: 'DELETE' })
}

export function deleteFavicon(): Promise<BrandingResponse> {
  return apiRequest<BrandingResponse>('/admin/branding/favicon', { method: 'DELETE' })
}

// ── Saved presets ────────────────────────────────────────────────────────────
export function listBrandThemes(): Promise<BrandThemeResponse[]> {
  return apiRequest<BrandThemeResponse[]>('/admin/branding/themes')
}

export function createBrandTheme(body: BrandThemeCreateRequest): Promise<BrandThemeResponse> {
  return apiRequest<BrandThemeResponse>('/admin/branding/themes', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function deleteBrandTheme(id: number): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/admin/branding/themes/${id}`, { method: 'DELETE' })
}

export function applyBrandTheme(id: number): Promise<BrandingResponse> {
  return apiRequest<BrandingResponse>(`/admin/branding/themes/${id}/apply`, { method: 'POST' })
}

export function getAdminFeatures(): Promise<FeaturesResponse> {
  return apiRequest<FeaturesResponse>('/admin/features')
}

export function patchFeatures(body: FeaturesUpdateRequest): Promise<FeaturesResponse> {
  return apiRequest<FeaturesResponse>('/admin/features', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}
