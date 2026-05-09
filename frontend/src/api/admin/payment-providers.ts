import { apiRequest } from '@/api/client'

export interface PaymentProviderResponse {
  id: number
  provider_key: string
  display_name: string
  is_enabled: boolean
  sort_order: number
  updated_at: string | null
}

export interface PaymentProvidersListResponse {
  items: PaymentProviderResponse[]
}

export interface PaymentProviderUpdateRequest {
  is_enabled?: boolean
  sort_order?: number
  display_name?: string
}

export function getAdminPaymentProviders(): Promise<PaymentProvidersListResponse> {
  return apiRequest<PaymentProvidersListResponse>('/admin/payment-providers')
}

export function updatePaymentProvider(
  providerId: number,
  body: PaymentProviderUpdateRequest,
): Promise<PaymentProviderResponse> {
  return apiRequest<PaymentProviderResponse>(`/admin/payment-providers/${providerId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}
