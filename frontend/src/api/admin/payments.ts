import { apiRequest } from '@/api/client'

export interface AdminPaymentListItem {
  payment_id: number
  user_id: number
  username: string | null
  first_name: string | null
  amount: number
  original_amount: number | null
  discount_applied: number | null
  currency: string
  status: string
  provider: string | null
  subscription_duration_months: number | null
  promo_code: string | null
  created_at: string | null
}

export interface AdminPaymentListResponse {
  items: AdminPaymentListItem[]
  total: number
  page: number
  page_size: number
}

export interface DailyRevenuePoint {
  date: string
  amount: number
  count: number
}

export interface ProviderRevenueItem {
  provider: string
  amount: number
  count: number
}

export interface PaymentStatsResponse {
  today_revenue: number
  week_revenue: number
  month_revenue: number
  all_time_revenue: number
  today_payments_count: number
  by_provider: ProviderRevenueItem[]
  daily_chart: DailyRevenuePoint[]
}

export interface PaymentsListParams {
  status?: string
  provider?: string
  date_from?: string
  date_to?: string
  user_id?: number
  page?: number
  page_size?: number
}

export function getAdminPayments(params: PaymentsListParams = {}): Promise<AdminPaymentListResponse> {
  const sp = new URLSearchParams()
  if (params.status) sp.set('status', params.status)
  if (params.provider) sp.set('provider', params.provider)
  if (params.date_from) sp.set('date_from', params.date_from)
  if (params.date_to) sp.set('date_to', params.date_to)
  if (params.user_id !== undefined) sp.set('user_id', String(params.user_id))
  if (params.page !== undefined) sp.set('page', String(params.page))
  if (params.page_size !== undefined) sp.set('page_size', String(params.page_size))
  const qs = sp.toString()
  return apiRequest<AdminPaymentListResponse>(`/admin/payments${qs ? `?${qs}` : ''}`)
}

export function getPaymentStats(days = 30): Promise<PaymentStatsResponse> {
  return apiRequest<PaymentStatsResponse>(`/admin/payments/stats?days=${days}`)
}
