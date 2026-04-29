import { apiRequest } from '@/api/client'

export interface AdminPromoItem {
  promo_code_id: number
  code: string
  promo_type: 'bonus_days' | 'discount'
  bonus_days: number | null
  discount_percentage: number | null
  max_activations: number
  current_activations: number
  is_active: boolean
  created_at: string | null
  valid_until: string | null
}

export interface AdminPromoListResponse {
  items: AdminPromoItem[]
  total: number
  page: number
  page_size: number
}

export interface PromoCreateRequest {
  code: string
  promo_type: 'bonus_days' | 'discount'
  bonus_days?: number
  discount_percentage?: number
  max_activations: number
  valid_until?: string
}

export interface PromoUpdateRequest {
  is_active?: boolean
  max_activations?: number
  valid_until?: string | null
  bonus_days?: number
  discount_percentage?: number
}

export function getAdminPromos(page = 0, page_size = 20): Promise<AdminPromoListResponse> {
  return apiRequest<AdminPromoListResponse>(`/admin/promos?page=${page}&page_size=${page_size}`)
}

export function createPromo(data: PromoCreateRequest): Promise<AdminPromoItem> {
  return apiRequest<AdminPromoItem>('/admin/promos', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updatePromo(promoId: number, data: PromoUpdateRequest): Promise<AdminPromoItem> {
  return apiRequest<AdminPromoItem>(`/admin/promos/${promoId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deletePromo(promoId: number): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/admin/promos/${promoId}`, {
    method: 'DELETE',
  })
}
