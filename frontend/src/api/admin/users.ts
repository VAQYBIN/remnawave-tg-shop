import { apiRequest } from '@/api/client'

export interface AdminUserListItem {
  user_id: number
  username: string | null
  first_name: string | null
  last_name: string | null
  is_banned: boolean
  registration_date: string | null
  panel_user_uuid: string | null
  email: string | null
  has_active_subscription: boolean
  subscription_end_date: string | null
}

export interface AdminUserListResponse {
  items: AdminUserListItem[]
  total: number
  page: number
  page_size: number
}

export interface AdminSubscriptionDetail {
  subscription_id: number
  is_active: boolean
  start_date: string | null
  end_date: string | null
  duration_months: number | null
  provider: string | null
  auto_renew_enabled: boolean
  traffic_limit_bytes: number | null
  traffic_used_bytes: number | null
  panel_user_uuid: string | null
}

export interface AdminPaymentItem {
  payment_id: number
  amount: number
  currency: string
  status: string
  provider: string | null
  created_at: string | null
  subscription_duration_months: number | null
}

export interface AdminUserDetailResponse {
  user_id: number
  username: string | null
  first_name: string | null
  last_name: string | null
  is_banned: boolean
  registration_date: string | null
  panel_user_uuid: string | null
  language_code: string | null
  referral_code: string | null
  email: string | null
  subscription: AdminSubscriptionDetail | null
  recent_payments: AdminPaymentItem[]
  total_paid: number
  panel_data: Record<string, unknown> | null
}

export interface UsersListParams {
  query?: string
  is_banned?: boolean
  has_subscription?: boolean
  page?: number
  page_size?: number
  order_by?: string
  order?: 'asc' | 'desc'
}

export function getAdminUsers(params: UsersListParams = {}): Promise<AdminUserListResponse> {
  const searchParams = new URLSearchParams()
  if (params.query) searchParams.set('query', params.query)
  if (params.is_banned !== undefined) searchParams.set('is_banned', String(params.is_banned))
  if (params.has_subscription !== undefined) searchParams.set('has_subscription', String(params.has_subscription))
  if (params.page !== undefined) searchParams.set('page', String(params.page))
  if (params.page_size !== undefined) searchParams.set('page_size', String(params.page_size))
  if (params.order_by) searchParams.set('order_by', params.order_by)
  if (params.order) searchParams.set('order', params.order)
  const qs = searchParams.toString()
  return apiRequest<AdminUserListResponse>(`/admin/users${qs ? `?${qs}` : ''}`)
}

export function getAdminUserDetail(userId: number): Promise<AdminUserDetailResponse> {
  return apiRequest<AdminUserDetailResponse>(`/admin/users/${userId}`)
}

export function banUser(userId: number, reason?: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/admin/users/${userId}/ban`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export function unbanUser(userId: number): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/admin/users/${userId}/unban`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function addDaysToUser(userId: number, days: number): Promise<{ ok: boolean; days_added: number }> {
  return apiRequest<{ ok: boolean; days_added: number }>(`/admin/users/${userId}/add-days`, {
    method: 'POST',
    body: JSON.stringify({ days }),
  })
}

export function addTrafficToUser(userId: number, gigabytes: number): Promise<{ ok: boolean; gigabytes_added: number }> {
  return apiRequest<{ ok: boolean; gigabytes_added: number }>(`/admin/users/${userId}/add-traffic`, {
    method: 'POST',
    body: JSON.stringify({ gigabytes }),
  })
}
