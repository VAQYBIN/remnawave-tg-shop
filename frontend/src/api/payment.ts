import { apiRequest } from './client'

export interface Payment {
  payment_id: number
  amount: number
  original_amount: number | null
  discount_applied: number | null
  currency: string
  status: string
  description: string | null
  subscription_duration_months: number | null
  provider: string
  created_at: string
}

export interface PaymentsList {
  items: Payment[]
  total: number
  page: number
  limit: number
}

export interface CreatePaymentRequest {
  provider: string
  months: number
  promo_code?: string
}

export interface CreatePaymentResponse {
  payment_id: number
  redirect_url: string
  amount: number
  original_amount: number | null
  currency: string
}

export interface PaymentStatus {
  payment_id: number
  status: string
  provider: string
  amount: number
  currency: string
  created_at: string
}

export interface PromoApplyResponse {
  promo_code: string
  discount_percentage: number
  expires_at: string
}

export function getPayments(page = 1, limit = 20): Promise<PaymentsList> {
  return apiRequest<PaymentsList>(`/payments?page=${page}&limit=${limit}`)
}

export function getPaymentsCount(): Promise<{ total: number }> {
  return apiRequest<{ total: number }>('/payments/count')
}

export function createPayment(data: CreatePaymentRequest): Promise<CreatePaymentResponse> {
  return apiRequest<CreatePaymentResponse>('/payments/create', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function getPaymentStatus(paymentId: number): Promise<PaymentStatus> {
  return apiRequest<PaymentStatus>(`/payments/${paymentId}/status`)
}

export function applyPromo(code: string): Promise<PromoApplyResponse> {
  return apiRequest<PromoApplyResponse>('/promo/apply', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export function removeActiveDiscount(): Promise<void> {
  return apiRequest<void>('/promo/active-discount', { method: 'DELETE' })
}
