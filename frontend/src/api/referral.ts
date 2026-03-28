import { apiRequest } from './client'

export interface ReferralInfo {
  referral_code: string
  referral_link: string
  invited_count: number
  purchased_count: number
  bonus_days_per_month: Record<string, number> | null
}

export function getReferral(): Promise<ReferralInfo> {
  return apiRequest<ReferralInfo>('/referral')
}
