import { apiRequest } from '@/api/client'

// ── New full-plan types (Phase 3+) ─────────────────────────────────────────

export interface PricingPlanOptionResponse {
  id: number
  plan_id: number
  duration_months: number | null
  duration_days: number | null
  traffic_gb: number | null
  traffic_unlimited: boolean
  price_rub: number | null
  price_stars: number | null
  is_enabled: boolean
  sort_order: number
  created_at: string
  updated_at: string | null
}

export interface PricingPlanResponse {
  id: number
  slug: string
  name_ru: string
  name_en: string | null
  description_ru: string | null
  description_en: string | null
  remnawave_squad_uuid: string | null
  remnawave_squad_name_snapshot: string | null
  plan_kind: string
  billing_model: string
  traffic_reset_strategy: string
  min_price_rub: number | null
  min_price_stars: number | null
  is_trial: boolean
  is_enabled: boolean
  sort_order: number
  created_at: string
  updated_at: string | null
  options: PricingPlanOptionResponse[]
}

export interface PricingPlanListResponse {
  items: PricingPlanResponse[]
  total: number
}

export interface PricingPlanCreateRequest {
  slug?: string
  name_ru: string
  name_en?: string
  description_ru?: string
  description_en?: string
  remnawave_squad_uuid?: string
  plan_kind?: string
  billing_model?: string
  traffic_reset_strategy?: string
  min_price_rub?: number
  min_price_stars?: number
  is_trial?: boolean
  is_enabled?: boolean
  sort_order?: number
}

export interface PricingPlanUpdateRequest {
  name_ru?: string
  name_en?: string | null
  description_ru?: string | null
  description_en?: string | null
  remnawave_squad_uuid?: string | null
  plan_kind?: string
  billing_model?: string
  traffic_reset_strategy?: string
  min_price_rub?: number | null
  min_price_stars?: number | null
  is_trial?: boolean
  is_enabled?: boolean
  sort_order?: number
}

export interface PricingPlanOptionCreateRequest {
  duration_months?: number
  duration_days?: number
  traffic_gb?: number
  traffic_unlimited?: boolean
  price_rub?: number
  price_stars?: number
  is_enabled?: boolean
  sort_order?: number
}

export interface PricingPlanOptionUpdateRequest {
  duration_months?: number | null
  duration_days?: number | null
  traffic_gb?: number | null
  traffic_unlimited?: boolean
  price_rub?: number | null
  price_stars?: number | null
  is_enabled?: boolean
  sort_order?: number
}

// ── Legacy types (kept for PlansPage until Phase 9) ────────────────────────

export type PlanResponse = PricingPlanResponse

export interface PlansListResponse {
  items: PricingPlanResponse[]
  total: number
}

/** @deprecated Use PricingPlanUpdateRequest */
export interface PlanCreateRequest {
  duration_months: number
  label?: string
  price_rub?: number
  price_stars?: number
  is_enabled?: boolean
  sort_order?: number
}

/** @deprecated Use PricingPlanUpdateRequest */
export interface PlanUpdateRequest {
  duration_months?: number
  label?: string
  price_rub?: number | null
  price_stars?: number | null
  is_enabled?: boolean
  sort_order?: number
}

// ── API functions ──────────────────────────────────────────────────────────

export function getAdminPlans(): Promise<PricingPlanListResponse> {
  return apiRequest<PricingPlanListResponse>('/admin/plans')
}

export function createPlan(body: PricingPlanCreateRequest): Promise<PricingPlanResponse> {
  return apiRequest<PricingPlanResponse>('/admin/plans', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updatePlan(planId: number, body: PricingPlanUpdateRequest): Promise<PricingPlanResponse> {
  return apiRequest<PricingPlanResponse>(`/admin/plans/${planId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deletePlan(planId: number): Promise<void> {
  return apiRequest<void>(`/admin/plans/${planId}`, { method: 'DELETE' })
}

export function createPlanOption(
  planId: number,
  body: PricingPlanOptionCreateRequest,
): Promise<PricingPlanOptionResponse> {
  return apiRequest<PricingPlanOptionResponse>(`/admin/plans/${planId}/options`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updatePlanOption(
  planId: number,
  optionId: number,
  body: PricingPlanOptionUpdateRequest,
): Promise<PricingPlanOptionResponse> {
  return apiRequest<PricingPlanOptionResponse>(`/admin/plans/${planId}/options/${optionId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deletePlanOption(planId: number, optionId: number): Promise<void> {
  return apiRequest<void>(`/admin/plans/${planId}/options/${optionId}`, { method: 'DELETE' })
}
