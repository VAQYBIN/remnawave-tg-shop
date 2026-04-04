import { apiRequest } from '@/api/client'

export interface AdminMeResponse {
  account_id: string
  email: string | null
  telegram_user_id: number | null
  is_admin: boolean
}

export interface DashboardResponse {
  total_users: number
  total_subscriptions: number
  active_subscriptions: number
  total_payments: number
  total_revenue: number
  new_users_today: number
  payments_today: number
  revenue_today: number
}

export function getAdminMe(): Promise<AdminMeResponse> {
  return apiRequest<AdminMeResponse>('/admin/me')
}

export function getDashboard(): Promise<DashboardResponse> {
  return apiRequest<DashboardResponse>('/admin/dashboard')
}
