import { apiRequest } from '@/api/client'

export interface AdminMeResponse {
  account_id: string
  email: string | null
  telegram_user_id: number | null
  is_admin: boolean
}

export interface RecentPaymentItem {
  payment_id: number
  user_id: number
  username: string | null
  first_name: string | null
  amount: number
  currency: string
  status: string
  provider: string | null
  created_at: string | null
}

export interface DashboardResponse {
  // Today
  new_users_today: number
  payments_today: number
  revenue_today: number
  // 7-day
  new_users_7days: number
  revenue_7days: number
  // 30-day
  revenue_30days: number
  // All-time
  total_users: number
  total_subscriptions: number
  active_subscriptions: number
  total_payments: number
  total_revenue: number
  // Expiring
  expiring_soon_count: number
  // Recent
  recent_payments: RecentPaymentItem[]
}

export function getAdminMe(): Promise<AdminMeResponse> {
  return apiRequest<AdminMeResponse>('/admin/me')
}

export function getDashboard(): Promise<DashboardResponse> {
  return apiRequest<DashboardResponse>('/admin/dashboard')
}
