import { apiRequest, API_BASE, getAccessToken } from '@/api/client'

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
  custom_css: string | null
  privacy_policy_url: string | null
  terms_of_service_url: string | null
  personal_data_url: string | null
  refund_policy_url: string | null
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
  primary_color?: string
  secondary_color?: string
  background_color?: string
  foreground_color?: string
  card_color?: string
  border_color?: string
  font_family?: string
  custom_css?: string
  privacy_policy_url?: string
  terms_of_service_url?: string
  personal_data_url?: string
  refund_policy_url?: string
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

export function getAdminFeatures(): Promise<FeaturesResponse> {
  return apiRequest<FeaturesResponse>('/admin/features')
}

export function patchFeatures(body: FeaturesUpdateRequest): Promise<FeaturesResponse> {
  return apiRequest<FeaturesResponse>('/admin/features', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}
