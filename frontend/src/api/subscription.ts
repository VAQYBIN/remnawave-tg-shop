import { apiRequest, ApiError } from './client'

export interface Subscription {
  subscription_id: number
  is_active: boolean
  start_date: string | null
  end_date: string
  duration_months: number | null
  status_from_panel: string | null
  traffic_limit_bytes: number | null
  traffic_used_bytes: number | null
  auto_renew_enabled: boolean
  provider: string | null
  panel_user_uuid: string
  panel_subscription_uuid: string | null
}

export interface TimePlan {
  kind: 'time'
  months: number
  price_rub: number
}

export interface TrafficPlan {
  kind: 'traffic'
  gb: number
  price_rub: number
}

export type Plan = TimePlan | TrafficPlan

export interface SubscriptionPlans {
  mode: 'time' | 'traffic'
  plans: Plan[]
}

export interface ConnectionInfo {
  link: string
}

export function getSubscription(): Promise<Subscription | null> {
  return apiRequest<Subscription>('/subscription').catch((err) => {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  })
}

export function getPlans(): Promise<SubscriptionPlans> {
  return apiRequest<SubscriptionPlans>('/subscription/plans')
}

export function getConnection(): Promise<ConnectionInfo> {
  return apiRequest<ConnectionInfo>('/subscription/connection')
}

export function setAutoRenew(enabled: boolean): Promise<{ auto_renew_enabled: boolean }> {
  return apiRequest('/subscription/auto-renew', {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  })
}
