import { apiRequest } from '@/api/client'

export interface PlanResponse {
  id: number
  duration_months: number
  label: string | null
  price_rub: number | null
  price_stars: number | null
  is_enabled: boolean
  sort_order: number
  created_at: string
  updated_at: string | null
}

export interface PlansListResponse {
  items: PlanResponse[]
  total: number
}

export interface PlanCreateRequest {
  duration_months: number
  label?: string
  price_rub?: number
  price_stars?: number
  is_enabled?: boolean
  sort_order?: number
}

export interface PlanUpdateRequest {
  duration_months?: number
  label?: string
  price_rub?: number | null
  price_stars?: number | null
  is_enabled?: boolean
  sort_order?: number
}

export function getAdminPlans(): Promise<PlansListResponse> {
  return apiRequest<PlansListResponse>('/admin/plans')
}

export function createPlan(body: PlanCreateRequest): Promise<PlanResponse> {
  return apiRequest<PlanResponse>('/admin/plans', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updatePlan(planId: number, body: PlanUpdateRequest): Promise<PlanResponse> {
  return apiRequest<PlanResponse>(`/admin/plans/${planId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deletePlan(planId: number): Promise<void> {
  return apiRequest<void>(`/admin/plans/${planId}`, { method: 'DELETE' })
}
