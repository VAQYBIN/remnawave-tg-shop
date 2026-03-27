import { apiRequest } from './client'

export interface Profile {
  account_id: string
  email: string | null
  is_email_verified: boolean
  language_code: string
  telegram_user_id: number | null
  telegram_username: string | null
  telegram_first_name: string | null
}

export function getProfile(): Promise<Profile> {
  return apiRequest<Profile>('/profile')
}
