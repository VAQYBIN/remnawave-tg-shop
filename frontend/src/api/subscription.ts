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
  auto_renew_available: boolean
  provider: string | null
  panel_user_id: number
  panel_subscription_uuid: string | null
}

// ── Legacy plan shapes ─────────────────────────────────────────────────────

export interface TimePlan {
  kind: 'time'
  months: number
  price_rub: number
  price_stars?: number | null
}

export interface TrafficPlan {
  kind: 'traffic'
  gb: number
  price_rub: number
}

export type Plan = TimePlan | TrafficPlan

// ── Catalog plan shapes (Phase 4+) ─────────────────────────────────────────

export interface PubPlanOption {
  id: number
  duration_months: number | null
  duration_days: number | null
  traffic_gb: number | null
  traffic_unlimited: boolean
  price_rub: number | null
  price_stars: number | null
  sort_order: number
}

export interface PubPlan {
  id: number
  slug: string
  name_ru: string
  name_en: string | null
  description_ru: string | null
  description_en: string | null
  plan_kind: string
  billing_model: string
  traffic_reset_strategy: string
  min_price_rub: number | null
  min_price_stars: number | null
  is_trial: boolean
  options: PubPlanOption[]
}

export interface SubscriptionPlans {
  mode: 'time' | 'traffic' | 'catalog'
  plans: Plan[]
  catalog_plans: PubPlan[]
}

// ── Entitlements ───────────────────────────────────────────────────────────

export interface Entitlement {
  id: number
  plan_id: number
  plan_option_id: number | null
  plan_slug: string
  plan_name_ru: string
  plan_name_en: string | null
  plan_kind: string
  billing_model: string
  starts_at: string
  ends_at: string | null
  traffic_limit_bytes_added: number
  is_active: boolean
  auto_renew_enabled: boolean
}

export interface Entitlements {
  standalone: Entitlement | null
  addons: Entitlement[]
  auto_renew_available: boolean
}

export interface RenewalBundleAddon {
  entitlement_id: number
  plan_id: number
  option_id: number
  price_rub: number | null
  price_stars: number | null
}

export interface RenewalBundle {
  has_bundle: boolean
  total_price_rub: number | null
  total_price_stars: number | null
  addons: RenewalBundleAddon[]
}

// ── Addons ─────────────────────────────────────────────────────────────────

export interface AddonPlanOption extends PubPlanOption {
  prorated_price_rub: number | null
  prorated_price_stars: number | null
}

export interface AddonPlan {
  id: number
  slug: string
  name_ru: string
  name_en: string | null
  description_ru: string | null
  description_en: string | null
  billing_model: string
  traffic_reset_strategy: string
  min_price_rub: number | null
  min_price_stars: number | null
  is_trial: boolean
  options: AddonPlanOption[]
}

export interface AddonsList {
  addons: AddonPlan[]
  standalone_ends_at: string | null
}

// ── Misc ──────────────────────────────────────────────────────────────────

export interface TrialEligibility {
  eligible: boolean
  trial_days: number
  trial_traffic_gb: number | null
  reason: 'disabled' | 'already_used' | 'has_subscription' | null
}

export interface ConnectionInfo {
  link: string
}

// ── API functions ──────────────────────────────────────────────────────────

export function getSubscription(): Promise<Subscription | null> {
  return apiRequest<Subscription>('/subscription').catch((err) => {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  })
}

export function getPlans(): Promise<SubscriptionPlans> {
  return apiRequest<SubscriptionPlans>('/subscription/plans')
}

export function getTrialEligibility(): Promise<TrialEligibility> {
  return apiRequest<TrialEligibility>('/subscription/trial-eligibility')
}

export function activateTrial(): Promise<Subscription> {
  return apiRequest<Subscription>('/subscription/trial', {
    method: 'POST',
  })
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

export function getEntitlements(): Promise<Entitlements> {
  return apiRequest<Entitlements>('/subscription/entitlements')
}

export function setEntitlementAutoRenew(entitlementId: number, enabled: boolean): Promise<Entitlement> {
  return apiRequest<Entitlement>(`/subscription/entitlements/${entitlementId}/auto-renew`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  })
}

export function getRenewalBundle(optionId: number): Promise<RenewalBundle> {
  return apiRequest<RenewalBundle>(`/subscription/renewal-bundle/${optionId}`)
}

export function getAddons(): Promise<AddonsList> {
  return apiRequest<AddonsList>('/subscription/addons')
}

// Full-price addon catalog for the combined "standalone + addon" purchase flow.
// Period aligns to the freshly-bought standalone; no active subscription required.
export function getAddonsCatalog(): Promise<AddonsList> {
  return apiRequest<AddonsList>('/subscription/addons/catalog')
}
