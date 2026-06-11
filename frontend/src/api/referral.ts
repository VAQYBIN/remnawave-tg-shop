import { apiRequest } from './client'

export interface ReferralFriend {
  name: string | null
  handle: string | null
  registered_at: string | null
  status: 'registered' | 'activated'
  bonus_days: number
}

export interface ReferralInfo {
  referral_code: string
  referral_link: string
  telegram_link: string | null
  invited_count: number
  purchased_count: number
  total_bonus_days: number
  bonus_days_per_month: Record<string, number> | null
  friends: ReferralFriend[]
}

export function getReferral(): Promise<ReferralInfo> {
  return apiRequest<ReferralInfo>('/referral')
}
